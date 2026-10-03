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

## Resolved

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
- **`terrain2.png`'s greyish clouds are asteroid/Kuiper belt tiles** (FreeCiv:
  Space's actual intended use), not unusable filler — they're now a real MVP2
  terrain-feature tile. See `graphics-and-assets.md` and `game-design.md`'s
  Planets & Natural Wonders catalog.
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
