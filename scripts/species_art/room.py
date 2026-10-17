"""Generate ONE room background, same spirit as bg.py (no state, no review stage).

  python -m scripts.species_art.room --list                                    # base pairs + counts
  python -m scripts.species_art.room --class rocky --gov democracy       # prompt + estimate
  python -m scripts.species_art.room --class rocky --gov democracy --yes # one paid call
  python -m scripts.species_art.room --class ice --ethic militarist      # ethic room prompt
  python -m scripts.species_art.room --check FILE                               # free: alpha checks
  python -m scripts.species_art.room --composite FILE --species 332 --landscape planet-inhabited-planet
  python -m scripts.species_art.room --gallery                                  # free
  python -m scripts.species_art.room --export                                   # free: finals -> rooms/

Output: species/work/room/<class>-<gov or ethic>-<n>.png (native transparency, + .txt sidecar),
-check.png (over magenta, black, checkerboard), -comp.png (landscape + room + portrait), and
species/work/room/index.html, a newest-first gallery to open through ./serve.sh.
--export copies the newest image of every room to rooms/images/ (PNG master), rooms/images-opt/
(OPT_SIZE WebP with alpha, for the game) and its sidecar to rooms/recipes/.
"""

import argparse
import base64
import html
import json
import shutil
from pathlib import Path

from . import config, costing, rooms
from .bg import lan_url
from .config import WORK
from .one import snap_alpha, write_check

OUT_DIR = WORK / "room"
SIZE = "1536x1024"
MODEL = "gpt-image-2.5-flare"
LANDSCAPES = config.REPO / "backgrounds" / "images"
PORTRAITS = config.REPO / "species" / "images"
# The landscape behind the window is scaled to this many times the window's larger side: just
# enough margin that the frame never shows its edge, so the square window shows almost all of it.
LANDSCAPE_COVER = 1.1
EXTRA_HOLES_MAX = 0.005  # share of the image clear outside the window before it's flagged
MULLION_GAP = 0.03  # clear regions closer than this share of the width count as one window
HAZE_MAX = 0.02  # share of the room (outside the window) semi-transparent before it's flagged
ROOM_OPAQUE = 240  # flare returns the room's opaque pixels at 248-249; snap from here up to 255
SUFFIXES = ("-raw", "-check", "-comp")
FINAL_DIR = config.REPO / "rooms" / "images"
OPT_DIR = config.REPO / "rooms" / "images-opt"
RECIPE_DIR = config.REPO / "rooms" / "recipes"
# Half size: the portrait spans the room's full height, so a 512px portrait (images-opt) sits on
# a 768x512 room at the same scale.
OPT_SIZE = (768, 512)


def shown(path):
    """Repo-relative path for printing, absolute for files outside the repo."""
    return path.relative_to(config.REPO) if path.is_relative_to(config.REPO) else path


def slug(cls, gov):
    return f"{cls}-{gov}"


def images_of(stem):
    stem += "-"
    return sorted((p for p in OUT_DIR.glob(f"{stem}*.png") if p.stem[len(stem):].isdigit()),
                  key=lambda p: int(p.stem[len(stem):]))


def check_window(rgba):
    """Alpha checks on a room. Returns (info, warnings): info has the window's bounding box
    (x0, y0, x1, y1, exclusive), its share of the image and the clear-region count (panes count
    separately)."""
    import numpy as np
    from scipy import ndimage
    a = np.asarray(rgba)[..., 3]
    h, w = a.shape
    clear = a < 128
    labels, n = ndimage.label(clear)
    warn = []
    if n == 0:
        return {"window": None, "share": 0.0, "regions": 0}, ["** OPAQUE RETURNED **"]
    # Panes split by mullions and glazing bars are one window: group clear regions whose gaps
    # are under MULLION_GAP of the width, and take the group with the most clear pixels.
    gap = max(1, round(MULLION_GAP * w))
    groups, _ = ndimage.label(ndimage.maximum_filter(clear.astype(np.uint8), size=gap) > 0)
    sizes = ndimage.sum_labels(clear, groups, range(1, groups.max() + 1))
    win = clear & (groups == 1 + int(np.argmax(sizes)))
    ys, xs = np.nonzero(win)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    share = float(win.mean())
    if share > 0.5:
        warn.append("** OPAQUE ROOM MISSING ** (most of the image is clear)")
    if (box[0] + box[2]) / 2 < w / 2:
        warn.append("** WINDOW LEFT HALF **")
    if box[0] == 0 or box[1] == 0 or box[2] == w or box[3] == h:
        warn.append("** WINDOW TOUCHES EDGE **")
    extra = float(((a < 128) & ~win).mean())
    if extra > EXTRA_HOLES_MAX:
        warn.append(f"** EXTRA HOLES ** {extra:.1%} clear outside the window")
    # Partial alpha away from the window's own edge = haze baked into the room.
    near = ndimage.binary_dilation(win, iterations=6)
    haze = float(((a >= 128) & (a < 250) & ~near).mean())
    if haze > HAZE_MAX:
        warn.append(f"** HAZE ** {haze:.1%} of the room semi-transparent")
    return {"window": box, "share": round(share, 4), "regions": int(n),
            "extra": round(extra, 4), "haze": round(haze, 4)}, warn


def check(png):
    from PIL import Image
    im = Image.open(png)
    if im.mode != "RGBA":
        print(f"mode {im.mode}: no alpha channel  ** OPAQUE RETURNED **")
        im = im.convert("RGBA")
        info, warn = {"window": None}, ["** OPAQUE RETURNED **"]
    else:
        info, warn = check_window(im)
    print("window: " + json.dumps(info) + ("  " + "  ".join(warn) if warn else "  ok"))
    out = png.with_name(png.stem + "-check.png")
    write_check(im, out)
    print(f"check {shown(out)}")
    return info


def composite(room, landscape, portrait, species_x=0):
    """Landscape scaled and centred on the room's window, the room over it, the portrait at full
    height on the left. All PIL images; returns an RGBA image the room's size."""
    from PIL import Image
    room = room.convert("RGBA")
    w, h = room.size
    info, _ = check_window(room)
    box = info["window"] or (w * 2 // 3, h // 4, w - w // 12, h * 2 // 3)
    side = max(box[2] - box[0], box[3] - box[1])
    size = max(1, round(side * LANDSCAPE_COVER))
    land = landscape.convert("RGBA").resize((size, size), Image.LANCZOS)
    cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    out = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    out.paste(land, (cx - size // 2, cy - size // 2))  # may hang off the canvas: paste clips
    out.alpha_composite(room)
    por = portrait.convert("RGBA")
    if por.height != h:
        por = por.resize((round(por.width * h / por.height), h), Image.LANCZOS)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    layer.paste(por, (species_x, 0), por)
    out.alpha_composite(layer)
    return out


def portrait_path(species_id):
    hits = sorted(PORTRAITS.glob(f"{species_id:03d}-*.png"))
    if not hits:
        raise SystemExit(f"no portrait master for species {species_id} in {PORTRAITS}")
    return hits[0]


def make_composite(png, species_id, landscape, species_x=0):
    from PIL import Image
    land = LANDSCAPES / f"{landscape}.png"
    if not land.is_file():
        raise SystemExit(f"no landscape {land}")
    comp = composite(Image.open(png), Image.open(land), Image.open(portrait_path(species_id)),
                     species_x)
    out = png.with_name(png.stem + "-comp.png")
    comp.convert("RGB").save(out)
    print(f"composite {shown(out)}")


def write_gallery():
    """index.html in OUT_DIR: every room, newest first, with its check and composite."""
    pngs = sorted((p for p in OUT_DIR.glob("*.png") if not p.stem.endswith(SUFFIXES)),
                  key=lambda p: p.stat().st_mtime, reverse=True)
    cards = []
    for p in pngs:
        txt = p.with_suffix(".txt")
        meta = txt.read_text() if txt.exists() else ""
        head, _, prompt = meta.partition("\n\n")
        imgs = []
        for suffix in ("-comp", "", "-check"):
            f = p.with_name(p.stem + suffix + ".png")
            if f.exists():
                v = int(f.stat().st_mtime)
                imgs.append(f'<a href="{f.name}?v={v}"><img src="{f.name}?v={v}" loading="lazy"></a>')
        cards.append(
            f"<figure>{''.join(imgs)}<figcaption><b>{html.escape(p.stem)}</b>"
            f"<pre>{html.escape(head)}</pre>"
            f"<details><summary>prompt</summary><p>{html.escape(prompt)}</p></details>"
            "</figcaption></figure>")
    (OUT_DIR / "index.html").write_text(
        "<!doctype html><meta charset=utf-8>"
        '<meta name=viewport content="width=device-width,initial-scale=1">'
        "<title>Rooms</title><style>"
        "body{margin:0;padding:16px;background:#111;color:#ddd;font:15px system-ui}"
        "figure{margin:0 0 32px}img{width:100%;max-width:1536px;display:block;margin-bottom:6px;"
        "background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/32px 32px}"
        "pre{white-space:pre-wrap;font-size:12px;opacity:.7;margin:4px 0}"
        "summary{cursor:pointer;opacity:.8}</style>"
        f"<h1>Rooms ({len(pngs)})</h1>" + "".join(cards))


def all_names():
    """Every room's name (base, then ethic), in catalogue order."""
    return [slug(c, g) for c, g in rooms.combos()] + [slug(c, e) for c, e in rooms.ethic_combos()]


def export():
    """Copy the newest image of every room to FINAL_DIR as <class>-<gov or ethic>.png, write an
    OPT_SIZE WebP of it (alpha kept lossless, so the window edge stays exact) to OPT_DIR, and its
    sidecar to RECIPE_DIR. Refuses while any room still has no image."""
    from PIL import Image
    names = all_names()
    missing = [n for n in names if not images_of(n)]
    if missing:
        raise SystemExit("no image yet for: " + ", ".join(missing))
    for d in (FINAL_DIR, OPT_DIR, RECIPE_DIR):
        d.mkdir(parents=True, exist_ok=True)
    for name in names:
        src = images_of(name)[-1]
        img = Image.open(src).convert("RGBA")
        img.save(FINAL_DIR / f"{name}.png", optimize=True)
        img.resize(OPT_SIZE, Image.LANCZOS).save(
            OPT_DIR / f"{name}.webp", quality=85, alpha_quality=100, method=6)
        shutil.copyfile(src.with_suffix(".txt"), RECIPE_DIR / f"{name}.txt")
        print(f"{src.name:36} -> {name}")
    print(f"\n{len(names)} rooms exported")


def list_combos():
    pairs = rooms.combos()
    for cls, gov in pairs:
        n = len(images_of(slug(cls, gov)))
        print(f"{cls:16} {gov:13} {n or '-'}")
    print(f"\n{len(pairs)} base pairs, {sum(1 for c, g in pairs if images_of(slug(c, g)))} "
          "with at least one image\n")
    eth = rooms.ethic_combos()
    for cls, e in eth:
        n = len(images_of(slug(cls, e)))
        print(f"{cls:16} {e:13} {n or '-'}")
    print(f"\n{len(eth)} ethic pairs, {sum(1 for c, e in eth if images_of(slug(c, e)))} "
          "with at least one image")


def main():
    ap = argparse.ArgumentParser(prog="room")
    ap.add_argument("--list", action="store_true", help="list every base and ethic pair + image counts")
    ap.add_argument("--gallery", action="store_true", help="free: rebuild index.html only")
    ap.add_argument("--export", action="store_true",
                    help="free: newest image of every room -> rooms/images(-opt), rooms/recipes")
    ap.add_argument("--check", type=Path, metavar="FILE", help="free: alpha checks on a room")
    ap.add_argument("--composite", type=Path, metavar="FILE",
                    help="free: landscape + room + portrait -> FILE-comp.png")
    ap.add_argument("--class", dest="cls", choices=rooms.CLASSES)
    kind = ap.add_mutually_exclusive_group()
    kind.add_argument("--gov", choices=rooms.GOVERNMENTS, help="base room")
    kind.add_argument("--ethic", choices=rooms.ETHICS, help="ethic room (replaces the government)")
    ap.add_argument("--species", type=int, default=332, help="portrait for the composite")
    ap.add_argument("--landscape", default="planet-inhabited-planet",
                    help="backgrounds/images/<name>.png for the composite")
    ap.add_argument("--species-x", type=int, default=0, help="portrait x offset in the composite")
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
    if args.check:
        check(args.check.resolve())
        return
    if args.composite:
        make_composite(args.composite.resolve(), args.species, args.landscape, args.species_x)
        write_gallery()
        return
    if args.gallery:
        write_gallery()
        print(lan_url(OUT_DIR, args.port) + "/")
        return
    if not (args.cls and (args.gov or args.ethic)):
        ap.error("--class and --gov or --ethic are required (or use --list / --gallery / --check)")

    cfg = config.load()
    try:
        prompt = (rooms.build_ethic(args.cls, args.ethic, args.note) if args.ethic
                  else rooms.build_base(args.cls, args.gov, args.note))
    except ValueError as e:
        raise SystemExit(str(e)) from None
    est = costing.estimate(cfg, args.quality, SIZE, prompt)
    name = slug(args.cls, args.ethic or args.gov)
    print(f"{name}  {args.model}  {args.quality}  {SIZE}  transparent  est ${est:.3f}\n\n"
          f"{prompt}\n")
    if not args.yes:
        print("(no API call; add --yes to generate)")
        return

    from .openai_images import OpenAIClient, scrub
    client = OpenAIClient(cfg)
    try:
        resp = client.sdk.images.generate(
            model=args.model, prompt=prompt, size=SIZE, quality=args.quality,
            output_format="png", background="transparent", moderation=cfg["moderation"], n=1)
    except Exception as e:  # noqa: BLE001 - one-shot tool: report and stop
        raise SystemExit(f"API error: {scrub(e)}") from None

    usage = resp.usage.model_dump() if resp.usage else None
    usd = costing.actual_from_usage(cfg, usage)
    taken = images_of(name)
    n = 1 + (int(taken[-1].stem.rsplit("-", 1)[1]) if taken else 0)
    png = OUT_DIR / f"{name}-{n}.png"
    png.write_bytes(base64.b64decode(resp.data[0].b64_json))
    png.with_suffix(".txt").write_text(
        f"model: {args.model}\nquality: {args.quality}\nsize: {SIZE}\nbackground: transparent\n"
        f"note: {args.note}\ncost_usd: {usd}\nusage: {json.dumps(usage)}\n\n{prompt}\n")
    costing.log_spend({"species_id": None, "id": png.stem, "stage": "room", "usage": usage},
                      usd if usd is not None else est, "usage" if usd is not None else "estimate")
    print(f"wrote {png.relative_to(config.REPO)}  cost ${usd if usd is not None else est:.4f}")
    snap_alpha(png, ROOM_OPAQUE)
    check(png)
    make_composite(png, args.species, args.landscape, args.species_x)
    write_gallery()
    print(f"image   {lan_url(png, args.port)}\ngallery {lan_url(OUT_DIR, args.port)}/")


if __name__ == "__main__":
    main()
