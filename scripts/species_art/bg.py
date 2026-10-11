"""Generate ONE planet landscape background, same spirit as one.py (no state, no review stage).

  python -m scripts.species_art.bg --list                                  # all pairs + image counts
  python -m scripts.species_art.bg --sprite planet-fruit --variant planet   # prompt + estimate only
  python -m scripts.species_art.bg --sprite planet-fruit --variant planet --yes   # one paid call
  python -m scripts.species_art.bg --export   # free: finals -> backgrounds/images(-opt)
  python -m scripts.species_art.bg --saturn-base --yes                     # gas giant step 1
  python -m scripts.species_art.bg --sprite planet-whales --base FILE --yes   # step 2: edit FILE

Output: species/work/bg/<sprite>-<variant>-<n>.png (+ .txt with prompt, model, cost), and
species/work/bg/index.html, a newest-first gallery to open through ./serve.sh.
"""

import argparse
import base64
import html
import json
import shutil
import socket
from pathlib import Path

from . import backgrounds, config, costing
from .config import WORK

OUT_DIR = WORK / "bg"
# The Saturn base every gas giant is edited from (picked in review: band right of centre, crisp
# gaps), so all six share one ring layout. Committed (it was saturn-base-4.png in the work
# folder) so gas giants can be regenerated from git alone. --base overrides it.
GAS_BASE = config.REPO / "backgrounds" / "saturn-base.png"
SIZE = "1024x1024"
# Finals for the game, mirroring species/images(-opt): PNG masters and WebPs to load.
FINAL_DIR = config.REPO / "backgrounds" / "images"
OPT_DIR = config.REPO / "backgrounds" / "images-opt"
RECIPE_DIR = config.REPO / "backgrounds" / "recipes"  # each final's sidecar: model, base, prompt
OPT_SIZE = 512
MODEL = "gpt-image-2.5-flare"


def images_of(sprite, variant):
    stem = f"{sprite}-{variant}-"
    return sorted((p for p in OUT_DIR.glob(f"{stem}*.png") if p.stem[len(stem):].isdigit()),
                  key=lambda p: int(p.stem[len(stem):]))


def lan_url(path, port):
    """URL of a repo file as served by ./serve.sh, reachable from another device on the LAN."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))  # UDP connect sends nothing; it only picks the LAN interface
        ip = s.getsockname()[0]
    except OSError:
        ip = "localhost"
    finally:
        s.close()
    return f"http://{ip}:{port}/{path.relative_to(config.REPO).as_posix()}"


def write_gallery():
    """index.html in OUT_DIR: every image, newest first, with its settings and prompt."""
    pngs = sorted(OUT_DIR.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    cards = []
    for p in pngs:
        txt = p.with_suffix(".txt")
        meta = txt.read_text() if txt.exists() else ""
        head, _, prompt = meta.partition("\n\n")
        v = int(p.stat().st_mtime)
        cards.append(
            f'<figure><a href="{p.name}?v={v}"><img src="{p.name}?v={v}" loading="lazy"></a>'
            f"<figcaption><b>{html.escape(p.stem)}</b><pre>{html.escape(head)}</pre>"
            f"<details><summary>prompt</summary><p>{html.escape(prompt)}</p></details>"
            "</figcaption></figure>")
    (OUT_DIR / "index.html").write_text(
        "<!doctype html><meta charset=utf-8>"
        '<meta name=viewport content="width=device-width,initial-scale=1">'
        "<title>Planet backgrounds</title><style>"
        "body{margin:0;padding:16px;background:#111;color:#ddd;font:15px system-ui}"
        "figure{margin:0 0 32px}img{width:100%;max-width:1024px;display:block}"
        "pre{white-space:pre-wrap;font-size:12px;opacity:.7;margin:4px 0}"
        "summary{cursor:pointer;opacity:.8}</style>"
        f"<h1>Planet backgrounds ({len(pngs)})</h1>" + "".join(cards))
    write_current()


def write_current():
    """current.html in OUT_DIR: the newest image of every pair, in catalogue order, as a grid."""
    cells = []
    for sprite, variant in backgrounds.combos():
        imgs = images_of(sprite, variant)
        if not imgs:
            cells.append(f"<figure><div class=gap>missing</div><figcaption>{sprite} · "
                         f"{variant}</figcaption></figure>")
            continue
        p = imgs[-1]
        v = int(p.stat().st_mtime)
        cells.append(f'<figure><a href="{p.name}?v={v}"><img src="{p.name}?v={v}" '
                     f'loading="lazy"></a><figcaption>{html.escape(p.stem)}</figcaption></figure>')
    (OUT_DIR / "current.html").write_text(
        "<!doctype html><meta charset=utf-8>"
        '<meta name=viewport content="width=device-width,initial-scale=1">'
        "<title>Current backgrounds</title><style>"
        "body{margin:0;padding:16px;background:#111;color:#ddd;font:14px system-ui}"
        "main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}"
        "figure{margin:0}img,.gap{width:100%;aspect-ratio:1;display:block;object-fit:cover}"
        ".gap{background:#222;display:grid;place-items:center}figcaption{opacity:.8}</style>"
        f"<h1>Current backgrounds ({len(cells)})</h1><main>" + "".join(cells) + "</main>")


def export():
    """Copy the newest image of every pair to FINAL_DIR as <sprite>-<variant>.png and write a
    OPT_SIZE² WebP of it to OPT_DIR (same settings as the species portraits), and its sidecar
    to RECIPE_DIR."""
    from PIL import Image
    missing = [f"{s} {v}" for s, v in backgrounds.combos() if not images_of(s, v)]
    if missing:
        raise SystemExit("no image yet for: " + ", ".join(missing))
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    OPT_DIR.mkdir(parents=True, exist_ok=True)
    RECIPE_DIR.mkdir(parents=True, exist_ok=True)
    for sprite, variant in backgrounds.combos():
        src = images_of(sprite, variant)[-1]
        name = f"{sprite}-{variant}"
        img = Image.open(src).convert("RGB")
        img.save(FINAL_DIR / f"{name}.png", optimize=True)
        img.resize((OPT_SIZE, OPT_SIZE), Image.LANCZOS).save(
            OPT_DIR / f"{name}.webp", quality=85, method=6)
        shutil.copyfile(src.with_suffix(".txt"), RECIPE_DIR / f"{name}.txt")
        print(f"{src.name:36} -> {name}")


def list_combos():
    pairs = backgrounds.combos()
    for sprite, variant in pairs:
        n = len(images_of(sprite, variant))
        print(f"{sprite:20} {backgrounds.SPRITES[sprite][0]:16} {variant:12} {n or '-'}")
    done = sum(1 for s, v in pairs if images_of(s, v))
    print(f"\n{len(pairs)} pairs, {done} with at least one image")


def main():
    ap = argparse.ArgumentParser(prog="bg")
    ap.add_argument("--list", action="store_true", help="list every sprite/variant pair")
    ap.add_argument("--gallery", action="store_true", help="free: rebuild index.html only")
    ap.add_argument("--export", action="store_true",
                    help="free: newest image per pair -> backgrounds/images(-opt)")
    ap.add_argument("--saturn-base", action="store_true",
                    help="gas giant step 1: a plain view from Saturn's cloud tops")
    ap.add_argument("--base", type=Path, default=None, metavar="FILE",
                    help="gas giant step 2: the Saturn base to edit (default: GAS_BASE)")
    ap.add_argument("--sprite", choices=sorted(backgrounds.SPRITES))
    ap.add_argument("--variant", choices=["planet", "giant-moon", "planet-moon"], default="planet")
    ap.add_argument("--quality", choices=["low", "medium", "high"], default="medium")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--note", default=None, help="extra correction appended to the prompt")
    ap.add_argument("--port", type=int, default=8080, help="./serve.sh port, for printed URLs")
    ap.add_argument("--yes", action="store_true", help="actually call the API (paid)")
    args = ap.parse_args()

    if args.list:
        list_combos()
        return
    if args.export:
        export()
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.gallery:
        write_gallery()
        print(lan_url(OUT_DIR, args.port) + "/")
        return
    if args.saturn_base:
        args.sprite, args.variant = "saturn", "base"
    elif not args.sprite:
        ap.error("--sprite is required (or use --list / --gallery / --saturn-base)")

    if (args.base is None and not args.saturn_base
            and backgrounds.SPRITES[args.sprite][0] == "gas-giant"):
        args.base = GAS_BASE
    cfg = config.load()
    try:
        if args.saturn_base:
            prompt = backgrounds.SATURN_BASE + (f" Correction: {args.note}" if args.note else "")
        elif args.base:
            prompt = backgrounds.build_gas_edit(args.sprite, args.note)
        else:
            prompt = backgrounds.build(args.sprite, args.variant, args.note)
    except ValueError as e:
        raise SystemExit(str(e)) from None
    if args.base and not args.base.is_file():
        raise SystemExit(f"no such base image: {args.base}")
    est = costing.estimate(cfg, args.quality, SIZE, prompt)
    if args.base:
        est += 0.01  # rough: the base image is billed as image input tokens
    print(f"{args.sprite} {args.variant}  {args.model}  {args.quality}  {SIZE}"
          f"{'  edit of ' + str(args.base) if args.base else ''}  est ${est:.3f}\n\n{prompt}\n")
    if not args.yes:
        print("(no API call; add --yes to generate)")
        return

    from .openai_images import OpenAIClient, scrub
    client = OpenAIClient(cfg)
    try:
        if args.base:
            with open(args.base, "rb") as f:
                resp = client.sdk.images.edit(
                    model=args.model, image=f, prompt=prompt, size=SIZE, quality=args.quality,
                    output_format="png", background="opaque", n=1)
        else:
            resp = client.sdk.images.generate(
                model=args.model, prompt=prompt, size=SIZE, quality=args.quality,
                output_format="png", background="opaque", moderation=cfg["moderation"], n=1)
    except Exception as e:  # noqa: BLE001 - one-shot tool: report and stop
        raise SystemExit(f"API error: {scrub(e)}") from None

    usage = resp.usage.model_dump() if resp.usage else None
    usd = costing.actual_from_usage(cfg, usage)
    taken = images_of(args.sprite, args.variant)
    n = 1 + (int(taken[-1].stem.rsplit("-", 1)[1]) if taken else 0)
    png = OUT_DIR / f"{args.sprite}-{args.variant}-{n}.png"
    png.write_bytes(base64.b64decode(resp.data[0].b64_json))
    png.with_suffix(".txt").write_text(
        f"model: {args.model}\nquality: {args.quality}\nnote: {args.note}\nbase: {args.base}\n"
        f"cost_usd: {usd}\nusage: {json.dumps(usage)}\n\n{prompt}\n")
    costing.log_spend({"species_id": None, "id": png.stem, "stage": "bg", "usage": usage},
                      usd if usd is not None else est, "usage" if usd is not None else "estimate")
    write_gallery()
    print(f"wrote {png.relative_to(config.REPO)}  cost ${usd if usd is not None else est:.4f}")
    print(f"image   {lan_url(png, args.port)}\ngallery {lan_url(OUT_DIR, args.port)}/")


if __name__ == "__main__":
    main()
