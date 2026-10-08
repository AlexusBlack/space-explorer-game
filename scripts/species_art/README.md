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

The API key goes in `.env` at the repo root (gitignored) as `OPENAI_API_KEY=...`.
It is only read when a paid command runs with `--yes`, is never printed, and is
scrubbed from any error text before it reaches state, logs or stdout.

The first cutout run downloads the matting model (`isnet-general-use`, ~180 MB,
~1 GB RAM). `birefnet-general` is sharper on fur but needs well over 6 GB of free
RAM on CPU at 1024²; switch `[cutout] matting_model` in `config.toml` on a bigger
machine. Re-cutting is free (raws are kept), so the model can be changed later.

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
