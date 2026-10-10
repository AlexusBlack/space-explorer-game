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
  rocky or molten); outer-system bodies are gas giants (0-5 moons, any class
  except gas giant — a gas giant orbiting a gas giant doesn't make sense) or
  ice planets (0-2 ice-only moons), 50/50 per body. `inhabited` is now a
  fully independent boolean on any planet or moon, not a separate type —
  drives only a text label today, via one flat tunable `INHABITED_CHANCE`
  constant (5%, after an initial 20% was found too high and quartered).
  Moons are real, separately-discoverable hex
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
- **MVP1 (two-player hot-seat explore loop) implemented.** New `src/state.js`
  owns the player/turn model: two `PlayerState`s (`color, q, r, xp,
  visionRadius, discovered: Set<"q,r">`), a shared `activePlayerIndex`/
  `movesRemaining`/`won`. Fog-of-war is kept entirely off the shared
  `mapData.tiles` singletons (two independent per-player `Set`s instead) so
  one player's discoveries can never leak into the other's render pass.
  Tap-to-move is **distance-based**: a tap on any hex within
  `hexDistance <= movesRemaining` moves the ship there in one action along
  the straight hex line (`hexgrid.js`'s new `hexLine`), consuming that many
  moves. Reveal is **vision-radius-based, not single-tile**: every ship has
  a `visionRadius` (MVP1 default 1) and reveals the full disk around every
  hex it occupies or passes through, not just the tapped destination — this
  is deliberately the same mechanism `game-design.md`'s "passive vision
  radius" leveling unlock will later just increase the radius of, not a
  separate system. One rendering exception: **star tiles are always
  visible** regardless of fog, as a wayfinding aid toward the
  every-system-discovered win condition — seeing a star this way doesn't
  mark it discovered, so it grants no XP and doesn't count toward winning;
  only actually moving there (and thus adding it to that player's
  `discovered` set) does. XP is a flat, MVP1-placeholder
  `BASE_XP`/`FEATURE_XP` split (blank tiles vs. any planet/moon/
  wonder-blackhole) — explicitly not the real inhabited/class-aware table,
  which is MVP2 scope. Added `index.html` DOM for a bottom per-player HUD,
  a win banner, and a full-screen pass-and-play interstitial (opaque, blocks
  all canvas pointer events while visible, so one player's revealed map
  never shows during handoff). `localStorage` (`explorer-game:save:v1`)
  persists the seed plus both players' state after every move and every
  End Turn, not just at turn boundaries; only the seed is stored for the
  map itself, since `generateMap({seed})` is cheap and deterministic. See
  `technical-architecture.md`'s Data Model and Persistence sections and
  `game-design.md`'s Experience & Leveling section.
- **Real ship sprite wired in, replacing the colored-circle ship marker;
  player distinction moved to a corner badge.** `images/icons/ship.png` is
  now cropped from `units.png` row 2, column 3 (a rounded tan/beige craft
  with twin cylindrical nacelles) and used for both players' map markers —
  no per-player recolor/second sprite, superseding the earlier
  `graphics-and-assets.md` note suggesting one. `units.png` turned out to
  use solid chroma-key green dividers/background rather than the
  bordered-table color `terrain1.png`/`hills.png` use, so
  `scripts/extract-icons.py`'s grid auto-detection and crop pipeline were
  extended (a chroma-key fallback for `detect_grid`, and a
  `remove_chroma_key` step gated by a per-entry `chroma_key` MANIFEST flag)
  rather than hardcoding this one sheet's layout — verified to reproduce
  every pre-existing icon byte-for-byte before trusting the new path. Since
  both ships now look identical on the map, the player-color distinction
  moved entirely to a new fixed-position `#player-badge` in the screen's
  top-right corner, colored per the active player and doubling as a
  compact turn indicator. See `graphics-and-assets.md`'s `units.png`
  section and `technical-architecture.md`'s Rendering Loop section.
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
- **Ship distinction improved further: per-tile owner dot, active-ship
  selection pulse, and a turn counter.** The corner `#player-badge` alone
  only answered "whose turn is it," not "which of the two identical-sprite
  ships on screen belongs to which player," so `render.js` now also draws
  a small color-coded dot at the upper-right corner of each ship's own hex
  (`drawOwnerDot`, both ships, always — ship position isn't privileged
  info). Separately, `images/select-alpha.png` (an untracked 384×48px
  white "marching ants" dashed-oval strip, 4 frames of 96×48 each, found
  sitting in `images/`, unrelated to the never-cropped `terrain1.png`
  "cyan selection diamond" this doc and `graphics-and-assets.md` previously
  flagged for the same purpose — that older plan is now superseded) is
  drawn as-is (`drawSelectionPulse`, no per-player recolor — the asset's
  own white reads fine as a neutral highlight under any ship) and animated
  under the currently active player's ship only, reinforcing which ship is
  presently under command. This is the one source of a periodic (not
  purely dirty-flag) redraw in `main.js`'s render loop — a 4-frame,
  ~150ms-per-frame cycle, suppressed while the pass-and-play interstitial
  is visible. Also added a `turnNumber`
  field to `gameState` (starts at 1, persisted, defaults to 1 on an
  old-shape save), incremented in `main.js`'s `endTurn()` only when the
  active-player index wraps back to 0 — i.e. it counts full P1+P2 rounds,
  not individual End Turn presses — and surfaced as "Turn N" in the top
  HUD. See `technical-architecture.md`'s Ship markers, Rendering Loop, and
  Persistence sections, and `graphics-and-assets.md`'s asset notes.
- **MVP2 (points of interest & leveling) implemented.** `src/state.js`'s
  flat MVP1 placeholder XP (`BASE_XP=1`/`FEATURE_XP=2`, no inhabited/class
  distinction) is replaced by a real table: 1 XP for a blank tile (band/
  star/asteroid-belt, unchanged), 5 for an uninhabited planet/moon, 10 for
  an inhabited one, 20 for a natural wonder. `levelForXp`/
  `cumulativeXpForLevel` derive a level from a player's lifetime XP via
  `50 * level * (level-1)` (level 2 at 100 XP, level 3 at 300, each level
  costing progressively more). Leveling is **player-choice-driven, not
  automatic fixed stat boosts** — an initial draft of the implementation
  plan assumed the latter from `game-design.md`'s loosely-worded "unlocks,
  in rough order" list, corrected by the project owner during planning:
  each level past 1 grants one upgrade *pick* from a new catalog module,
  `src/upgrades.js` (`UPGRADES`/`availableUpgrades`), where an entry's
  `requires` can name any other entry — including one in a *different*
  track, not just an earlier tier of its own (e.g. "Onboard Science Lab
  Mk I" requires "Extended Vision Mk I") — so "track" is purely a display
  grouping, not an isolation boundary. MVP2 ships three tracks: Speed
  (+2 moves/turn/tier), Vision (+1 passive vision radius/tier), Science
  (+1 XP per tile discovered/tier, cross-track-gated behind Vision Mk I).
  `level`, `visionRadius`, moves-per-turn, and the XP bonus are all
  derived from `xp` + the player's `unlockedUpgrades` set on every call,
  never stored directly — only `xp` (a monotonic lifetime counter, kept
  separate in principle from any future XP-as-currency spend mechanic,
  which would need its own balance field so `level` can never regress)
  and the actually-*chosen* `unlockedUpgrades` are persisted; the old
  per-player `visionRadius` save field is dropped entirely (derived now).
  A new blocking `#upgrade-picker` overlay in `main.js`/`index.html`
  (same full-screen/pointer-capturing pattern as the existing pass-and-
  play `#interstitial`) presents whichever upgrades are currently
  offerable the moment a pick is owed, resolving multiple pending picks
  one at a time; if a pick is owed but nothing's offerable (every
  reachable tier already taken), it's left banked rather than forced,
  since a later MVP adding more tracks gives it something to spend on.
  See `technical-architecture.md`'s Data Model ("Leveling & upgrades"),
  Persistence, and Module Layout sections, and `game-design.md`'s
  Movement & Exploration / Experience & Leveling sections.

- **MVP3 (anomalies) implemented.** Anomaly tiles (question-mark-in-circle
  icon, synthesized via `scripts/generate-anomaly-icon.py` rather than
  cropped from a tilesheet) are seeded both per-system
  (`ANOMALY_SYSTEM_CHANCE`, same mechanism as `wonder-blackhole`) and as a
  very sparse deep-space scatter (`ANOMALY_DEEPSPACE_CHANCE`), via
  `src/mapgen.js`. **Deliberate trigger-rule decision, confirmed with the
  project owner during planning**: unlike every other discovery, an
  anomaly's effect does *not* fire on mere reveal/vision — only when a
  player's move actually *lands on* the tile, via `src/state.js`'s
  `checkAnomalyLanding`. Landing **destroys the tile globally, for both
  players** (mutates it to a plain band tile; tracked in a new
  gameState-level — not per-player — `destroyedAnomalies` Set, replayed
  onto a freshly-regenerated `mapData` at load via
  `applyDestroyedAnomalies`, since `mapData` itself is never persisted).
  `triggerAnomaly` then resolves one of four effects uniformly at random
  (wormhole teleport, bulk XP, local map reveal, free upgrade pick),
  rerolling away from free-upgrade if the catalog has nothing left to
  offer. The local-reveal effect awards XP for its newly-revealed tiles
  exactly like any other reveal, not just a silent unfog. See
  `technical-architecture.md`'s new "Anomalies" subsection and
  `game-design.md`'s Anomalies section.

- **MVP4 (pirates & combat) implemented.** Four design decisions were
  confirmed with the project owner via AskUserQuestion before planning:
  (1) **pirates act once per full round** (hooked into `main.js`'s
  `endTurn`, exactly where `activePlayerIndex` wraps back to 0), not
  per-player-turn or per-move; (2) **combat is symmetric and pirate bases
  are destructible** — a player can land on a pirate ship or base to
  attack it (reusing MVP3's landing-trigger pattern), destroying a base
  pays a one-time XP bounty and frees its region to spawn a new one later;
  there is no player-vs-player combat; (3) **terrain defense bonus
  magnitude is Civ5-style**: `band` +0%, `planet`/`moon` +15%,
  `asteroid-belt` +25%, `star` +50%, `wonder-blackhole` +75%, applied to
  the defender only, keyed by the single shared tile the fight occurs on;
  (4) **ship loss is a flat XP penalty** (floored at 0) plus a full
  respawn-at-Earth with health restored to max — a confirmed, deliberate,
  one-time exception to the "`xp` never decreases" rule stated elsewhere.
  **Deliberate scope-narrowing, not asked**: pirates never attack planets
  (the roadmap's own Definition of Done only requires damaging/destroying
  a player *ship*, and planets have no health/ownership concept anywhere
  in this codebase) — only player ships and pirate bases are ever combat
  targets. Combat resolution (`src/combat.js`'s `resolveCombat`) adapts
  Civ5's own melee formula (strength-ratio damage modifier, wounded-unit
  penalty) into a single mutual exchange, not a multi-round loop. See
  `technical-architecture.md`'s new "Pirates & Combat" subsection and
  `game-design.md`'s "Pirates & Combat" section. The `units.png`/
  `pirate-base.png` licensing question above remains unresolved — this
  work did not address it.

- **MVP4 combat rebalance implemented** (supersedes some phrasing in the
  MVP4 entry above — fights are no longer resolved by simply "landing on"
  a pirate's tile; see below). Playtesting found the original MVP4 HP pool
  (8-30) made nearly every fight resolve in one or two hits. Four
  decisions confirmed with the user via AskUserQuestion: (1) **HP/attack
  rescaled to ~100 (Civ5 scale)**: both player ships and pirate raiders get
  100 max health; player attack (12) is ~2x a standard raider's (6);
  pirate bases (150 HP / 8 attack) are deliberately tougher, encouraging a
  multi-turn siege rather than a drive-by kill. `combat.js`'s damage
  constants were already ported from Civ5's own 100-HP convention, so no
  formula changes were needed — this was pure stat tuning. (2) **Passive
  healing eligibility is "no combat happened this round"** (not a
  proximity/detection check) — a new `PlayerState.inCombatThisRound` flag,
  set by either side of a resolved fight and reset once per round by
  `state.js`'s `tickPassiveHealing` (called from `main.js`'s `endTurn`
  alongside `tickPirates`). (3) **Passive healing is upgradeable via a new
  "Repair" track** (two tiers, `+5`/round each, gated behind Health Mk I,
  mirroring how Attack is gated behind Health) rather than folded into the
  existing Health track. (4) **A melee attack always costs the player's
  full tapped move distance**, whether or not the ship ends up advancing —
  chosen specifically to block a free-repeat-attack exploit (re-engaging
  an already-adjacent, still-alive target would otherwise cost 0 moves).
  **Structural change, not just tuning**: an attacking ship (player or
  pirate) now never moves onto the defender's tile unless the attack
  destroys it — `src/pirates.js`'s `findPirateAt(gameState, q, r)`
  replaced `checkPirateLanding`, letting `main.js` check the player's
  *tapped target* before committing any movement, splitting the move so it
  only completes the final hex on a kill; `stepPirateShip` applies the
  same rule in the reverse direction. See `technical-architecture.md`'s
  "Pirates & Combat" subsection and `game-design.md`'s "Pirates & Combat"
  section (both rewritten) for the full current mechanics.

- **Immediate follow-up tuning, same session**: two quick adjustments to
  the rebalance above, direct from the user. Pirate base health dropped
  150→100 (`PIRATE_BASE_MAX_HEALTH`), matching player ships/raiders
  exactly — a base's only remaining toughness edge is its higher attack
  (8 vs. a raider's 6). The "full tapped move distance" attack-cost rule
  was replaced with a flat `ATTACK_MOVE_COST = 4` (`src/pirates.js`,
  consumed in `main.js`'s `handleTap`, clamped at 0) — attacking now
  always costs exactly 4 moves regardless of tapped distance or whether
  the ship ends up advancing, simpler than the distance-based rule it
  replaces (which incidentally also happened to block the free-repeat-
  attack exploit that rule was originally chosen to avoid, since 4 is a
  fixed nonzero cost either way).

- **Upgrade tracks extended from Mk I/II to Mk I-V (5 tiers each)**, direct
  user request "to allow longer playtesting" — with only 12 total
  upgrades (6 tracks × 2 tiers), a long session quickly exhausted the
  catalog, leaving pending picks permanently banked/unspendable. Tiers
  III-V continue the exact same per-tier bonus as I/II (e.g. Health stays
  +25/tier, now five times instead of twice) — pure catalog extension, no
  new balance numbers invented. 30 total upgrades now exist across
  speed/vision/science/health/attack/repair.

- **Gas giants get six colour variants instead of one sprite.** Direct user
  request: every gas giant used the same purple `planet-whales` sprite. Five
  recolours of it were added (Jupiter brown, Saturn yellow, Uranus cyan,
  Neptune blue, a fictional green), generated locally by
  `scripts/extract-icons.py` rather than new art. Chosen with the user: keep
  the original purple as one of the six (and keep its name, so nothing is
  renamed), all six equally likely, rings left as they are on every variant.
  `pickClassAndSprite` already made one rng draw even for a one-sprite
  class, so map layouts are unchanged for every seed (checked on 200 seeds);
  only which colour a gas giant gets changes, including in existing saves,
  since the map is regenerated from the seed on load.

- **Stars get five colours with realistic-but-skewed odds.** Direct user
  request: every star used the one yellow sprite; they wanted red, white and
  blue too, with yellow and red dominating because that's what players
  expect, and otherwise closer to the real distribution. Real counts are
  roughly red (M) 76%, orange (K) 12%, yellow (G) 8%, white (F/A) 4%, blue
  (O/B) 0.1%. Chosen with the user: include orange, weights red 40 / yellow
  30 / orange 15 / white 10 / blue 5 (~157 stars per map, so ~8 blue), Sol
  always yellow, companions rolled independently, every colour drawn at the
  same size, and `star.png` kept as the yellow star so nothing is renamed.
  The colours come from a separate seeded stream so map layouts stay
  identical for every seed (checked on 200 seeds) and existing saves keep
  working; they just show coloured stars.

- **Planets and moons get random sizes, moons a random position in their
  hex.** Direct user request, to make systems look less uniform: planets
  75-100% of their sprite's size, moons 80-120% of the normal (50%) moon
  size, and moons shifted by up to ±50% horizontally and vertically.
  Chosen with the user: the shift is measured against half the hex (up to
  ±16 px across, ±14 px down at zoom 1), so even the largest moon only
  reaches its own hex edge and never spills into a neighbour; Earth stays
  at full size, the way Sol stays yellow (its moons still vary). Rolled
  from a separate seeded stream like star colours, so layouts are unchanged
  for every seed (checked on 200 seeds) and existing saves keep working.

- **Systems, planets and moons get names; inhabited worlds get name tags.**
  Direct user request: unique system names, 40% catalogue designations
  (`GD-17`: two capitals, dash, 1-4 digits, no leading zero) and the rest
  from the user's `data/star_planet_names.json`; planets numbered with Roman
  numerals by distance from the star (`Sol IV`), moons lettered (`Sol V-c`);
  inhabited planets get their own names, shown as bold white text in a dark
  blue rounded box. Chosen with the user: plain designations only show when
  zoomed in (zoom >= 1) to avoid clutter; system names show on every star
  from the start, since stars are always visible; inhabited moons get own
  names too; companion stars get capital-letter suffixes (`GD-17 B`), shown
  only when zoomed in. Implementation choices: the digit count is rolled
  first so short and long numbers are equally common; planets at equal
  distance and moons around a planet are ordered clockwise from north;
  every system and own name is unique per map ("Sol" and "Earth"
  reserved). Names use a separate seeded stream in a final pass, so layouts
  are unchanged for every seed (checked on 200 seeds) and existing saves
  just gain names.

- **Labels sit directly under their body, not under the hex.** User report:
  every label was drawn at a fixed spot below the hex, which looked
  misplaced once planets varied in size and moons were smaller and shifted
  within their hex (a moon's name could sit well below or beside it). Each
  label now hangs a small gap under its drawn icon (centre, including a
  moon's offset, plus half the scaled sprite height), for stars, planets
  and moons alike. Close neighbours can still overlap at high zoom; accepted
  as is.

- **Label text stops growing past a readable size.** User report: labels
  kept scaling up with zoom (up to 36 px at the maximum zoom of 3). Text now
  grows with zoom only up to 14 px for plain labels and 16 px for name tags
  (reached around zoom 1.2), then stays at that size; the small gap under
  the body scales with the text instead of with zoom.

- **Player ships stop growing at native size.** User request, following
  the label size cap: the ship sprite and its selection oval scaled with
  zoom without limit, getting blurry and as big as a planet. They now
  scale only up to their native pixel size (zoom 1) and stay that size
  when zoomed in further. Pirate ships, bases and the owner dot are
  unchanged.
- **Stars form clusters with empty voids between them.** User request:
  systems were spread fairly evenly over the map, which was boring; clusters
  with big empty areas in between should steer players to explore their local
  cluster first, with noise used to make the shapes look natural. Decisions
  taken at plan time:
  - **Bigger map, same systems.** The radius grows from 90 to 150 (about
    68k hexes, up from 25k; first 125, then raised to 150 to keep about
    110 systems once the gap below was tripled). `SYSTEM_COUNT` stays 120,
    and about 112 are placed.
  - **8–12 medium clusters.** Each cluster gets a radius of about 22–30
    hexes and usually holds 1–19 systems (median 10). The home cluster is
    always centred on Sol and holds at least 9.
  - **A few lone systems.** About 10% (`LONE_SYSTEM_SHARE`) are dropped only
    where the cluster density is near zero (`LONE_MAX_DENSITY`), so they sit
    out in the voids.
  - **Discard old saves.** Every seed's layout changes, so `SAVE_VERSION` goes
    from 1 to 2 and `loadGame` ignores v1 saves.

  The implementation is a hybrid, not pure thresholded noise, because noise
  alone can't guarantee a cluster count or a home cluster:
  - cluster centres are dart-thrown at least `CLUSTER_GAP` (30) hexes apart,
    edge to edge (first 10, then tripled at the user's request for wider
    voids);
  - each cluster's density falloff is measured on a position warped by
    seeded fbm gradient noise (`src/noise.js`; `CLUSTER_WARP` 9 hexes,
    `CLUSTER_WARP_SCALE` 30), which turns circles into irregular blobs;
  - a cluster that won't fit shrinks and retries, which keeps the count from
    dropping further.

  Deep space rises from about 21% to 70% of the map. The per-hex anomaly
  chance is unchanged, so anomalies rise from about 120 to 260 per map, with
  the extra ones out in the voids. Generation takes about 90 ms per map.

- **Earth has one grey moon, Luna; rocky moons gain a moon-only grey look.**
  Moons had no art of their own, and Earth rolled 0-2 random rocky or molten
  moons with designations like "Sol III-a". The user asked for a grey rocky
  moon made from an ice planet icon with zero saturation, used only by moons,
  and for Earth to always have a single moon labelled Luna. Decisions:
  - **Source icon: `planet-shield`** (the pale icy one), desaturated into
    `moon-grey` by a new `desaturate` option in `scripts/extract-icons.py`.
  - **Moon-only, not a new class.** It is a Rocky sprite listed in
    `MOON_ONLY_SPRITES`, which only `placeMoons` draws from. Any rocky moon
    can be grey, 1 in 7 (one extra sprite next to the six rocky ones); this
    is the knob if grey moons feel too common or too rare.
  - **Luna is inhabited** (10 XP) and shows its name tag like Earth. First
    planned as uninhabited but tagged; the user changed it before
    implementation. "Luna" is reserved so no other world can take it.
  - **Discard old saves again.** Luna's fixed placement changes the home
    system's draws from the main stream, which shifts every later system, so
    `SAVE_VERSION` goes from 2 to 3.

- **Pirate ships get the same native-size cap.** User request, following
  the player ship cap above: pirate ships now also scale with zoom only up
  to native size (`SHIP_MAX_ZOOM`). Their health bar uses the same capped
  zoom so it doesn't drift away from the sprite. Pirate bases are still
  unchanged.

- **Inhabited worlds get a species, shown on a tappable world card.** User
  request: each inhabited planet/moon gets a species from
  `species/species.json` and one of its names (the species key counts as
  one); Earth and Luna are always 332-Humani under the name "Human" (the
  user added "Human" to Humani's variants for this); tapping an inhabited
  world's name tag opens a small window with the world's name, species name,
  species portrait (`species/images-opt/`) and world type. Decisions at plan
  time:
  - **Match the world type.** Only species whose `planetoids` include the
    world's class can live there (ice maps to the catalogue's "frozen",
    gas giant to "gas_giant"). Every class has at least 62 candidates.
  - **Repeats allowed.** Each world picks independently; about 50 distinct
    species appear across about 55 inhabited worlds per map.
  - **A small card over the dimmed map**, not a full-screen overlay; any tap
    closes it.
  - **The species description is shown too.**

  Species use their own random stream, so maps and saves are unchanged. A
  tag tap opens the card instead of moving and spends no moves.

- **Anomaly bulk XP raised from 50 to 250.** User request: 50 XP stopped
  mattering a few levels in, so the "salvaged data cache" anomaly effect
  (`ANOMALY_BULK_XP` in `src/state.js`) now gives 250 XP, keeping it
  relevant longer. The other three effects are unchanged.

- **Per-player notification area replaces the turn-start pirate attack
  overlays.** User request: pirate attacks from the end-of-round tick used
  to queue as blocking overlays shown after the interstitial, so Player 1
  saw every attack (including Player 2's) and Player 2 saw none. Each player
  now has their own column of round icons on the right edge:
  - pirate ship: you were attacked;
  - species portrait: you found an inhabited world;
  - "?": you found an anomaly.

  Tapping an icon centers on the object and shows its text for about 7 s,
  swiping removes it, and ending your turn clears your list. Decisions at
  plan time:
  - **The player's own attacks keep their immediate overlay.** Only the
    round-tick pirate attacks move to notifications.
  - **"Discovered" anomaly means first revealed in your fog.** The
    landing-result overlay stays, and a notification for an anomaly that
    either player has used up is removed automatically.
  - **Notifications are saved per player.** Old saves load with an empty
    list, so there's no `SAVE_VERSION` bump.

- **Species descriptions describe living species.** User request: the world
  card showed Earth-history wording for some species, for example Jaekelo
  (shown as "Jaekeith"), described as "Extinct giant aquatic arthropods". A
  species living on a world the player just found can't be extinct, so the
  `description` field (display-only; the portrait prompts don't use it) is
  written in-universe: species are alive now, with no extinct, fossil,
  ancient, prehistoric or "scientists" framing. Eleven entries were reworded
  in `species/species.json` and its `species.csv` mirror: Sphenod, Latimer,
  Meganeur, Limulus, Jaekelo, Triopsa, Wallise, Opabina, Hallucig, Dactylo
  and Euperip.

- **Species notifications open the world card.** User request: tapping an
  inhabited-world notification now centers on the world and opens its world
  card (the same one a name-tag tap opens) instead of the short caption,
  which only repeated what the card shows.

- **Tile report on long-press.** User request: a window with a hex's
  coordinates, what it is, and the entities on it with their stats. Long-press
  (about 500 ms, cancelled by more than 10 px of movement or a second finger)
  was chosen over other gestures because:
  - it is the iPadOS convention for "details without acting";
  - tap already moves the ship.

  Decisions at plan time:
  - **A fogged hex shows only its coordinates, "Unexplored" and the
    distance.** Nothing leaks, and pirates on it aren't listed.
  - **Both players' ships show full stats**, the rival's as well as your
    own.
  - **An inhabited world shows a compact species line** plus a "View world"
    button that opens the existing world card. The portrait isn't
    duplicated.
  - **Extra facts:** star system and zone, combat defense bonus, discovery
    XP, and distance from your ship, including whether it's reachable this
    turn.
