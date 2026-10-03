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
- Both ships start at **Earth**, a planet in the shared home system (whose
  star — the one every player's ship can see first — is "Sol"). Earth is a
  planet tile, not the star itself; see "Stars" below for why that
  distinction matters.
- Each player has their own: fog-of-war/revealed-tile state, position,
  experience total, level, and ship stats (moves/turn, vision radius, health,
  attack). Players do not share progress with each other, even though they
  share the same map.
- Turn structure: each player takes a full turn (spends their move budget,
  may end early), then explicitly ends their turn, handing the device to the
  other player via a pass-and-play interstitial (see
  [`ui-ux-spec.md`](ui-ux-spec.md)).

## Map & Coordinate System

- A single true-hex map, generated once per game session from a random seed
  (not fixed/shared across all playthroughs — see
  [`technical-architecture.md`](technical-architecture.md)).
- The map is **mostly empty deep space**, with distinct, spaced-apart star
  systems scattered across it (not a uniformly-paved grid where every hex is
  "a star system" — the concept doc's "1,000+ star systems" describes the
  eventual number of separate, multi-tile systems, not the map's total tile
  count). Prototyping at ~100-150 systems first; see `mvp-roadmap.md` for the
  1,000+ scale-up.
- Each system is a small cluster of tiles (a star, optionally a few planets/
  asteroid-belt tiles, surrounded by a thin "interstellar" halo) rather than
  a single hex — see `graphics-and-assets.md`/`technical-architecture.md` for
  how these are generated and carved. Every tile (whether part of a system or
  true deep space) is tagged with one of five **bands** — `inner`, `medium`,
  `outer`, `interstellar`, `deep-space` — used to pick its background art.
- Rendered as a true flat-top hex grid (6-neighbor axial coordinates,
  genuine hex-shaped tile art) — see `technical-architecture.md` for the
  rendering-math history here (the original diamond placeholder art was
  actually a square-grid projection, not a hex one; resolved once real hex
  art existed).
- Both players explore the *same* generated map/seed within one game session;
  only their fog-of-war differs.

## Stars

Each system has 1-3 actual stars (not a decorative "wonder" — these are real
tiles in the system, generated structurally): single-star 65% of systems,
binary 25%, trinary 10%. This is a direct map-generation fact, not a special
event to discover — a trinary system is simply a system with three star
tiles clustered at its center, the same way a real trinary star system is
still just "a system," not a bonus feature layered on top of one. The home
system's star is **Sol** (always single-star); **Earth** is a separate
planet tile within that system, not the star itself.

## Movement & Exploration

- Each ship has a fixed number of moves per turn (increases with leveling).
- Moving onto a previously-unexplored (fogged) tile reveals it and awards
  experience:
  - Deep space (the vast majority of hexes — not explicitly generated, see
    `technical-architecture.md`): 1 XP.
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

- Each **star system is its own region** for pirate purposes (a tile's
  `regionId` is simply its owning system's id — see
  `technical-architecture.md`). Per region, there's a chance each turn (or on
  some other cadence, to be tuned) that a pirate base spawns if no pirate
  base is currently present in that region.
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
| Natural wonder | Black hole | Highest flat XP; visually distinct tile (the tileset's swirling "oil"/black-hole-style disc). Trinary star systems are **not** a wonder — see "Stars" above; they're a real multi-tile structural feature of system generation, not a discoverable bonus. |
| Asteroid / Kuiper belt | — | Terrain feature tile (16 hill-silhouette variants from `hills.png`); treated as a normal explorable tile for XP purposes unless/until given a distinct effect |

## Session End

**Win condition (MVP, revised): every star system has been discovered** —
i.e. a ship (either player's) has revealed each system's star tile at least
once. Originally framed as "the map is fully explored," but with the map now
mostly deep space (not a uniformly-paved grid, see "Map & Coordinate System"
above), literally revealing every single hex is no longer a reasonable or
fun completion condition — it would mean carpet-covering tens of thousands
of empty tiles. Discovering every *system* preserves the original intent
(a shared, cooperative "have we mapped everything of substance" goal)
without that grind. Still cooperative, not competitive, across both
players' fog-of-war; per-player XP/level remain a personal-progress measure,
not a scoring contest.

## Glossary

- **Tile** — one true hex on the map, tagged with a **band** (inner/medium/
  outer/interstellar/deep-space, driving its background art) and optionally a
  feature on top: star, planet, natural wonder, asteroid/Kuiper belt,
  anomaly, or pirate base.
- **System** — a cluster of tiles (a star, surrounding rings of possible
  planets/belts, and an interstellar halo) generated as one unit; the
  concept doc's "star system."
- **Fog of war** — per-player tracking of which tiles have been revealed by
  that player's exploration.
- **Region** — equivalent to a system's id; used for pirate base spawn-chance
  rolls.
