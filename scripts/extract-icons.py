#!/usr/bin/env python3
"""Regenerates every file in images/icons/ from the source tilesheets.

Source sheets (terrain1.png, hills.png, ...) are legend/reference grids with
a consistent table-border color — grid lines are detected automatically
rather than hardcoded, so this keeps working if a sheet's cell size changes.
Each icon is: crop its cell (border excluded), trim to content bounding box,
optionally boost+recolor a low-opacity source (not currently needed by
anything in MANIFEST, but terrain2.png's cloud blends once required it —
kept as a per-entry option so a future low-opacity source is a one-line
manifest addition, not new code), optionally recolour a ringed planet's
body (the gas giant colour variants, all from one cell), then save.

Usage: python3 scripts/extract-icons.py [name ...]
  No arguments: regenerate everything in MANIFEST.
  One or more names: regenerate only those entries (output filename stem,
  e.g. `star`, `planet-whales`, `asteroid-belt-3`).

Run from anywhere; paths are resolved relative to this script's location.
"""

import sys
from pathlib import Path
from PIL import Image, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = REPO_ROOT / "images"
ICONS_DIR = IMAGES_DIR / "icons"

BORDER_COLOR = (26, 61, 91)
BORDER_TOL = 20

# units.png (and presumably pirate-base.png-style sheets) use a different
# convention entirely: no labeled border-line color, just a solid
# chroma-key green background between/around sprites (and, for sprites
# meant to be used as-is, as their "transparent" background too).
CHROMA_GREEN = (0, 255, 0)
CHROMA_TOL = 30


def _grid_from_color(img, color, tol):
    """Shared row/column boundary detection: a row/column is a divider if
    nearly every pixel across its full span matches `color` within `tol`."""
    w, h = img.size
    px = img.convert("RGB").load()

    def matches(p):
        return all(abs(p[i] - color[i]) <= tol for i in range(3))

    def row_frac(y, x0, x1):
        hits = sum(1 for x in range(x0, x1) if matches(px[x, y]))
        return hits / (x1 - x0)

    def col_frac(x, y0, y1):
        hits = sum(1 for y in range(y0, y1) if matches(px[x, y]))
        return hits / (y1 - y0)

    # Scan only the left portion for row lines, in case a credits panel with
    # a different background sits on the right (true for every sheet so far).
    scan_w = min(w, 420)
    rows = [y for y in range(h) if row_frac(y, 0, scan_w) > 0.5]
    cols = [x for x in range(w) if col_frac(x, 0, h) > 0.5]
    return rows, cols


def detect_grid(img):
    """Auto-detects row/column boundary pixel coordinates from the sheet's
    own divider lines, rather than assuming a fixed cell size. Tries the
    labeled-legend-sheet border color first (terrain1.png/hills.png style);
    falls back to chroma-key green dividers (units.png style) if that finds
    nothing, so this keeps working across both sheet conventions without
    per-source configuration."""
    rows, cols = _grid_from_color(img, BORDER_COLOR, BORDER_TOL)
    if rows and cols:
        return rows, cols
    return _grid_from_color(img, CHROMA_GREEN, CHROMA_TOL)


def remove_chroma_key(img, color=CHROMA_GREEN, tol=CHROMA_TOL):
    """For chroma-key sheets (units.png): makes background-colored pixels
    transparent so the sprite can be composited like every other icon."""
    img = img.convert("RGBA")
    src = img.load()
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dst = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = src[x, y]
            if all(abs(v - c) <= tol for v, c in zip((r, g, b), color)):
                continue
            dst[x, y] = (r, g, b, a)
    return out


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


# Gas giant colour variants, all recoloured from the purple planet-whales
# cell: brightness -> colour stops, darkest first. Real Sol giants plus one
# fictional green.
GAS_GIANT_PALETTES = {
    "jupiter": [(45, 25, 15), (110, 60, 35), (170, 110, 70), (215, 175, 130), (245, 230, 205)],
    "saturn": [(60, 45, 15), (140, 110, 45), (205, 170, 90), (235, 210, 140), (250, 240, 200)],
    "uranus": [(20, 60, 75), (60, 130, 150), (120, 190, 205), (175, 225, 230), (225, 248, 250)],
    "neptune": [(10, 20, 70), (30, 60, 150), (60, 110, 210), (110, 160, 240), (190, 215, 255)],
    "green": [(15, 45, 20), (45, 100, 50), (95, 160, 80), (160, 205, 120), (220, 240, 190)],
}


def recolor_body(img, stops, sat_lo=0.30, sat_hi=0.50):
    """Recolours a ringed planet's body with a brightness gradient map,
    keeping its cloud bands and shading. The body is strongly saturated and
    the rings pale, so a saturation ramp (sat_lo..sat_hi, slightly feathered)
    selects the body, including the ring strip passing in front of it, and
    leaves the rings untouched."""
    img = img.convert("RGBA")
    src = img.load()
    w, h = img.size
    mask = Image.new("L", img.size, 0)
    mpx = mask.load()
    lum = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            hi, lo = max(r, g, b), min(r, g, b)
            sat = (hi - lo) / hi if hi else 0
            mpx[x, y] = round(255 * min(1, max(0, (sat - sat_lo) / (sat_hi - sat_lo))))
            lum[x, y] = 0.299 * r + 0.587 * g + 0.114 * b
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    mpx = mask.load()
    # Stretch the body's own brightness range (2nd-98th percentile) over the stops.
    body = sorted(lum[p] for p in lum if mpx[p] > 127)
    b_lo, b_hi = body[len(body) * 2 // 100], body[len(body) * 98 // 100]
    out = img.copy()
    dst = out.load()
    n = len(stops) - 1
    for y in range(h):
        for x in range(w):
            m = mpx[x, y] / 255
            if not m:
                continue
            t = min(1, max(0, (lum[x, y] - b_lo) / (b_hi - b_lo))) * n
            i = min(int(t), n - 1)
            f = t - i
            new = [stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f for c in range(3)]
            r, g, b, a = src[x, y]
            dst[x, y] = (*(round(old + (nw - old) * m) for old, nw in zip((r, g, b), new)), a)
    return out


# (output filename stem, source filename, row, col) — row/col are 0-indexed
# into that source's auto-detected grid. Add `inset`/`pad`/`boost`/`tint`/
# `recolor` to an entry only if its defaults aren't right for that cell.
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
    # -- gas giant colour variants of the same cell (see GAS_GIANT_PALETTES) --
    ("planet-gas-brown", "terrain1.png", 9, 4, {"recolor": "jupiter"}),
    ("planet-gas-yellow", "terrain1.png", 9, 4, {"recolor": "saturn"}),
    ("planet-gas-cyan", "terrain1.png", 9, 4, {"recolor": "uranus"}),
    ("planet-gas-blue", "terrain1.png", 9, 4, {"recolor": "neptune"}),
    ("planet-gas-green", "terrain1.png", 9, 4, {"recolor": "green"}),
    ("planet-shield", "terrain1.png", 11, 4),
    # -- hills.png: 16 asteroid/Kuiper belt variants, used as-is --
    *[(f"asteroid-belt-{i + 1}", "hills.png", i // 4, i % 4) for i in range(16)],
    # -- units.png: ship sprites (chroma-key green background, see
    # graphics-and-assets.md's units.png section) --
    ("ship", "units.png", 1, 2, {"chroma_key": True}),  # rounded tan/beige craft
    ("pirate-ship", "units.png", 0, 12, {"chroma_key": True}),  # blue/white angular fighter
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
        if opts.get("chroma_key"):
            cell = remove_chroma_key(cell)
        result = trim(cell, pad=opts.get("pad", 2))
        if "boost" in opts:
            result = boost_and_tint(result, opts["boost"], opts["tint"])
        if "recolor" in opts:
            result = recolor_body(result, GAS_GIANT_PALETTES[opts["recolor"]])

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
