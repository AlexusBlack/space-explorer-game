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

## Usable As-Is vs. Needs Sourcing vs. Needs Redraw

**Usable as-is (crop directly from `terrain1.png`):**
- The glowing yellow **"Star"** tile — candidate for the sun/home-system
  marker or a star-system background tile.
- The **"Oil" / "oil (arctic)"** swirly orange-black disc — strong visual
  stand-in for the black-hole natural wonder.
- The **planet/resource icon column** (Oasis, Gold, Iron, Gems, Fish, Whales,
  etc.) — repurposed as a generic "planet type" icon set; the Civ resource
  names are irrelevant, only the glyph shape/color matters for MVP.
- The **cyan selection diamond** overlay — reusable directly for tile/ship
  selection highlighting.
- The **gray fog overlay** — reusable directly for fog-of-war rendering.
- The **greyish cloud blend textures in `terrain2.png`** — asteroid belt and
  Kuiper belt tiles (confirmed FreeCiv: Space usage). Several rows of these
  exist; pick 1–2 as a distinct "asteroid field" tile type.

**Resolved via `units.png` / `pirate-base.png`:**
- **Player ship** sprite — row 2, column 3 of `units.png`.
- **Initial pirate ship** sprite — row 1, column 13 of `units.png`.
- **Pirate base** sprite — `pirate-base.png` (standalone file).

**Still needs sourcing:**
- A **tileable starfield background**. Recommended approach: generate
  procedurally via Canvas (e.g. randomly scattered small white/colored dots
  with varying opacity, seeded alongside the map) rather than sourcing a PNG
  — fewer dependencies, and avoids introducing a new licensing question.

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

1. Hex/diamond tile background — one neutral "space" variant (new, or a
   recolored terrain diamond if recoloring is in scope for MVP0).
2. Starfield background — procedurally generated (see above).
3. Fog-of-war overlay — reused as-is from `terrain1.png`.
4. Selection highlight diamond — reused as-is from `terrain1.png`.
5. Star glow tile — reused as-is from `terrain1.png`, for Earth's system /
   sun marker.
6. Player ship sprite — `units.png`, row 2 column 3. MVP1 needs a second,
   visually distinct ship for player 2 (a recolor/tint of this sprite, or a
   second sprite picked from `units.png`, is sufficient — doesn't need to be
   a different unit design).
7. Pirate ship sprite (for MVP4) — `units.png`, row 1 column 13.
8. Pirate base sprite (for MVP4) — `pirate-base.png`.
9. Asteroid/Kuiper belt tile (for MVP2, alongside planets/wonders) — reused
   greyish cloud blend from `terrain2.png`.

## Tile Geometry & Canvas Mapping

The diamond shape used throughout the sheet confirms an **isometric-diamond
projection** (classic Civ2/FreeCiv style), not flat-top or pointy-top
overhead hexes. Recommended implementation (see
[`technical-architecture.md`](technical-architecture.md) for the full
write-up):

- Store the logical map using **axial or cube hex coordinates** (cleaner
  neighbor/distance math than offset coordinates).
- Render using a 2:1 diamond width:height ratio per tile.
- Implement a single, well-tested screen↔tile coordinate transform utility
  early — this is solved, well-documented math (see Red Blob Games' hex-grid
  guide), not a design question to debate.

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
the sprite inventory stays accurate as implementation proceeds.

## Future Art Pipeline

For MVP0–MVP4, continue reusing/cropping the existing FreeCiv/Amplio tileset
plus the small set of new sourced/procedural assets listed above — this is
fast, free, and already matches the concept doc's own stated direction. An
original (non-GPL) art pass is parked post-MVP4 (see `mvp-roadmap.md`) and
should only be prioritized if GPL encumbrance becomes a real constraint
(e.g. wanting a closed-source or app-store distribution that conflicts with
GPL v2 obligations on the bundled art).
