# Graphics & Assets

## Source Tileset Inventory

`images/terrain1.png` and `images/terrain2.png` are the only art currently in
the repo. Both are **FreeCiv "Amplio v2.0" legend/credit reference sheets** —
labeled sample grids documenting what's in the original tileset release, not
pre-cut, ready-to-use sprite frames at final in-game dimensions. Full license
attribution lives in [`../images/CREDITS.md`](../images/CREDITS.md).

### `terrain1.png` (960×785px)

A table of terrain-diamond backgrounds (Desert, Plains, Grassland/River,
Forest, Hills, Mountains, Tundra, Arctic, Swamp, Jungle, Star) each paired
with a planet/resource-style icon (Oasis, Buffalo, Pheasant, Coal, Gold,
Game, Ivory, Oil, Peat, Gems, Fish, Seals, Horses, Wheat, Silk, Wine, Iron,
Furs, Spice, Fruit, Whales, Shield), plus Civ-land infrastructure overlays
(irrigation, farmland, mining, pollution, village, oil platform, fallout),
road/railroad edge overlays, and utility overlays (dither, mask, ocean
blending, a yellow "user attention" highlight frame, a gray fog overlay, a
cyan selection diamond, a flag icon).

### `terrain2.png` (960×295px)

Labeled "Forest and tropical forest from Battle for Wesnoth": a row of small
green directional/movement chevron sprites, followed by several rows of
faint, greyish cloud-like blend textures. In the original FreeCiv: Space
tileset these greyish clouds are used as **asteroid belts and Kuiper belts**
— a space-relevant reuse despite the "forest" label inherited from the
land tileset these blends were adapted from. This repurposes what was
previously thought to be unusable filler art into a real MVP tile type (see
below).

### `units.png`

A grid of ready-to-use unit/ship sprites (unlike `terrain1.png`/`terrain2.png`,
this is not a labeled legend sheet — cells are separated by green guide lines
only, with many cells deliberately left blank as unused slots). Two sprites
are designated for use:

- **Player ship** — row 2, column 3 (a rounded tan/beige craft).
- **Initial pirate ship** — row 1, column 13 (a blue/white angular fighter).

This resolves the ship-sprite gap noted below: both MVP0's visual
completeness and MVP4's pirate-ship requirement now have source art.
License/provenance for `units.png` has not yet been confirmed (it doesn't
carry an embedded credit panel the way `terrain1.png`/`terrain2.png` do) —
tracked in [`open-questions.md`](open-questions.md).

### `pirate-base.png`

A standalone sprite (a dark metallic space-station design with turret-like
protrusions) for the pirate base structure introduced in MVP4. Same
license/provenance caveat as `units.png` — no embedded credit panel, tracked
in [`open-questions.md`](open-questions.md).

### `images/icons/` — cropped from `terrain1.png`

`terrain1.png`'s grid turned out to be perfectly regular (97×49px cells,
8 columns × 16 rows, detected programmatically rather than eyeballed) —
column 0 of each row is a terrain-diamond background, columns 2/4 are
planet/resource-style icons, columns 1/3/5/7 are label text. Surveying every
icon in columns 2 and 4 across all 11 terrain rows turned up real celestial
art (not just the land-ruleset resource names the Civ legend labels them
with — "Buffalo," "Pheasant," etc. are leftover label text, not what's
actually drawn). Four were cropped (border gridlines excluded, trimmed to
content bounding box):

- `icons/star.png` — row 9, column 2 ("Fish" label) — a bright glowing
  yellow/white orb. Used for every star tile (primary and secondary/binary/
  trinary), sized smaller for secondary stars.
- `icons/planet-uninhabited.png` — row 7, column 2 ("Peat" label) — a small
  reddish/maroon barren rocky planet.
- `icons/planet-inhabited.png` — row 2, column 2 ("Pheasant" label) — a
  blue/green planet with visible landmasses/cloud cover. Also used for Earth
  specifically (identified by its "Earth" text label, not a separate sprite).
- `icons/wonder-blackhole.png` — row 0, column 4 ("Oil" label) — the
  swirling orange accretion-disc sprite noted below; confirmed as the best
  black-hole stand-in once actually cropped and viewed at scale.

**Good candidates not yet used, for future variety** (same survey, same
grid): row 1 col 2 ("Buffalo," teal swirled gas giant), row 1 col 4
("Wheat," small ringed blue planet), row 2 col 4 ("Silk," green/brown),
row 3 col 4 ("Wine," rusty cratered), row 5 col 4 ("Furs," orange banded gas
giant), row 6 col 2 ("Ivory," yellow cratered moon), row 6 col 4
("oil (arctic)," a second black-hole/accretion-disc variant), row 8 col 4
("Fruit," teal ringed), row 9 col 4 ("Whales," purple ringed gas giant —
especially striking). Picking 2-3 variants per icon type and choosing
per-tile from a seeded hash of its coordinate would be a cheap way to add
visual variety later without new art.

### `images/templates/hex-tile-template.png` and `hex-tile-tiling-preview.png`

Generated (not sourced) templates for authoring true hex-shaped tile art:
276×241px, flat-top orientation, 256×221px hex silhouette, transparent
outside the hex, magenta alignment guides meant to be deleted before final
export. The tiling preview composites 7 copies in a flower pattern to confirm
edge-to-edge seams before committing to real art — see
`images/templates/README.md` for full usage notes.

### `images/starfield-{inner,medium,base-outer,interstellar,deep-space}-hex.png`

Five hand-painted tiles built from the template above, each representing one
of the five **bands** the map generator tags every tile with (see
`technical-architecture.md`'s "Band Materialization"): `inner`, `medium`,
`outer`, `interstellar`, `deep-space` — brightness decreases monotonically in
that order (measured average brightness: 69 → 48 → 25 → 15 → 9). Verified
structurally correct before wiring in: exact template dimensions, fully
transparent outside the hex silhouette, fully opaque inside, all guide lines
removed. These are now the actual in-game background art for every tile —
see "Tile Geometry & Canvas Mapping" below for the rendering-side change this
required.

**Known, accepted tradeoff**: each file bakes its own star speckles directly
into the texture, so the same pattern repeats visibly when the same band
tile is stamped across many adjacent hexes (most noticeable in deep space,
by far the most common band). Confirmed visually by compositing a 7-hex
cluster of the deep-space tile before shipping it. Accepted for now in favor
of shipping something working — revisit later (e.g. a few randomized
variants per band, chosen per-tile from a seeded hash of its coordinate) if
the repetition becomes a real complaint during playtesting.

## Usable As-Is vs. Needs Sourcing vs. Needs Redraw

**Still usable as-is (crop directly from `terrain1.png`), not yet done:**
- The **cyan selection diamond** overlay — reusable directly for tile/ship
  selection highlighting (needed starting MVP1).
- The **gray fog overlay** — reusable directly for fog-of-war rendering
  (needed starting MVP1).
- The **greyish cloud blend textures in `terrain2.png`** — asteroid belt and
  Kuiper belt tiles (confirmed FreeCiv: Space usage); the asteroid-belt icon
  is still a canvas-drawn placeholder (scattered dots), not yet cropped art.

**Resolved via `images/icons/` (see above):**
- **Star**, **planet-uninhabited**, **planet-inhabited**, **wonder-blackhole**
  icons — all four cropped from `terrain1.png` and wired into the renderer.

**Resolved via `units.png` / `pirate-base.png`:**
- **Player ship** sprite — row 2, column 3 of `units.png`.
- **Initial pirate ship** sprite — row 1, column 13 of `units.png`.
- **Pirate base** sprite — `pirate-base.png` (standalone file).

**Resolved via the 5 hand-painted band tiles** (see above) — the
procedurally-generated starfield this section originally called for was
built, shipped in MVP0, and then **removed** once the 5 real band tiles
covered the entire map: a procedural dot layer drawn underneath fully-opaque
band art everywhere would never be visible, so keeping it running would
have been pure wasted per-frame work for zero effect.

**Excluded from the asset pool (needs redraw or simply not relevant):**
- The green directional/movement chevron row in `terrain2.png` — these are
  Wesnoth unit-facing indicators, not terrain; no space-game relevance. (The
  greyish cloud rows below the chevrons *are* usable — see above.)
- The Civ-land infrastructure overlays in `terrain1.png` (irrigation,
  farmland, mining, pollution, village, fallout) and the road/railroad edge
  overlays — these are land-terrain-specific and have no space-game
  equivalent in the current concept.
- **Colored terrain-diamond backgrounds (Desert/Plains/Grassland/...) as
  cosmetic per-system color variety — decided against.** They're visibly
  Civ land-terrain colors and break the space/starfield immersion when used
  as a hex background. MVP0 uses a single neutral/dark space tile instead
  (variety comes from star/planet/wonder/asteroid-belt content on top of it,
  not from recoloring the base tile).

## Minimal MVP0/MVP1 Sprite List

1. ~~Hex/diamond tile background~~ / ~~Starfield background~~ — **done**:
   the 5 hand-painted band tiles (`images/starfield-*-hex.png`) now cover
   every tile on the map; see above.
2. ~~Star / planet-uninhabited / planet-inhabited / wonder-blackhole
   icons~~ — **done**: cropped from `terrain1.png`, see `images/icons/`
   above.
3. Fog-of-war overlay — still needed for MVP1 (not yet cropped from
   `terrain1.png`).
4. Selection highlight diamond — still needed for MVP1.
5. Player ship sprite — `units.png`, row 2 column 3. MVP1 needs a second,
   visually distinct ship for player 2 (a recolor/tint of this sprite, or a
   second sprite picked from `units.png`, is sufficient — doesn't need to be
   a different unit design).
6. Pirate ship sprite (for MVP4) — `units.png`, row 1 column 13.
7. Pirate base sprite (for MVP4) — `pirate-base.png`.

Asteroid/Kuiper belt *icon* is still a canvas-drawn placeholder (scattered
dots) — the greyish cloud blend in `terrain2.png` noted elsewhere in this doc
remains the option for a future real asteroid-belt icon pass.

## Tile Geometry & Canvas Mapping

The original `terrain1.png`/`terrain2.png` diamond sprites turned out to be
the classic **isometric square-grid projection** (confirmed by inspecting
both the Amplio tileset's own `.tilespec` — `is_hex = FALSE` — and
`freecivx`'s custom space map generator, which explicitly refuses to run on
hex topology because its circle-carving math only produces real circles on a
square grid) — not a true hex projection, despite looking similar to one.
With those sprites, only 4 of a hex tile's 6 true neighbors were genuine
shared-edge neighbors on screen; the other 2 touched only at a single corner
point.

**This is now resolved.** Once real hex-shaped tile art existed (the 5
hand-painted band tiles above), the renderer was switched to a true flat-top
hex pixel projection (`src/hexgrid.js`, standard Red Blob Games formulas).
All 6 neighbors now tile edge-to-edge with no gaps or overlaps — verified
both mathematically and by compositing a 7-hex cluster of real art before
and after wiring it in. `HEX_SIZE` (128, center-to-vertex) matches the art
template exactly, so tiles render at native resolution when `camera.zoom ===
1`.

- Flat-top orientation: flat edges top/bottom, points left/right (wider than
  tall) — matches the art template in `images/templates/`.
- `src/hexgrid.js` is the single screen↔tile coordinate transform utility;
  `src/assets.js` loads the 5 band images once at startup.

## Licensing & Attribution

`terrain1.png`'s own credit panel says "see README for detailed credits," but
no README existed in this repo prior to this documentation pass. This has
been remediated: see [`../images/CREDITS.md`](../images/CREDITS.md) for full
attribution (Isotrident, Amplio, Freeland, Yautja, AlexusBlack, Viktor,
Wenrexa) and GPL v2 citation, and the root [`../README.md`](../README.md) /
[`../LICENSE`](../LICENSE) for how the project's AGPLv3 code license and the
bundled GPL v2 art license coexist. `units.png` and `pirate-base.png` still
need their own provenance/license confirmed (see
[`open-questions.md`](open-questions.md)).

Any newly cropped sprite exported from these sheets for actual in-game use
should be added to this document (filename, source region, dimensions) so
the sprite inventory stays accurate as implementation proceeds. The 5
hand-painted band tiles and the `images/templates/` files have no embedded
credit panel and are original work by the project owner, not derived from
the GPL v2 tileset — no attribution entry needed for them in
`images/CREDITS.md`.

## Future Art Pipeline

For MVP0–MVP4, continue reusing/cropping the existing FreeCiv/Amplio tileset
(ships, pirate base) plus the hand-painted band tiles — this is fast, free,
and already matches the concept doc's own stated direction. An original
(non-GPL) art pass is parked post-MVP4 (see `mvp-roadmap.md`) and should only
be prioritized if GPL encumbrance becomes a real constraint (e.g. wanting a
closed-source or app-store distribution that conflicts with GPL v2
obligations on the bundled art).

Also parked: addressing the baked-in star-speckle repetition in the 5 band
tiles (see above) if it becomes a real complaint during playtesting, and a
real cropped asteroid-belt icon (currently a canvas-drawn placeholder).
