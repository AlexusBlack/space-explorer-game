"""Resumable run state (species/work/state.json).

A *job* is one paid image generation. Its params hash covers everything that
affects the output (model|size|quality|style|bg|prompt); a job id is
"<hash12>-a<attempt>". Re-planning a stage produces the same hashes, so any
param set that already has a done job is skipped -> re-running never re-bills.
"""

import hashlib
import json
import os
import threading
from datetime import datetime, timezone

from .config import STATE_PATH, WORK

DONE = "done"
TERMINAL = {"done", "failed", "moderation_blocked"}
IN_FLIGHT = {"submitted", "batched"}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def params_hash(model, size, quality, style, bg, prompt):
    return hashlib.sha1("|".join((model, size, quality, style, bg, prompt)).encode()).hexdigest()


def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


class State:
    def __init__(self, path=STATE_PATH):
        self.path = path
        self.lock = threading.RLock()
        if path.exists():
            self.data = json.loads(path.read_text())
        else:
            self.data = {"version": 1, "jobs": {}, "species": {}, "batches": {},
                         "spend": {"total": 0.0, "by_stage": {}}}

    # ---- persistence -------------------------------------------------
    def save(self):
        with self.lock:
            atomic_write_json(self.path, self.data)

    # ---- jobs --------------------------------------------------------
    @property
    def jobs(self):
        return self.data["jobs"]

    def jobs_for_hash(self, h):
        return [j for j in self.jobs.values() if j["params_hash"] == h]

    def jobs_for_species(self, sid):
        return sorted((j for j in self.jobs.values() if j["species_id"] == sid),
                      key=lambda j: j["created"])

    def ensure_job(self, spec, stage, new_attempt=False):
        """Return (job, created). Reuses an existing job for this param set unless
        new_attempt=True (reroll), which always adds attempt n+1."""
        h = params_hash(spec["model"], spec["size"], spec["quality"], spec["style"],
                        spec["bg"], spec["prompt"])
        with self.lock:
            existing = self.jobs_for_hash(h)
            if existing and not new_attempt:
                live = [j for j in existing if j["status"] not in ("failed",)]
                if live:
                    return live[-1], False
            attempt = len(existing) + 1
            job = {
                **spec, "id": f"{h[:12]}-a{attempt}", "params_hash": h, "attempt": attempt,
                "stage": stage, "status": "pending", "created": now(), "finished": None,
                "raw_path": None, "usage": None, "cost_usd": 0.0, "cost_source": None,
                "reserved_usd": 0.0, "error": None, "batch_id": None, "flags": [],
            }
            self.jobs[job["id"]] = job
            return job, True

    def attempts_for(self, job):
        """Finished paid attempts for this species in the same configuration
        (bg/style/model/quality); reroll notes change the prompt but still count."""
        same = ("species_id", "bg", "style", "model", "quality")
        return sum(1 for j in self.jobs.values()
                   if all(j[k] == job[k] for k in same) and j["status"] in TERMINAL)

    def update_job(self, jid, **fields):
        with self.lock:
            self.jobs[jid].update(fields)
            self.save()

    # ---- species-level ----------------------------------------------
    def species(self, sid):
        return self.data["species"].setdefault(str(sid), {"status": "new", "cutouts": {}})

    # ---- spend -------------------------------------------------------
    def add_spend(self, stage, usd):
        with self.lock:
            sp = self.data["spend"]
            sp["total"] = round(sp["total"] + usd, 6)
            sp["by_stage"][stage] = round(sp["by_stage"].get(stage, 0.0) + usd, 6)

    def spent(self, stage=None):
        sp = self.data["spend"]
        return sp["total"] if stage is None else sp["by_stage"].get(stage, 0.0)

    def reserved(self, stage=None):
        """Estimated cost of jobs billed-but-not-yet-reconciled (in-flight batches)."""
        return sum(j["reserved_usd"] for j in self.jobs.values()
                   if j["status"] in IN_FLIGHT and (stage is None or j["stage"] == stage))


def raw_dir_for(slug):
    return WORK / "raw" / slug
