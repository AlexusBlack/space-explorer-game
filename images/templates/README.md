# Hex Tile Art Templates

## `hex-tile-template.png`

144×126px (the hex silhouette itself is 128×110px, plus an 8px margin on all
sides so guide lines aren't clipped at the edge).

**Updated 2026-10-03: resized down from the original 276×241px template.**
At the old scale, the real star/planet/wonder/asteroid-belt sprites cropped
from `terrain1.png`/`terrain2.png` (all roughly 30-90px native) had to be
upscaled 2-3x to look properly sized against the tile, which read as too
small and blurry. The hex is now sized so a ~50px icon (e.g. `star.png`,
51×43px) lands at or near its own native resolution instead — see
`src/hexgrid.js`'s `HEX_SIZE` comment for the exact math. **The 5
`starfield-*-hex.png` band tiles painted against the old template are now
the wrong scale and need to be repainted against this one.**

- **Orientation: flat-top** (flat edges top/bottom, points left/right) —
  unchanged from before.
- **Outside the hex outline must stay fully transparent** (alpha 0). The
  renderer draws this exact bitmap once per tile position; anything opaque
  outside the hex silhouette will visibly overlap into neighboring tiles.
- The hex interior is pre-filled with the game's current deep-space
  background color (`#05070d`) as a starting point — paint your starfield
  detail on top of it, or clear it and replace it entirely; either is fine
  as long as everything *outside* the hex stays transparent.
- The bright magenta outline + center crosshair are alignment guides only —
  select-and-delete (or color-key them out) before exporting your final art.
  They're a saturated, unlikely-to-collide color specifically so they're
  easy to isolate and remove.
- At this smaller size there's much less room for painted-in detail (fewer
  pixels to work with) before it reads as noise rather than texture — a
  simpler, lower-frequency pattern than before will likely read better.

## `hex-tile-tiling-preview.png`

A 7-hex "flower" (center + all 6 neighbors), built by tiling copies of
`hex-tile-template.png` at the exact spacing the game's hex math uses.
Confirms the template tiles edge-to-edge with no gaps or overlaps. Once you
have real art, re-export it into this same template and you can rebuild this
preview yourself (or send it back and I will) to sanity-check seams before
committing to a full repaint.
