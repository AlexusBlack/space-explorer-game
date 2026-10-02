# Technical Architecture

This document starts thin (MVP0 scope) and is expected to grow alongside the
code. It currently describes intended structure, not yet-implemented fact —
update it as decisions are actually made in code.

## Coordinate System

- Logical map storage: **axial or cube hex coordinates** (not offset
  row/column) — standard choice for clean neighbor/distance calculations.
  See Red Blob Games' hex-grid guide for the reference math; this is treated
  as solved, not a design question.
- Rendering: isometric-diamond projection (2:1 width:height diamond per
  tile), matching the existing tileset's diamond tile shape.
- A single screen↔tile transform utility should be one of the first modules
  written, since both the renderer and input handling (tap-to-move, pan/zoom)
  depend on it.

## Map Generation

- The map is generated **once per game session from a random seed** (not a
  single fixed map reused across all playthroughs, and not regenerated
  live as players explore — "pregenerated" means generated ahead of play,
  then held fixed for that session).
- The seed should be stored as part of persisted game state so a session can
  be reproduced/resumed exactly (and incidentally makes the generator
  testable: same seed in → same map out, per MVP0's definition of done).
- Generator responsibilities (MVP0): produce 1,000+ tiles, each flagged as
  blank / planet (inhabited or not) / natural wonder / asteroid-Kuiper-belt,
  with Earth placed as the shared home tile both players start at. Anomaly
  and pirate-base flagging are added to the generator's output in MVP3/MVP4
  respectively, without needing to change the underlying coordinate/tile
  data structure.
- The generator should also precompute a **region id per tile**: regions are
  fixed-radius clusters of hexes (e.g. flood-fill or distance-based grouping
  from evenly spaced region centers), computed once at map-generation time
  and stored per tile, so MVP4's pirate spawn logic can do a cheap
  region-id lookup rather than recomputing clusters at runtime.

## Data Model (sketch)

```
GameState
├── seed
├── map: Tile[] (keyed by axial coordinate)
│     └── Tile: { type, region_id, revealed_by: Set<PlayerId>,
│                 ...type-specific data }
└── players: [PlayerState, PlayerState]
      └── PlayerState: { ship_position, xp, level, moves_remaining,
                          revealed_tiles, (later) health }
```

`revealed_by`/fog-of-war is tracked per tile per player (or equivalently, a
revealed-tile set per player) — this is the piece of the model that must be
right from MVP1 onward, since it's shared unchanged through MVP4.

**Win condition check**: after each tile reveal, compare the union of both
players' `revealed_tiles` against the total tile count; equal means the map
is fully explored and the game ends. O(1) to maintain incrementally (track a
running "revealed count" instead of recomputing the union each time).

## Rendering Loop

Canvas 2D, redraw-on-change (no need for a continuous animation loop given
turn-based, low-frequency updates) — redraw triggers: camera pan/zoom, ship
movement, turn change, pass-and-play interstitial show/hide.

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
├── mapgen.js        seeded map generator
├── render.js        canvas drawing (map, ships, overlays, HUD)
├── input.js         tap/pan/zoom/pinch handling
├── state.js         GameState model, localStorage persistence
└── main.js          wiring/game loop
```
