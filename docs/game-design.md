# Game Design

## Overview & Tone

A peaceful, friendly 2D space exploration game for two people, hot-seat on one
device (designed around an iPad Mini). Each player commands their own
starship, exploring a shared pregenerated hex map to find planets, natural
wonders, and anomalies, earning experience and growing their ship's
capabilities. Pirates exist as a Civ5-barbarian-style threat, but combat is a
secondary system layered on top of an otherwise low-stakes, exploration-first
game — losing a ship is a setback, not a game-over.

## Players & Ships

- Two players, hot-seat on one device, each controlling one independent
  starship from the very first playable build (MVP1).
- Both ships start at **Earth**, the shared home planet.
- Each player has their own: fog-of-war/revealed-tile state, position,
  experience total, level, and ship stats (moves/turn, vision radius, health,
  attack). Players do not share progress with each other, even though they
  share the same map.
- Turn structure: each player takes a full turn (spends their move budget,
  may end early), then explicitly ends their turn, handing the device to the
  other player via a pass-and-play interstitial (see
  [`ui-ux-spec.md`](ui-ux-spec.md)).

## Map & Coordinate System

- A single hex map, generated once per game session from a random seed (not
  fixed/shared across all playthroughs — see
  [`technical-architecture.md`](technical-architecture.md)).
- 1,000+ star systems (tiles) in the initial generated map.
- Rendered as an isometric-diamond grid (matching the tileset's diamond tile
  shape), backed internally by axial/cube hex coordinates.
- Both players explore the *same* generated map/seed within one game session;
  only their fog-of-war differs.

## Movement & Exploration

- Each ship has a fixed number of moves per turn (increases with leveling).
- Moving onto a previously-unexplored (fogged) tile reveals it and awards
  experience:
  - Blank/empty tile: 1 XP.
  - Tile containing a planet: more than a blank tile; inhabited planets award
    more than uninhabited ones.
  - Tile containing a natural wonder (e.g. black hole, trinary star system):
    the highest flat reward of the "discovery" rewards.
- Already-revealed tiles can be revisited freely without additional reward.

## Experience & Leveling

- A single XP total per player drives a level number via a threshold table
  (exact thresholds to be tuned during MVP2 implementation/playtesting).
- Leveling up unlocks, in rough order of introduction:
  1. More moves per turn.
  2. Larger vision radius — **passive**: each turn, tiles within the ship's
     current vision radius are revealed automatically, without needing to
     move directly onto them (scout-like), stacking with reveal-on-visit.
  3. More health.
  4. Stronger attack.
- Levels and their unlocks are per-player, not shared.

## Anomalies

Anomalies are special tiles that, when discovered, trigger one random effect
from:

- **Wormhole** — teleports the ship to a random map location.
- **Bulk experience points** — a large flat XP bonus.
- **Local map reveal** — instantly reveals a radius of nearby tiles without
  needing to visit them.
- **Free ability** — grants the next leveling-table unlock immediately,
  without needing to cross the XP threshold for it.

Anomalies are introduced after the leveling system exists (MVP3), since "free
ability" has no meaning without an unlock table to grant from.

## Pirates

Pirates are this game's equivalent of Civilization 5's barbarians:

- The map is divided into **regions**, each a fixed-radius cluster of hexes
  (exact radius to be tuned during MVP4 implementation; precomputed once by
  the MVP0 map generator so pirate logic can look up "which region is this
  tile in" cheaply). Per region, there's a chance each turn (or on some other
  cadence, to be tuned) that a pirate base spawns if no pirate base is
  currently present in that region.
- A pirate base produces pirate ships periodically, up to a support capacity
  cap (no further production once the cap is reached, until losses free up
  capacity).
- Pirate ships roam the map and will attack player ships and planets they
  encounter.
- Combat resolution (attack/flee) and ship stats (health, attack) are
  introduced together with pirates in MVP4 — there is no reason for a ship to
  have a health stat before anything in the game can damage it.
- **Losing a ship is a soft penalty**: the player's ship respawns at Earth,
  losing some banked XP and/or turn progress, but the game continues. This
  keeps pirates a real but non-punishing threat, consistent with the game's
  "peaceful friendly" tone.

## Planets & Natural Wonders (catalog — to be expanded during MVP2)

| Type | Examples | Notes |
|---|---|---|
| Uninhabited planet | — | Moderate XP on discovery |
| Inhabited planet | other nations (per original Civ5-inspired concept) | Higher XP on discovery; may be a future hook for non-combat "other nations" content beyond MVP4 |
| Natural wonder | Black hole, trinary star system | Highest flat XP; visually distinct tile (e.g. the tileset's swirling "oil"/black-hole-style disc, the glowing "Star" tile) |
| Asteroid / Kuiper belt | — | Terrain feature tile (reused greyish cloud art from `terrain2.png`); treated as a normal explorable tile for XP purposes unless/until given a distinct effect |

## Session End

**Win condition (MVP, confirmed): the map is fully explored.** The game ends
once every tile has been revealed — by either player's fog-of-war, since the
two players share one map and are implicitly cooperating toward mapping it
completely. This is a cooperative completion condition, not a competitive
one; per-player XP/level remain a personal-progress measure, not a scoring
contest between the two players.

## Glossary

- **Tile** — one hex (rendered as an isometric diamond) on the map; may be
  blank, a planet, a natural wonder, an anomaly, or a pirate base.
- **Fog of war** — per-player tracking of which tiles have been revealed by
  that player's exploration.
- **Region** — a fixed-radius cluster of hexes, precomputed by the map
  generator, used for pirate base spawn-chance rolls.
