# Technical Architecture

This document starts thin (MVP0 scope) and is expected to grow alongside the
code. It currently describes intended structure, not yet-implemented fact —
update it as decisions are actually made in code.

## Coordinate System

- Logical map storage: **true axial hex coordinates**, 6-neighbor adjacency
  (not offset row/column, and not a non-hex square grid).
- Rendering: **true flat-top hex projection** (`src/hexgrid.js`'s
  `axialToPixel`/`pixelToAxial`), using standard Red Blob Games formulas —
  `x = size*1.5*q`, `y = size*(√3/2*q + √3*r)` — where `HEX_SIZE` matches the
  art template's center-to-vertex distance exactly, so tile art renders at
  native resolution at `camera.zoom === 1`. **`HEX_SIZE` has been halved
  twice**: 128 → 64 once real icon sprites were in place and the tile was
  clearly oversized relative to them (feature sprites cropped from
  `terrain1.png`/`hills.png` are all roughly 30-90px native; at
  `HEX_SIZE=128` they needed 2-3x upscaling, both too-small-looking and
  blurry), then 64 → 32 on direct feedback that tiles still looked too large
  even at that size. See `hexgrid.js`'s `HEX_SIZE` comment for the current
  sizing rationale. The 5 hand-painted band tiles have since been repainted
  against the current (smallest) template (see
  `images/templates/README.md`).
  - **Feature icons are no longer scaled to fit the tile at all** —
    `render.js`'s `drawIcon` now draws each sprite at its own native pixel
    resolution, scaled only by `camera.zoom`. This was the actual fix for
    icons looking undersized/blurry (the tile-size halvings above address a
    *different* problem — the band background's apparent size — and would
    have kept being insufficient on their own as long as icons were still
    being stretched to a tile-relative fraction). Also dropped the smaller
    size for secondary stars in binary/trinary systems — no reason for them
    to differ from a primary star.
  - Earlier versions of this project used the tileset's diamond/iso-square
    projection formula directly on axial coordinates, which is **not** a true
    hex projection (confirmed by inspecting the FreeCiv Amplio tileset's own
    `.tilespec` — `is_hex = FALSE` — and freecivx's space generator, which
    explicitly rejects hex topology because its circle-carving math only
    produces real circles on a square grid). That meant only 4 of a hex
    tile's 6 true neighbors were genuine shared-edge neighbors on screen. Once
    real hex-shaped tile art existed (see `graphics-and-assets.md`), the
    renderer was switched to this true projection — closing that gap
    entirely; all 6 neighbors now tile edge-to-edge with no gaps or overlaps
    (verified by compositing a 7-hex cluster before wiring any real art in).
- A single screen↔tile transform utility should be one of the first modules
  written, since both the renderer and input handling (tap-to-move, pan/zoom)
  depend on it. (`src/hexgrid.js`.)

## Map Generation

Ported from `freecivx`'s custom space map generator (`server/generator/space_map.c`),
adapted to true hex topology. See `docs/graphics-and-assets.md` for the asset
side of this; the key algorithmic ideas:

- The map is generated **once per game session from a random seed** (not a
  single fixed map reused across all playthroughs, and not regenerated live
  as players explore). The seed is stored with persisted game state so a
  session can be reproduced/resumed exactly, and makes the generator
  testable: same seed in → same map out.
- **Placement**: pre-roll every system's target radius, sort largest-first,
  then dart-throw random candidate centers (up to a fixed attempt budget per
  system) rejecting any candidate closer than `radius + otherRadius + MIN_GAP`
  (native hex distance) to an already-placed system; shrink the radius and
  retry if no candidate is found, down to an absolute minimum, skipping the
  system entirely if even that fails. Largest-first avoids the coverage
  ceiling a naive random-sequential approach hits.
- **One system is always fixed at the origin** as the shared Earth/home
  system, placed before any dart-throwing; all other systems avoid it like
  any other placed system.
- **Carving**: each system is a set of concentric rings (inner/medium/outer
  at fixed fractions of its own radius) measured with plain hex distance from
  its center — no square-distance workaround needed, since hex distance
  isn't being squared the way freecivx's square-grid formula was. A
  multi-harmonic sinusoidal "wobble" (computed from the pixel-projected angle
  of each tile relative to the system center) perturbs the ring boundaries so
  systems read as organic blobs rather than perfect circles.
- **Bodies are sparse, not per-tile rolls**: planets, wonders, and asteroid/
  Kuiper belts are placed onto ring tiles by sampling a handful of candidates
  per system (with a minimum separation between bodies), not by rolling a
  type independently for every tile. A thin "interstellar" halo (a couple of
  hexes past each system's outer ring) is carved too, mainly so neighboring
  systems' halos can touch and read as a loose "corridor" where systems are
  packed close together.
- **Planets are restricted by zone/band, and may have moons**: `inner` gets
  0-3 Molten/Toxic bodies (never moons); `medium` gets 0-3 Rocky planets
  (each 0-2 moons, Rocky or Molten); `outer` gets 1-3 bodies, each 50/50 a
  Gas Giant (0-5 moons, any class except Gas Giant) or an Ice planet (0-2
  ice-only moons). `src/planet-classes.js` is the single source of truth
  for the class → sprite catalog (and the moon-eligible subset, excluding
  Gas Giant — a gas giant orbiting a gas giant doesn't make sense), imported
  by both `mapgen.js` (generation) and `assets.js` (loading). A moon is a
  real tile claiming one of its parent planet's own unclaimed same-zone
  neighbor hexes (`src/mapgen.js`'s
  `claimNeighborsFromPool`, generalizing the same shuffle-and-slice pattern
  used for secondary star placement) — not a decorative overlay on the
  parent's tile. `inhabited` is a boolean independent of class/sprite on any
  planet or moon (a single flat `INHABITED_CHANCE` constant today).
- Since neighboring systems' halos are allowed to overlap/touch by design
  (above), `carveSystem` skips any hex a system reaches that an
  earlier-processed system already claimed (band, planet, moon, or
  anything else) rather than overwriting it — found and fixed while adding
  moons, since moons claim extra hexes reaching further toward a system's
  own boundary, which made halo-overlap collisions with a neighboring
  system's already-placed bodies common enough to matter (previously rare
  and unnoticed with only 0-2 sparse planets per system and no moons).
- **Every tile within the map radius is materialized at generation time**,
  including deep space — a deliberate choice (see "Band materialization"
  below), not the sparse/implicit-deep-space model this project started
  with.
- Each tile's `regionId` is simply **its system's id** (`-1` for deep space)
  — pirate spawn logic (MVP4) can look up "which system-region is this tile
  part of" as a plain field read, no separate region-clustering pass needed.

## Band Materialization

Every hex's **band** (`inner` / `medium` / `outer` / `interstellar` /
`deep-space`) — which determines its background art — is computed and
stored once, at map-generation time, specifically so the renderer never has
to compute distance-to-nearest-system per frame. This was a deliberate
tradeoff requested when real tile art arrived: lower per-frame cost and
simpler rendering code, at the expense of generation time and memory scaling
with total map area rather than just system footprints (previously only
system interiors + halos were stored; now the entire map, including the deep
space between systems, is).

- A tile's `type` is either the generic `"band"` (a plain backdrop tile, no
  feature on it) or a specific feature (`star`, `planet`, `moon`,
  `wonder-blackhole`, `asteroid-belt`) layered on top of its own band. Every
  materialized tile — feature or plain — carries a `band` field the renderer
  uses to pick the background image; only `"band"` type tiles have *nothing
  else* drawn on top. `planet`/`moon` tiles additionally carry `planetClass`
  (molten/toxic/rocky/gas-giant/ice), `sprite` (the specific icon key within
  that class), and `inhabited` (boolean, independent of class/sprite); a
  `moon` tile also carries `parent: {q, r}` pointing at its planet.
- After all systems are carved and populated, one final sweep covers every
  remaining hex within the map radius with `{ type: "band", band:
  "deep-space" }`. This is the step that was previously left implicit
  (unstored, "any hex with no entry is deep space"); see "Scale" below for
  the tradeoff this introduces at larger map sizes.
- This fully supersedes the project's earlier "only contentful tiles are
  stored, deep space is implicit" principle. That principle still has merit
  at much larger scale (see below) but was explicitly traded away for
  simplicity and lower per-frame cost at the current prototype size.
- **Scale**: prototyping at ~100-150 systems (mapRadius ~90, ~24,700 tiles
  fully materialized in ~85ms — fine at this size). The concept doc's
  "1,000+ star systems" is a later scale-up, not the current target — see
  `mvp-roadmap.md`'s parking lot. At that scale, two things need revisiting
  together, not just the placement algorithm: (1) the O(n²) placement scan
  needs a spatial grid/bucket index (freecivx's own generator never validated
  this at 1000+-system scale either), and (2) fully materializing every deep
  space hex (which scales with total map *area*, roughly quadratically with
  map radius) will need to go back to something closer to the original
  implicit/sparse model, or a chunked/lazy generation scheme restricted to a
  radius around each ship — full materialization is a deliberate, acceptable
  tradeoff at ~25k tiles, not at the 500k-2M+ tiles a 1000+-system map implies.

## Data Model (as implemented, MVP1)

```
mapData (src/mapgen.js's generateMap return value, never persisted — cheaply
         and deterministically rebuilt from `seed` via generateMap({seed}))
├── seed, mapRadius, systems: [{ id, q, r, radius, isHome, starCount, phases }]
├── systemsSkipped, totalHexCount, earth: {q, r}
└── tiles: Map<"q,r", Tile> — every hex in the map radius, shared/singleton,
      never mutated by player state. Tile: { q, r, type, band,
      regionId (= owning system's id, -1 for deep space), ...type-specific }

gameState (src/state.js, persisted — see "Persistence" below)
├── activePlayerIndex, movesRemaining, won
└── players: [PlayerState, PlayerState]
      └── PlayerState: { color, q, r, xp, visionRadius, discovered: Set<"q,r"> }
```

Fog-of-war (`discovered`) is deliberately kept **off** the shared `tiles`
map and lives entirely as two independent per-player `Set`s of `axialKey`
strings — both players read the same singleton tile objects, so storing a
"revealed" flag on the tile itself would leak one player's discoveries into
the other's render pass immediately. `src/render.js` only ever receives the
*active* player's `discovered` set, which is what actually enforces "can't
see the other player's fog" (a data-availability guarantee, not a runtime
check).

**Reveal is vision-radius-based, not single-tile.** Each `PlayerState`
carries its own `visionRadius` (MVP1 default: 1, i.e. itself plus its 6
neighbors — see `game-design.md`'s Leveling section) so a future leveling
unlock can simply increase that one number with no other code change.
Whenever a ship occupies or passes through a hex — every step of a tapped
move's path, not just the destination — `src/state.js`'s `revealAround`
reveals every tile within that player's `visionRadius` of that hex.
Newly-revealed tiles award flat XP via `xpForTile`/`revealTile` regardless
of whether they were the move's destination or just within vision range —
there's no separate "seen vs. visited" XP tier in MVP1.

**Fog exception — stars are always visible.** `render.js` always draws a
`"star"` tile regardless of the active player's `discovered` set (every
other tile type stays blank/fogged until actually discovered). This is a
pure rendering/wayfinding aid toward the win condition — players can see
where every system is from the start — and is independent of the
`discovered` set: seeing a star this way does **not** mark it discovered,
so it grants no XP and doesn't count toward the win condition below.

**Win condition check**: with deep space now the vast majority of the map,
"every tile revealed" is no longer the right completion condition (see
`game-design.md`'s Session End) — it's **every system's star tile
discovered** instead. A system's primary star always sits at exactly
`(system.q, system.r)` (see `mapgen.js`'s `carveSystem`), so
`checkWinCondition` just tests, for every entry in `mapData.systems`,
whether *either* player's `discovered` set contains that key — a
cooperative union, O(systems × players) per move, run after every move.

## Rendering Loop

Canvas 2D, redraw-on-change (no need for a continuous animation loop given
turn-based, low-frequency updates) — redraw triggers: camera pan/zoom, ship
movement, turn change, pass-and-play interstitial show/hide.

Per redraw, the tile loop looks up only the hexes within the current
viewport (inverse-projecting the four screen corners to an axial q/r
bounding box, then doing `Map.get` per candidate — see `src/render.js`'s
`visibleHexRange`), **not** every stored tile. This keeps per-frame cost
bounded by screen size rather than total map size, which matters now that
every tile is materialized (see "Band Materialization" above) — scanning
all ~24,700 stored tiles every frame just to cull most of them would have
defeated the point of keeping per-frame work low.

Per-band background art is loaded once at startup (`src/assets.js`) and
drawn via `drawImage` — no procedural/random starfield layer anymore; it
would be fully hidden under the now-universal band art and was removed
rather than left running for no visible effect.

**Rendering happens in three passes over the visible tiles, not one
interleaved pass**: all band backgrounds first, then all feature icons
(star/planet/moon/wonder/belt), then all labels. Icons and labels routinely
extend past their own tile's hex footprint — icons are drawn at native
pixel size (see "Band Materialization" note on `HEX_SIZE`/icon sizing
above) and tiles are small, so e.g. the ~86px-wide black-hole sprite is
wider than the ~64px tile itself. Moons are the one deliberate exception to
native-size icons — drawn at 50% of that scale, since they're meant to read
as smaller bodies orbiting their parent planet, not a second equally-sized
feature. Drawing a tile's background, icon, and
label together before moving to the next tile meant a later-processed
neighboring tile's opaque background would silently paint over the
spillover part of an earlier tile's icon or label. Queuing icons/labels
during the background pass and drawing them only once every background is
down (`src/render.js`'s `pendingIcons`/`pendingLabels`) guarantees nothing
ever clips them, regardless of q/r iteration order.

## Persistence

- Single `localStorage` key (`explorer-game:save:v1`, see `src/state.js`),
  holding the seed, `activePlayerIndex`, `movesRemaining`, and both
  players' `{ color, q, r, xp, visionRadius, discovered }` (`discovered`
  serialized as a plain array of `axialKey` strings, restored back to a
  real `Set` on load). Only the seed is stored for the map itself —
  `tiles`/`systems` are always cheaply and deterministically rebuilt via
  `generateMap({ seed })` rather than persisted. Single device, single
  session, one save slot is the stated use case — no export/import or
  multi-device sync needed at this stage; starting/loading a new seed
  always overwrites it.
- Persisted after every state-changing action — a move or an End Turn, not
  debounced — not just at turn boundaries, so a closed tab never loses
  progress mid-turn either. Payload is small and actions are
  human-tap-paced, so synchronous `setItem` on every action is cheap.
  `JSON.parse` and a `version` field are guarded so a corrupt or
  old-schema save is treated as absent rather than throwing.

## Dependency Policy

Vanilla JS, zero shipped runtime dependencies, static-file deployable (e.g.
GitHub Pages), no backend. See [`ui-ux-spec.md`](ui-ux-spec.md) for the
rationale shared with the UI layer.

## Module Layout (as implemented)

```
src/
├── hexgrid.js         axial coordinate math, screen<->tile transforms,
│                      hexLine (move-path interpolation for tap-to-move)
├── mapgen.js          seeded map generator (places systems, bands every tile)
├── planet-classes.js  planet/moon class -> sprite catalog (shared by
│                      mapgen.js and assets.js)
├── render.js          canvas drawing (viewport-bounded tile lookup, icons,
│                      fog-of-war skip, ship markers)
├── assets.js          per-band/icon image loading
├── input.js           tap/drag-pan/pinch-zoom/wheel-zoom handling
├── state.js           player/turn GameState model, fog-of-war,
│                      win-condition check, localStorage persistence
└── main.js            wiring/game loop/turn orchestration
```
