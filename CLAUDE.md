# CLAUDE.md

Project-specific context for continuing development on Space Explorer with
Claude Code. This file exists specifically so development can resume
seamlessly on a **different machine** after a plain `git clone`/`git pull`
— the accumulated session memory on the original machine (lessons learned,
decisions made) does not travel with the repo, so it's captured here
instead. Read this before starting work; it's denser than the `docs/*.md`
files (which describe the game/architecture) because it's aimed at an
agent picking the project back up cold.

## What this is

A peaceful, 2-player hot-seat space exploration game — Canvas2D, vanilla
JS ES modules, **zero build step**, static-file deployable (GitHub Pages
or anywhere). See `README.md` for the doc map; the two densest references
are `docs/game-design.md` (player-facing mechanics) and
`docs/technical-architecture.md` (data model, module layout, exact
implementation detail — read this before touching `src/state.js` or
`src/mapgen.js`, it documents non-obvious invariants).

## Current status (as of this writing)

**MVP0 through MVP4 are implemented and committed.** `README.md`'s top
status line still says "MVP0 ... is implemented" — that's stale and
hasn't been fixed yet; trust `git log` and `docs/mvp-roadmap.md` over it.

- MVP0: seeded hex map generator + Canvas2D renderer.
- MVP1: two-player hot-seat loop, per-player fog-of-war, moves/turns.
- MVP2: real XP table + **choice-driven** leveling (upgrade picks from a
  prerequisite tree — see "Key lessons" below, this was NOT the obvious
  first reading of the design doc).
- MVP3: anomaly tiles (landing-only trigger, shared/global one-shot
  destruction, 4 random effects: wormhole/bulk-XP/local-reveal/free-pick).
- MVP4: pirates & melee combat (`src/combat.js`, `src/pirates.js`) —
  implemented, then rebalanced **three more times in the same session**
  based on direct playtesting feedback. Current state: ~100 HP/attack
  scale (Civ5-like, multi-hit fights), attacks stop one hex short unless
  they land the kill, passive healing (Repair upgrade track), pirate ship
  roam speed 6 hexes/round, chase chance scales with relative health
  (flees when badly outmatched). See `docs/open-questions.md`'s Resolved
  section for the full decision history — it's a running log, each
  follow-up tuning pass is a *new* entry rather than a rewrite of the
  previous one, so read it chronologically if you need the "why" behind a
  specific constant.
- Upgrade tracks (Speed/Vision/Science/Health/Attack/Repair) run **Mk I
  through Mk V** (5 tiers each, 30 upgrades total) — extended from
  Mk I/II specifically so long playtests don't exhaust the catalog.

**Known open items / deferred work:**
- Cache-busting for `src/*.js`/`index.html` was discussed and explicitly
  deferred ("let's skip that for now"). The real fix isn't just a `?v=`
  on the entry `<script>` tag — relative ES module imports drop the
  query string on resolution, so every local `import` specifier would
  need its own version suffix. If asked again: propose a small one-off
  script (same spirit as `scripts/extract-icons.py`) that rewrites the
  `?v=` suffix across all `src/*.js` imports + the `index.html` script
  tag, run manually before a release.
- `images/units.png` / `images/pirate-base.png` license/provenance is
  still unconfirmed (tracked in `docs/open-questions.md`'s Unresolved
  section) — don't ship a build that bundles them without resolving this.
- Pirates deliberately never attack planets (MVP4 scope-narrowing —
  planets have no health/ownership model anywhere in this codebase).
- `README.md`'s status line needs bumping to reflect MVP4.

## Development conventions (established over this project's history)

**No build step, ever.** `./serve.sh` runs a plain Python static server
for manual testing. Don't introduce a bundler/transpiler/package.json
runtime dependency without the user explicitly asking — it's a stated
architectural choice (`docs/technical-architecture.md`'s Dependency
Policy), not an oversight.

**Headless verification is the primary test method — this repo ships no
test framework or package.json.** The established pattern, reused
every MVP: copy `src/*.js` into a scratch directory (your harness's
scratchpad dir), add a one-line `package.json` containing `{"type":
"module"}` so plain Node will load ES modules, write a `test.mjs` with
`node:assert/strict` assertions covering the new logic (injectable `rng`
params make this practical — most non-map-gen randomness defaults to
`Math.random` but accepts an override), and run it with plain `node
test.mjs`. Re-run after every subsequent tuning change in the same
session rather than re-deriving a fresh harness each time. Syntax-check
individual files with `node --check <file>` the same way (same
scratchpad-with-package.json trick — a bare `node --check` on a `src/`
file fails with an ESM error since the repo itself has no package.json).

**Avoid `claude-in-chrome` browser automation; use it only as a true last
resort.** The user explicitly asked for this. Prefer: headless Node
verification for game logic (above), Python/Pillow for image/sprite work
(composite and inspect PNGs directly, or render a contact sheet), static
checks (e.g. grep every DOM id a script references against what's
actually in `index.html`) for markup/wiring changes. Only reach for the
browser when something is genuinely impossible to verify any other way.

**Only commit when explicitly asked**, even after a clearly-finished
change — this has been the pattern every single time in this project's
history (implement → verify → report → wait for "commit this"). When
committing: stage specific files by name, never `git add -A`/`-u` broadly.
**`images/starfield-base-hex.xcf` is the user's own in-progress GIMP
asset** — it shows as modified in `git status` very often (they edit it
directly, outside any Claude session) and must never be staged unless the
user explicitly asks to include it. Every commit in this repo's history
deliberately excludes it. Commit messages: a short imperative summary
line, then a body explaining *why* (motivation/context, not a restatement
of the diff), ending with the attribution line from the system's own
instructions (currently `Co-Authored-By: Claude Sonnet 5
<noreply@anthropic.com>` — check the live system reminder for the current
exact line rather than trusting this file, which can go stale).

**Docs structure — update the relevant one(s) whenever behavior changes,
in the same commit as the code:**
- `docs/game-design.md` — player-facing mechanics/rules, written for
  someone who wants to understand *what the game does*.
- `docs/technical-architecture.md` — data model, module layout,
  implementation-level detail and *why* a given approach was chosen;
  written for whoever next touches the code.
- `docs/open-questions.md` — a **running log**, not a living spec: when a
  later decision supersedes an earlier logged one, add a new entry
  referencing/superseding the old one rather than rewriting history. Has
  an Unresolved section (decisions not yet made) and a Resolved section
  (decisions made, with the reasoning — this is the single best place to
  find "why is this constant what it is").
- `docs/graphics-and-assets.md` — art sourcing/licensing/extraction
  details (`scripts/extract-icons.py`'s `MANIFEST` is the source of truth
  for which sprite comes from which tilesheet cell).
- `docs/mvp-roadmap.md` — the staged MVP plan; update its scope notes if
  an MVP's actual implementation narrows or extends what was originally
  scoped (e.g. MVP4 deliberately dropped "pirates attack planets").

**Plan-mode workflow for nontrivial features**: explore relevant files
directly (or via Explore subagents for genuinely unfamiliar territory) →
design the approach → **use AskUserQuestion to resolve genuinely ambiguous
design decisions before writing the final plan**, not after → write the
plan to the plan file → `ExitPlanMode` for approval → implement →
headless-verify → update docs → report back and wait for an explicit
commit request. For a small, well-scoped tuning/tweak request (change a
constant, adjust one function), skip the full plan-mode ceremony and just
implement directly with a brief confirmation of what changed.

## Key lessons from this project's history (read before assuming a design)

1. **Don't assume the simplest/automatic mechanism when a design doc
   describes a system loosely.** `docs/game-design.md` once described
   leveling as "unlocks: 1. more moves, 2. more vision, ..." which reads
   like automatic fixed stat boosts — the user corrected this to a
   **player-choice** upgrade-tree system with cross-track prerequisite
   chains during MVP2 planning. When a doc names a system's *content* but
   is silent on *mechanism* (automatic vs. player-chosen, per-player vs.
   shared/global), surface that explicitly as a plan-time question or
   called-out assumption — don't silently pick the simpler reading.
2. **This project has repeatedly corrected an initial
   "reveal-based"/"automatic"/"per-player" assumption toward a more
   deliberate mechanic** (MVP2 leveling → choice-driven; MVP3 anomalies →
   landing-only trigger + globally-shared one-shot destruction, not
   per-player). Treat that as the prior for any *new* shared-world
   mechanic too — ask rather than assume.
3. **When tuning a numeric constant (density, chance, damage, etc.),
   prefer the simplest lever the user's own phrasing points at over a
   more "robust" structural fix**, even if the structural fix seems more
   correct on paper. Concretely: during MVP3, a density complaint was
   first "fixed" with a deterministic guarantee-placement pass; the user
   explicitly rejected it ("Remove that guaranteed code, instead just
   increase chance of anomaly 4 times") in favor of a plain probability
   multiplier. Default to the simple knob first, especially mid-prototype.
4. **`player.xp` is a monotonic lifetime counter — it must never
   decrease** (this drives `level`, which must never go backward), with
   **exactly one sanctioned, explicitly-documented exception**: the MVP4
   ship-loss penalty (`state.js`'s `applyShipLoss`, flagged in the code
   comments as a deliberate, user-confirmed one-off). Don't add a second
   exception without equally explicit confirmation and equally visible
   in-code documentation of why.
5. **Civ5 is the recurring design reference for pirates/combat** — melee
   resolution (strength-ratio damage modifier, wounded-unit penalty),
   terrain defense bonuses, and the ~100 HP/attack scale were all
   deliberately modeled on Civ5's own conventions, adapted (not
   literally ported) where the literal numbers didn't make sense at a
   different scale. If extending combat further, Civ5 is the right
   mental model to reach for first.

## Architecture quick-reference

(Full detail in `docs/technical-architecture.md` — this is just enough to
orient.)

```
src/
├── hexgrid.js      axial coords, screen<->tile transforms, move-path interpolation
├── mapgen.js       seeded map generator (deterministic from `seed` alone)
├── noise.js        seeded 2D gradient noise + fbm (star cluster edge warp)
├── planet-classes.js  planet/moon class -> sprite catalog
├── star-classes.js    star colour -> sprite catalog with spawn weights
├── upgrades.js     leveling upgrade catalog (tracks, tiers, cross-track prereqs)
├── combat.js       pure melee math (Civ5-adapted), no other project imports
├── pirates.js      pirate base/ship spawn, production, roam AI, combat orchestration
├── render.js       canvas drawing
├── assets.js       image loading
├── input.js        tap/pan/zoom handling
├── state.js        player/turn GameState model, XP/leveling, persistence
└── main.js         wiring/game loop/turn orchestration
```

**Species portraits** (`species/`, `scripts/species_art/`): an offline Python
pipeline (gitignored venv; not a game dependency) that generates one RGBA
portrait per species with OpenAI `gpt-image-2`. Its outputs are game data,
though: `main.js` fetches `species/species.json` (mapgen gives each inhabited
world a species) and the world card shows `species/images-opt/*.webp`. Read
`scripts/species_art/README.md` first. Hard rules from the user: the API key
lives only in the gitignored `.env` and is never printed or committed; **every
paid step stops at a human review gate**, so never run a paid command (`--yes`)
without explicit approval for that stage. `species/work/` (raws, run state,
review verdicts, spend log) is gitignored and machine-local. Verify changes
with `python -m scripts.species_art selftest` (offline, mock API). For single-image
prompt tests use `python -m scripts.species_art.one` (see the README's "Quick
single portraits"); current settings are `--model gpt-image-2.5-flare
--transparent`, plus `--strict-anatomy` for floaters.

`mapData` (from `mapgen.js`) is **never persisted** — always cheaply and
deterministically regenerated from `seed`. `gameState` (from `state.js`)
**is** persisted to `localStorage` (single save slot). Anything that
mutates a shared map tile at runtime (so far, only MVP3 anomaly
destruction) must record that mutation separately in persisted
`gameState` and replay it onto the freshly-regenerated map at load —
see `applyDestroyedAnomalies`. Pirate bases/ships (MVP4) are dynamic
`gameState` records layered on top of tiles, not tile mutations, so they
need no such replay step. Fog-of-war lives as two independent per-player
`Set`s, deliberately kept off the shared tile objects.
