# Hex Tile Art Templates

## `hex-tile-template.png`

276×241px (the hex silhouette itself is 256×221px, plus a 10px margin on all
sides so guide lines aren't clipped at the edge).

- **Orientation: flat-top** (flat edges top/bottom, points left/right) —
  chosen to match the game's current wide/landscape tile rhythm. This is
  cheap to change: nothing is committed to flat-top yet since no art exists
  — ask and I'll regenerate as pointy-top if you'd rather have that look.
- **Outside the hex outline must stay fully transparent** (alpha 0). The
  renderer will draw this exact bitmap once per tile position; anything
  opaque outside the hex silhouette will visibly overlap into neighboring
  tiles.
- The hex interior is pre-filled with the game's current deep-space
  background color (`#05070d`) as a starting point — paint your starfield
  detail on top of it, or clear it and replace it entirely; either is fine
  as long as everything *outside* the hex stays transparent.
- The bright magenta outline + center crosshair are alignment guides only —
  select-and-delete (or color-key them out) before exporting your final art.
  They're a saturated, unlikely-to-collide color specifically so they're
  easy to isolate and remove.

## `hex-tile-tiling-preview.png`

A 7-hex "flower" (center + all 6 neighbors), built by tiling copies of
`hex-tile-template.png` at the exact spacing the game's hex math will use.
Confirms the template tiles edge-to-edge with no gaps or overlaps. Once you
have real art, re-export it into this same template and you can rebuild this
preview yourself (or send it back and I will) to sanity-check seams before
committing to a full pass across every tile type.

## Next step

This is a template for one generic starfield/background tile. The game's
renderer currently draws a diamond (isometric square-grid projection, a
placeholder — see `docs/graphics-and-assets.md`/`docs/technical-architecture.md`
for why). Switching the renderer itself over to draw true hex art is a
separate follow-up once you've got a filled-in tile to show — just let me
know when that's ready.
