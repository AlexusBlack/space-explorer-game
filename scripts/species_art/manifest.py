"""Review application, final export (cutout + thumb) and species_images.json."""

import json

from . import cutout, normalize
from .config import CUTOUT_DIR, MANIFEST_PATH, REPO, THUMB_DIR, VARIANT_DIR
from .selection import method_for
from .state import atomic_write_json, now

OK_VERDICTS = ("approve", "accept")


def cut_job(state, job, method, cfg, mask_fn=None):
    """Cut one raw with one method into work/variants; record in state."""
    from PIL import Image
    rgba, stats = cutout.cut(REPO / job["raw_path"], method, cfg, mask_fn=mask_fn)
    path = VARIANT_DIR / job["slug"] / f"{job['id']}.{method}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(path)
    with state.lock:
        state.species(job["species_id"])["cutouts"][f"{job['id']}:{method}"] = {
            "path": str(path.relative_to(REPO)), "stats": stats, "at": now()}
    return path, stats


def apply_review(state, review, cat, cfg):
    """Fold review.json into species status. Returns {status: [ids]}."""
    by_species = {}
    for item, rv in review["items"].items():
        by_species.setdefault(rv["species_id"], []).append((item, rv))
    out = {"approved": [], "reroll": [], "rejected": [], "undecided": []}
    for sid in sorted(set(by_species) | {int(k) for k in review["picks"]}):
        items = dict(by_species.get(sid, []))
        sp_state = state.species(sid)
        pick = review["picks"].get(str(sid))
        approved = [i for i, rv in items.items() if rv.get("verdict") in OK_VERDICTS]
        if not pick and len(approved) == 1:
            pick = approved[0]
        if pick and items.get(pick, {}).get("verdict") in OK_VERDICTS:
            job_id, method = pick.split(":")
            if method == "raw":
                method = method_for(cat[sid], cfg)
            sp_state.update(status="approved", selected={"job": job_id, "method": method},
                            review_notes=items[pick].get("notes", ""))
            out["approved"].append(sid)
        elif any(rv.get("verdict") == "reroll" for rv in items.values()):
            notes = "; ".join(rv["notes"] for rv in items.values()
                              if rv.get("verdict") == "reroll" and rv.get("notes"))
            sp_state.update(status="reroll", reroll_note=notes or None)
            out["reroll"].append(sid)
        elif items and all(rv.get("verdict") == "reject" for rv in items.values()):
            sp_state.update(status="rejected")
            out["rejected"].append(sid)
        else:
            out["undecided"].append(sid)
    state.save()
    return out


def finalize(state, cat, cfg, ids=None, mask_fn=None, log=print):
    done = []
    for sid_s, sp_state in sorted(state.data["species"].items(), key=lambda kv: int(kv[0])):
        sid = int(sid_s)
        if sp_state.get("status") != "approved" or (ids and sid not in ids):
            continue
        sel = sp_state["selected"]
        job = state.jobs[sel["job"]]
        key = f"{sel['job']}:{sel['method']}"
        if key not in sp_state["cutouts"]:
            cut_job(state, job, sel["method"], cfg, mask_fn=mask_fn)
        from PIL import Image
        rgba = Image.open(REPO / sp_state["cutouts"][key]["path"]).convert("RGBA")
        canvas, meta = normalize.normalize(rgba, cat[sid].body_plan, cfg)
        slug = cat[sid].slug
        cpath, tpath = CUTOUT_DIR / f"{slug}.webp", THUMB_DIR / f"{slug}.webp"
        normalize.save_final(canvas, cpath, tpath, cfg)
        sp_state["final"] = {**meta, "cutout": str(cpath.relative_to(REPO)),
                             "thumb": str(tpath.relative_to(REPO)), "at": now()}
        done.append(sid)
        log(f"  final {slug}")
    state.save()
    return done


def build(state, cat, cfg):
    species = {}
    for sid_s, sp_state in sorted(state.data["species"].items(), key=lambda kv: int(kv[0])):
        if "final" not in sp_state:
            continue
        sid = int(sid_s)
        sel, fin = sp_state["selected"], sp_state["final"]
        job = state.jobs[sel["job"]]
        attempts = [j for j in state.jobs_for_species(sid) if j["status"] == "done"]
        species[sid_s] = {
            "id": sid, "key": cat[sid].key,
            "cutout": fin["cutout"], "thumb": fin["thumb"], "raw": job["raw_path"],
            "anchor": fin["anchor"], "pivot": fin["pivot"], "bbox": fin["bbox"],
            "blend": "screen" if sel["method"] == "C2" else "normal",
            "method": sel["method"], "style": job["style"], "model": job["model"],
            "quality": job["quality"], "size": job["size"], "prompt": job["prompt"],
            "prompt_hash": job["params_hash"], "attempts": len(attempts),
            "cost_usd": round(sum(j["cost_usd"] for j in attempts), 4),
            "status": sp_state["status"], "review_notes": sp_state.get("review_notes", ""),
        }
    c = cfg["canvas"]
    atomic_write_json(MANIFEST_PATH, {"version": 1, "canvas": {"w": c["size"], "h": c["size"]},
                                      "generated": now(), "species": species})
    return len(species)


def load_manifest():
    return json.loads(MANIFEST_PATH.read_text()) if MANIFEST_PATH.exists() else None
