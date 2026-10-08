"""Offline self-test: mock OpenAI client + mock Batch API, synthetic images, stub mask.

Runs in a temporary directory (every module-level path is redirected), never reads
.env, never touches species/work, never makes a network call.
"""

import base64
import io
import json
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from . import catalogue, config, costing, cutout, manifest, normalize, openai_images, prompts, selection
from . import state as state_mod

S = 256  # synthetic image size (keeps the test fast)


# ---- synthetic images ----------------------------------------------------------

def _disc_alpha(size=S, r=0.3):
    yy, xx = np.mgrid[:size, :size] / size
    d = np.sqrt((xx - 0.5) ** 2 + (yy - 0.45) ** 2)
    return np.clip((r - d) / 0.02, 0, 1).astype(np.float32)  # ~5px soft edge


def synth(bg):
    """A red-orange disc on the background a given method expects."""
    a = _disc_alpha()[..., None]
    fg = np.array([0.85, 0.35, 0.10], np.float32)
    if bg == "A":
        rgb = np.broadcast_to(fg, (S, S, 3)).copy()
        alpha = np.where(a[..., 0] > 0.99, 253 / 255, a[..., 0])  # the 252-254 quirk
        arr = np.dstack([rgb, alpha])
        mode = "RGBA"
    else:
        back = {"B": [0.5, 0.5, 0.5], "C": [0, 0, 0], "D": [0, 0.69, 0.25]}[bg]
        arr = a * fg + (1 - a) * np.array(back, np.float32)
        mode = "RGB"
    buf = io.BytesIO()
    Image.fromarray((arr * 255 + 0.5).astype(np.uint8), mode).save(buf, "PNG")
    return buf.getvalue()


def stub_mask(img, cfg):
    return _disc_alpha(img.size[0])


# ---- mocks ------------------------------------------------------------------------

class MockClient:
    def __init__(self, fail_first=0, moderation_ids=()):
        self.calls = 0
        self.fail_first = fail_first
        self.moderation_ids = set(moderation_ids)
        self.batches, self.files = {}, {}

    def _bg(self, body):
        if body["background"] == "transparent":
            return "A"
        p = body["prompt"]
        return "C" if "black" in p else "D" if "chroma" in p else "B"

    def generate(self, body):
        self.calls += 1
        if self.calls <= self.fail_first:
            e = Exception("rate limited")
            e.status_code = 429
            raise e
        if any(f"inspired by the {k}" in body["prompt"] for k in self.moderation_ids):
            raise openai_images.ModerationBlocked("blocked")
        usage = {"input_tokens": 300, "output_tokens": 1756,
                 "input_tokens_details": {"text_tokens": 300, "image_tokens": 0}}
        return synth(self._bg(body)), usage, {"background": body["background"]}

    # batch API
    def upload_batch(self, path):
        fid = f"file-{len(self.files)}"
        self.files[fid] = Path(path).read_text()
        return fid

    def create_batch(self, file_id):
        bid = f"batch_{len(self.batches)}"
        self.batches[bid] = {"input": file_id, "polls": 0}
        return bid

    def retrieve_batch(self, bid):
        b = self.batches[bid]
        b["polls"] += 1
        if b["polls"] == 1:
            return {"status": "in_progress", "output_file_id": None, "error_file_id": None, "counts": None}
        lines = self.files[b["input"]].splitlines()
        out = []
        for i, line in enumerate(lines):
            req = json.loads(line)
            if i == 0:  # first item fails -> must go back to pending
                out.append({"custom_id": req["custom_id"], "response": {"status_code": 500, "body": {
                    "error": {"code": "server_error"}}}})
                continue
            out.append({"custom_id": req["custom_id"], "response": {"status_code": 200, "body": {
                "data": [{"b64_json": base64.b64encode(synth(self._bg(req["body"]))).decode()}],
                "usage": {"input_tokens": 300, "output_tokens": 1756}}}})
        self.files[f"out-{bid}"] = "\n".join(json.dumps(r) for r in out)
        return {"status": "completed", "output_file_id": f"out-{bid}", "error_file_id": None, "counts": None}

    def download(self, fid):
        return self.files[fid]


class NoWait:
    def wait(self):
        pass


# ---- sandbox ------------------------------------------------------------------------

def _sandbox(tmp):
    """Point every module-level path at tmp."""
    work = tmp / "species" / "work"
    paths = {"REPO": tmp, "WORK": work, "BATCH_DIR": work / "batches", "SET_DIR": work / "sets",
             "SPEND_LOG": work / "spend.log", "VARIANT_DIR": work / "variants",
             "CUTOUT_DIR": tmp / "species/images/cutout", "THUMB_DIR": tmp / "species/images/thumb",
             "MANIFEST_PATH": tmp / "species/species_images.json"}
    for mod in (config, costing, openai_images, manifest, selection, state_mod):
        for k, v in paths.items():
            if hasattr(mod, k):
                setattr(mod, k, v)
    work.mkdir(parents=True)
    return work


def _quiet(*a, **k):
    pass


# ---- tests -------------------------------------------------------------------------

def test_prompts(cat, cfg):
    sp = cat[1]
    a, b = prompts.build(sp, "A", "B"), prompts.build(sp, "A", "B")
    assert a == b, "prompt not deterministic"
    assert "#808080" in a and "transparent" not in a.lower()
    t = prompts.build(sp, "A", "A")
    for word in ("grey", "black", "green", "#"):
        assert word not in t.split("Isolated subject")[-1].lower() or word == "#", f"backdrop word in A: {word}"
    assert "Correction: fewer legs" in prompts.build(sp, "A", "B", note="fewer legs")
    assert prompts.build(sp, "A", "B", note="x") != a
    allp = [selection.spec(s, cfg, "A", "B")["prompt"] for s in cat.values()]
    assert len(allp) == 331 and len(set(allp)) == 331, "prompts must be unique per species"
    print("ok  prompts: deterministic, unique x331, transparency prompt has no backdrop words")


def test_sync_idempotent(cat, cfg, work):
    st = state_mod.State(work / "state.json")
    specs = selection.stage_specs("pilot", cat, cfg)[:5]
    jobs = [st.ensure_job(s, "pilot")[0] for s in specs]
    client = MockClient(fail_first=2)
    sleeps = []
    orig = openai_images._call_with_retries

    def fast(client_, body, limiter, max_tries=6, sleep=None):
        return orig(client_, body, limiter, max_tries, sleep=sleeps.append)
    openai_images._call_with_retries = fast
    try:
        s1 = openai_images.run_sync(jobs, cfg, st, "pilot", client, NoWait(), log=_quiet)
    finally:
        openai_images._call_with_retries = orig
    assert s1["done"] == 5 and client.calls == 7 and len(sleeps) == 2, (s1, client.calls, sleeps)
    assert all((work.parent.parent / j["raw_path"]).exists() for j in st.jobs.values())
    spent = st.spent()
    assert abs(spent - 5 * costing.actual_from_usage(cfg, {"output_tokens": 1756, "input_tokens": 300})) < 1e-9

    # second pass: re-plan from scratch, reload state from disk -> zero calls, zero spend
    st2 = state_mod.State(work / "state.json")
    jobs2 = [st2.ensure_job(s, "pilot")[0] for s in specs]
    client2 = MockClient()
    s2 = openai_images.run_sync(jobs2, cfg, st2, "pilot", client2, NoWait(), log=_quiet)
    assert client2.calls == 0 and s2["skipped"] == 5 and st2.spent() == spent
    assert len(st2.jobs) == 5
    print(f"ok  sync: 5 done after 2 retried 429s; rerun made 0 calls; spend ${spent:.4f} unchanged")
    return st2


def test_moderation(cat, cfg, work):
    st = state_mod.State(work / "state-mod.json")
    job = st.ensure_job(selection.spec(cat[238], cfg, "A", "B"), "pilot")[0]
    s = openai_images.run_sync([job], cfg, st, "pilot", MockClient(moderation_ids={cat[238].prototype}),
                               NoWait(), log=_quiet)
    assert s["blocked"] == 1 and st.jobs[job["id"]]["status"] == "moderation_blocked" and st.spent() == 0
    print("ok  moderation: blocked job flagged, not retried, not billed")


def test_quota(cat, cfg, work):
    st = state_mod.State(work / "state-quota.json")
    jobs = [st.ensure_job(s, "pilot")[0] for s in selection.stage_specs("pilot", cat, cfg)[:6]]

    class Broke(MockClient):
        def generate(self, body):
            self.calls += 1
            e = Exception("You have no credits remaining")
            e.status_code, e.code = 429, "insufficient_quota"
            raise e
    client = Broke()
    s = openai_images.run_sync(jobs, {**cfg, "concurrency": 1}, st, "pilot", client, NoWait(), log=_quiet)
    assert s["halted"] and "quota" in s["halted"] and client.calls == 1, (s, client.calls)
    assert all(j["status"] == "pending" for j in st.jobs.values()) and st.spent() == 0
    assert all(st.attempts_for(j) == 0 for j in st.jobs.values())
    print("ok  quota: insufficient_quota halts after 1 call, no retries, jobs stay pending")


def test_budget(cat, cfg, work):
    st = state_mod.State(work / "state-budget.json")
    cfg = {**cfg, "stage_caps": {**cfg["stage_caps"], "pilot": 0.12}, "concurrency": 1}
    jobs = [st.ensure_job(s, "pilot")[0] for s in selection.stage_specs("pilot", cat, cfg)[:5]]
    client = MockClient()
    s = openai_images.run_sync(jobs, cfg, st, "pilot", client, NoWait(), log=_quiet)
    assert s["halted"] and client.calls == 2 and st.spent() <= 0.12, (s, client.calls)
    print(f"ok  budget: halted after {client.calls} images at ${st.spent():.3f} (cap $0.12)")

    st_b = state_mod.State(work / "state-budget2.json")
    cfg_b = {**cfg, "stage_caps": {**cfg["stage_caps"], "bulk1": 0.5}}
    jobs = [st_b.ensure_job(s, "bulk1")[0] for s in selection.stage_specs("bulk1", cat, cfg_b, list(range(1, 51)))]
    client = MockClient()
    try:
        openai_images.batch_submit(jobs, cfg_b, st_b, "bulk1", client, "bulk1", log=_quiet)
        raise AssertionError("batch over cap should not submit")
    except costing.BudgetExceeded:
        pass
    assert not client.files and not client.batches
    print("ok  budget: over-cap batch refused before upload")


def test_batch(cat, cfg, work):
    st = state_mod.State(work / "state-batch.json")
    ids = [3, 4, 5, 6]
    specs = selection.stage_specs("bulk1", cat, cfg, ids)
    jobs = [st.ensure_job(s, "bulk1")[0] for s in specs]
    client = MockClient()
    bid = openai_images.batch_submit(jobs, cfg, st, "bulk1", client, "bulk1", log=_quiet)
    assert all(j["status"] == "batched" for j in jobs) and st.reserved() > 0
    # resubmitting the same set must not create a second batch
    assert openai_images.batch_submit(jobs, cfg, st, "bulk1", client, "bulk1", log=_quiet) is None
    openai_images.batch_collect(cfg, st, client, log=_quiet)          # in_progress
    assert st.data["batches"][bid]["status"] == "submitted"
    openai_images.batch_collect(cfg, st, client, log=_quiet)          # completed
    statuses = sorted(j["status"] for j in st.jobs.values())
    assert statuses == ["done", "done", "done", "pending"], statuses
    spent = st.spent()
    assert abs(spent - 3 * costing.actual_from_usage(cfg, {"output_tokens": 1756, "input_tokens": 300},
                                                     batch=True)) < 1e-9
    assert st.reserved() == 0
    # replaying the result lines never double-counts
    for line in client.files[f"out-{bid}"].splitlines():
        openai_images._collect_line(json.loads(line), cfg, st, "bulk1", _quiet)
    assert st.spent() == spent
    print(f"ok  batch: submit once, 3 collected + 1 back to pending, ${spent:.4f}, replay safe")


def test_cutouts(cat, cfg, work):
    st = state_mod.State(work / "state-cut.json")
    sp = cat[1]
    truth = _disc_alpha()
    for method, bg in config.METHOD_BG.items():
        job = st.ensure_job(selection.spec(sp, cfg, "A", bg), "transparency")[0]
        raw = work / "raw" / job["slug"] / f"{bg}-{job['id']}.png"
        raw.parent.mkdir(parents=True, exist_ok=True)
        raw.write_bytes(synth(bg))
        job.update(status="done", raw_path=str(raw.relative_to(work.parent.parent)))
        path, stats = manifest.cut_job(st, job, method, cfg, mask_fn=stub_mask)
        out = np.asarray(Image.open(path), dtype=np.float32) / 255.0
        alpha = out[..., 3]
        inside, outside = truth > 0.99, truth < 0.01
        assert alpha[inside].min() > 0.95, (method, alpha[inside].min())
        if method != "C2":  # C2 deliberately keeps faint luminance, but black bg -> ~0 anyway
            assert alpha[outside].max() < 0.05, (method, alpha[outside].max())
        edge = (truth > 0.05) & (truth < 0.95)
        if method == "C2":
            # glow layer (manifest blend "screen"): its alpha is deliberately wider than the
            # subject's, so the invariant is that premultiplied colour reproduces the raw
            raw_rgb = np.asarray(Image.open(raw).convert("RGB"), dtype=np.float32) / 255.0
            err = np.abs(out[..., :3] * alpha[..., None] - raw_rgb)[edge].max()
        else:
            # halo check, as the review page does it: composite over magenta vs ground truth
            mag = np.array([0.82, 0.23, 0.69], np.float32)
            t = truth[..., None]
            want = t * np.array([0.85, 0.35, 0.10], np.float32) + (1 - t) * mag
            got = out[..., :3] * alpha[..., None] + (1 - alpha[..., None]) * mag
            err = np.abs(got - want)[edge].max()
        assert err < 0.12, f"{method}: halo vs ground truth over magenta (err {err:.3f})"
        assert "opaque_returned" not in stats["flags"], (method, stats)
        print(f"ok  cutout {method:<3}: core a>{alpha[inside].min():.2f}, bg a<{alpha[outside].max():.2f}, "
              f"halo err {err:.3f}")
    # method A on an opaque image must be flagged
    raw = work / "opaque.png"
    raw.write_bytes(synth("B"))
    _, stats = cutout.cut(raw, "A", cfg)
    assert "opaque_returned" in stats["flags"]
    print("ok  cutout A: opaque return detected and flagged")
    return st


def test_normalize(cfg):
    c = cfg["canvas"]
    for plan, tall in (("legged", False), ("floater", False), ("serpentine", True)):
        h, w = (600, 200) if tall else (300, 500)
        img = np.zeros((h + 40, w + 60, 4), np.uint8)
        img[20:20 + h, 30:30 + w] = [200, 100, 50, 255]
        canvas, meta = normalize.normalize(Image.fromarray(img), plan, cfg)
        a = np.asarray(canvas)[..., 3]
        ys, xs = np.nonzero(a > 8)
        assert canvas.size == (c["size"], c["size"])
        assert max(ys.max() - ys.min() + 1, xs.max() - xs.min() + 1) <= c["fit_box"] + 1
        assert abs((xs.min() + xs.max() + 1) / 2 - c["size"] / 2) <= 1
        if plan in normalize.GROUNDED:
            assert meta["anchor"] == "bottom-center" and meta["pivot"] == [512, 968]
            assert abs(ys.max() + 1 - (c["size"] - c["bottom_pad"])) <= 1, ys.max()
        else:
            assert meta["anchor"] == "center" and meta["pivot"] == [512, 512]
            assert abs((ys.min() + ys.max() + 1) / 2 - c["size"] / 2) <= 1
    # small subjects are not upscaled beyond max_upscale
    img = np.zeros((300, 300, 4), np.uint8)
    img[100:200, 100:200] = 255
    _, meta = normalize.normalize(Image.fromarray(img), "legged", cfg)
    assert meta["scale"] == c["max_upscale"]
    print("ok  normalize: fit box, bottom-centre / centre anchors, pivots, upscale cap")


def test_review_and_manifest(cat, cfg, st, work):
    sid = 1
    picks = [k for k in st.species(sid)["cutouts"] if k.endswith(":B")]
    review = {"items": {picks[0]: {"species_id": sid, "verdict": "approve", "notes": "nice"}},
              "picks": {}}
    rev2 = {"species_id": 73, "verdict": "reroll", "notes": "fewer legs"}
    review["items"]["deadbeef-a1:raw"] = rev2
    out = manifest.apply_review(st, review, cat, cfg)
    assert out["approved"] == [1] and out["reroll"] == [73]
    assert st.species(73)["reroll_note"] == "fewer legs"
    done = manifest.finalize(st, cat, cfg, mask_fn=stub_mask, log=_quiet)
    assert done == [1]
    n = manifest.build(st, cat, cfg)
    m = json.loads(manifest.MANIFEST_PATH.read_text())
    rec = m["species"]["1"]
    assert n == 1 and rec["anchor"] == "bottom-center" and rec["method"] == "B" and rec["blend"] == "normal"
    for k in ("cutout", "thumb"):
        im = Image.open(work.parent.parent / rec[k])
        assert im.format == "WEBP" and im.mode == "RGBA"
        assert im.size == ((1024, 1024) if k == "cutout" else (256, 256))
    print("ok  review -> finalize -> manifest: approved #1 exported as WebP, #73 marked reroll with note")


def main():
    cat, cfg = catalogue.load(), config.load()
    with tempfile.TemporaryDirectory() as d:
        work = _sandbox(Path(d))
        test_prompts(cat, cfg)
        test_sync_idempotent(cat, cfg, work)
        test_moderation(cat, cfg, work)
        test_quota(cat, cfg, work)
        test_budget(cat, cfg, work)
        test_batch(cat, cfg, work)
        st = test_cutouts(cat, cfg, work)
        test_normalize(cfg)
        test_review_and_manifest(cat, cfg, st, work)
    print("\nselftest passed")
