"""Which species go into which stage, and the job specs each stage needs."""

import random
from collections import Counter, defaultdict

from . import prompts
from .config import METHOD_BG, SET_DIR

PILOT_IDS = [1, 2, 73, 116, 147, 182, 205, 238, 258, 278, 300, 304, 305]
STYLE_SUBSET = [1, 73, 205, 278, 300, 182]       # alt style blocks B, C
MODEL_SUBSET = [2, 116, 258, 304]                # alt model comparison
QUALITY_SUBSET = [1, 73, 278, 300]               # low + high for the quality call
TRANSPARENCY_IDS = [1, 73, 205, 278, 2, 182, 300, 305]
PLANETS = ("rocky", "frozen", "gas_giant", "toxic", "molten")


def spec(sp, cfg, style, bg, model=None, quality=None, note=None):
    return {
        "species_id": sp.id, "key": sp.key, "slug": sp.slug,
        "model": model or cfg["model"], "size": cfg["size"],
        "quality": quality or cfg["quality"], "style": style, "bg": bg,
        "note": note, "prompt": prompts.build(sp, style, bg, note),
    }


def method_for(sp, cfg):
    return sp.method or cfg["locked"]["method"]


def stage_specs(stage, cat, cfg, ids=None):
    """Return the list of job specs a stage needs (idempotent: same input -> same specs)."""
    style = cfg["locked"]["style"]
    if stage == "pilot":
        out = [spec(cat[i], cfg, "A", "B") for i in PILOT_IDS]
        out += [spec(cat[i], cfg, s, "B") for s in ("B", "C") for i in STYLE_SUBSET]
        out += [spec(cat[i], cfg, "A", "B", model=cfg["pilot"]["alt_model"]) for i in MODEL_SUBSET]
        out += [spec(cat[i], cfg, "A", "B", quality=q) for q in ("low", "high") for i in QUALITY_SUBSET]
        return out
    if stage == "transparency":
        return [spec(cat[i], cfg, style, bg) for i in TRANSPARENCY_IDS for bg in ("A", "B", "C", "D")]
    # bulk sets: one job per species using its method's background
    ids = ids if ids is not None else read_set(stage)
    return [spec(cat[i], cfg, style, METHOD_BG[method_for(cat[i], cfg)]) for i in ids]


# ---- sets -------------------------------------------------------------

def read_set(name):
    p = SET_DIR / f"{name}.ids"
    if not p.exists():
        raise FileNotFoundError(f"no set '{name}' — run `bulk select` first ({p})")
    return [int(x) for x in p.read_text().split()]


def write_set(name, ids):
    SET_DIR.mkdir(parents=True, exist_ok=True)
    (SET_DIR / f"{name}.ids").write_text("\n".join(str(i) for i in ids) + "\n")


def chunk(ids, n, size=50):
    return ids[(n - 1) * size: n * size]


def stratified(cat, n, exclude, seed=1):
    """Pick n species proportionally across groups (each group >= 1), and within each
    group greedily favour planet types covered least so far."""
    rng = random.Random(seed)
    pool = defaultdict(list)
    for sp in cat.values():
        if sp.id not in exclude:
            pool[sp.group].append(sp)
    for g in pool:
        pool[g].sort(key=lambda s: s.id)
        rng.shuffle(pool[g])
    total = sum(len(v) for v in pool.values())
    raw = {g: n * len(v) / total for g, v in pool.items()}
    quota = {g: max(1, int(q)) for g, q in raw.items()}
    for g in sorted(raw, key=lambda g: raw[g] - int(raw[g]), reverse=True):
        if sum(quota.values()) >= n:
            break
        quota[g] += 1
    while sum(quota.values()) > n:  # min-1 floors can overshoot; trim the largest
        quota[max(quota, key=quota.get)] -= 1

    covered = Counter()
    picked = []
    for g in sorted(pool):
        cands = list(pool[g])
        for _ in range(min(quota[g], len(cands))):
            best = min(cands, key=lambda s: min(covered[p] for p in s.planetoids))
            cands.remove(best)
            picked.append(best.id)
            covered.update(best.planetoids)
    return sorted(picked)
