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
  `terrain1.png`/`terrain2.png` are all roughly 30-90px native; at
  `HEX_SIZE=128` they needed 2-3x upscaling, both too-small-looking and
  blurry), then 64 → 32 on direct feedback that tiles still looked too large
  even at that size — icons now render somewhat *below* native resolution
  (safe/sharp; it's upscaling that causes blur, not downscaling). See
  `hexgrid.js`'s `HEX_SIZE` comment for the current sizing rationale. This
  also means the 5 hand-painted band tiles need repainting against the
  current (smallest) template (see `images/templates/README.md`) — the old
  ones still render (same aspect ratio, just scaled down, not stretched) but
  at progressively reduced effective resolution with each halving.
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
  feature on it) or a specific feature (`star`, `planet-uninhabited`,
  `planet-inhabited`, `wonder-blackhole`, `asteroid-belt`) layered on top of
  its own band. Every materialized tile — feature or plain — carries a
  `band` field the renderer uses to pick the background image; only `"band"`
  type tiles have *nothing else* drawn on top.
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

## Data Model (sketch)

```
GameState
├── seed
├── map: Tile[] (keyed by axial coordinate; every hex in the map radius is present)
│     └── Tile: { type, band, regionId (= owning system's id, -1 for deep space),
│                 revealed_by: Set<PlayerId>, ...type-specific data }
│     Note: `home: true` marks the Earth *planet* tile (players start here);
│     `sol: true` marks the home system's *star* tile. These are deliberately
│     different tiles — Earth orbits Sol, it isn't Sol.
├── systems: [{ id, q, r, radius, isHome, starCount }]
└── players: [PlayerState, PlayerState]
      └── PlayerState: { ship_position, xp, level, moves_remaining,
                          revealed_tiles, (later) health }
```

`revealed_by`/fog-of-war is tracked per tile per player (or equivalently, a
revealed-tile set per player) — this is the piece of the model that must be
right from MVP1 onward, since it's shared unchanged through MVP4.

**Win condition check**: with deep space now the vast majority of the map,
"every tile revealed" is no longer the right completion condition (see
`game-design.md`'s Session End) — it's **every system's star tile
discovered** instead. Maintain a running count of systems with a discovered
star tile against `systems.length`; O(1) per move, no need to scan the full
tile map.

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
drawn via `drawImage`, with any feature icon (star/planet/wonder/belt)
layered on top — no procedural/random starfield layer anymore; it would be
fully hidden under the now-universal band art and was removed rather than
left running for no visible effect.

## Persistence

- `localStorage`, holding the seed plus both players' state (position, fog,
  XP/level). Single device, single session is the stated use case — no
  export/import or multi-device sync needed at this stage.
- Persist after every turn-ending action at minimum (more frequently if
  cheap) so a closed tab doesn't lose progress mid-turn.

## Dependency Policy

Vanilla JS, zero shipped runtime dependencies, static-file deployable (e.g.
GitHub Pages), no backend. See [`ui-ux-spec.md`](ui-ux-spec.md) for the
rationale shared with the UI layer.

## Module Layout (suggested, revisit once code exists)

```
src/
├── hexgrid.js       axial coordinate math, screen<->tile transforms
├── mapgen.js        seeded map generator (places systems, bands every tile)
├── render.js        canvas drawing (viewport-bounded tile lookup, icons)
├── assets.js        per-band background image loading
├── input.js         tap/pan/zoom/pinch handling
├── state.js         GameState model, localStorage persistence (not yet built)
└── main.js          wiring/game loop
```
