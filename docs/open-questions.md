# Open Questions

Running log of decisions not yet made. Resolved items move into the relevant
doc (`game-design.md`, `technical-architecture.md`, etc.) and are removed
from here.

## Unresolved

- **`units.png` / `pirate-base.png` license/provenance.** Unlike
  `terrain1.png`/`terrain2.png`, neither file has an embedded credit panel.
  Confirm their source (likely the same FreeCiv Amplio/space tileset release)
  and update [`../images/CREDITS.md`](../images/CREDITS.md) accordingly
  before shipping a build that bundles them.
- **Band brightness gradient partially flattened in the latest repaint.**
  After repainting the 5 band tiles against the new 76×67px template,
  `inner`→`medium`→`outer` still show a clear gradient (69 → 49 → 25 average
  brightness), but `outer`/`interstellar`/`deep-space` now measure almost
  identical (~24-25 each) where the original pass had them clearly separated
  (25 → 15 → 9). Not changed without confirmation — may be intentional, or
  just an artifact of a quick repaint at a much smaller canvas. See
  `images/templates/README.md`.

## Resolved

- **Planet generation reworked into 5 zone-restricted classes with
  independently discoverable moons.** Inner-system bodies are molten or
  toxic (never have moons); middle-system bodies are rocky (0-2 moons each,
  rocky or molten); outer-system bodies are gas giants (0-5 moons of any
  class) or ice planets (0-2 ice-only moons), 50/50 per body. `inhabited` is
  now a fully independent boolean on any planet or moon, not a separate
  type — drives only a text label today, via one flat tunable
  `INHABITED_CHANCE` constant. Moons are real, separately-discoverable hex
  tiles (not decorative), each claiming one of the parent planet's own
  unclaimed same-zone neighbor hexes and rendered at 50% icon scale. Earth
  is unchanged as a special case but is now simply the home system's
  designated rocky, inhabited planet, and can itself roll 0-2 moons like any
  other rocky planet. `src/planet-classes.js` is the new single source of
  truth for the class→sprite catalog, consumed by both `mapgen.js` and
  `assets.js`. The 11 previously-unwired planet sprites (plus `planet-silk`,
  which the project owner had originally left out of the class breakdown
  and then confirmed into the rocky pool) are now all in use. Found and
  fixed a related latent bug while verifying: neighboring systems' halos are
  allowed to overlap by design, but `carveSystem` was unconditionally
  overwriting any hex it reached — including ones an earlier-processed
  system had already claimed for a planet/moon — silently deleting that
  body. Rare and unnoticed with the old sparse 0-2-planets-per-system model,
  but moons claiming extra hexes made it common enough to fail verification;
  fixed by having `carveSystem` skip any already-claimed hex outright. See
  `game-design.md`'s Planets & Natural Wonders catalog,
  `technical-architecture.md`'s Data Model sketch and Map Generation
  section, and `graphics-and-assets.md`'s `images/icons/` section.
- **Icon extraction is now scripted (`scripts/extract-icons.py`), and 11
  more planet variants were pre-extracted for a future variety pass.** The
  script auto-detects each source sheet's grid from its own table-border
  color rather than hardcoded cell sizes, and a declarative `MANIFEST` is
  the single source of truth for where every icon comes from. Verified by
  reproducing all pre-existing icons byte-for-byte before trusting its
  output. Along the way, found and fixed a real clipping bug: the crop
  inset (meant only to skip the sheets' border lines, which are exactly
  1px thick) defaulted to 3px, shaving 2 extra pixels of real sprite
  content off every edge — invisible on most icons, which have margin to
  spare, but it flattened the bottom of `planet-uninhabited.png`, whose
  circle sits almost flush against its cell's edge. Fixed by changing the
  default to `inset=1` and re-extracting everything. The 11 new planet
  variants (`planet-oasis`, `planet-buffalo`, `planet-ivory`, `planet-wheat`,
  `planet-silk`, `planet-wine`, `planet-furs`, `planet-spice`,
  `planet-fruit`, `planet-whales`, `planet-shield`) are extracted but **not
  yet wired into `mapgen.js`/`render.js`** — that's a distinct next step.
  See `graphics-and-assets.md`.
- **Hot-seat model** — two independent ships (own fog-of-war/XP/level each)
  on a shared map, not one shared ship. _(Decided when drafting this
  documentation pass.)_
- **Second-player timing** — present from MVP1, not deferred to a later
  stage. _(Decided when drafting this documentation pass.)_
- **Map generation** — freshly generated per game session from a seed, not
  one fixed static map reused across all playthroughs. _(Decided when
  drafting this documentation pass.)_
- **Win condition** — the map being fully explored (combined across both
  players' fog-of-war) ends the game; cooperative, not competitive. See
  `game-design.md`'s Session End section.
- **Passive vision radius** — leveling up vision radius auto-reveals nearby
  tiles each turn without needing to move onto them, stacking with
  reveal-on-visit. See `game-design.md`'s Experience & Leveling section.
- **Pirate region definition** — a fixed-radius cluster of hexes, precomputed
  per-tile by the MVP0 map generator. See `game-design.md`'s Pirates section
  and `technical-architecture.md`'s Map Generation section.
- **No colored terrain-diamond biomes** — the Civ-land terrain colors
  (Desert/Plains/Grassland/...) are not used for cosmetic per-system variety;
  they break starfield immersion. MVP0 uses a single neutral space tile
  instead. See `graphics-and-assets.md`.
- **Asteroid/Kuiper belts are a real MVP2 terrain-feature tile**, not
  unusable filler. _(Superseded: the art source for them has since changed
  from `terrain2.png` to `hills.png` — see the dedicated entries below.)_
  See `graphics-and-assets.md` and `game-design.md`'s Planets & Natural
  Wonders catalog.
- **True hex topology, not the square grid the tileset/freecivx actually use.**
  Confirmed via research that the Amplio tileset and freecivx's space
  generator are built for a non-hex isometric square grid; we use true
  6-neighbor hex anyway, carved with native (non-squared) hex distance. The
  diamond-sprite cosmetic gap this originally caused (2 of 6 neighbor
  directions only touching at a corner point) is now closed — see below.
  See `technical-architecture.md` and `graphics-and-assets.md`.
- **Map generation ported from `freecivx`'s space map generator**: largest-first
  spaced system placement, concentric-ring carving with a wobbled boundary,
  sparse body placement. (Deep space was originally left implicit/unstored;
  now fully materialized — see below.) Replaces the original
  independent-per-tile-roll generator, which looked like noise rather than a
  starmap. See `technical-architecture.md`.
- **Real hex-shaped tile art integrated; renderer switched to a true
  flat-top hex projection.** 5 hand-painted band tiles (inner/medium/outer/
  interstellar/deep-space) replace the diamond placeholder entirely, closing
  the corner-touch gap above. `HEX_SIZE` matches the art template exactly.
  See `graphics-and-assets.md`/`technical-architecture.md`.
- **Baked-in star-speckle repetition in the band tiles — accepted, not
  fixed.** Configuring a non-repeating procedural approach was judged not
  worth the time versus the already-working (now removed) procedural
  starfield; simplicity preferred for now. Parked for a possible later pass
  (a few randomized variants per band) if it becomes a real complaint. See
  `graphics-and-assets.md`.
- **Every tile materialized at generation time (including deep space), not
  computed per frame.** Explicit tradeoff requested to minimize per-frame
  processing: generation time/memory now scale with total map area, not just
  system footprints, but the render loop never recomputes
  distance-to-nearest-system — it only looks up precomputed tile bands
  within the current viewport. Revisit at 1,000+-system scale (parking lot
  in `mvp-roadmap.md`). See `technical-architecture.md`'s "Band
  Materialization" and "Rendering Loop" sections.
- **Procedural random-dot starfield layer removed.** Once every tile is
  covered by opaque band art, that layer would always render fully hidden
  underneath — keeping it running would have been wasted per-frame work for
  no visible effect.
- **Star/planet/black-hole icons replaced with real sprites cropped from
  `terrain1.png`**, not the vector-drawn placeholders (colored circles,
  gradient). The grid was detected programmatically (regular 97×49px cells)
  rather than eyeballed, then every planet-candidate icon surveyed before
  picking: `icons/star.png`, `icons/planet-uninhabited.png`,
  `icons/planet-inhabited.png`, `icons/wonder-blackhole.png`. Several more
  good unused candidates are catalogued in `graphics-and-assets.md` for a
  future variety pass. Asteroid-belt icon remains a placeholder.
- **Scale: prototype at ~100-150 systems first**, not the concept doc's full
  1,000+ immediately — that's a deliberate later scale-up (parking lot item
  in `mvp-roadmap.md`) once the placement/carving approach is validated.
- **Win condition changed from "every tile revealed" to "every star system
  discovered"** — a direct consequence of the map now being mostly deep
  space; exhaustively revealing every hex is no longer a reasonable
  completion condition. See `game-design.md`'s Session End.
- **Earth is a planet, not the home system's star.** Fixed a bug where the
  home star tile itself was labeled "Earth" — the star is now "Sol" and
  Earth is a separate `planet-inhabited` tile within that system, matching
  how every other planet/star relationship works. See `game-design.md`'s
  Players & Ships / Stars sections.
- **Trinary star systems are real multi-tile systems (3 actual star tiles),
  not a "wonder" feature.** Removed the redundant `wonder-trinary` decorative
  tile type — multi-star systems (1-3 stars, 65/25/10% distribution, ported
  from freecivx) already existed as a structural part of system generation;
  the leftover wonder type was a confusing duplicate left over from before
  the generator rewrite. Also fixed a real bug along the way: multi-star
  placement could silently pick the same neighboring tile twice (or get
  overwritten by later planet placement), so some "trinary" systems only
  had 1-2 actual star tiles — now placed without replacement and excluded
  from the planet/belt sampling pools. See `game-design.md`'s Stars section.
- **Asteroid/Kuiper belt icons replaced with real sprites cropped from
  `terrain2.png`**, not the scattered-dot placeholder. Finding along the
  way: the cloud blend textures are extremely low native opacity (max
  ~16%, every one of the 32 cells checked) — unusable at native opacity, so
  the shape (alpha channel) was kept but boosted and recolored. 2 variants,
  each belt tile picking one plus a random rotation/flip computed once at
  generation time for variety from just 2 source crops. _(Superseded — see
  below: `terrain2.png` turned out to be the wrong file entirely, replaced
  by `hills.png`.)_
- **Asteroid-belt art source corrected from `terrain2.png` to `hills.png`**
  — the project owner had provided the wrong file originally. `hills.png` is
  a 4×4 grid (16 distinct variants, "Hill variations... Freeland by Peter
  Arbor") usable directly with no opacity boost or recoloring (native max
  alpha ~50-55%, vs. `terrain2.png`'s ~16%). All 16
  (`icons/asteroid-belt-1.png` – `icons/asteroid-belt-16.png`) are in use;
  the synthetic rotation/flip trick was dropped since 16 real variants
  already give enough visual variety on their own
  (`mapgen.js`'s `pickBeltAppearance` now just picks 1-16). One variant
  (`asteroid-belt-12.png`) has a faint low-opacity rectangular wash next to
  its main shape — kept in per "use the 16 as-is" rather than excluded. See
  `graphics-and-assets.md`.
- **`HEX_SIZE` halved twice (128 → 64 → 32)**, and the hex art template
  regenerated each time. First halving: real icon sprites made clear the
  tile was oversized relative to them (icons were being upscaled 2-3x —
  both too-small-looking and blurry); targeted `star.png` (the largest
  common icon, 51×43 native) landing at ~50px. Second halving: direct
  feedback that tiles still looked too large even at that size.
  The 5 hand-painted band tiles were repainted against the current 76×67px
  template (originally 276×241px) — confirmed correct dimensions,
  transparency, and no leftover guide lines. See
  `technical-architecture.md`'s Coordinate System section and
  `images/templates/README.md`.
- **Feature icons (star/planet/wonder/asteroid-belt) now render at their own
  native pixel resolution, scaled only by `camera.zoom`** — not stretched to
  a fraction of the (now much smaller, post-halving) tile size, which had
  been causing them to render both scaled-down-looking and slightly blurry
  depending on zoom. Also dropped the smaller size for secondary stars in
  binary/trinary systems — no reason for them to differ from a primary
  star's size. See `render.js`'s `drawIcon`.
- **Icons/labels were getting clipped by neighboring tiles' backgrounds.**
  With small tiles (64px wide) and native-size icons (up to ~90px wide,
  e.g. the black-hole sprite), an icon routinely spills into a neighboring
  tile's screen space — and background/icon/label were all being drawn
  together, tile by tile, so a later-processed neighboring tile's opaque
  background silently painted over that spillover. Fixed by splitting
  rendering into three full passes over the visible tiles (all backgrounds,
  then all icons, then all labels) instead of one interleaved pass — same
  fix pattern already applied to labels earlier, now generalized to icons
  too. See `technical-architecture.md`'s Rendering Loop section.
