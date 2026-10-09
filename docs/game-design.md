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
- Systems gather into **8–12 star clusters** with irregular, natural-looking
  edges, separated by wide empty voids. The home system (Sol) always sits
  in a cluster, so players explore their local cluster first and then
  choose which void to cross. A few lone systems (about 10%) sit out in the
  voids as waypoints. The extra deep space also holds proportionally more
  anomalies.
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

Stars come in five colours, rolled independently for every star (companions
included): red 40%, yellow 30%, orange 15%, white 10%, blue 5%. Real
populations are about three-quarters red dwarfs and almost no blue stars;
the odds keep that order but boost yellow to second, since a Sun-like star
is what players expect to see, and keep blue rare without making it vanish.
Sol is always yellow. Colour is visual only today (no gameplay effect).

## Names

Every system has a unique name. The home system is always **Sol**; any other
system has a 40% chance of a catalogue designation (two capital letters, a
dash and a 1-4 digit number with no leading zero, e.g. `GD-17`, `KX-4821`)
and otherwise gets a name from `data/star_planet_names.json` (its star and
any-use names). Other bodies are named after their system:
- **Companion stars** in a binary/trinary system: system name plus a
  capital letter, clockwise from north around the main star (`GD-17 B`).
- **Planets**: system name plus a Roman numeral, numbered outward by
  distance from the main star (`Sol IV`, `GD-17 III`); planets at the same
  distance are numbered clockwise from north.
- **Moons**: their planet's name plus a lower-case letter, clockwise from
  north around the planet (`Sol V-c`, `GD-17 III-a`).
- **Inhabited planets and moons** also get their own name from the list
  (planet or moon names plus any-use ones), unique across the map. Earth's
  own name is always **Earth**, and its moon's is always **Luna**.

Labels: a system's name shows under its main star from the start (stars are
always visible). An inhabited world shows its own name as a tag, bold white
text in a dark blue rounded box, once discovered. Plain designations of
other planets, moons and companion stars only show when zoomed in close
(zoom 1 or more), to keep the map readable.

## Movement & Exploration

- Each ship has a fixed number of moves per turn (increases with leveling).
- Moving onto a previously-unexplored (fogged) tile reveals it and awards
  experience (see `src/state.js`'s `xpForTile` for the authoritative
  table; `src/upgrades.js`'s Science Lab track can add a further flat
  bonus on top of these base amounts):
  - Deep space (the vast majority of hexes — not explicitly generated, see
    `technical-architecture.md`), star tiles, and asteroid/Kuiper belts:
    **1 XP**.
  - Tile containing an uninhabited planet or moon: **5 XP**.
  - Tile containing an inhabited planet or moon: **10 XP**.
  - Tile containing a natural wonder (e.g. black hole, trinary star
    system): **20 XP**, the highest flat reward.
- Already-revealed tiles can be revisited freely without additional reward.

## Experience & Leveling

- A single XP total per player is a **monotonic lifetime counter** — it
  only ever increases, and drives a `level` number via a cumulative
  threshold table where each level costs more XP than the last:
  `cumulativeXpForLevel(level) = 50 * level * (level - 1)` — level 1 is
  free (0 XP), level 2 needs 100, level 3 needs 300, level 4 needs 600,
  level 5 needs 1000, and so on (first-pass numbers, tunable in
  `src/state.js`). If a future feature lets XP double as a spendable
  currency for something else, it needs its own separate spendable
  balance — this lifetime total must stay append-only forever, since
  `level` must never go backwards. **One sanctioned exception (MVP4):**
  losing a melee fight applies a flat, confirmed XP penalty (see "Pirates &
  Combat" below) — `level` may visibly drop as a result; this is
  intentional, not a bug, and no other code path may decrement XP.
- **Leveling up does not automatically apply a fixed effect.** Each level
  past 1 grants the player one **upgrade pick**, chosen from whichever
  entries in a catalog (`src/upgrades.js`) are currently offerable. Each
  upgrade belongs to a flavor "track" (e.g. Speed, Vision, Science) with
  five tiered entries each, Mk I through Mk V (extended from an original
  Mk I/II-only run specifically to give longer playtest sessions more
  picks to spend before every track maxes out — tiers III-V continue the
  same per-tier bonus as I/II, no new balance decisions); an entry's
  prerequisite can be any
  other upgrade, including one in a *different* track — e.g. "Onboard
  Science Lab Mk I" requires "Extended Vision Mk I" even though Science
  and Vision are different tracks. A player who crosses multiple level
  thresholds in one burst (e.g. a single long move revealing a lot of XP
  at once) owes multiple picks, resolved one at a time.
- MVP2 ships three tracks: **Speed** (+2 moves per turn per tier),
  **Vision** (+1 *passive* vision radius per tier — tiles within the
  ship's current vision radius are revealed automatically whenever it
  moves, without needing to move directly onto each one, stacking with
  reveal-on-visit; every ship already has a small vision radius (1 hex)
  from MVP1 onward, this just increases it), and **Science** (+1 XP per
  tile discovered per tier, gated behind Vision Mk I). MVP4 adds **Health**
  (+25 max health per tier, on a 100-HP base — Civ5 scale), **Attack** (+3
  attack per tier on a 12-attack base, gated behind Health Mk I — armor
  before weapons), and **Repair** (+5 passive healing per round per tier,
  also gated behind Health Mk I), now that pirates/combat exist for them to
  matter against. A ship's `currentHealth` depletes during combat and does
  **not** regenerate automatically every round — only if it wasn't on
  either side of a fight that round (passive healing, see "Pirates &
  Combat" below) or via a full respawn-at-Earth after a loss.
- If a pick is owed but the catalog has nothing left to offer (every
  reachable tier already taken), it's simply left banked/unspendable —
  not forced or discarded — until a later MVP adds more tracks.
- Levels, XP, and chosen upgrades are all per-player, not shared.

## Anomalies

Anomalies are special tiles — rendered as a question mark in a black circle
— seeded onto the map two ways: a small per-system chance (same mechanism
as a natural wonder) and a very sparse scatter directly in deep space, so
flying through otherwise-empty space has an occasional real payoff too
(`src/mapgen.js`'s `ANOMALY_SYSTEM_CHANCE`/`ANOMALY_DEEPSPACE_CHANCE`).

**Unlike every other discovery, an anomaly's effect does not fire on mere
reveal.** Simply seeing it within vision radius pays only the normal flat
discovery XP, same as any blank tile. The effect only triggers when a
ship's move actually **lands on** the tile — and doing so **destroys it,
permanently, for both players**: it reverts to an ordinary tile the instant
either player visits it, so it can never be triggered a second time by
anyone. This is a deliberate choice (confirmed during MVP3 planning) that
makes landing on one a real decision, not an automatic drive-by bonus.

Landing on a live anomaly triggers one random effect from:

- **Wormhole** — teleports the ship to a random map location (never another
  anomaly tile) and reveals around the new position, awarding XP for
  whatever's newly discovered there same as any move.
- **Bulk experience points** — a large flat XP bonus
  (`src/state.js`'s `ANOMALY_BULK_XP`).
- **Local map reveal** — instantly reveals a radius of nearby tiles well
  beyond normal vision range (`ANOMALY_REVEAL_RADIUS`) without needing to
  visit them individually — and awards XP for each newly-revealed tile
  exactly like any other reveal, not just unfogging silently.
- **Free ability** — immediately grants one random currently-available
  upgrade pick (see "Experience & Leveling" above), without needing to
  cross a level threshold for it. If every upgrade the catalog can
  currently offer is already unlocked, the game rerolls among the other
  three effects instead of wasting the anomaly on a no-op.

Anomalies were introduced once the leveling system exists (MVP3), since
"free ability" has no meaning without an unlock table to grant from.

## Pirates & Combat

Pirates are this game's equivalent of Civilization 5's barbarians, and
combat is "spiritually inspired" by Civ5's own melee resolution — a
strength-ratio damage modifier plus random variance — simplified to
melee-only for MVP4 (no ranged units, no fortify bonus).

**Spawn, production, roam (per full round):**
- Each **star system is its own region** for pirate purposes (a tile's
  `regionId` is simply its owning system's id). Once per full round (after
  BOTH players have completed a turn — not per-player-turn, not per-move),
  every region with no pirate base currently present gets an independent
  spawn-chance roll (`PIRATE_BASE_SPAWN_CHANCE`, `src/pirates.js`); the
  shared home system is never eligible.
- Each existing base then rolls to produce one new pirate ship
  (`PIRATE_BASE_PRODUCTION_CHANCE`), up to a support capacity cap
  (`PIRATE_BASE_SUPPORT_CAP`) — no further production once the cap is
  reached, until ship losses free up capacity.
- Every existing pirate ship then roams up to `PIRATE_SHIP_SPEED` (6) hexes
  that round, one at a time, re-evaluating each step. Within detection
  range of the nearer player, it has a chance to path greedily toward
  them — **not a flat chance**: a ship at full health relative to that
  player chases up to `PIRATE_CHASE_CHANCE` (90%) of the time, but the
  more it falls behind in relative HP, the less it presses the attack. If
  it rolls "don't chase" and it's badly outmatched (relative health below
  `PIRATE_FLEE_HEALTH_RATIO`, 50%), it actively flees — steps *away* from
  the player — instead of wandering randomly; a healthier ship that just
  didn't roll a chase takes a plain random step as before. The net effect:
  a healthy pirate presses in aggressively, a wounded one becomes
  increasingly erratic (an occasional lunge mixed with mostly running),
  and a badly wounded one actively disengages. Encountering a player
  partway through a round's steps cuts the remaining steps short — see
  "Melee attacks stop one hex short" below, which applies to pirates
  attacking too.

**Combat is symmetric**: a player can also attack a pirate ship or base by
simply moving their own ship toward its tile (see "Melee attacks stop one
hex short" below) — pirates are a target to hunt, not just a threat to
react to. There is no player-vs-player combat.

**HP/attack scale (Civ5-like): fights take several hits across multiple
turns, not one.** Player ships, pirate raider ships, and pirate bases all
share the same 100 max health pool; a player's attack (12 base) is roughly
2x a standard pirate raider's (6), while a pirate base hits harder (8) to
stay a credible siege target despite having no more health than a raider.
`src/combat.js`'s damage constants (4-8 per hit at parity, ported directly
from Civ5's own 100-HP convention) were already sized for this scale; the
original MVP4 pass used a much smaller HP pool (8-30), which made most
fights resolve in one or two hits — this rebalance is purely stat tuning,
no combat-formula changes.

**Resolution** (`src/combat.js`'s `resolveCombat`): a single mutual
exchange per engagement, not a multi-round loop within one call — repeated
taps/engagements across turns are what make a fight multi-hit. The
attacker hits first; the defender only counters if it survives that hit —
exactly like Civ5's own melee combat. Effective strength is `attack *
woundedMultiplier * (1 + terrainBonus)`; a wounded unit fights
progressively weaker as it loses health (floored at 20% effective
strength), and the defender gets a flat terrain bonus from whichever tile
the fight occurs on:

| Terrain | Defense bonus |
|---|---|
| Empty space / plain tile | +0% |
| Planet / moon | +15% |
| Asteroid belt | +25% |
| Star | +50% |
| Black hole (wonder) | +75% |

**Melee attacks stop one hex short unless they land the killing blow.** An
attacking ship never advances onto the defender's tile mid-fight — it
engages from the hex immediately before the target along its move path,
and only actually moves onto that tile if the attack destroys the
defender. A fight that leaves the defender alive ends with the attacker
adjacent, free to tap the same target again (next turn, or later the same
turn if moves remain) to continue the engagement. This applies
symmetrically: a pirate ship's own roam-step attack on a player works the
same way — no forward progress that round unless it wins. Attacking always
costs a flat 4 moves (`ATTACK_MOVE_COST`), regardless of how far the ship
traveled to engage or whether it ends up advancing — simpler than, and
replacing, an earlier "full tapped distance" rule.

**Destroying a pirate base** grants a one-time XP bounty
(`PIRATE_BASE_BOUNTY_XP`) and frees that region to spawn a new base later.
Ships the base already produced are not retroactively destroyed — they
become ownerless but otherwise fight normally.

**Losing a ship is a soft penalty**: a flat, tunable XP deduction
(`SHIP_LOSS_XP_PENALTY`, floored at 0 — a confirmed, deliberate one-time
exception to XP's otherwise-monotonic lifetime-counter rule, see
"Experience & Leveling" above), full respawn at Earth with health restored
to max, and — only when the loss happened on the player's own
move-and-attack (not from a pirate's own round-tick attack) — forfeiture of
any moves remaining that turn. The game continues; this is never a session
-ending loss, consistent with the "peaceful friendly" tone.

**Passive healing**: a ship that wasn't on either side of a fight during a
full round (not attacked, and didn't attack) regenerates some health at
the start of the next round — eligibility is purely "no combat happened,"
not a proximity/detection-range check, so simply avoiding an engagement for
one round is enough to start recovering. The base heal rate is upgradeable
via the **Repair** track (see "Experience & Leveling" above). Pirates do
not get passive healing — only player ships.

**Not in scope for MVP4**: pirates do not attack planets (planets have no
health/ownership concept in this codebase yet) — only player ships and
pirate bases are ever combat targets. Pirate markers are fog-gated like any
tile feature (only visible once the active player has discovered that
hex).

## Planets & Natural Wonders

Planets are generated in 5 classes, each restricted to one of a system's
`inner`/`medium`/`outer` bands (see `technical-architecture.md`'s Map
Generation section for how bands are carved):

| Zone | Classes | Count per system | Moons |
|---|---|---|---|
| Inner | Molten, Toxic | 0-3 | Never |
| Middle | Rocky | 0-3 | 0-2 each, rocky or molten |
| Outer | Gas Giant, Ice | 1-3 (50/50 per body) | Gas Giant: 0-5, any class except Gas Giant. Ice: 0-2, ice only |

**Moons are real, separately-discoverable tiles** — not a decorative overlay
on their parent planet — each claiming one of the parent's own unclaimed
neighboring hexes, and rendered at half the normal icon size. Earth is the
home system's designated Rocky, inhabited planet, and always has exactly
one moon, **Luna**: a grey Rocky moon, inhabited, with its name tag.

Rocky moons have one extra look planets never use: a plain grey moon (an
ice world's art with all colour removed), about 1 in 7 rocky moons.

**Sizes vary, so no two bodies look stamped out** (visual only, no gameplay
effect): each planet is drawn at 75-100% of its sprite's size, each moon at
80-120% of the normal moon size, and each moon sits off-centre in its hex
by up to half the hex's half-width and half-height, so it never leaves its
own hex. Earth is always drawn at full size.

**Inhabited is a boolean independent of class** — any planet or moon can be
inhabited regardless of which of the 5 classes (and which specific sprite)
it is. For now this only drives its own name and name tag (see "Names")
and (per the XP
table below) a higher reward; a future pass may give it other effects
(e.g. a "other nations" hook per the original Civ5-inspired concept),
but it never changes which sprite is drawn.

| Type | Examples | Notes |
|---|---|---|
| Uninhabited planet/moon | any of the 5 classes | 5 XP on discovery |
| Inhabited planet/moon | any of the 5 classes | 10 XP on discovery |
| Natural wonder | Black hole | 20 XP, the highest flat reward; visually distinct tile (the tileset's swirling "oil"/black-hole-style disc). Trinary star systems are **not** a wonder — see "Stars" above; they're a real multi-tile structural feature of system generation, not a discoverable bonus. |
| Asteroid / Kuiper belt | — | Terrain feature tile (16 hill-silhouette variants from `hills.png`); 1 XP, treated as a normal explorable tile unless/until given a distinct effect |

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
  feature on top: star, planet, moon, natural wonder, asteroid/Kuiper belt,
  anomaly, or pirate base. A planet/moon's class (molten/toxic/rocky/
  gas-giant/ice) and its inhabited flag are independent fields, not a type
  split — see "Planets & Natural Wonders."
- **System** — a cluster of tiles (a star, surrounding rings of possible
  planets/belts, and an interstellar halo) generated as one unit; the
  concept doc's "star system."
- **Fog of war** — per-player tracking of which tiles have been revealed by
  that player's exploration.
- **Region** — equivalent to a system's id; used for pirate base spawn-chance
  rolls.
