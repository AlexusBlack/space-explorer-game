# Species portrait pipeline

Offline dev tooling that produces one consistent RGBA cutout portrait per species
in `species/species.json` (334 species) with OpenAI `gpt-image-2`, then a local
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
may cut through the body. Humans have their own `human` body plan, which swaps
the "evolved from a creature like the …" opening for "an ordinary human being"
and asks for human hands.

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
The last 31 completed the catalogue (all 331 species). Three bodies ended
above the bottom edge; a walrus took plain `--crop-bottom`, and two
wide-legged arthropods were given `--crop-bottom --no-pose` plus the same
"tucked in, clear space on both sides" note up front, which fixed both on the
first try with no side cuts. For wide or many-legged bodies, use that
combination straight away rather than `--crop-bottom` alone.
Humans, dogs and cats were then added to the catalogue as 332-334 and came
out clean on the first try with default settings.

Export: `one --export` (free) copies the newest numbered file per species to
`species/images/<id03>-<Key>.png`, converts it to a 512² WebP (Pillow,
Lanczos, quality 85, `alpha_quality=100`, `method=6`) in
`species/images-opt/<id03>-<Key>.webp`, and copies its sidecar (model, flags,
the full prompt including any `--note`) to `species/recipes/<id03>-<Key>.txt`.
`method=6` is slow (about 4 s per image, 20 minutes for all) but gives the
smallest files. The output is byte-identical for an unchanged final, so a
re-export only shows real changes in git. To regenerate a portrait from git
alone, rerun `one --id N --yes` with the flags in its recipe; the prompt is
deterministic from the catalogue, so the recipe's prompt is what you get.

## Planet backgrounds (`bg.py`)

Same one-image-at-a-time loop as `one.py`, for the landscape behind a world's
card: one 1024² opaque image per planet sprite and variant (`planet`,
`giant-moon` = moon of a gas giant, `planet-moon` = moon of a rocky or ice
planet). `backgrounds.py` holds the catalogue (palette and terrain words per
sprite, written from the tile sprites, plus 4 hex colours pulled from each
sprite's lit side) and the variant table, which mirrors mapgen's moon rules:
42 pairs. Images are pure landscapes, no window frame: a separate room layer
will frame them later, so the prompt keeps the settlement and sky bodies
central and the picture even out to every edge.

```sh
alias bg='scripts/species_art/.venv/bin/python -m scripts.species_art.bg'   # run from repo root
bg --list                                          # all 42 pairs + image counts
bg --sprite planet-fruit --variant planet          # prompt + estimate only
bg --sprite planet-fruit --variant planet --yes    # one paid call
bg --gallery                                       # free: rebuild the gallery pages
bg --export                                        # free: finals -> backgrounds/images(-opt)
```

Output: `species/work/bg/<sprite>-<variant>-<n>.png` with a `.txt` (model,
quality, note, base, cost, prompt); every call goes into `spend.log`. Default
model `gpt-image-2.5-flare`, medium; `--note "..."` appends a correction.
Each call also rebuilds `species/work/bg/index.html`, a newest-first gallery
of every attempt, and `current.html`, the newest image of each pair as a
grid, and prints LAN URLs, so results can be checked on another device through
`./serve.sh` (e.g. `http://<lan-ip>:8080/species/work/bg/`).

**Gas giants are two-step.** Asked for directly, the model drew the planet's
own rings as a closed arc hanging in the sky, like another planet's. So:
`bg --saturn-base --yes` makes a plain view from Saturn's cloud tops (modelled
on NASA's Cassini Grand Finale art: a huge near-straight striped band rising
steeply out of the horizon), and every gas giant sprite is then an image
**edit** of one chosen base (`GAS_BASE` in `bg.py`, currently
`saturn-base-4.png`; `--base FILE` overrides) that keeps the camera and ring
band and only recolours and adds the floating city. All six share one ring
layout. An edit costs about $0.022 (the base is billed as input). The chosen
base is committed as `backgrounds/saturn-base.png`, so gas giants can be
regenerated on any machine.

What the first tests showed: the text-only prompt gets the palette and an
alien feel right first time; a moon's parent planet needs "unmistakably not
Earth" or it comes out as Earth, and sky bodies need "wholly inside the
frame" or they get cropped. Flare costs about $0.0145 per text-only image
(the tool's estimate, $0.054, uses the `gpt-image-2` rate).

A moon's parent planet: with one generic parent per kind, a big planet made
every moon sky look alike. It is now about a sixth of the image wide, covered
in swirling white cloud and storm spirals, and seen through this world's
atmosphere (washed in the sky's hue, low contrast, partly translucent, with
this world's cloud wisps across it). The airless moon (`AIRLESS`, moon-grey)
has no veil; its parent is instead desaturated toward the scene's greys. The
gas giant in giant-moon skies is the same crisp generic giant everywhere.

Export: `bg --export` copies the newest image of every pair (it refuses if
any pair has none) to `backgrounds/images/<sprite>-<variant>.png` and writes
a 512² WebP (Pillow, Lanczos, quality 85, `method=6`) to
`backgrounds/images-opt/<sprite>-<variant>.webp`, the copy the game should
load, and its sidecar to `backgrounds/recipes/<sprite>-<variant>.txt`. To swap in an older attempt, delete or renumber the newer ones in the
work folder and export again.

## Rooms (`room.py`)

The middle layer of the world card scene: the landscape (`bg.py`) at the
back, a room over it with its window cut out, and the species portrait
(`one.py`) in front on the left. Rooms are 1536×1024 with **native
transparency** (`gpt-image-2.5-flare`, `background="transparent"`): the
window panes are clear and the rest is opaque, so the game can stack the
three layers with plain CSS or canvas and nothing is keyed.

`rooms.py` holds the catalogue and prompts. Two families, 78 rooms, both led
by the world: 30 **base rooms**, world class (`backgrounds.VARIANTS`) ×
government (`src/government.js` order), and 48 **ethic rooms**, world class ×
extreme ethic pole (`ETHIC_ROOM`, the eight poles of `src/ethics.js`), where
the ethic replaces the government. Earth and Luna have no rooms of their own for
now; they use their class and government's base room. Every prompt shares `LAYOUT`: a single flat wall
seen head-on like a video call background (no floor, ceiling, side walls or
room depth); one large tall window (about two thirds of the height, a quarter
of the width, centred three quarters across, a little above the middle);
a deep recess, sturdy frame, sill, curtains and shutters so it reads as a
window and not a painting; one undivided pane, clear with no glass tint,
nothing in front; an uncluttered left half for the portrait. Rooms are
reused across worlds and species, so `NEGATIVE` bans furniture, potted or
Earth plants and anything human-made or Earthly, plus flags, banners,
emblems, maps, globes and planet pictures, as well as text.

The first Earth room (a since-dropped Earth-only prompt, square window, flare, $0.012) came back with a clean
single hole and an opaque room, but the pane was frosted (alpha about
85-120), so the landscape looked washed out. The window was also smaller and
further left than asked, and with its slim frame it read like a painting.
It also had a blue flag and a globe on the wall screen. All four led to the
current prompt.

The second (`rocky-democracy-1`, $0.012) fixed the frame and the pane
(92% fully clear, no haze), but the window was small (half the height, an
eighth of the width, centred at 64%) because the model drew a whole room
with floor, side wall, armchairs and potted plants, which also read as
human and Earthly. So the prompt now asks for one flat wall only, with
wall-mounted details and no furniture or Earth plants.

That third attempt (`rocky-democracy-2`) was accepted as the reference look:
a window about two thirds of the height, curtains, sill and blind, no
furniture. Four more with the same prompt (ice × Monarchy, molten ×
Dictatorship, gas giant × Oligarchy, toxic × Anarchy, $0.0125 each) all
passed the window check first time (one clean hole, no haze), with windows
about 18% wide and centred at 70-72%, a little nearer the asked 75%.

But apart from molten × Dictatorship they looked generic: the government
decor won over the world. The user's rule: **the world comes first**, since it
decides the building materials and aesthetic; government and ethics only add
objects and mood on top. So each prompt now opens with the world
(`CLASS_ARCH`: materials, shapes, light, e.g. basalt, obsidian and heat vents
for molten, ice blocks and furs for ice, airship-hull ribs and membranes for
gas giants), then the government's room and its objects (`GOV_ROOM`, e.g.
jewellery, crowns and treasures for a monarchy), "all made from this world's
own materials". The window shape varies per world (`WINDOW_SHAPE`: an oval
porthole on gas giants, arched tops on rocky and ice worlds, rounded
pressure ports on moons and toxic worlds, bevelled on molten), staying tall
and about the same size. Ethic rooms swap the government's room for the
pole's (`ETHIC_ROOM`): a war hall with weapons and trophies for militarists,
a laboratory of machines and devices for materialists, a temple hall with
shrines and relics for spiritualists, an embassy salon of alien gifts for
xenophiles, and so on.

Rerolling the same four with this prompt ($0.0128 each, all clean single
holes) made each read as its world: ice blocks, furs and frost with crowns in
niches; basalt, obsidian and glowing vents; an oval porthole in an airship
hull with treasures in lit niches; a stained, patched habitat wall with
gauges and vents. Ethic rooms are world + extreme ethic, with no
government in them.

All 13 ice rooms (12 new at $0.0127 each, plus `ice-monarchy-2`) passed the
window check first time. Every one reads clearly as ice (ice-block wall,
furs, warm lamps, arched window), but they are too alike: the government or
ethic shows only in a narrow strip of props right of the window, since the
left half is kept plain for the portrait. Militarist (weapons, shield,
skull), spiritualist (shrine niches), pacifist (instruments, water),
materialist (devices) and democracy (chart panel) are recognisable;
anarchy, oligarchy, authoritarian, individualist and xenophobe barely differ.

So the government and ethic descriptions (`GOV_ROOM`, `ETHIC_ROOM`) now
shape the whole wall (structure, finish, palette: a patchwork of repairs for
anarchy, gold-inlaid rare materials for oligarchy, a strict panel grid for
authoritarians, bars and armoured plates for xenophobes), the prompt says
they shape the whole wall, "not just a few objects", and only the middle of
the left half is kept plain: decoration may run along the top, down the far
left edge and around the window. The first reroll, ice × Dictatorship
($0.013), came back with massive symmetrical pilasters across the whole
wall, a geometric relief, wall cameras and a colder grey palette, clearly
apart from the other ice rooms.
Rerolls of ice × Anarchy, Oligarchy and Xenophobe ($0.013 each) worked too: a
patchwork of mismatched metal and fabric panels; gold-inlaid bands with ice
sculptures in lit niches; riveted iron bands and plates across the wall.
Authoritarian and Individualist rerolls ($0.013 each) gave a strict grid of
identical plaques and lit panels, and a wall crowded with shelves of odd
keepsakes, so the whole ice set of 13 now differs room by room.
The rocky set of 13 (about $0.013 each, about $0.17 in all) also passed the window check
first time, every window arched and centred at about 60–75% across. The world shows
throughout: carved stone, flowing polished alien wood and iridescent shell inlay.
Anarchy (patchwork), oligarchy (gold niches), monarchy (crowns, drapes),
militarist (weapons, trophies), authoritarian (panel grid), individualist
(shelves of keepsakes), xenophobe (iron bars and plates) and materialist
(devices) are the strongest. Dictatorship stays warm, despite the "cold, colourless
light", because the world's warm palette wins. Democracy, pacifist and xenophile are the
plainest.
The first gas giant room (Monarchy, $0.013) worked first time. Its window is a clean tall
rounded-oval porthole (11% of the image, no warnings). The airship-hull wall has curved
pale ribs, a membrane and wind vanes, with navy drapes, gold ornament and crowns and
treasures in niches.
The other 12 gas giant rooms ($0.013 each) all passed the window check first time, every
one a tall rounded porthole, so the per-class `WINDOW_SHAPE` works. The pale airship hull
carries every room. Dictatorship here does come out cold and grey (the world's pale
palette doesn't fight it, unlike rocky). Militarist, xenophobe (riveted iron bands),
authoritarian (panel grid), anarchy (patchwork), materialist, individualist and xenophile
are the most distinct. Democracy (a chart panel) and oligarchy (gold niches) are the
plainest.
The first moon room (Monarchy, $0.013) passed the window check first time. Its pressure
port is a rounded rectangle under a riveted shutter housing. The wall is riveted grey
habitat panelling with pipes, a gauge and a valve, plus red velvet drapes, gold trim and
crowns and jewellery in lit niches. Its window is a little shorter than the others
(about 52% of the height, against 60–70% elsewhere), but still well placed.
The other 12 moon rooms ($0.013 each) all passed the window check first time, every one
a rounded pressure port under a shutter housing, at 50–60% of the image height. Grey
riveted panels, pipes, gauges and valves carry every room. Anarchy (colourful patch
plates), materialist (blue schematic screens and cabling), militarist (weapons, armour,
horned trophies), spiritualist (a carved mandala, candle niches), xenophile (lit shelves
of alien curiosities), authoritarian (panel grid), dictatorship (cameras, heavy
pilasters) and oligarchy (black-gold marble, gold-lit niches) are the most distinct.
Democracy (a chart panel), pacifist (a water channel, chimes, stacked stones) and
xenophobe (iron bars over a plain wall) are the plainest. The militarist room's weapons
read as rifles, so a bit more Earth-like than the other worlds' spears.
All 13 molten rooms ($0.013 each; the dictatorship is new as `-3`, after two
older-prompt attempts) passed the window check first time. Every window is a tall
bevelled-corner rectangle. This is the most uniform set: dark basalt, obsidian with
glowing lava veins and ember-orange light strips everywhere, so the world reads very
strongly and the government or ethic less so. Militarist (axes, spears, armour),
pacifist (a pale flowing inlay, a lute, chimes, a cascade), materialist (machines, pipes,
glowing panels), monarchy (crowns in lit niches, red drapes), individualist (shelves of
trinkets), xenophile (bright crystals and eggs in niches), spiritualist (shrine niches,
a glowing sacred line), anarchy (a patchwork of tiles) and authoritarian (a panel grid)
are the most distinct. Democracy breaks the palette with a pale tiled panel and a chart
screen. Xenophobe (a heavy frame grid) is the weakest, close to authoritarian.
Xenophile's drapes cut into the opening, giving a pinched window outline; it is still
one clear region with no warning.
The xenophobe reroll (`-2`, $0.013) used a `--note` asking for heavy bronze bars,
riveted armour plates, half-drawn blast shutters, locks, chains and crude obsidian
warding blades, and "clearly different from a plain grid of panels". It now reads as a
fortress. Its window is narrower (7% of the image) but clean and well placed.
All 13 toxic rooms ($0.013 each; anarchy is `-3`, after two older-prompt attempts)
passed the window check first time. Every window is a rounded airlock-style port with a
shutter housing. Pale composite panels streaked with yellow-green residue, vent grilles
and gauges carry every room. Militarist (blades, armour, horned trophies), xenophile
(alien curiosities), individualist (shelves and hooks of keepsakes), materialist
(machines, tanks, green screens), anarchy (a patchwork of colourful plates),
oligarchy (gold veining, lit gold niches), monarchy (jewels in gold niches, green
drapes), spiritualist (shrine niches with candles, an etched pattern) and pacifist (a
lute, a gong, a green cascade) are the most distinct. Authoritarian (a panel grid) is
fine. Democracy (a chart panel), dictatorship (plain pilasters, a camera) and
xenophobe (a few iron bands, as on molten before its reroll) are the plainest.

```sh
alias room='scripts/species_art/.venv/bin/python -m scripts.species_art.room'   # run from repo root
room --list                                              # 30 base + 48 ethic pairs + image counts
room --class ice --ethic militarist                      # ethic room prompt (free)
room --class rocky --gov democracy                       # prompt + estimate only
room --class rocky --gov democracy --yes                 # one paid call
room --check FILE                                        # free: alpha checks
room --composite FILE --species 332 --landscape planet-inhabited-planet   # free
room --gallery                                           # free
room --export                                            # free: finals -> rooms/
```

Output: `species/work/room/<class>-<gov>-<n>.png` with a `.txt`
sidecar; every call goes into `spend.log`. After a paid call the tool
automatically:
- snaps alpha 240-254 to 255, since flare returns the room's opaque pixels
  at 248-249 (the untouched output stays as `-raw.png`);
- runs the window check. It treats clear regions within 3% of the width
  of each other as one window, in case bars appear anyway. It prints the
  window's box and share, and warns on `OPAQUE RETURNED`, a window in the
  left half or touching an edge, `EXTRA HOLES` (over 0.5% clear outside the
  window) and `HAZE` (over 2% semi-transparent room). It also writes
  `-check.png` (over magenta, black, checkerboard);
- writes `-comp.png`. The landscape master is scaled to 1.1× the
  window's larger side and centred on it, the room goes over it, and the
  portrait master sits at full height from x = 0 (`--species-x` to nudge);
- rebuilds `index.html`, a newest-first gallery showing composite, room
  and check for each attempt, with LAN URLs for `./serve.sh`.

Export: `room --export` (free) copies the newest image of every room (it
refuses if any of the 78 has none) to `rooms/images/<class>-<gov or ethic>.png`
(RGBA master, 1536×1024), writes a 768×512 WebP (Pillow, Lanczos, quality 85,
`alpha_quality=100` so the window edge stays exact, `method=6`) to
`rooms/images-opt/<class>-<gov or ethic>.webp`, the copy the game should load,
and copies its sidecar to `rooms/recipes/`. The WebP is half size on purpose:
the portrait spans the room's full height, so a 512² portrait from
`species/images-opt/` sits on it at the same scale. Names follow the
catalogue, so the game needs no manifest. To swap in an older attempt,
delete or renumber the newer ones in the work folder and export again.

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
species/images/cutout|thumb/    committed: 1024² lossless WebP, 256² WebP thumbnails (staged pipeline)
species/images/<id03>-<Key>.png committed: one.py finals, 1024² RGBA PNG masters
species/images-opt/             committed: the same at 512², WebP: what the game should load
species/recipes/                committed: each one.py final's sidecar (model, flags, full prompt)
backgrounds/images(-opt)/       committed: bg.py finals, PNG masters + 512² WebPs
backgrounds/recipes/            committed: each background's sidecar, plus saturn-base.txt
backgrounds/saturn-base.png     committed: the Saturn base every gas giant is edited from
species/work/room/              gitignored: room.py attempts, checks, composites, gallery
rooms/images(-opt)/             committed: room.py finals, RGBA PNG masters + 768×512 WebPs
rooms/recipes/                  committed: each room's sidecar
species/work/                   gitignored: state, review verdicts, spend log, prompts, raws, variants, batches
```

`species/work/` doesn't travel with a clone. Without it, the finals and the
manifest are still there, but rerolls and re-cuts need the raws.
