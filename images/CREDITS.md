# Art Credits

The tileset reference sheets in this folder (`terrain1.png`, `terrain2.png`) are
reproduced from the **FreeCiv "Amplio v2.0"** space tileset and the
**Battle for Wesnoth** forest tileset. Both are licensed under the
**GNU General Public License v2 (GPL v2)**.

`terrain1.png`'s own embedded credit panel reads (transcribed verbatim):

> **Amplio v2.0**
>
> Tiles from: Isotrident, Amplio, Freeland, and by Yautja
>
> Specials from: Isotrident, Amplio, Battle for Wesnoth, Wikipedia,
> opengameart.org, FreeCol
>
> New Specials by: Vegard Stolpnessæter
>
> See README for detailed credits
>
> Space Tiles: Star Tiles, Crystal, Space Station by AlexusBlack. Main Star,
> Planets by Viktor. Space Organics by Wenrexa.
>
> License: GPL v2

`terrain2.png`'s credit panel reads:

> **Amplio v2.0**
>
> Forest and tropical forest from Battle for Wesnoth
>
> License: GPL v2

## `units.png`

A grid of ship/unit sprites used for the player ship and initial pirate ship
(see [`../docs/graphics-and-assets.md`](../docs/graphics-and-assets.md) for
exact grid positions). Unlike `terrain1.png`/`terrain2.png`, this sheet
carries no embedded credit panel, so its source/license has not yet been
confirmed. If it was exported from the same FreeCiv Amplio/space tileset
release, it is almost certainly GPL v2 like the other two files — but this
should be confirmed explicitly (check the original tileset's own README if
available) before shipping a build that bundles it. Tracked in
[`../docs/open-questions.md`](../docs/open-questions.md).

## `pirate-base.png`

A standalone sprite (dark metallic space station with turret-like
protrusions) used for the pirate base structure (see
[`../docs/graphics-and-assets.md`](../docs/graphics-and-assets.md)). Like
`units.png`, it carries no embedded credit panel — source/license
unconfirmed, same tracking as `units.png` in
[`../docs/open-questions.md`](../docs/open-questions.md).

## Notes

- These two PNGs are **legend/reference sheets** (a labeled sample grid), not
  cut, ready-to-use sprite frames. Treat them as a style/licensing reference;
  any sprite actually cropped for use in-game should be re-exported at the
  exact pixel dimensions the renderer expects and tracked in
  [`../docs/graphics-and-assets.md`](../docs/graphics-and-assets.md).
- The original Amplio/FreeCiv tileset ships its own README with a fuller
  contributor list than fits in the sheet's credit panel; if a full copy of
  that tileset is sourced later, replace this file with (or append) its exact
  README content rather than this reconstruction.
- Because this is GPL v2 licensed art, any game build that bundles these
  images (or derivatives/crops of them) must itself be distributable under
  GPL v2 terms for the *art*, regardless of what license the project's own
  code uses (see root [`LICENSE`](../LICENSE)).
