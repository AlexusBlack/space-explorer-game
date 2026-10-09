# Species portrait pipeline

Offline dev tooling that produces one consistent RGBA cutout portrait per species
in `species/species.json` (331 species) with OpenAI `gpt-image-2`, then a local
background-removal pass, a common bounding convention and a human review gate
before every paid stage. Nothing here ships with the game; the game only reads
`species/species_images.json` and the WebPs it points at.

Python is used only for this tooling (like `scripts/extract-icons.py`); the
game itself stays vanilla JS with no build step.

## Setup

```sh
python3 -m venv scripts/species_art/.venv
scripts/species_art/.venv/bin/pip install -r scripts/species_art/requirements.txt
alias sart='scripts/species_art/.venv/bin/python -m scripts.species_art'   # run from repo root
sart selftest            # offline: mock API, synthetic images, no key needed
```

For quick single-image tests use `one.py` (next section) rather than the
stages.

The API key goes in `.env` at the repo root (gitignored) as `OPENAI_API_KEY=...`.
It is only read when a paid command runs with `--yes`, is never printed, and is
scrubbed from any error text before it reaches state, logs or stdout.

The first cutout run downloads the matting model (`isnet-general-use`, ~180 MB,
~1 GB RAM). `birefnet-general` is sharper on fur but needs well over 6 GB of free
RAM on CPU at 1024²; switch `[cutout] matting_model` in `config.toml` on a bigger
machine. Re-cutting is free (raws are kept), so the model can be changed later.

## Quick single portraits (`one.py`)

The fastest way to try the look: one command, one API call, one file you open
from the folder. It uses no run state, review page or cutout stage, and leaves
the staged pipeline below untouched.

```sh
alias one='scripts/species_art/.venv/bin/python -m scripts.species_art.one'   # run from repo root
one --id 321                                                    # print prompt + estimate only
one --id 321 --model gpt-image-2.5-flare --transparent --yes    # one paid call
```

Output goes to `species/work/one/<id>-<Key>-<n>.png` (`n` counts up, nothing is
overwritten) with a `.txt` beside it recording model, quality, flags, cost,
usage and the full prompt. Every call is appended to `species/work/spend.log`.

The prompt comes from `prompts.build_portrait()`: a member of a sentient,
tool-using species derived from the catalogue animal, wearing clothing (legged,
bird) or a harness fitted to its own body (others), framed like a video call
(head and upper body, eye contact) with clear space on the left and right so
the portrait can sit on the left of a wider room scene. Only the bottom edge
may cut through the body.

| Flag | Effect |
|---|---|
| `--yes` | actually call the API (paid); without it only the prompt and estimate print |
| `--transparent` | native transparent background; prompt says "isolated subject on a transparent background" instead of the grey backdrop. Needs `--model gpt-image-2.5-flare` (`gpt-image-2` rejects it with a 400, unbilled) |
| `--model M` | override `config.toml`'s model |
| `--quality low\|medium\|high` | default `medium` |
| `--framing bust\|full` | default `bust` (video call); `full` = standing full figure |
| `--strict-anatomy` | swimmers/floaters: frame on the sensory organs, and floaters get "no humanoid torso, all limbs tentacles". Use for floaters on flare, which otherwise drifts humanoid |
| `--no-pose` | drop the catalogue pose; use when a pose like "lying flat with arms spread" pushes limbs off the sides |
| `--crop-bottom` | force a waist-up crop; use when the body ends above the bottom edge (feet, flippers, wing tips below a cut torso), which would look like levitating in the floorless room scene |
| `--note "..."` | appended as `Correction: ...` |
| `--cut FILE` | free, no API: local matting cut (method B) of an opaque result into `-cut.png` |
| `--snap-bottom FILE` | free, no API: apply the bottom snap (below) to an existing transparent result |

Transparent runs also write:
- `-raw.png`: the untouched API output. The kept `.png` has alpha 250-254
  snapped to 255 (flare returns opaque pixels at 252-253).
- The kept `.png` is also **bottom-snapped**: the model often ends a waist crop
  in a straight cut 4-47 px above the bottom edge, so when the body ends in a
  wide straight edge within 64 px of the bottom, the picture is moved down
  until it touches. Feet, flippers and tapering tails are left alone (they
  don't end in a wide straight edge).
- `-check.png`: the portrait over magenta (halos), near-black (glow/haze) and a
  checkerboard, side by side.
- A one-line alpha summary: clear/partial/opaque %, top corners, `** OPAQUE
  RETURNED **` if the flag was ignored, `sides CUT left/right` when more
  than 1% of the outer 2 px columns are opaque, and `bottom N%` (share of the
  bottom 2 rows that is body; good busts are 40-96%) with `** BOTTOM NOT CUT
  **` under 20%. Floaters may legitimately end above the bottom.

What a 3-per-group sample (39 images, flare, transparent, medium) showed: no
opaque returns, one side crop (fixed with `--no-pose`), and a few species whose
description says "glowing" or "translucent" came back with a soft white haze
baked into the alpha (visible on the near-black panel). Accepted as is for
now; fix per image if it matters. A further 59 (100 species in total) showed the same picture plus bottom-edge
problems: 12 bodies ended above the bottom edge. Five were straight cuts a
few px short (now fixed for free by the bottom snap); the rest were
regenerated with `--crop-bottom` (one also needed `--no-pose`, one a `--note`
about folding its wings). Wide-winged species (moths) are the most likely to
touch the sides. Known but accepted: the swimmer prompt's "small device"
tends to come out as a smartphone, and clothed species mostly share one
olive tunic-and-strap outfit. Flare's real per-image price is unconfirmed
(the tool costs it at the `gpt-image-2` rate, about $0.014); check billing.
A third batch of 100 (200 species in total) matched: 7 bodies ended above
the bottom edge (2 of them floaters) and 3 touched the sides. Three were
regenerated with `--crop-bottom` (a coil, feet, and a cut too narrow for the
bottom snap) and three with `--no-pose` (one plus a `--note` folding manta
wings like a cloak). The rest, including a scorpion and a seahorse whose
tails end above the edge and some glow haze, were accepted as is.
Smartphone-like devices are fine: they fit the setting.
A fourth batch of 100 (300 species in total): 10 bodies ended above the
bottom edge (3 of them floaters, left as is) and one dragonfly's wings touched
both sides (fixed with `--no-pose` and a `--note` folding them back). The
seven `--crop-bottom` regenerations all reached the bottom, but three wide
bodies (sprawled arms, a centipede's segments, a batfish's fins) then touched
the sides: a waist-up crop enlarges the subject. Adding `--no-pose` and a
`--note` keeping the arms or body tucked in with clear space on both sides
fixed all three. Glow haze up to about 13% was accepted again.

## Stages

Every paid command prints its plan and estimate and does nothing without `--yes`.
`--dry-run` is the same but explicit. Budget: per-stage caps plus a total cap in
`config.toml`; a run that would exceed either halts cleanly (exit 3).

| Stage | Commands | Gate |
|---|---|---|
| 0 setup | `sart dry-run` · `sart review` → view "Dry-run prompts" | prompts approved, key added |
| 1 pilot | `sart pilot --yes` · `sart cutout --stage pilot` · `sart review` | style, quality, model locked in `[locked]` |
| 2 transparency | `sart transparency --yes` · `sart cutout --stage transparency` · `sart review` | default method + per-species `method` overrides |
| 3 bulk 1 | `sart bulk select --name bulk1` · `sart bulk submit --set bulk1 --yes` · `sart bulk collect --set bulk1` (repeat) · `sart cutout --set bulk1` · `sart review` · `sart apply-review` · `sart reroll --yes` · `sart report --stage bulk1` | approve / reroll / reject |
| 4 rest | `sart bulk select --name rest` · `sart bulk submit --set rest --chunk N --yes` (N = 1..6) · as above | final review |
| finish | `sart apply-review` · `sart finalize` (also rebuilds the manifest) | |

`sart status` shows job/species/spend state and checks there are no duplicate
paid jobs. `sart contact-sheet --stage pilot` writes a PNG grid into
`species/work/` if you'd rather not open the browser.

## Resuming and idempotency

All run state lives in `species/work/state.json` (atomic writes). A job's id is
derived from a hash of everything that affects its output
(model|size|quality|style|background|prompt), so re-running any stage re-plans
the same jobs and skips the ones already done: **re-running never re-bills.**
The raw image is written to disk before the job is marked done. Batch jobs are
polled and collected, never re-sent; items that fail inside a batch go back to
`pending` and can be retried with `sart run-pending --stage bulk1 --yes`.

## Common tasks

- **Reroll one species with a correction:** `sart reroll --id 42 --note "six legs, not eight" --yes`.
  Notes typed on the review page are used automatically by `sart reroll --yes`
  (which rerolls every species marked *reroll* by `apply-review`). Attempts are
  capped by `max_attempts`.
- **Re-cut with another method (free):** `sart recut --id 42 --method C2`.
- **Change the style:** edit `STYLES` in `prompts.py`. Every prompt's hash
  changes, so nothing already generated is invalidated, but a stage re-run would
  generate the new variants. Only do this between stages.
- **Fix one species' description:** edit its entry in `species/visual_overrides.json`
  (`visual`, `traits`, `body_plan`, `pose`, `method`), then reroll it.

## Methods (background → cutout)

| Method | Generated on | Cutout |
|---|---|---|
| A | native transparency (preview) | snap 252-254 alpha to 255, decontaminate edge colour; flags `opaque_returned` |
| B | flat grey #808080 | matting mask + analytic un-mix against the measured backdrop |
| C1 | black | as B |
| C2 | black | union of matting mask and luminance alpha; manifest `blend: "screen"` for glow |
| D | chroma green | matting mask minus pure-backdrop holes, un-mix + despill |

## Files

```
species/visual_overrides.json   committed: hand-curated visual text / body plan / method per species
species/species_images.json     committed: game-facing manifest (see docs/technical-architecture.md)
species/images/cutout|thumb/    committed: 1024² lossless WebP, 256² WebP thumbnails
species/work/                   gitignored: state, review verdicts, spend log, prompts, raws, variants, batches
```

`species/work/` doesn't travel with a clone. Without it, the finals and the
manifest are still there, but rerolls and re-cuts need the raws.
