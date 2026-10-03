#!/usr/bin/env python3
"""Regenerates every file in images/icons/ from the source tilesheets.

Source sheets (terrain1.png, hills.png, ...) are legend/reference grids with
a consistent table-border color — grid lines are detected automatically
rather than hardcoded, so this keeps working if a sheet's cell size changes.
Each icon is: crop its cell (border excluded), trim to content bounding box,
optionally boost+recolor a low-opacity source (not currently needed by
anything in MANIFEST, but terrain2.png's cloud blends once required it —
kept as a per-entry option so a future low-opacity source is a one-line
manifest addition, not new code), then save.

Usage: python3 scripts/extract-icons.py [name ...]
  No arguments: regenerate everything in MANIFEST.
  One or more names: regenerate only those entries (output filename stem,
  e.g. `star`, `planet-whales`, `asteroid-belt-3`).

Run from anywhere; paths are resolved relative to this script's location.
"""

import sys
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = REPO_ROOT / "images"
ICONS_DIR = IMAGES_DIR / "icons"

BORDER_COLOR = (26, 61, 91)
BORDER_TOL = 20


def detect_grid(img):
    """Auto-detects row/column boundary pixel coordinates from the sheet's
    own table border lines, rather than assuming a fixed cell size."""
    w, h = img.size
    px = img.convert("RGB").load()

    def row_frac(y, x0, x1):
        hits = sum(
            1
            for x in range(x0, x1)
            if all(abs(px[x, y][i] - BORDER_COLOR[i]) <= BORDER_TOL for i in range(3))
        )
        return hits / (x1 - x0)

    def col_frac(x, y0, y1):
        hits = sum(
            1
            for y in range(y0, y1)
            if all(abs(px[x, y][i] - BORDER_COLOR[i]) <= BORDER_TOL for i in range(3))
        )
        return hits / (y1 - y0)

    # Scan only the left portion for row lines, in case a credits panel with
    # a different background sits on the right (true for every sheet so far).
    scan_w = min(w, 420)
    rows = [y for y in range(h) if row_frac(y, 0, scan_w) > 0.5]
    cols = [x for x in range(w) if col_frac(x, 0, h) > 0.5]
    return rows, cols


def crop_cell(img, rows, cols, row, col, inset=1):
    x0, y0, x1, y1 = cols[col], rows[row], cols[col + 1], rows[row + 1]
    return img.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset))


def trim(img, pad=2):
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def boost_and_tint(img, boost, tint):
    """For a low native-opacity source: keep its alpha-channel shape but
    scale the opacity up and apply a flat color. See terrain2.png's cloud
    blends (docs/graphics-and-assets.md) for why this was once needed."""
    img = img.convert("RGBA")
    src = img.load()
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dst = out.load()
    for y in range(img.height):
        for x in range(img.width):
            a = src[x, y][3]
            dst[x, y] = (tint[0], tint[1], tint[2], min(255, int(a * boost)))
    return out


# (output filename stem, source filename, row, col) — row/col are 0-indexed
# into that source's auto-detected grid. Add `inset`/`pad`/`boost`/`tint` to
# an entry only if its defaults aren't right for that cell.
MANIFEST = [
    # -- terrain1.png: star, the 2 currently-wired planets, black hole --
    ("star", "terrain1.png", 9, 2),
    ("planet-inhabited", "terrain1.png", 2, 2),  # "Pheasant"
    ("planet-uninhabited", "terrain1.png", 7, 2),  # "Peat"
    ("wonder-blackhole", "terrain1.png", 0, 4),  # "Oil"
    # -- terrain1.png: additional planet variants for future variety --
    # (not yet wired into mapgen.js/render.js — extracted ahead of that
    # work per the project owner's request)
    ("planet-oasis", "terrain1.png", 0, 2),
    ("planet-buffalo", "terrain1.png", 1, 2),
    ("planet-ivory", "terrain1.png", 6, 2),
    ("planet-wheat", "terrain1.png", 1, 4),
    ("planet-silk", "terrain1.png", 2, 4),
    ("planet-wine", "terrain1.png", 3, 4),
    ("planet-furs", "terrain1.png", 5, 4),
    ("planet-spice", "terrain1.png", 7, 4),
    ("planet-fruit", "terrain1.png", 8, 4),
    ("planet-whales", "terrain1.png", 9, 4),
    ("planet-shield", "terrain1.png", 11, 4),
    # -- hills.png: 16 asteroid/Kuiper belt variants, used as-is --
    *[(f"asteroid-belt-{i + 1}", "hills.png", i // 4, i % 4) for i in range(16)],
]


def main():
    requested = set(sys.argv[1:])
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    grids = {}  # source filename -> (img, rows, cols), loaded once per source

    for entry in MANIFEST:
        name, source, row, col = entry[:4]
        opts = entry[4] if len(entry) > 4 else {}
        if requested and name not in requested:
            continue

        if source not in grids:
            img = Image.open(IMAGES_DIR / source).convert("RGBA")
            grids[source] = (img, *detect_grid(img))
        img, rows, cols = grids[source]

        cell = crop_cell(img, rows, cols, row, col, inset=opts.get("inset", 1))
        result = trim(cell, pad=opts.get("pad", 2))
        if "boost" in opts:
            result = boost_and_tint(result, opts["boost"], opts["tint"])

        out_path = ICONS_DIR / f"{name}.png"
        result.save(out_path)
        print(f"{name}.png  {result.size[0]}x{result.size[1]}  <- {source} row {row} col {col}")

    if requested:
        known = {e[0] for e in MANIFEST}
        unknown = requested - known
        if unknown:
            print(f"\nWarning: unknown name(s), skipped: {', '.join(sorted(unknown))}", file=sys.stderr)


if __name__ == "__main__":
    main()
