"""Command line for the species portrait pipeline. See README.md for the stage walkthrough.

Every paid command prints its plan + estimate and does nothing unless --yes is given.
"""

import argparse
import json
import re
import sys
from collections import Counter

from . import catalogue, config, costing, manifest, selection
from .config import METHOD_BG, PROMPT_DIR, WORK
from .state import State

STAGES = ("pilot", "transparency", "bulk1", "rest")
REROLL_HEADROOM = 0.30
SETTING_RE = re.compile(
    r"\b(standing on|perched on|sitting on|clinging to|roosting|basking|hovering at|"
    r"under (?:a|the) |over (?:a|the|storm)|beside|sky|cavern|tunnel|ice floe|"
    r"on (?:a |the )?(?:leaf|branch|trunk|wall|rock|sand|ice|lava|seabed|reef))", re.I)


# ---- helpers ------------------------------------------------------------------

def _sets_or_provisional(cat):
    """bulk1/rest ids: the saved sets, else what `bulk select` would pick (for dry runs)."""
    try:
        bulk1 = selection.read_set("bulk1")
    except FileNotFoundError:
        bulk1 = selection.stratified(cat, 50, exclude=set(selection.PILOT_IDS))
    try:
        rest = selection.read_set("rest")
    except FileNotFoundError:
        rest = [i for i in cat if i not in set(selection.PILOT_IDS) | set(bulk1)]
    return bulk1, rest


def _specs(stage, cat, cfg, ids=None):
    if stage in ("bulk1", "rest") and ids is None:
        bulk1, rest = _sets_or_provisional(cat)
        ids = bulk1 if stage == "bulk1" else rest
    return selection.stage_specs(stage, cat, cfg, ids)


def _dedupe(specs):
    seen, out = set(), []
    for s in specs:
        k = (s["model"], s["size"], s["quality"], s["style"], s["bg"], s["prompt"])
        if k not in seen:
            seen.add(k)
            out.append(s)
    return out


def _est(cfg, specs, batch=False):
    return sum(costing.estimate(cfg, s["quality"], s["size"], s["prompt"], batch) for s in specs)


def _confirm(args, n, usd, what):
    print(f"{what}: {n} image(s), estimated ${usd:.2f}")
    if args.dry_run:
        print("(dry run — nothing sent)")
        return False
    if not args.yes:
        print("Paid step: re-run with --yes to proceed.")
        return False
    return True


def _client(args):
    from .openai_images import OpenAIClient
    return OpenAIClient(args.cfg)


def _halt(summary):
    print(f"summary: {json.dumps({k: v for k, v in summary.items() if k != 'halted'})}")
    if summary.get("halted"):
        print(f"HALTED: {summary['halted']}")
        sys.exit(3)


# ---- commands -----------------------------------------------------------------

def cmd_dry_run(args):
    cat, cfg = catalogue.load(), args.cfg
    config.ensure_work_dirs()
    stages = STAGES if args.stage == "all" else (args.stage,)
    rows, seen_pilot = [], set()
    for stage in stages:
        specs = _dedupe(_specs(stage, cat, cfg))
        if stage == "pilot":
            seen_pilot = {s["prompt"] + s["model"] + s["quality"] for s in specs}
        billable = [s for s in specs if stage != "transparency"
                    or s["prompt"] + s["model"] + s["quality"] not in seen_pilot]
        batch = stage in ("bulk1", "rest")
        est = _est(cfg, billable, batch) + REROLL_HEADROOM * len(billable) * (
            _est(cfg, billable[:1]) if batch and billable else 0)
        _write_prompts(stage, specs, cfg, batch)
        rows.append((stage, len(specs), len(billable), "batch" if batch else "sync", est,
                     cfg["stage_caps"].get(stage)))
    # all 331 under locked settings, for reviewing the full prompt set
    all_specs = [selection.spec(sp, cfg, cfg["locked"]["style"], METHOD_BG[selection.method_for(sp, cfg)])
                 for sp in cat.values()]
    _write_prompts("all", all_specs, cfg, False)

    print(f"\nmodel {cfg['model']} · {cfg['size']} · {cfg['quality']} · style {cfg['locked']['style']} "
          f"· method {cfg['locked']['method']}\n")
    print(f"{'stage':<14}{'jobs':>6}{'billable':>10}{'mode':>7}{'est USD':>10}{'cap':>8}")
    for stage, n, b, mode, est, cap in rows:
        print(f"{stage:<14}{n:>6}{b:>10}{mode:>7}{est:>10.2f}{cap if cap is not None else '-':>8}")
    print(f"{'total':<14}{'':>6}{sum(r[2] for r in rows):>10}{'':>7}{sum(r[4] for r in rows):>10.2f}"
          f"{cfg['budget_usd_total']:>8}")
    print("(bulk estimates include ~30% sync reroll headroom; transparency excludes grey renders reused from pilot)")
    lint = [(sp.id, sp.key, m.group(0)) for sp in cat.values() for m in SETTING_RE.finditer(sp.visual)]
    print(f"\nprompts written to {PROMPT_DIR.relative_to(config.REPO)}/  ·  "
          f"{sum(sp.curated for sp in cat.values())} curated visuals  ·  setting-word lint hits: {len(lint)}")
    for sid, key, hit in lint:
        print(f"  lint #{sid} {key}: '{hit}'")


def _write_prompts(stage, specs, cfg, batch):
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROMPT_DIR / f"{stage}.jsonl", "w") as f:
        for s in specs:
            f.write(json.dumps({**s, "est_usd": round(costing.estimate(
                cfg, s["quality"], s["size"], s["prompt"], batch), 5)}, ensure_ascii=False) + "\n")


def cmd_run(args):
    """Synchronous stage run (pilot / transparency)."""
    cat, cfg, st = catalogue.load(), args.cfg, State()
    config.ensure_work_dirs()
    specs = _dedupe(_specs(args.stage, cat, cfg))
    jobs = []
    for s in specs:
        job, _ = st.ensure_job(s, args.stage)
        jobs.append(job)
    todo = [j for j in jobs if j["status"] == "pending"]
    if not _confirm(args, len(todo), _est(cfg, todo), f"stage {args.stage}"):
        return
    st.save()
    from .openai_images import run_sync
    _halt(run_sync(jobs, cfg, st, args.stage, _client(args)))


def cmd_bulk(args):
    cat, cfg = catalogue.load(), args.cfg
    config.ensure_work_dirs()
    if args.action == "select":
        if args.name == "bulk1":
            ids = selection.stratified(cat, args.n, exclude=set(selection.PILOT_IDS), seed=args.seed)
        else:
            taken = set(selection.PILOT_IDS) | set(selection.read_set("bulk1"))
            ids = [i for i in cat if i not in taken]
        selection.write_set(args.name, ids)
        groups = Counter(cat[i].group for i in ids)
        planets = Counter(p for i in ids for p in cat[i].planetoids)
        print(f"set {args.name}: {len(ids)} species\n  groups: {dict(groups)}\n  planets: {dict(planets)}")
        return
    st = State()
    if args.action == "submit":
        ids = selection.read_set(args.set)
        if args.chunk:
            ids = selection.chunk(ids, args.chunk, args.chunk_size)
        stage = args.set
        jobs = [st.ensure_job(s, stage)[0] for s in _dedupe(selection.stage_specs(stage, cat, cfg, ids))]
        todo = [j for j in jobs if j["status"] == "pending"]
        if not _confirm(args, len(todo), _est(cfg, todo, batch=True), f"batch {args.set}"
                        + (f" chunk {args.chunk}" if args.chunk else "")):
            return
        st.save()
        from .openai_images import batch_submit
        try:
            batch_submit(jobs, cfg, st, stage, _client(args), args.set)
        except costing.BudgetExceeded as e:
            print(f"HALTED: {e}")
            sys.exit(3)
    elif args.action == "collect":
        from .openai_images import batch_collect
        batch_collect(cfg, st, _client(args), set_name=args.set)
        pending = [j for j in st.jobs.values() if j["status"] == "pending" and j["stage"] in ("bulk1", "rest")]
        if pending:
            print(f"{len(pending)} job(s) back to pending (failed/expired in batch) — "
                  f"re-run `run-pending --stage <set>` to retry synchronously")


def cmd_run_pending(args):
    cat, cfg, st = catalogue.load(), args.cfg, State()
    jobs = [j for j in st.jobs.values() if j["status"] == "pending" and j["stage"] == args.stage]
    if not _confirm(args, len(jobs), _est(cfg, jobs), f"pending {args.stage} (sync)"):
        return
    from .openai_images import run_sync
    _halt(run_sync(jobs, cfg, st, args.stage, _client(args)))


def _scope_jobs(st, args):
    if args.id:
        ids = set(args.id)
    elif args.stage in ("pilot", "transparency"):
        ids = set(selection.PILOT_IDS if args.stage == "pilot" else selection.TRANSPARENCY_IDS)
    else:
        ids = set(selection.read_set(args.set or args.stage))
    jobs = [j for j in st.jobs.values() if j["status"] == "done" and j["species_id"] in ids]
    if args.stage in ("pilot", "transparency") and not args.id:
        jobs = [j for j in jobs if j["stage"] == args.stage or (args.stage == "transparency" and j["bg"] == "B")]
    return jobs


def cmd_cutout(args):
    cat, cfg, st = catalogue.load(), args.cfg, State()
    wanted = set(args.methods.split(",")) if args.methods else None
    n = 0
    for job in _scope_jobs(st, args):
        candidates = [m for m, bg in METHOD_BG.items() if bg == job["bg"]]
        methods = [m for m in candidates if (wanted is None and (
            args.stage == "transparency" or m == selection.method_for(cat[job["species_id"]], cfg)))
            or (wanted and m in wanted)]
        for m in methods:
            key = f"{job['id']}:{m}"
            if key in st.species(job["species_id"])["cutouts"] and not args.force:
                continue
            path, stats = manifest.cut_job(st, job, m, cfg)
            st.save()
            n += 1
            print(f"  cut {job['slug']:<16} {m:<3} cov {stats['coverage']:.3f} semi {stats['semi']:.3f} "
                  f"{' '.join(stats['flags'])}")
    print(f"{n} cutout(s) written")


def cmd_review(args):
    from .review_server import serve
    serve(args.port)


def cmd_apply_review(args):
    cat, cfg, st = catalogue.load(), args.cfg, State()
    from .review_server import load_review
    out = manifest.apply_review(st, load_review(), cat, cfg)
    for k, v in out.items():
        print(f"{k:<10} {len(v):>4}  {v if len(v) <= 20 else str(v[:20])[:-1] + ', ...]'}")


def cmd_reroll(args):
    cat, cfg, st = catalogue.load(), args.cfg, State()
    ids = args.id or [int(k) for k, v in st.data["species"].items() if v.get("status") == "reroll"]
    specs = []
    for sid in ids:
        sp = cat[sid]
        note = args.note or st.species(sid).get("reroll_note")
        specs.append(selection.spec(sp, cfg, cfg["locked"]["style"],
                                    METHOD_BG[selection.method_for(sp, cfg)], note=note))
    jobs = [st.ensure_job(s, "reroll", new_attempt=True)[0] for s in specs]
    capped = [j for j in jobs if st.attempts_for(j) >= cfg["max_attempts"]]
    for j in capped:
        print(f"  skip {j['slug']}: already {cfg['max_attempts']} attempts (raise max_attempts to allow more)")
    jobs = [j for j in jobs if j not in capped]
    for j in jobs:
        print(f"  reroll {j['slug']}" + (f"  note: {j['note']}" if j.get("note") else ""))
    if not _confirm(args, len(jobs), _est(cfg, jobs), "reroll"):
        for j in jobs + capped:  # don't leave unconfirmed attempts behind
            st.jobs.pop(j["id"], None)
        return
    for j in capped:
        st.jobs.pop(j["id"], None)
    for sid in ids:
        st.species(sid)["status"] = "rerolling"
    st.save()
    from .openai_images import run_sync
    _halt(run_sync(jobs, cfg, st, "reroll", _client(args)))


def cmd_recut(args):
    cfg, st = args.cfg, State()
    for sid in args.id:
        jobs = [j for j in st.jobs_for_species(sid) if j["status"] == "done"
                and METHOD_BG[args.method] == j["bg"]]
        if args.job:
            jobs = [j for j in jobs if j["id"] == args.job]
        if not jobs:
            print(f"  #{sid}: no done generation with a {METHOD_BG[args.method]} background")
            continue
        path, stats = manifest.cut_job(st, jobs[-1], args.method, cfg)
        st.save()
        print(f"  recut #{sid} {args.method} -> {path.relative_to(config.REPO)} {stats}")


def cmd_status(args):
    st = State()
    jobs = st.jobs.values()
    print("jobs by status:", dict(Counter(j["status"] for j in jobs)))
    print("jobs by stage: ", dict(Counter(j["stage"] for j in jobs)))
    print("species:       ", dict(Counter(v.get("status", "new") for v in st.data["species"].values())))
    print(f"spend: ${st.spent():.4f} total · " + ", ".join(
        f"{k} ${v:.4f}" for k, v in st.data["spend"]["by_stage"].items()) + f" · reserved ${st.reserved():.4f}")
    open_b = {k: v["status"] for k, v in st.data["batches"].items() if v["status"] not in ("collected",)}
    print("open batches:  ", open_b or "none")
    dup = [h for h, n in Counter(j["params_hash"] for j in jobs if j["status"] == "done"
                                  and j["stage"] != "reroll").items() if n > 1]
    print(f"duplicate done jobs (should be 0): {len(dup)}")


def cmd_report(args):
    cfg, st = args.cfg, State()
    jobs = [j for j in st.jobs.values() if j["stage"] == args.stage
            or (args.stage in ("bulk1", "rest") and j["stage"] == "reroll")]
    done = [j for j in jobs if j["status"] == "done"]
    batch = args.stage in ("bulk1", "rest")
    est = sum(costing.estimate(cfg, j["quality"], j["size"], j["prompt"],
                               batch and j["stage"] != "reroll") for j in done)
    act = sum(j["cost_usd"] for j in done)
    per_species = Counter(j["species_id"] for j in done)
    failed = [j for j in jobs if j["status"] in ("failed", "moderation_blocked")]
    print(f"stage {args.stage}: {len(done)} done, {len(failed)} failed/blocked "
          f"({len(failed) / max(len(jobs), 1):.0%} failure rate)")
    print(f"cost: actual ${act:.4f} vs estimate ${est:.4f} ({(act / est - 1) if est else 0:+.1%})  "
          f"[{Counter(j['cost_source'] for j in done)}]")
    print(f"avg attempts per species: {sum(per_species.values()) / max(len(per_species), 1):.2f}")
    flags = Counter(f for j in done for f in j["flags"])
    if flags:
        print("flags:", dict(flags))
    for j in failed:
        print(f"  {j['status']}: {j['slug']} {j['error'][:120] if j['error'] else ''}")


def cmd_contact_sheet(args):
    from PIL import Image, ImageDraw
    st = State()
    jobs = sorted(_scope_jobs(st, args), key=lambda j: (j["species_id"], j["created"]))
    tiles = []
    for j in jobs:
        tiles.append((f"#{j['species_id']} {j['bg']}{j['style']} {j['quality']} raw", config.REPO / j["raw_path"]))
        for key, c in st.species(j["species_id"])["cutouts"].items():
            if key.startswith(j["id"] + ":"):
                tiles.append((f"#{j['species_id']} cut {key.split(':')[1]}", config.REPO / c["path"]))
    if not tiles:
        print("nothing to draw")
        return
    T, cols = 256, 6
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * T, rows * (T + 18)), (40, 40, 44))
    d = ImageDraw.Draw(sheet)
    for i, (label, path) in enumerate(tiles):
        x, y = (i % cols) * T, (i // cols) * (T + 18)
        bg = Image.new("RGB", (T, T), (208, 58, 176) if "cut" in label else (242, 242, 242))
        im = Image.open(path).convert("RGBA")
        im.thumbnail((T, T))
        bg.paste(im, ((T - im.width) // 2, (T - im.height) // 2), im)
        sheet.paste(bg, (x, y))
        d.text((x + 4, y + T + 3), label, fill=(230, 230, 230))
    name = args.set or args.stage or "ids"
    out = WORK / f"contact-{name}.png"
    sheet.save(out)
    print(f"wrote {out.relative_to(config.REPO)} ({len(tiles)} tiles)")


def cmd_finalize(args):
    cat, cfg, st = catalogue.load(), args.cfg, State()
    done = manifest.finalize(st, cat, cfg, ids=set(args.id) if args.id else None)
    n = manifest.build(st, cat, cfg)
    print(f"finalized {len(done)} species; manifest has {n} entries")


def cmd_manifest(args):
    cat, cfg, st = catalogue.load(), args.cfg, State()
    print(f"manifest has {manifest.build(st, cat, cfg)} entries")


def cmd_selftest(args):
    from . import selftest
    selftest.main()


# ---- parser -------------------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="python -m scripts.species_art")
    sub = p.add_subparsers(dest="cmd", required=True)

    def paid(sp):
        sp.add_argument("--dry-run", action="store_true", help="show plan + estimate only")
        sp.add_argument("--yes", action="store_true", help="actually spend money")

    def scope(sp):
        sp.add_argument("--stage", choices=STAGES)
        sp.add_argument("--set")
        sp.add_argument("--id", type=int, nargs="+")

    s = sub.add_parser("dry-run", help="write every prompt + per-stage cost table (no API)")
    s.add_argument("--stage", default="all", choices=STAGES + ("all",))
    s.set_defaults(fn=cmd_dry_run)

    for name in ("pilot", "transparency"):
        s = sub.add_parser(name, help=f"run stage '{name}' synchronously")
        paid(s)
        s.set_defaults(fn=cmd_run, stage=name)

    s = sub.add_parser("bulk", help="bulk sets via the Batch API")
    s.add_argument("action", choices=("select", "submit", "collect"))
    s.add_argument("--name", choices=("bulk1", "rest"), default="bulk1", help="select: which set")
    s.add_argument("--n", type=int, default=50)
    s.add_argument("--seed", type=int, default=1)
    s.add_argument("--set", choices=("bulk1", "rest"))
    s.add_argument("--chunk", type=int, help="1-based chunk of the set")
    s.add_argument("--chunk-size", type=int, default=50)
    paid(s)
    s.set_defaults(fn=cmd_bulk)

    s = sub.add_parser("run-pending", help="retry pending jobs of a stage synchronously")
    s.add_argument("--stage", required=True, choices=STAGES + ("reroll",))
    paid(s)
    s.set_defaults(fn=cmd_run_pending)

    s = sub.add_parser("cutout", help="cut raws (free, local)")
    scope(s)
    s.add_argument("--methods", help="comma list of A,B,C1,C2,D (default: stage-appropriate)")
    s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_cutout)

    s = sub.add_parser("review", help="serve the review contact sheet")
    s.add_argument("--port", type=int, default=8765)
    s.set_defaults(fn=cmd_review)

    s = sub.add_parser("apply-review", help="fold review.json verdicts into state")
    s.set_defaults(fn=cmd_apply_review)

    s = sub.add_parser("reroll", help="new attempt for species (default: those marked reroll)")
    s.add_argument("--id", type=int, nargs="+")
    s.add_argument("--note", help="correction appended to the prompt")
    paid(s)
    s.set_defaults(fn=cmd_reroll)

    s = sub.add_parser("recut", help="re-cut a species' latest raw with another method (free)")
    s.add_argument("--id", type=int, nargs="+", required=True)
    s.add_argument("--method", required=True, choices=config.METHODS)
    s.add_argument("--job")
    s.set_defaults(fn=cmd_recut)

    sub.add_parser("status").set_defaults(fn=cmd_status)
    s = sub.add_parser("report", help="actual vs estimate, failure rate, attempts")
    s.add_argument("--stage", required=True, choices=STAGES + ("reroll",))
    s.set_defaults(fn=cmd_report)

    s = sub.add_parser("contact-sheet", help="PNG grid of raws + cutouts (no browser needed)")
    scope(s)
    s.set_defaults(fn=cmd_contact_sheet)

    s = sub.add_parser("finalize", help="normalise approved cutouts into species/images + manifest")
    s.add_argument("--id", type=int, nargs="+")
    s.set_defaults(fn=cmd_finalize)
    sub.add_parser("manifest", help="rebuild species/species_images.json").set_defaults(fn=cmd_manifest)
    sub.add_parser("selftest", help="offline tests with a mock API").set_defaults(fn=cmd_selftest)
    return p


def main(argv=None):
    sys.stdout.reconfigure(line_buffering=True)  # progress shows live when redirected to a log
    args = build_parser().parse_args(argv)
    args.cfg = config.load()
    args.fn(args)
