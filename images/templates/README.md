# Hex Tile Art Templates

## `hex-tile-template.png`

76×67px (the hex silhouette itself is 64×55px, plus a 6px margin on all
sides so guide lines aren't clipped at the edge).

**Updated 2026-10-03: halved again, from 144×126px to 76×67px**, per direct
feedback that tiles still looked too large even after the first resize (down
from an original 276×241px). Note that feature icons (stars/planets/etc.) no
longer scale with tile size at all — they're drawn at their own native pixel
resolution regardless of `HEX_SIZE` — so this template only affects the band
*background* art below.

**The 5 `starfield-*-hex.png` band tiles have been repainted against this
template** (confirmed: all 76×67px, correctly transparent/opaque, no
leftover guide lines). One thing worth a look: the inner→medium→outer
brightness gradient is intact, but outer/interstellar/deep-space now measure
almost identical in brightness (~24-25 avg) where they were previously
clearly separated (25/15/9) — may be worth another pass if that three-way
distinction mattered to you, otherwise no action needed.

- **Orientation: flat-top** (flat edges top/bottom, points left/right) —
  unchanged.
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
- At 64×55px there's very little room for painted-in detail — a few soft
  speckles/a subtle gradient is about the practical ceiling before it reads
  as noise. If you want more visible texture, this is a sign `HEX_SIZE`
  should be adjusted back up rather than fighting the resolution — worth
  flagging if the next repaint still doesn't look right.

## `hex-tile-tiling-preview.png`

A 7-hex "flower" (center + all 6 neighbors), built by tiling copies of
`hex-tile-template.png` at the exact spacing the game's hex math uses.
Confirms the template tiles edge-to-edge with no gaps or overlaps. Once you
have real art, re-export it into this same template and you can rebuild this
preview yourself (or send it back and I will) to sanity-check seams before
committing to a full repaint.
