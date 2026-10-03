# MVP Roadmap

Guiding principle: every MVP stage below is **fully functional and playable
on its own** — nothing ships half-wired. Each stage builds strictly on the
previous one's data model, so earlier stages shouldn't need rework as later
systems are added (e.g. the two-player/fog-of-war model from MVP1 is designed
to carry forward unchanged through MVP4, rather than being retrofitted).

## MVP0 — Seeded Map Generator & Renderer

*Technical spike, no players, no turns.*

**In scope**
- A procedural true-hex map generator (ported from `freecivx`'s space map
  generator — see `docs/technical-architecture.md`): largest-first spaced
  placement of distinct star systems, each carved as concentric rings with a
  wobbled boundary and sparse planet/wonder/asteroid-belt features, set in
  mostly-empty deep space. Prototyping at ~100-150 systems (not yet the
  concept doc's full 1,000+ — see Parking Lot). Every tile is tagged with a
  band (inner/medium/outer/interstellar/deep-space) at generation time.
- True flat-top hex canvas renderer using real hand-painted band art (one
  image per band, loaded once at startup), with feature icons (star/planet/
  wonder/belt) layered on top — only the hexes within the current viewport
  are looked up per frame, not the whole map.
- Pan/zoom camera controls.

**Out of scope:** ships, movement, turns, UI chrome, persistence.

**Definition of done:** given the same seed, the generator produces an
identical map every time (verified), systems read as visually distinct with
real empty space between them (verified against a first implementation that
instead rolled tile types independently per-hex and looked like noise — the
whole reason for this rewrite), and it renders as a scrollable, zoomable
starfield on canvas.

## MVP1 — Two-Player Hot-Seat Explore Loop

**In scope**
- Two independent ships, both starting at Earth, sharing the MVP0-generated
  map.
- Per-player fog-of-war/revealed-tile state, position, and XP total.
- Tap-to-move within a fixed per-turn move budget.
- "End Turn" button; triggers a full-screen pass-and-play interstitial before
  the next player's turn begins.
- Exploring a previously-hidden tile awards flat XP (differentiated later in
  MVP2 by tile type; MVP1 can treat all non-wonder/planet tiles uniformly, or
  pull forward the basic per-type amounts from `game-design.md` if trivial —
  implementer's call).
- Game state (map seed + both players' position/fog/XP) persists via
  `localStorage` across page reloads.

**Deferred:** leveling/unlocks, planet/wonder-specific bonus XP (if not
pulled forward), anomalies, pirates, combat, health.

**Definition of done:** two people can hand one device back and forth, each
explore the shared map independently without seeing the other's fog-of-war,
watch their own XP counter increase, and resume an in-progress session after
closing and reopening the page. The win condition (every star system
discovered, combined across both players — see `game-design.md`'s Session
End) is implemented and checked after each move; with ~100-150 systems this
is now realistic to actually verify end-to-end in a playtest, not just at a
toy scale.

## MVP2 — Points of Interest & Leveling

**In scope**
- Planets (inhabited vs. uninhabited, different XP values), natural wonders
  (black hole, trinary system), and asteroid/Kuiper belt terrain-feature
  tiles seeded onto the map by the MVP0 generator; planets/wonders worth more
  XP than a blank tile.
- XP-threshold leveling table; first two unlocks: more moves per turn, a
  passive vision radius (auto-reveals nearby tiles each turn without needing
  to move onto them).

**Deferred:** anomalies, pirates/combat/health.

**Definition of done:** discovering a planet or wonder grants visibly larger
XP than a blank tile, and crossing a level threshold visibly changes that
player's ship capability (without affecting the other player).

## MVP3 — Anomalies

**In scope**
- Anomaly tiles seeded onto the map; on discovery, trigger one of: wormhole
  (random teleport), bulk XP, local-map reveal, or free ability grant.

**Definition of done:** all four anomaly effects trigger correctly at least
once per player during a playtest session.

## MVP4 — Pirates & Combat

**In scope**
- Per-region (fixed-radius hex cluster, precomputed by the MVP0 generator)
  pirate base spawn chance (when no base is present in that region).
- Pirate base ship production up to a support capacity cap.
- Pirate ship roaming AI and attacks on player ships/planets.
- Ship health stat, attack/flee combat resolution.
- Soft-penalty ship loss: respawn at Earth with partial XP/progress loss,
  game continues.

**Definition of done:** a pirate base spawns, produces a raider, the raider
can damage/destroy a player ship, and the affected player resumes play from
Earth without the session ending.

## Parking Lot (not committed to any stage)

- Additional natural wonder / anomaly types.
- Per-region difficulty/density tuning pass.
- Save slots / export-import of game state (beyond single-session
  `localStorage`).
- Sound/music.
- PWA manifest for "install to home screen" on iPad.
- Accessibility pass (color-blind-safe tile distinctions, text scaling).
- Original (non-GPL) art pass, if the reused FreeCiv/Wesnoth tileset ever
  needs replacing.
- ~~True hex-shaped tile art~~ — **done**: 5 hand-painted band tiles plus a
  true flat-top hex renderer, replacing the diamond placeholder.
- Address the accepted star-speckle repetition in the band tiles (see
  `graphics-and-assets.md`) if it becomes a real complaint during
  playtesting — e.g. a few randomized variants per band.
- Scale the map generator from ~100-150 systems to the concept doc's full
  1,000+. Two things need revisiting together, not just placement: (1)
  replace the O(n²) placement scan with a spatial grid/bucket index for
  neighbor queries (flagged as necessary at that scale by the freecivx
  research this generator is based on), and (2) stop fully materializing
  every deep-space tile (fine at ~25k tiles, not at the 500k-2M+ a
  1,000+-system map implies) — likely back to an implicit/sparse model or
  chunked generation around each ship.
