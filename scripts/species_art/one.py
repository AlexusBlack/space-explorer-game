"""Generate ONE portrait for one species, no state/cutout/review machinery.

  python -m scripts.species_art.one --id 1                  # print prompt + estimate, no API call
  python -m scripts.species_art.one --id 1 --yes            # one paid call -> species/work/one/
  python -m scripts.species_art.one --id 1 --transparent --yes   # native transparent background
  python -m scripts.species_art.one --id 1 --cut FILE       # free: local matting cut of an opaque result
"""

import argparse
import base64
import json
from pathlib import Path

from . import catalogue, config, costing, prompts
from .config import WORK

OUT_DIR = WORK / "one"


def alpha_summary(rgba):
    """One-line alpha report; flags OPAQUE RETURNED with cutout.cut method A's test, but on
    the top corners only: a bust is cropped by the bottom edge, so its bottom corners are body."""
    import numpy as np
    a = np.asarray(rgba)[..., 3]
    clear, opaque = (a <= 3).mean(), (a >= 250).mean()
    corners = [a[0, 0], a[0, -1]]
    line = (f"alpha: clear {clear:.0%}  partial {1 - clear - opaque:.1%}  opaque {opaque:.0%}  "
            f"top corners {'transparent' if max(corners) <= 127 else 'OPAQUE'}")
    if (a < 250).mean() < 0.05 or max(corners) > 127:
        line += "  ** OPAQUE RETURNED **"
    sides = {"left": (a[:, :2] > 127).mean(), "right": (a[:, -2:] > 127).mean()}
    cut_sides = [k for k, v in sides.items() if v > 0.01]  # subject touches a side edge
    line += f"  sides {'CUT ' + '+'.join(cut_sides) if cut_sides else 'clear'}"
    # The room scene has no floor: a bust should run off the bottom edge (good ones: 40-96%
    # of the bottom rows are body). Near 0% = feet, flippers or a torso cut above the edge.
    bottom = (a[-2:] > 127).any(0).mean()
    line += f"  bottom {bottom:.0%}" + ("  ** BOTTOM NOT CUT **" if bottom < 0.2 else "")
    return line


def write_check(rgba, path):
    """Side-by-side composite over magenta (halos), near-black (lost glow) and a checkerboard."""
    from PIL import Image
    w, h = rgba.size
    sheet = Image.new("RGB", (w * 3, h))
    checker = Image.new("RGB", (w, h), (255, 255, 255))
    grey = Image.new("RGB", (32, 32), (204, 204, 204))
    for y in range(0, h, 32):
        for x in range((y // 32) % 2 * 32, w, 64):
            checker.paste(grey, (x, y))
    for i, bg in enumerate([Image.new("RGB", (w, h), (208, 58, 176)),
                            Image.new("RGB", (w, h), (21, 21, 21)), checker]):
        bg.paste(rgba, (0, 0), rgba)
        sheet.paste(bg, (i * w, 0))
    sheet.save(path)


def snap_alpha(png):
    """Transparency preview quirk: opaque areas arrive as alpha 250-254 (slightly see-through).
    Snap those to 255 in place; the untouched API output is kept as <name>-raw.png."""
    import numpy as np
    from PIL import Image
    im = Image.open(png)
    if im.mode != "RGBA":
        return
    raw = png.with_name(png.stem + "-raw.png")
    if not raw.exists():
        png.replace(raw)
    arr = np.array(Image.open(raw))
    arr[..., 3][arr[..., 3] >= 250] = 255
    Image.fromarray(arr, "RGBA").save(png)


def snap_bottom(png, max_gap=64):
    """The model often ends a waist crop 4-47 px above the bottom edge, leaving a strip the room
    scene would show as floating. If the body ends in a wide straight cut within max_gap px of
    the bottom (seen up to 47 px), move the picture down so the cut touches it (the original stays in -raw.png).
    Feet, flippers and tapering tails are left alone: they don't end in a wide straight edge."""
    import numpy as np
    from PIL import Image
    arr = np.array(Image.open(png).convert("RGBA"))
    cov = (arr[..., 3] > 127).mean(1)
    rows = np.nonzero(cov)[0]
    if not len(rows):
        return
    y = rows[-1]
    gap = len(cov) - 1 - y
    if not 0 < gap <= max_gap or y < 12 or cov[y - 12] < 0.3 or cov[:gap].any():
        return
    arr = np.concatenate([np.zeros_like(arr[:gap]), arr[:-gap]])
    Image.fromarray(arr, "RGBA").save(png)
    print(f"snap-bottom: moved down {gap} px so the waist cut touches the bottom edge")


def check(png):
    from PIL import Image
    rgba = Image.open(png)
    if rgba.mode != "RGBA":
        print(f"mode {rgba.mode}: no alpha channel  ** OPAQUE RETURNED **")
        rgba = rgba.convert("RGBA")
    else:
        print(alpha_summary(rgba))
    out = png.with_name(png.stem + "-check.png")
    write_check(rgba, out)
    print(f"check {out.relative_to(config.REPO)}")


def cut(path, cfg):
    from PIL import Image
    from . import cutout
    rgba, _ = cutout.cut(path, "B", cfg)
    out = path.with_name(path.stem + "-cut.png")
    Image.fromarray(rgba, "RGBA").save(out)
    print(f"wrote {out.relative_to(config.REPO)}  (local cut, no spend)")
    check(out)


def main():
    ap = argparse.ArgumentParser(prog="one")
    ap.add_argument("--id", type=int, required=True)
    ap.add_argument("--framing", choices=sorted(prompts.FRAMING), default="bust")
    ap.add_argument("--quality", choices=["low", "medium", "high"], default="medium")
    ap.add_argument("--model", default=None, help="default: config.toml model")
    ap.add_argument("--note", default=None, help="extra correction appended to the prompt")
    ap.add_argument("--strict-anatomy", action="store_true",
                    help="swimmers/floaters: no 'head and upper body', no humanoid torso")
    ap.add_argument("--no-pose", action="store_true",
                    help="drop the catalogue pose (use when it pushes limbs off the sides)")
    ap.add_argument("--crop-bottom", action="store_true",
                    help="force a waist-up crop (use when the body ends above the bottom edge)")
    ap.add_argument("--transparent", action="store_true",
                    help="native transparent background (no backdrop words in the prompt)")
    ap.add_argument("--cut", type=Path, default=None, metavar="FILE",
                    help="free: cut an existing opaque result locally (matting model), no API call")
    ap.add_argument("--snap-bottom", type=Path, default=None, metavar="FILE",
                    help="free: apply the bottom snap to an existing transparent result, no API call")
    ap.add_argument("--yes", action="store_true", help="actually call the API (paid)")
    args = ap.parse_args()

    cfg = config.load()
    if args.cut:
        cut(args.cut.resolve(), cfg)
        return
    if args.snap_bottom:
        snap_bottom(args.snap_bottom.resolve())
        check(args.snap_bottom.resolve())
        return

    sp = catalogue.load()[args.id]
    model, size = args.model or cfg["model"], "1024x1024"
    prompt = prompts.build_portrait(sp, args.framing, args.note, args.strict_anatomy,
                                    args.transparent, args.no_pose, args.crop_bottom)
    est = costing.estimate(cfg, args.quality, size, prompt)
    print(f"{sp.slug}  {model}  {args.quality}  {size}  est ${est:.3f}\n\n{prompt}\n")
    if not args.yes:
        print("(no API call; add --yes to generate)")
        return

    from .openai_images import OpenAIClient, scrub
    client = OpenAIClient(cfg)
    try:
        resp = client.sdk.images.generate(
            model=model, prompt=prompt, size=size, quality=args.quality, output_format="png",
            background="transparent" if args.transparent else "opaque",
            moderation=cfg["moderation"], n=1)
    except Exception as e:  # noqa: BLE001 - one-shot tool: report and stop
        raise SystemExit(f"API error: {scrub(e)}") from None

    usage = resp.usage.model_dump() if resp.usage else None
    usd = costing.actual_from_usage(cfg, usage)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    taken = [p.stem.rsplit("-", 1)[1] for p in OUT_DIR.glob(f"{sp.slug}-*.png")]
    n = 1 + max([int(t) for t in taken if t.isdigit()], default=0)
    png = OUT_DIR / f"{sp.slug}-{n}.png"
    png.write_bytes(base64.b64decode(resp.data[0].b64_json))
    png.with_suffix(".txt").write_text(
        f"model: {model}\nquality: {args.quality}\nframing: {args.framing}\n"
        f"strict_anatomy: {args.strict_anatomy}\ntransparent: {args.transparent}\n"
        f"no_pose: {args.no_pose}\ncrop_bottom: {args.crop_bottom}\n"
        f"cost_usd: {usd}\nusage: {json.dumps(usage)}\n\n{prompt}\n")
    costing.log_spend({"species_id": sp.id, "id": png.stem, "stage": "one", "usage": usage},
                      usd if usd is not None else est, "usage" if usd is not None else "estimate")
    print(f"wrote {png.relative_to(config.REPO)}  cost ${usd if usd is not None else est:.4f}",
          flush=True)
    if args.transparent:
        snap_alpha(png)
        snap_bottom(png)
        check(png)


if __name__ == "__main__":
    main()
