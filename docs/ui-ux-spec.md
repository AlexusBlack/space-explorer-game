# UI / UX Spec

Target device: iPad Mini (touch-only, ~8" screen), shared by one to six
people sitting together. No mouse, no hover affordances assumed anywhere.

## Screen Regions

- **Start screen** — opened by the top bar's "New Game" button, and shown on
  a launch with no save (a launch with a save resumes directly). A card over
  a dark backdrop, above every other overlay, with:
  - a seed field and 🎲 reroll (the seed input used to sit in the top bar);
  - one row per player: team colour dropdown (the dropdown itself shows the
    chosen colour, since iOS can't colour individual options), name, "ICV"
    plus ship name with a 🎲 reroll, and × remove (disabled at one player);
  - "+ Add player" (disabled at six), "Start game", and "Cancel" only when
    there is a running game to go back to.

  Controls are at least 40 px tall for touch.
- **Map viewport** — the dominant region; full-bleed canvas showing the
  hex/diamond map, ships, and fog-of-war.
- **HUD strip** — a fixed bar (bottom, for thumb reach) showing: whose turn
  it is ("Ann's turn · ICV Enterprise", in the team colour), that player's XP/level, moves remaining this turn, and an "End Turn"
  button.
- **Pass-and-play interstitial** — a full-screen "Pass to <name>"
  tap-to-continue screen shown immediately after a turn ends and before the
  next player's map/fog-of-war is revealed. This is a real information-hiding
  requirement (not just cosmetic): every player shares one physical screen,
  and one team's fog-of-war/discoveries must not be visible to another
  during handoff.
- **Notification area** — a column of round icons on the right edge for the
  active player's own events: pirate attacks, inhabited worlds and anomalies
  they discovered. Tap one to center on it and show its text for about 7 s;
  swipe one sideways to remove it. Ending a turn clears the list. It sits
  under the interstitial, so it's hidden during handoff.
- **Tile report** — opened by long-pressing a hex, since a tap already moves
  the ship. It's a card over the dimmed map in the same style as the world
  card. It shows the coordinates, what the hex is, its system, zone, defense
  bonus, discovery XP and distance, then each ship or pirate on the hex with
  its stats (see `game-design.md`'s "Tile report"). Close it with the × or a
  tap on the backdrop. Taps on the card itself don't close it, so its "View
  world" button works.

## Touch Interactions

- **Tap an in-range hex** — move the ship there (if within this turn's move
  budget).
- **Tap the ship** — select/re-center the camera on it.
- **Long-press a hex** (one still finger, about 500 ms) — open its tile
  report. Long-press is the iPadOS convention for "show details without
  acting". Moving more than 10 px or adding a second finger cancels it.
  Once it fires, lifting the finger doesn't move the ship and the map
  doesn't pan until every finger is up. Safari's own long-press callout and
  text selection are turned off on the canvas.
- **One-finger drag** — pan the map.
- **Pinch** — zoom the map.
- **Tap "End Turn"** — ends the current player's turn and triggers the
  pass-and-play interstitial.

All interactions use native pointer/touch events — no gesture library,
consistent with the project's "minimize dependencies" direction.

## Layout

Responsive to both portrait and landscape rather than orientation-locked.
Safari's resize/orientation-change events are cheap to handle, and locking
orientation would be a needless restriction for a game meant to be picked up
and passed around casually.

## Dependency Policy

Vanilla JS + Canvas 2D API for all rendering and interaction through at least
MVP4 — there's no rendering complexity here (no particle systems, no
WebGL-class effects) that justifies a framework or canvas library. Zero
runtime dependencies shipped to the browser; a dev-only bundler (or none at
all, serving raw ES modules) is fine for developer convenience. This keeps
the game deployable as static files with no backend, matching the
single-device hot-seat concept (no networking needed).
