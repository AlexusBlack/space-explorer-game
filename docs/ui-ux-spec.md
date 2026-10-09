# UI / UX Spec

Target device: iPad Mini (touch-only, ~8" screen), shared by two people
sitting together. No mouse, no hover affordances assumed anywhere.

## Screen Regions

- **Map viewport** — the dominant region; full-bleed canvas showing the
  hex/diamond map, ships, and fog-of-war.
- **HUD strip** — a fixed bar (bottom, for thumb reach) showing: whose turn
  it is, that player's XP/level, moves remaining this turn, and an "End Turn"
  button.
- **Pass-and-play interstitial** — a full-screen "Pass to Player 2"
  tap-to-continue screen shown immediately after a turn ends and before the
  next player's map/fog-of-war is revealed. This is a real information-hiding
  requirement (not just cosmetic): both players share one physical screen,
  and one player's fog-of-war/discoveries must not be visible to the other
  during handoff.
- **Notification area** — a column of round icons on the right edge for the
  active player's own events: pirate attacks, inhabited worlds and anomalies
  they discovered. Tap one to center on it and show its text for about 7 s;
  swipe one sideways to remove it. Ending a turn clears the list. It sits
  under the interstitial, so it's hidden during handoff.
- **Tile/object detail** — a lightweight on-tap popover (canvas-drawn or a
  simple absolutely-positioned DOM overlay), not a full modal, so inspecting
  a planet/wonder/anomaly doesn't interrupt the exploration flow.

## Touch Interactions

- **Tap an in-range hex** — move the ship there (if within this turn's move
  budget).
- **Tap the ship** — select/re-center the camera on it.
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
