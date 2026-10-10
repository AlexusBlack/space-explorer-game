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
- **Cluster field** (`buildClusterField`, own stream `${seed}:clusters`):
  systems gather into 8–12 star clusters separated by empty voids, instead
  of being spread evenly. It's a hybrid of fixed centres plus noise, rather
  than thresholded noise alone, because noise by itself can't guarantee a
  cluster count or that Sol sits in a cluster.
  - The cluster count is uniform 8–12. Radii share `CLUSTER_TOTAL_AREA`
    between them, are jittered, and are sorted largest first.
  - The largest cluster is centred on the origin, so the home system always
    starts inside one.
  - The other centres are dart-thrown at least `CLUSTER_GAP` hexes apart,
    edge to edge. A cluster that can't fit shrinks its radius and retries,
    down to half the base radius.
  - `density(q, r)` warps the position by `CLUSTER_WARP` hexes of fbm noise
    (`src/noise.js`: seeded 2D gradient noise, streams
    `${seed}:cluster-warp-x`/`-y`). It then returns the strongest cluster
    falloff: 1 out to `CLUSTER_PLATEAU` of the radius, falling linearly to 0
    at the edge. The warp is what gives clusters irregular, natural edges.
- **Placement**: pre-roll every system's target radius, sort largest-first,
  then dart-throw candidate centers (up to a fixed attempt budget per
  system), rejecting any candidate closer than `radius + otherRadius + MIN_GAP`
  (native hex distance) to an already-placed system. If no candidate is
  found, shrink the radius and retry, down to an absolute minimum, and skip
  the system entirely if even that fails. Largest-first avoids the coverage
  ceiling a naive random-sequential approach hits. Candidates come from
  `pickSystemCandidate`, and there are two kinds:
  - most systems pick a random cluster, take a point within
    `CLUSTER_SPREAD` × its radius, and accept it with probability equal to
    the density there;
  - about `LONE_SYSTEM_SHARE` (10%) are lone systems: uniform darts accepted
    only where density ≤ `LONE_MAX_DENSITY`, so they land in the voids.

  With `MAP_RADIUS` 150 and `SYSTEM_COUNT` 120, about 112 systems are placed
  and about 70% of hexes are deep space. Changing any of these constants
  changes every seed's layout, so bump `SAVE_VERSION` when you do.
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
- **Star colours use their own random stream**: every star tile carries a
  `sprite` (`star-red`, `star`, `star-orange`, `star-white`, `star-blue`),
  picked by weight from `src/star-classes.js` (also read by `assets.js`).
  The roll comes from a separate `` createRng(`${seed}:stars`) `` stream, not
  the main `rng`: star tiles made no draw before colours existed, so drawing
  from `rng` would shift every later draw, changing every seed's layout and
  breaking existing saves (whose map is regenerated from seed). Sol is fixed
  to the yellow `star` but still makes its draw, so every system consumes
  the same number of star-stream values.
- **Planet/moon sizes and moon offsets use their own random stream too**
  (`` createRng(`${seed}:bodies`) ``, threaded through `populateSystem`,
  `placeBodiesInZone` and `placeMoons`), for the same reason as star
  colours: drawing them from `rng` would change every seed's layout.
  Planets get `scale` (`PLANET_SCALE`, 0.75-1); moons get `scale`
  (`MOON_SCALE`, 0.8-1.2) and `offset: {x, y}` (each within
  ±`MOON_OFFSET_MAX` = 0.5). Earth is fixed at `scale: 1` but still makes
  its draw. Visual only; see Rendering Loop.
- **Names come from a final pass with its own stream**
  (`nameMap`, `` createRng(`${seed}:names`) ``), run after every tile
  exists, so naming never moves a layout draw. `generateMap({ seed, names })`
  takes the parsed `data/star_planet_names.json` (`main.js` fetches it once
  at startup with top-level `await`; it's data, so no build step); with no
  list every system gets a designation. It sets `system.name` (also on the
  primary star tile), `name` on companion stars (`GD-17 B`, clockwise from
  north around the primary), planets (Roman numeral by hex distance from
  the primary, ties clockwise from north) and moons (`-a`, `-b`... clockwise
  around `parent`), and `ownName` on inhabited planets/moons (Earth's is
  "Earth", its moon's "Luna"). One `used` set (seeded with `RESERVED_NAMES`:
  "Sol", "Earth" and "Luna") keeps every
  system and own name unique per map; a pick removes a random entry from
  its pool (`use` star+any, planet+any or moon+any) and falls back to a
  designation if the pool runs dry. `DESIGNATION_CHANCE` = 0.4. Names are
  regenerated, not saved: editing the JSON renames bodies in existing saves
  but never moves them.
- **Species come from one more final pass with its own stream**
  (`assignSpecies`, `` createRng(`${seed}:species`) ``, run after
  `nameMap`), so adding species changed no layout or name and needed no
  `SAVE_VERSION` bump. `generateMap({ seed, names, species })` takes the
  parsed `species/species.json` (fetched once by `main.js`, like the names;
  with no list nothing is assigned). Each inhabited planet/moon, in tile
  order, gets `species: { id, name }`: a random species whose `planetoids`
  include its class (`CLASS_TO_PLANETOID`: rocky→rocky, ice→frozen,
  gas-giant→gas_giant, toxic→toxic, molten→molten; repeats allowed), then a
  random name from `[key, ...name_variants]`. Earth and Luna are fixed to
  Humani (found by `key`) as "Human". Only `id` and the chosen name are on
  the tile; the card looks up the rest by `id`. Display only, nothing in
  game logic reads it.
- **Planets are restricted by zone/band, and may have moons**: `inner` gets
  0-3 Molten/Toxic bodies (never moons); `medium` gets 0-3 Rocky planets
  (each 0-2 moons, Rocky or Molten); `outer` gets 1-3 bodies, each 50/50 a
  Gas Giant (0-5 moons, any class except Gas Giant) or an Ice planet (0-2
  ice-only moons). `src/planet-classes.js` is the single source of truth
  for the class → sprite catalog (and the moon-eligible subset, excluding
  Gas Giant — a gas giant orbiting a gas giant doesn't make sense), imported
  by both `mapgen.js` (generation) and `assets.js` (loading). Its
  `MOON_ONLY_SPRITES` adds per-class sprites only moons may draw: `placeMoons`
  calls `pickClassAndSprite(rng, pool, true)`, planets never pass `true`.
  Today that is `moon-grey` in Rocky, so a Rocky moon is grey 1 time in 7.
  **Earth always has exactly one moon, Luna**: instead of `placeMoons`,
  `populateSystem` claims one neighbor of Earth with
  `claimNeighborsFromPool(rng, pool, earthCoord, 1)` and writes a fixed
  Rocky, `moon-grey`, inhabited moon flagged `luna: true` (size and offset
  still rolled). Earth is placed first, so its medium-ring pool always has a
  free neighbor (checked over 500 seeds). A moon is a
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
- **Anomalies** are seeded two ways, both tunable: `populateSystem` rolls a
  per-system chance (`ANOMALY_SYSTEM_CHANCE`, same mechanism as the
  `wonder-blackhole` roll just above it) claiming a zone-pool hex, and the
  deep-space sweep (below) separately rolls a rarer per-tile chance
  (`ANOMALY_DEEPSPACE_CHANCE`) to seed one directly into otherwise-empty
  space instead of a plain band tile. Both rates were raised to 8x their
  original first-pass values (0.12→0.96, 0.0004→0.0032) across two rounds
  of playtesting feedback, each prior rate still too sparse to reliably
  encounter within the first few turns — purely a probability bump, no
  placement guarantee; an unlucky seed can still in principle place every
  anomaly far from home. At `0.96` per system, nearly every system has
  one — anomalies are now a near-ubiquitous feature, not a rare find.

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
  `wonder-blackhole`, `asteroid-belt`, `anomaly`) layered on top of its own
  band. Every
  materialized tile — feature or plain — carries a `band` field the renderer
  uses to pick the background image; only `"band"` type tiles have *nothing
  else* drawn on top. `planet`/`moon` tiles additionally carry `planetClass`
  (molten/toxic/rocky/gas-giant/ice), `sprite` (the specific icon key within
  that class; the gas-giant class has six colour variants), and `inhabited` (boolean, independent of class/sprite); a
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
- **Scale**: prototyping at ~100-150 systems (mapRadius 150, ~68,000 tiles
  fully materialized in ~95ms — fine at this size; the radius grew from 90
  when star clusters were added, to leave room for voids). The concept doc's
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
├── activePlayerIndex, movesRemaining, turnNumber, won
├── destroyedAnomalies: Set<"q,r"> — shared, NOT per-player (see "Anomalies" below)
├── pirateBases: [{ id, q, r, regionId, health, maxHealth }] — dynamic
│     entities, NOT a mapData tile mutation (see "Pirates & Combat" below)
├── pirateShips: [{ id, q, r, health, maxHealth, attack, baseId }]
├── nextPirateEntityId — shared id counter for both arrays above
└── players: PlayerState[] — 1..6, in turn order (from the start screen)
      └── PlayerState: { name, shipName, color (= team), q, r, xp,
            unlockedUpgrades: Set<upgradeId>,
            discovered: Set<"q,r"> (the SAME instance for teammates),
            currentHealth, inCombatThisRound,
            notifications: [{ kind, q, r, message, speciesId? }] }
```
Only `xp` and `unlockedUpgrades` are persisted leveling state — `level`,
`visionRadius`, moves-per-turn, and the per-tile XP bonus are all derived
from them on demand (see "Leveling & upgrades" below), never stored
directly, so they can never drift out of sync with the current thresholds
or catalog. `maxHealth`/`attack` (MVP4) are derived the same way; only the
depletable `currentHealth` is stored directly, since it's mutable
moment-to-moment combat state, not a pure function of `xp`/
`unlockedUpgrades`.

Fog-of-war (`discovered`) is deliberately kept **off** the shared `tiles`
map and lives entirely as one `Set` of `axialKey` strings **per team** —
every player reads the same singleton tile objects, so storing a "revealed"
flag on the tile itself would leak one team's discoveries into another's
render pass immediately. `src/render.js` only ever receives the *active*
player's `discovered` set, which is what actually enforces "can't see
another team's fog" (a data-availability guarantee, not a runtime check).

**Team fog is a shared Set instance.** A team is just a colour.
`createNewGame(mapData, setup)` gives every player of one colour the very
same `Set` object as `player.discovered`, rather than adding a separate
team record. Why:
- every fog reader (`render.js`, `tile-report.js`, pirate fog gates, the
  win check) keeps reading `player.discovered` unchanged;
- `revealTile`'s existing "already discovered → no XP, no notification"
  rule gives exactly the chosen XP rule: discovery XP goes only to the
  teammate who reveals a hex first.

The catch is persistence: JSON can't express shared references, so the
save stores fog once per team colour and `deserializeState` rebuilds one
Set per colour (see "Persistence").

**Reveal is vision-radius-based, not single-tile.** Whenever a ship
occupies or passes through a hex — every step of a tapped move's path,
not just the destination — `src/state.js`'s `revealAround` reveals every
tile within `visionRadiusForPlayer(player)` of that hex (base 1 — itself
plus its 6 neighbors — plus any Vision-track upgrade bonuses; see
"Leveling & upgrades" below). Newly-revealed tiles award XP via
`xpForTile`/`revealTile` (plus any Science-track flat bonus) regardless of
whether they were the move's destination or just within vision range —
there's no separate "seen vs. visited" XP tier.

**Leveling & upgrades.** `player.xp` is a **monotonic lifetime total** —
it only ever increases (even if a future feature lets XP double as a
spendable currency elsewhere, that needs its own separate balance field,
since `level` must never go backwards). `src/state.js`'s `levelForXp`
derives a level from it via a cumulative-cost threshold table
(`cumulativeXpForLevel`); `playerLevel(player)` is the convenience
wrapper. Leveling up does **not** automatically apply a fixed stat
change — each level past 1 grants one upgrade *pick* from
`src/upgrades.js`'s `UPGRADES` catalog, which the player chooses among
whatever `availableUpgrades(player.unlockedUpgrades)` currently offers
(a catalog entry's `requires` can name any other entry, including one in
a different "track" — tracks are a display grouping only, not an
isolation boundary). `pendingUpgradePicks(player)` (level minus 1 minus
how many have already been spent) tells `main.js` when to show the
upgrade-picker overlay; if a pick is owed but nothing's currently
offerable (every reachable tier already taken), it's left banked rather
than forced. `movesPerTurnForPlayer`/`visionRadiusForPlayer`/
`xpBonusForPlayer` sum whichever catalog entries' `movesPerTurnBonus`/
`visionRadiusBonus`/`xpBonusPerTile` fields are present in
`player.unlockedUpgrades`, each on top of a base constant
(`MOVES_PER_TURN_BASE`/`VISION_RADIUS_BASE`). `trailTurnsForPlayer` sums
`trailTurnsBonus` from a base of 0: how many turns of ship trails the player
sees (see "Vessel Trail Detector" below).

**Anomalies** (`type: "anomaly"` tiles, `src/mapgen.js`) carry no extra
gen-time data — which of four effects fires is rolled at trigger time, not
stored on the tile (same "nothing to store yet" treatment as
`wonder-blackhole`). Unlike every other feature, an anomaly's effect does
**not** fire on reveal — `src/state.js`'s `checkAnomalyLanding(mapData,
gameState, player)` only fires when a player's position, after a move,
exactly matches a still-live anomaly tile. On a hit, it **mutates the
shared `mapData` tile object in place** (`tile.type = "band"`) — the
anomaly is destroyed globally, for both players, the instant either one
lands on it, not tracked per-player. Since `mapData` is never persisted
(always cheaply regenerated from the seed via `generateMap`), the
destruction itself is recorded in the persisted, gameState-level
`destroyedAnomalies` Set; `applyDestroyedAnomalies(mapData, gameState)` is
called once at boot after a saved game's `mapData` is regenerated, to
replay every previously-destroyed tile back to `"band"` before play
resumes — otherwise a reload would resurrect every anomaly a player had
already consumed. `src/state.js`'s `triggerAnomaly(mapData, player, tile,
rng)` then resolves one of wormhole / bulk-XP / local-reveal / free-upgrade
uniformly at random (`rng` defaults to `Math.random`, injectable for
tests); if free-upgrade is rolled but `availableUpgrades` has nothing left
to offer, it rerolls among the other three rather than wasting the
anomaly. The local-reveal effect reuses `revealAround` with an explicit
`radius` override (bigger than any upgrade-boosted vision radius) and
awards XP for whatever it newly reveals exactly like any other reveal —
it's a bonus discovery burst, not a free unfog.

**Pirates & Combat (MVP4, `src/pirates.js` + `src/combat.js`).** Pirate
bases/ships are dynamic `gameState` records, not mapData tile mutations
like anomaly destruction — a pirate can sit on top of any tile without
altering it, so nothing about them needs replaying onto a
freshly-regenerated map at load (unlike `destroyedAnomalies`). A region
"has a base" purely by whether some entry in `gameState.pirateBases`
carries its `regionId` — no separate flag; destroying a base simply
removes that entry, which both frees the region and does **not**
retroactively remove ships it already produced (they become ownerless
orphans, harmless, since `produceFromBases`'s support-cap check only
counts ships whose `baseId` matches a still-present base).

`tickPirates(mapData, gameState, rng)` orchestrates one full round (called
from `main.js`'s `endTurn`, exactly where `activePlayerIndex` wraps back to
0 — i.e. once per round, not per-player-turn or per-move): spawn-chance
rolls per eligible region, production rolls per base under its support
cap, then up to `PIRATE_SHIP_SPEED` (6) single-hex roam/attack steps per
existing ship, re-evaluated fresh each step. Within
`PIRATE_SHIP_DETECTION_RADIUS` of the nearer player, chase chance isn't
flat: `healthRatio = min(1, (ship.health/ship.maxHealth) /
(player.currentHealth/maxHealthForPlayer(player)))` scales
`PIRATE_CHASE_CHANCE` (a 0.9 ceiling) down as the ship falls behind that
player in relative HP, so a healthy ship chases aggressively and a
battered one rarely does. A step that rolls "don't chase" either flees
(steps toward the materialized neighbor that *maximizes* distance from the
player, via `stepAwayFrom` — the mirror of `stepToward`) if `healthRatio`
is below `PIRATE_FLEE_HEALTH_RATIO` (0.5), or falls back to a plain random
materialized-neighbor step otherwise (same as when no player is in
detection range at all). Each fight returns an event `{ playerIndex, q, r,
message }` (`q, r` is the fight hex, the attacked player's position).
`endTurn` pushes it to that player's `notifications` as a `pirate` entry
rather than a blocking overlay, so it's seen by the attacked player on
their own next turn. `endTurn` clears the ending player's list *before*
running the tick, so an attack on the player who just ended their turn
isn't wiped. Encountering a player mid-step ends that ship's
movement for the round early, via the stop-short rule below, same as the
player's own attacks consume their whole action. `findPirateAt(gameState,
q, r)` is a plain
position-based lookup (not tied to a specific player's current position) —
`main.js` calls it against the player's *tapped move target* before
committing any movement, and `stepPirateShip` calls it (inline, once per
step) against each candidate roam-step destination before committing the
ship's movement, both for the stop-short rule below.

**HP/attack scale (combat-rebalance update): 100 HP shared by player
ships, pirate raiders, and pirate bases alike; player attack ~2x a
raider's; pirate bases hit harder (8 vs. a raider's 6) to compensate for
having no more health** — a deliberate bump from the original MVP4 pass's
much smaller pool (8-30 HP), which made most fights resolve in one or two
hits.
`combat.js`'s damage constants (4-8 per hit at parity) were already ported
directly from Civ5's own 100-HP convention, so this rebalance is pure stat
tuning — no changes to `resolveCombat` itself, which already operates on
dimensionless ratios/fractions and so was scale-independent all along.

`combat.js`'s `resolveCombat(attacker, defender, terrainBonusPct, rng)` is
a single mutual exchange (not a multi-round loop) per call — repeated
calls across turns (via repeated taps or roam steps) are what make an
engagement multi-hit, not looping inside one call. Adapted from Civ5's own
melee formula: `effectiveStrength = attack * woundedMultiplier * (1 +
terrainBonus)`, a strength-ratio damage modifier (`m = 0.5 + (r+3)^4/512`,
Civ5's own constant), and random damage within a min/spread band. The
attacker hits first; the defender only counters if it survives that hit.
The defender's terrain bonus is keyed by whichever tile type the fight
occurs on: `band` +0%, `planet`/`moon` +15%, `asteroid-belt` +25%, `star`
+50%, `wonder-blackhole` +75% — `TERRAIN_DEFENSE_BONUS` in `combat.js`.

**"Stop short unless destroyed" — the attacker never shares the
defender's tile mid-fight.** Both `main.js`'s `handleTap` (player attacking
a pirate) and `pirates.js`'s `stepPirateShip` (pirate attacking a player)
follow the same pattern: resolve combat using the *defender's* tile for
the terrain bonus, without first moving the attacker onto it; only commit
the attacker's position change to that tile if `resolveCombat` reports
`defenderDefeated`. For the player, this means a multi-hex tapped move
that targets a live pirate applies only up to the second-to-last hex of
the path (`path.slice(0, -1)`) before combat resolves, with a final
`applyMove(mapData, active, [target])` only on a kill; a flat
`ATTACK_MOVE_COST` (`src/pirates.js`) is spent from `movesRemaining`
(clamped at 0) regardless of the tapped distance or whether the ship
actually advances — simpler than, and replacing, an earlier "full tapped
distance" rule. For a pirate ship, this simply
means not updating `ship.q/r` in the non-kill branch — Civ5-style, a
non-lethal melee attack spends the turn's action with no forward
progress. A consequence: a player's final position after `handleTap` can
never coincide with a still-*live* pirate (either it died and was
removed, or the move stopped one hex short) — so the anomaly check that
follows always runs safely against wherever the player actually ended up,
with no risk of firing against a tile that also holds a live pirate.

Losing a fight calls `state.js`'s `applyShipLoss`: a flat, tunable XP
penalty floored at 0 (`SHIP_LOSS_XP_PENALTY`) — the **one sanctioned
exception** to "xp never decreases" (see "Leveling & upgrades" above) —
full respawn at Earth with `currentHealth` reset to max. Moves-remaining
forfeiture for the current turn is handled by the caller
(`main.js`'s `handleTap`), only on the player-initiated-attack path; a
round-tick pirate-initiated loss has no "current active player's moves" to
meaningfully forfeit.

**Passive healing** (`state.js`'s `tickPassiveHealing`, called from
`main.js`'s `endTurn` right after `tickPirates`, same once-per-round
cadence): any player whose `inCombatThisRound` is still `false` regenerates
`passiveHealForPlayer(player)` HP, clamped at `maxHealthForPlayer`; the
flag is then reset to `false` for both players regardless, for the next
round. `inCombatThisRound` is set `true` by `resolvePlayerAttack` (the
instant a player attacks) and by `stepPirateShip` (the instant a pirate's
attack resolves against a player) — it spans the whole round (both
players' individual turns plus the round-tick itself), since a
player-initiated fight happens *during* their own turn, before the round
wraps, while a pirate-initiated fight only ever happens *during* the
round-tick. Eligibility is deliberately "no combat happened this round,"
not a proximity/detection-range check (confirmed with the user). Pirates
themselves have no passive healing — only `PlayerState` carries
`inCombatThisRound`/benefits from this.

**Fog exception — stars are always visible.** `render.js` always draws a
`"star"` tile regardless of the active player's `discovered` set (every
other tile type stays blank/fogged until actually discovered). This is a
pure rendering/wayfinding aid toward the win condition — players can see
where every system is from the start — and is independent of the
`discovered` set: seeing a star this way does **not** mark it discovered,
so it grants no XP and doesn't count toward the win condition below.

**Ship markers**: every player's ship is always drawn (regardless of whose
turn it is — unlike fog, ship position isn't privileged information),
using `images/icons/ship.png` (cropped from `units.png`, see
`graphics-and-assets.md`) — the **same sprite for every player**. Players
are told apart four ways, each answering a different question:
- A small badge in the team colour, fixed to the screen's top-right corner
  (`index.html`'s `#player-badge`, updated in `main.js`'s `updateHud`) —
  "whose turn is it." It shows the turn-order number (P1, P2…), since
  teammates share a colour.
- An "ICV <ship-name>" label under the ship (`render.js`'s
  `drawShipLabel`; `main.js` passes `label: shipTitle(player)` in each ship
  record), team-coloured text on a dark pill, for the stack's visible ship
  only, at zoom > `LABEL_ZOOM` like world tags — "which ship is this,"
  including between teammates.
- A small team-coloured dot drawn at the upper-left corner of the ship's hex
  (`render.js`'s `drawOwnerDot`, same "not privileged information" policy
  as the ship sprite itself), for the stack's visible ship only (see
  "Ship stacks" below) — "which on-screen ship is whose."
- A "marching ants" selection animation drawn under the *active* player's
  ship only (`render.js`'s `drawSelectionPulse`, using
  `images/select-alpha.png` — a 4-frame white dashed-oval strip, drawn as
  its own original color, not recolored per player) — "which ship is
  currently being commanded."

None of these recolor or swap the ship icon itself — the sprite stays
identical for every player throughout.

**Ship label vs. world labels.** The ship sprite (44 px) is about as tall
as a planet (47 px), so a ship label hanging under the ship would overlap
the world's own name tag hanging under the planet. `render` therefore
computes the ship stacks *before* drawing the tile label queue, records
each labelled ship's label bottom per hex (`shipLabelBottoms`), and moves
any label or tag queued for that hex down to start under it. The tag's
returned hit rect moves with it, so tapping it still opens the world card.
Ship labels draw after every ship sprite, so no sprite covers one.

The ship sprite and selection oval scale with zoom only up to their native
pixel size (`SHIP_MAX_ZOOM` = 1 in `render.js`): zoomed in further they
stay put, so they stay sharp and don't grow to planet size. The owner dot
still follows the hex. Pirate ships use the same cap, and so does their
health bar so it stays just above the sprite; pirate bases still scale freely.

**Ship stacks**: player and pirate ships share one render pass. Each hex
draws only one ship. `render.js`'s exported, pure `shipStacks(playerShips,
otherShips, discovered)` groups the visible ships by hex:
- player ships are always visible;
- pirate ships are visible only on hexes the active player has discovered.

It then sorts each stack, keeping the incoming order within a rank:
1. the active player's ship;
2. other players' ships;
3. everything else (pirates now, future AI ships).

The top ship gets its usual extras:
- the selection pulse and owner dot if it's a player ship;
- the health bar if it's a pirate.

A stack of two or more also gets a count at the hex's upper-right corner
(`drawStackCount`), which is why the owner dot moved to the upper-left.

Pirate bases are structures, not ships. They are drawn first, always
visible on discovered hexes, and never counted. Stacks topped by a pirate
draw before stacks topped by a player, so a player ship stays on top where
sprites spill into a neighboring hex.

The long-press tile report lists the whole stack.

**Win condition check**: with deep space now the vast majority of the map,
"every tile revealed" is no longer the right completion condition (see
`game-design.md`'s Session End) — it's **every system's star tile
discovered** instead. A system's primary star always sits at exactly
`(system.q, system.r)` (see `mapgen.js`'s `carveSystem`), so
`checkWinCondition` just tests, for every entry in `mapData.systems`,
whether *any* player's `discovered` set contains that key — a
cooperative union, O(systems × players) per move, run after every move.

## Rendering Loop

Canvas 2D, redraw-on-change (no need for a continuous animation loop given
turn-based, low-frequency updates) — redraw triggers: camera pan/zoom, ship
movement, turn change, pass-and-play interstitial show/hide, plus one
periodic source: the active-player selection pulse (see "Ship markers"
above) advances through its 4 frames on a ~150ms tick (`main.js`'s
`frame()`, gated behind a simple frame-index comparison so a full canvas
redraw only actually happens when the visible frame changes, not on every
`requestAnimationFrame` tick). That tick — and the animation itself — is
suppressed while the pass-and-play interstitial is visible, since nothing
needs to animate underneath a fully-covering overlay.

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
wider than the ~64px tile itself. Planets and moons are the deliberate
exception to native-size icons: each planet is drawn at its tile's `scale`
(0.75-1) and each moon at 50% times its `scale` (0.8-1.2), since moons are
meant to read as smaller bodies orbiting their parent planet, not a second
equally-sized feature. A moon is also shifted by its `offset` (fractions of
the zoomed hex half-width/half-height, up to ±0.5, so it stays inside its
hex). Labels hang just under their drawn icon, not the hex: the anchor is
the icon's drawn centre (a moon's includes its offset) plus half its scaled
height (`labelAnchor`; the sprites fill their full height, so the image's
bottom is the body's bottom), with the hex half-height as a fallback while
the image loads. Label text grows with zoom only up to a cap
(`LABEL_MAX_PX` 14, `TAG_MAX_PX` 16) and then stays put, so close zoom
keeps labels readable rather than oversized. Labels: the primary star's
`name` shows at zoom > `LABEL_ZOOM` (0.5) even undiscovered, an inhabited
body's `ownName` at the same zoom as a tag (`drawTag`: bold, slightly larger
white text in a dark blue `roundRect`), and plain designations of other
bodies and companion stars only at zoom >= `DESIGNATION_ZOOM` (1). Drawing a tile's background, icon, and
label together before moving to the next tile meant a later-processed
neighboring tile's opaque background would silently paint over the
spillover part of an earlier tile's icon or label. Queuing icons/labels
during the background pass and drawing them only once every background is
down (`src/render.js`'s `pendingIcons`/`pendingLabels`) guarantees nothing
ever clips them, regardless of q/r iteration order.

**Tappable name tags.** `drawTag` returns the screen rect it drew, and
`render` returns `{ tagHits }`, a `{ rect, tile }` per tag drawn this frame.
`main.js` keeps the latest list (any camera change redraws, so it's never
stale) and `handleTap` hit-tests it before treating a tap as a move,
last-drawn tag first. Tags only draw for the active player's discovered
worlds above `LABEL_ZOOM`, so tappability follows the same fog and zoom
rules. A hit opens the `#world-card` overlay (`index.html`): a dimmed
backdrop with a ~320px card holding the world's `ownName`, its class and
type, the species portrait (`species/images-opt/<id03>-<Key>.webp`, loaded
by `<img>` only when the card opens), the species name and its
description. Any tap on the card or backdrop closes it, and `handleTap`
ignores taps while it is open, like the other overlays.

**Tile report.** `input.js`'s `attachCameraControls` takes a fifth
callback, `onLongPress`:
- The first pointer's `pointerdown` starts a 500 ms timer.
- The timer is cancelled when the press stops being a tap candidate (more
  than 10 px of movement), when a second pointer arrives, and when the last
  pointer is released.
- When it fires, it clears `tapCandidate` so the release isn't also a tap,
  which would move the ship. It also sets `longPressed`, which makes
  `pointermove` ignore movement until every pointer is up, so the map doesn't
  drift under the window.

`main.js`'s `handleLongPress` converts the point with `screenToHex`, which
`handleTap` now shares. It then renders `tile-report.js`'s
`buildTileReport(mapData, gameState, q, r)` into `#tile-report`, using DOM
nodes and `textContent` only.

The builder is pure, so it can be tested headlessly, and it is always from
the active player's point of view:
- An undiscovered hex returns only "Unexplored" and the distance.
- Pirates are listed only on discovered hexes, the same rule `render.js` uses.
- Player ships are always listed, because they are always drawn.

`CLASS_DISPLAY_NAMES` moved there from `main.js`, and the world card imports
it.

`overlayOpen()` is the shared guard: taps and long-presses do nothing while
any overlay, the world card or the report is open. The report closes only
on its backdrop or its × button, so its "View world" button (which closes
the report and calls `showWorldCard`) can be pressed.

**Notification area.** Each player's `notifications` array (oldest first)
feeds `#notifications`, a DOM column on the right edge rebuilt by
`renderNotifications` (called from `updateHud`, so every state change, turn
switch and load is covered). Entries come from three places:
- `revealTile` pushes a `species` or `anomaly` entry when it newly reveals an
  inhabited world with a species or an anomaly tile, but only when
  `awardXp` is true. `awardXp` already separates real discoveries from the
  silent spawn and respawn reveals, so Earth and Luna are never announced,
  and no second flag is needed.
- `endTurn` routes `tickPirates` events into `pirate` entries (see "Pirates
  & Combat").
- `pruneNotifications` drops `anomaly` entries whose tile is no longer an
  anomaly. Anomaly destruction is shared, so this runs for both players in
  `afterStateChange` and at load.

`clearNotifications` empties the ending player's list in `endTurn`.

Each circle handles its own pointer events, so they never reach the canvas
pan/tap handler:
- a release after moving under 10 px is a tap: `centerCameraOn` plus
  `#notice-caption` for 7 s, with one shared timer that a new tap restarts
  (a `species` entry opens `showWorldCard` for its tile instead of the
  caption);
- a horizontal drag of 40 px or more removes the entry and saves.

The column's z-index is below the full-screen overlays, so the opaque
interstitial hides it during handoff. Only the player's own attack on a
pirate still uses the `#combat-overlay` queue.

## Start Screen

`src/setup.js` is pure (no DOM): `TEAM_COLORS` (6, cyan and orange first
so pre-team saves keep their colours; no red, which reads as pirates),
`SHIP_NAMES`, `MIN_PLAYERS`/`MAX_PLAYERS` (1/6), `NAME_MAX_LENGTH` (20),
`SHIP_PREFIX` ("ICV") and `shipTitle(player)`. The roster is an array of
`{ name, shipName, color }` in turn order:
- `defaultSetup` is two players on the first colour;
- `addPlayer` uses `defaultPlayerName` (lowest free "Player N") and
  `pickShipName` (random among unused names), on the first player's team;
- `normalizeSetup` runs on Start: trims, truncates, fills blanks with
  defaults, and drops unknown colours.

`main.js` renders it into `#setup` (DOM nodes and `textContent`/`value`
only, no `innerHTML` with user text). Text inputs write straight into the
working array without a re-render, so typing keeps focus; add, remove and
reroll rebuild the rows. `showSetup({ cancellable })` opens it: the top
bar's New Game passes `true`; boot passes `false` when there is no usable
save (or `?seed=` names a different seed than the save), prefilling that
URL seed. Until Start there is no `gameState`, so `frame()` skips drawing.
`#setup` is in `overlayOpen()`, so map gestures are ignored under it.

Ship names are stored without the "ICV" prefix; everything that shows one
goes through `shipTitle` (map label, HUD, tile report, pirate messages).

## Vessel Trail Detector

`src/trails.js` is pure. `gameState.trails` is a list of
`{ ship, color, time, path: [{ q, r }] }` records:
- `ship` is `"p<index>"` for a player or `"s<id>"` for a pirate ship;
- `color` is the team colour, or `PIRATE_TRAIL_COLOR` (red) for pirates.

**Time.** Trails are stamped in player turns ("steps"):
`currentStep = (turnNumber − 1) · P + activePlayerIndex`, with P the player
count, so it is derived from existing fields and needs no counter of its
own. The pirate round runs in `endTurn` after the turn has wrapped to
player 0, so `pirates.js` stamps its moves `currentStep − 0.5`: after the
last player's turn and before the next round's first.

**Age.** For a viewer at step S, `trailsForViewer` gives age 1 to anything
with `S − time ≤ P` (from their own previous turn up to now, including this
turn) and age 2 to `P < S − time ≤ 2P`. From every seat that puts the
viewer's own last move, every other player's move since, and exactly one
pirate round at age 1. A half-step window was chosen over per-round
numbering because round numbers would show seat 3 the previous round's
moves of seats 4–6 as "older" than seats 1–2's.

**Recording.** `main.js`'s `moveActive` wraps `applyMove` and records the
hexes the player moved through (the approach path and any advance after a
kill). `pirates.js` records every roam step and the advance after a kill.
`recordTrail` extends a ship's latest record only when the time matches and
the new path starts where that record ends; otherwise it starts a new one.
Wormhole jumps and respawns aren't recorded as moves, so they break the
line. Moves are recorded whether or not anyone owns the upgrade, so a fresh
Mk I shows the last turn at once. `pruneTrails` runs on every End Turn and
drops records older than 2P steps, so the list stays a couple of rounds
long.

**Drawing.** `render.js`'s trail pass runs after the map sprites and
before labels, bases and ships, older records first. Each step is its own
segment between hex centres, drawn only when both hexes are in the viewer's
discovered set (the same fog rule as pirate ships). Age 1 goes from
`TRAIL_ALPHA_TAIL` (0.2) at the record's start to `TRAIL_ALPHA_HEAD` (0.75)
at the ship; age 2 is flat at `TRAIL_ALPHA_OLD` (0.12).

## Persistence

- Single `localStorage` key (`explorer-game:save:v1`, see `src/state.js`;
  the key name is fixed, the payload's `version` field is what changes:
  `SAVE_VERSION` 2 since star clusters changed every seed's layout, 3 since
  Earth's fixed Luna changed the home system's main-stream draws, 4 for
  teams; `loadGame` returns null on any other mismatch so an old save is
  ignored and the next save overwrites it), holding the seed, `activePlayerIndex`, `movesRemaining`, `turnNumber`,
  the shared `destroyedAnomalies` set, `pirateBases`/`pirateShips`/
  `nextPirateEntityId` (plain arrays/number, no Set reconstruction needed),
  `trails` (the Vessel Trail Detector's records, a plain array),
  `teamFog: { [color]: ["q,r", ...] }` (each team's fog written once), and
  every player's `{ name, shipName, color, q, r, xp, unlockedUpgrades,
  currentHealth, inCombatThisRound, notifications }` (`teamFog` entries,
  `unlockedUpgrades`, and `destroyedAnomalies` all serialized as plain
  arrays, restored back to real `Set`s on load; `deserializeState` builds
  one Set per colour and hands it to every player of that colour, so
  teammates share it again after a reload).
- **v3 saves are migrated, not dropped.** Version 3 differs only in fog
  layout (a `discovered` array per player) and missing names, so
  `loadGame` accepts it: each player keeps their own fog (the two v3
  colours differ, so they stay separate teams), names default to
  "Player N", and ships to `SHIP_NAMES[i]`. `visionRadius`/`maxHealth`/`attack` are **not**
  persisted — they're fully derived from `xp`/`unlockedUpgrades` (see
  "Leveling & upgrades" above), so retuning thresholds or the upgrade
  catalog later re-evaluates every existing save automatically rather than
  leaving it stuck on a stale stored value. Only the seed is stored for
  the map itself — `tiles`/`systems` are always cheaply and
  deterministically rebuilt via `generateMap({ seed })` rather than
  persisted (which is exactly why destroyed anomalies need their own
  persisted record and a replay step at load — see "Anomalies" above;
  pirates need no such replay step, since they're dynamic records, not a
  tile mutation).
  Single device, single session, one save slot is the stated use case — no
  export/import or multi-device sync needed at this stage; starting/loading
  a new seed always overwrites it. `turnNumber` defaults to `1`,
  `unlockedUpgrades` defaults to an empty set, `destroyedAnomalies`
  defaults to an empty set, `pirateBases`/`pirateShips` default to `[]`,
  `nextPirateEntityId` defaults to `1`, `currentHealth` defaults to
  `HEALTH_BASE`, `inCombatThisRound` defaults to `false`, and
  `notifications` and `trails` default to `[]` (so this needed no `SAVE_VERSION` bump), when
  deserializing a save from before those fields
  existed, rather than surfacing as `undefined`/throwing.
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

Offline dev tooling is exempt as long as nothing it needs ships: the species
portrait pipeline (`scripts/species_art/`) is Python in a gitignored venv,
like `scripts/extract-icons.py`, and the game only consumes its static outputs.

`scripts/species_art/one.py` is a deliberately minimal companion to the staged
pipeline: one paid call per run, no `state.json`, no job hashing, no review
gate beyond `--yes` (it prints the prompt and estimate without it). It reuses
`catalogue`, `config`, `costing` (estimate + `log_spend`), `openai_images`
(client, `scrub()` for key-safe errors) and, for `--cut`, `cutout.cut`. Its
prompt is `prompts.build_portrait()`, kept separate from the pipeline's
`build()` so changing one never changes the other's prompt hashes. Optional
fixes (`strict_anatomy`, `no_pose`, `crop_bottom`, `note`) default off, so the default prompt
for a species only changes when the shared constants do. The only local
post-processing on transparent output is `snap_alpha` (alpha 250-254 to 255)
and `snap_bottom` (move a near-bottom straight cut down to the edge); both
keep the untouched API output as `-raw.png`, and `alpha_summary` reports
side and bottom contact so framing problems show without opening the image.

`one.py` portraits are exported by copying, not through `finalize`/the
manifest: the newest numbered file per species goes to
`species/images/<id03>-<Key>.png` (1024² RGBA) and a 512² WebP (quality 85,
lossless-quality alpha) to `species/images-opt/<id03>-<Key>.webp`. The name is
`Species.slug`, so runtime code derives it from `species.json` alone
(`` `${String(s.id).padStart(3, "0")}-${s.key}` ``) with no manifest lookup.
Humans (332) use their own `human` body plan: `build_portrait()` swaps the
"evolved from a creature like the …" opening for "an ordinary human being"
and asks for human hands; other code treats `human` like `legged` (clothed,
grounded).

## Species Portrait Manifest (`species/species_images.json`)

Written by `scripts/species_art` (`finalize` / `manifest`), not yet read by any
runtime module. Keyed by species id as a string:

```json
{ "version": 1, "canvas": {"w": 1024, "h": 1024}, "generated": "...",
  "species": { "1": { "id": 1, "key": "Ursavi",
    "cutout": "species/images/cutout/001-Ursavi.webp",
    "thumb":  "species/images/thumb/001-Ursavi.webp",
    "anchor": "bottom-center", "pivot": [512, 968], "bbox": [x0, y0, x1, y1],
    "blend": "normal",
    "raw": "...", "method": "B", "style": "A", "model": "gpt-image-2",
    "quality": "medium", "size": "1024x1024", "prompt": "...", "prompt_hash": "...",
    "attempts": 1, "cost_usd": 0.053, "status": "approved", "review_notes": "" } } }
```

Runtime code needs only `cutout`, `thumb`, `anchor`, `pivot`, `bbox` and
`blend`; the rest is provenance. To place a portrait, map `pivot` (canvas px)
to the scene's floor point (grounded species) or centre point (floaters and
swimmers). `bbox` is the subject's tight box on the 1024 canvas, for hit
testing or tighter framing. `blend: "screen"` marks glow layers that look
best drawn with `globalCompositeOperation = "screen"`. `raw` points into the
gitignored `species/work/` and won't exist in a fresh clone.

## Module Layout (as implemented)

```
src/
├── hexgrid.js         axial coordinate math, screen<->tile transforms,
│                      hexLine (move-path interpolation for tap-to-move)
├── mapgen.js          seeded map generator (places systems, bands every tile)
├── noise.js           seeded 2D gradient noise + fbm (cluster edge warp)
├── planet-classes.js  planet/moon class -> sprite catalog (shared by
│                      mapgen.js and assets.js)
├── star-classes.js    star colour -> sprite catalog with spawn weights
│                      (shared by mapgen.js and assets.js)
├── upgrades.js        leveling upgrade catalog (tracks, tiers,
│                      cross-track prerequisites) consumed by state.js
│                      and main.js
├── combat.js          pure melee combat math (terrain bonus table,
│                      wounded-unit penalty, Civ5-style strength-ratio
│                      damage resolution) — no other project imports
├── pirates.js         pirate base/ship spawn, production, roam AI, and
│                      combat orchestration, consumed by main.js
├── render.js          canvas drawing (viewport-bounded tile lookup, icons,
│                      fog-of-war skip, ship markers, pirate markers,
│                      ship trails)
├── assets.js          per-band/icon image loading
├── input.js           tap/long-press/drag-pan/pinch-zoom/wheel-zoom
│                      handling
├── tile-report.js     pure builder for the long-press tile report
│                      (fog rules, stats); main.js renders it
├── trails.js          Vessel Trail Detector: ship move records, the
│                      turn-step clock, age windows and pruning
├── setup.js           start-screen roster model: team colours, ship
│                      names, ICV prefix, add/remove/default-name rules;
│                      main.js renders it as #setup
├── state.js           player/turn GameState model, fog-of-war, XP/
│                      leveling, anomaly landing/effects, ship-loss
│                      (MVP4), win-condition check, localStorage
│                      persistence
└── main.js            wiring/game loop/turn orchestration
```
