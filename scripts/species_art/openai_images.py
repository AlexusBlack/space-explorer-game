"""OpenAI image calls: synchronous runner (retries, rate limit, budget) and Batch API.

The API key is read from the repo-root .env (OPENAI_API_KEY) and is never printed;
`scrub()` removes it from any error text before it reaches state, logs or stdout.
"""

import base64
import json
import os
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import costing
from .config import BATCH_DIR, REPO, WORK
from .state import now

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


class ModerationBlocked(Exception):
    pass


class PermanentError(Exception):
    pass


class QuotaExhausted(Exception):
    """Account has no credits / hit a hard quota: stop the whole run, nothing was billed."""


def _error_code(exc):
    code = getattr(exc, "code", None) or getattr(exc, "type", None)
    body = getattr(exc, "body", None)
    if not code and isinstance(body, dict):
        code = body.get("code") or (body.get("error") or {}).get("code")
    return code


def scrub(text):
    key = os.environ.get("OPENAI_API_KEY")
    text = str(text)
    if key:
        text = text.replace(key, "sk-***")
    return text


def load_key():
    try:
        from dotenv import load_dotenv
        load_dotenv(REPO / ".env")
    except ImportError:
        pass
    if not os.environ.get("OPENAI_API_KEY"):
        raise PermanentError("OPENAI_API_KEY missing — add it to .env at the repo root")


def request_body(job, cfg):
    body = {
        "model": job["model"], "prompt": job["prompt"], "size": job["size"],
        "quality": job["quality"], "output_format": cfg["output_format"],
        "background": "transparent" if job["bg"] == "A" else "opaque",
        "moderation": cfg["moderation"], "n": 1,
    }
    return body


# ---- clients -----------------------------------------------------------

class OpenAIClient:
    """Thin adapter so the runner can be tested with a mock of the same shape."""

    def __init__(self, cfg):
        load_key()
        from openai import OpenAI
        self.sdk = OpenAI(max_retries=0, timeout=cfg["request_timeout_s"])

    def generate(self, body):
        import openai
        try:
            resp = self.sdk.images.generate(**body)
        except openai.BadRequestError as e:
            code = getattr(e, "code", None) or (getattr(e, "body", None) or {}).get("code")
            if code == "moderation_blocked":
                raise ModerationBlocked(scrub(e)) from None
            raise PermanentError(scrub(e)) from None
        except (openai.AuthenticationError, openai.PermissionDeniedError, openai.NotFoundError) as e:
            raise PermanentError(scrub(e)) from None
        data = resp.data[0]
        usage = resp.usage.model_dump() if resp.usage else None
        meta = {"background": getattr(resp, "background", None)}
        return base64.b64decode(data.b64_json), usage, meta

    # batch API
    def upload_batch(self, path):
        with open(path, "rb") as f:
            return self.sdk.files.create(file=f, purpose="batch").id

    def create_batch(self, file_id):
        return self.sdk.batches.create(input_file_id=file_id, endpoint="/v1/images/generations",
                                       completion_window="24h").id

    def retrieve_batch(self, batch_id):
        b = self.sdk.batches.retrieve(batch_id)
        return {"status": b.status, "output_file_id": b.output_file_id,
                "error_file_id": b.error_file_id,
                "counts": b.request_counts.model_dump() if b.request_counts else None}

    def download(self, file_id):
        return self.sdk.files.content(file_id).text


def _retry_after(exc):
    resp = getattr(exc, "response", None)
    try:
        return float(resp.headers.get("retry-after"))
    except (AttributeError, TypeError, ValueError):
        return None


def _is_retryable(exc):
    import openai
    if isinstance(exc, (openai.APIConnectionError, openai.APITimeoutError, openai.RateLimitError,
                        openai.InternalServerError)):
        return True
    return getattr(exc, "status_code", None) in RETRYABLE_STATUS


# ---- rate limit ----------------------------------------------------------

class RateLimiter:
    """Token bucket: at most `per_minute` request starts in any rolling minute."""

    def __init__(self, per_minute):
        self.interval = 60.0 / max(per_minute, 1)
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self):
        with self.lock:
            t = time.monotonic()
            start = max(t, self.next_at)
            self.next_at = start + self.interval
        if start > t:
            time.sleep(start - t)


# ---- sync runner -----------------------------------------------------------

def raw_path_for(job):
    return WORK / "raw" / job["slug"] / f"{job['bg']}{job['style']}-{job['id']}.png"


def _call_with_retries(client, body, limiter, max_tries=6, sleep=time.sleep):
    delay = 2.0
    for i in range(max_tries):
        limiter.wait()
        try:
            return client.generate(body)
        except (ModerationBlocked, PermanentError, QuotaExhausted):
            raise
        except Exception as e:  # noqa: BLE001 - classify below
            if _error_code(e) in ("insufficient_quota", "billing_hard_limit_reached"):
                raise QuotaExhausted(scrub(e)) from None
            if i == max_tries - 1 or not _is_retryable(e):
                raise PermanentError(scrub(e)) from None
            wait = _retry_after(e) or delay * (1 + random.random() * 0.5)
            sleep(min(wait, 60.0))
            delay = min(delay * 2, 60.0)


def run_sync(jobs, cfg, state, stage, client, limiter=None, log=print):
    """Generate every not-yet-done job. Returns a summary dict. Never re-bills a done job."""
    limiter = limiter or RateLimiter(cfg["ipm_limit"])
    guard = costing.BudgetGuard(cfg, state, stage)
    todo = []
    for j in jobs:
        if j["status"] == "submitted" and not j.get("batch_id"):
            log(f"  warn  {j['slug']}: previous run died mid-request; retrying (may have been billed)")
            j["status"] = "pending"
        if j["status"] == "pending":
            todo.append(j)
    summary = {"requested": 0, "done": 0, "failed": 0, "blocked": 0, "skipped": len(jobs) - len(todo),
               "spent": 0.0, "halted": None}
    stop = threading.Event()

    def work(job):
        if stop.is_set():
            return "skipped"
        if state.attempts_for(job) >= cfg["max_attempts"]:
            state.update_job(job["id"], status="failed", error="max_attempts reached", finished=now())
            return "failed"
        est = costing.estimate(cfg, job["quality"], job["size"], job["prompt"])
        try:
            guard.reserve(est)
        except costing.BudgetExceeded as e:
            stop.set()
            summary["halted"] = str(e)
            return "skipped"
        try:
            state.update_job(job["id"], status="submitted", error=None)
            summary["requested"] += 1
            img, usage, meta = _call_with_retries(client, request_body(job, cfg), limiter)
            path = raw_path_for(job)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(img)  # raw lands on disk before the job flips to done
            usd = costing.actual_from_usage(cfg, usage)
            source = "usage" if usd is not None else "estimate"
            usd = est if usd is None else usd
            flags = []
            if job["bg"] == "A" and meta.get("background") not in (None, "transparent"):
                flags.append("opaque_returned")
            with state.lock:
                state.add_spend(stage, usd)
                state.update_job(job["id"], status="done", raw_path=str(path.relative_to(REPO)),
                                 usage=usage, cost_usd=usd, cost_source=source, finished=now(),
                                 flags=flags)
            costing.log_spend(state.jobs[job["id"]], usd, source)
            summary["spent"] += usd
            log(f"  done  {job['slug']:<16} {job['bg']}{job['style']} {job['quality']:<6} ${usd:.4f}")
            return "done"
        except QuotaExhausted as e:
            state.update_job(job["id"], status="pending", error=scrub(e)[:500])
            stop.set()
            summary["halted"] = "API quota exhausted (no credits?) — add credits, then re-run; nothing was billed"
            return "skipped"
        except ModerationBlocked as e:
            state.update_job(job["id"], status="moderation_blocked", error=scrub(e)[:500], finished=now())
            log(f"  BLOCKED {job['slug']} (moderation) — edit its overrides and reroll")
            return "blocked"
        except PermanentError as e:
            state.update_job(job["id"], status="failed", error=scrub(e)[:500], finished=now())
            log(f"  FAILED {job['slug']}: {scrub(e)[:200]}")
            return "failed"
        finally:
            guard.release(est)

    with ThreadPoolExecutor(max_workers=cfg["concurrency"]) as ex:
        futs = [ex.submit(work, j) for j in todo]
        for f in as_completed(futs):
            r = f.result()
            if r in summary:
                summary[r] += 1
    state.save()
    return summary


# ---- batch -------------------------------------------------------------------

def batch_submit(jobs, cfg, state, stage, client, set_name, log=print):
    todo = [j for j in jobs if j["status"] == "pending"]
    if not todo:
        log("nothing to submit (all jobs already done / in flight)")
        return None
    guard = costing.BudgetGuard(cfg, state, stage)
    total = sum(costing.estimate(cfg, j["quality"], j["size"], j["prompt"], batch=True) for j in todo)
    guard.reserve(total)  # raises BudgetExceeded before anything is uploaded
    guard.release(total)
    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    tmp = BATCH_DIR / f"pending-{set_name}-{int(time.time())}.jsonl"
    with open(tmp, "w") as f:
        for j in todo:
            f.write(json.dumps({"custom_id": j["id"], "method": "POST",
                                "url": "/v1/images/generations", "body": request_body(j, cfg)}) + "\n")
    file_id = client.upload_batch(tmp)
    batch_id = client.create_batch(file_id)
    final = BATCH_DIR / f"{batch_id}.jsonl"
    tmp.rename(final)
    with state.lock:
        for j in todo:
            est = costing.estimate(cfg, j["quality"], j["size"], j["prompt"], batch=True)
            j.update(status="batched", batch_id=batch_id, reserved_usd=est)
        state.data["batches"][batch_id] = {"set": set_name, "stage": stage, "input_file_id": file_id,
                                           "jobs": [j["id"] for j in todo], "status": "submitted",
                                           "created": now(), "estimate_usd": round(total, 4)}
        state.save()
    log(f"submitted batch {batch_id}: {len(todo)} images, est ${total:.2f}")
    return batch_id


def batch_collect(cfg, state, client, log=print, set_name=None):
    """Poll every open batch; decode finished results into raw/. Returns per-batch status."""
    out = {}
    for bid, b in list(state.data["batches"].items()):
        if b["status"] in ("collected", "failed", "expired", "cancelled"):
            continue
        if set_name and b["set"] != set_name:
            continue
        info = client.retrieve_batch(bid)
        out[bid] = info["status"]
        log(f"batch {bid}: {info['status']} {info.get('counts') or ''}")
        if info["status"] not in ("completed", "failed", "expired", "cancelled"):
            continue
        seen = set()
        for fid in (info.get("output_file_id"), info.get("error_file_id")):
            if not fid:
                continue
            text = client.download(fid)
            (BATCH_DIR / f"{bid}.{fid}.result.jsonl").write_text(text)
            for line in text.splitlines():
                if line.strip():
                    seen.add(_collect_line(json.loads(line), cfg, state, b["stage"], log))
        with state.lock:
            # anything not in the results (expired/cancelled) goes back to pending for a sync retry
            for jid in b["jobs"]:
                j = state.jobs[jid]
                if jid not in seen and j["status"] == "batched":
                    j.update(status="pending", batch_id=None, reserved_usd=0.0,
                             error=f"batch {info['status']} without a result")
            b["status"] = "collected" if info["status"] == "completed" else info["status"]
            state.save()
    return out


def _collect_line(rec, cfg, state, stage, log):
    jid = rec.get("custom_id")
    job = state.jobs.get(jid)
    if job is None or job["status"] != "batched":
        return jid  # already collected: never double-count spend
    resp = rec.get("response") or {}
    body = resp.get("body") or {}
    if resp.get("status_code") == 200 and body.get("data"):
        path = raw_path_for(job)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(base64.b64decode(body["data"][0]["b64_json"]))
        usage = body.get("usage")
        usd = costing.actual_from_usage(cfg, usage, batch=True)
        source = "usage" if usd is not None else "estimate"
        usd = job["reserved_usd"] if usd is None else usd
        flags = ["opaque_returned"] if job["bg"] == "A" and body.get("background") == "opaque" else []
        with state.lock:
            state.add_spend(stage, usd)
            job.update(status="done", raw_path=str(path.relative_to(REPO)), usage=usage, cost_usd=usd,
                       cost_source=source, reserved_usd=0.0, finished=now(), flags=flags)
        costing.log_spend(job, usd, source)
    else:
        err = (body.get("error") or rec.get("error") or {})
        code = err.get("code") if isinstance(err, dict) else None
        job.update(status="moderation_blocked" if code == "moderation_blocked" else "pending",
                   batch_id=None, reserved_usd=0.0, error=scrub(json.dumps(err))[:500])
        log(f"  batch item failed {job['slug']}: {code or err}")
    return jid
