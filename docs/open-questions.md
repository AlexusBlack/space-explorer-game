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

## Resolved

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
- **`terrain2.png`'s greyish clouds are asteroid/Kuiper belt tiles** (FreeCiv:
  Space's actual intended use), not unusable filler — they're now a real MVP2
  terrain-feature tile. See `graphics-and-assets.md` and `game-design.md`'s
  Planets & Natural Wonders catalog.
