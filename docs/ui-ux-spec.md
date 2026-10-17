# UI / UX Spec

Target device: iPad Mini (touch-only, ~8" screen), shared by one to six
people sitting together. No mouse, no hover affordances assumed anywhere.

## Screen Regions

- **Start screen** — opened by the top bar's "New Game" button, and shown on
  a launch with no save (a launch with a save resumes directly). A card over
  a dark backdrop, above every other overlay, with:
  - a seed field and 🎲 reroll (the seed input used to sit in the top bar);
  - a **Map** section: a layout dropdown (Clusters / Even, each a preset)
    beside a 180 px preview of the star systems the seed and settings place
    (one dot per system sized by its radius, home in the first player's
    team colour, lone systems dimmer, the map's hexagonal edge), with a
    caption such as "108 of 120 systems placed · radius 110 · ~37k tiles"
    that also says how many systems didn't fit. It updates as you type;
  - "Advanced map settings", collapsed by default: one number field per
    setting (systems, map radius, system size min/max, gap between systems,
    and for Clusters the cluster count min/max, gap between clusters,
    density, core and lone share, then the anomaly chance per system and
    deep-space anomalies per 1000 hexes), plus "Reset to defaults";
  - one row per player: team colour dropdown (the dropdown itself shows the
    chosen colour, since iOS can't colour individual options), name, "ICV"
    plus ship name with a 🎲 reroll, and × remove (disabled at one player);
  - "+ Add player" (disabled at six), "Start game", and "Cancel" only when
    there is a running game to go back to.

  Controls are at least 40 px tall for touch.
- **Map viewport** — the dominant region; full-bleed canvas showing the
  hex/diamond map, ships, and fog-of-war. Pinch and wheel zoom out as far as
  the whole map (never limited above 0.25 on small maps); below zoom 0.2
  ships draw as fixed-size dots (team colour with a white outline, larger
  for the active ship; pirate ships red dots, pirate bases red squares) so
  they stay findable, and the selection pulse stops animating.
- **Top bar** — the active player's emc balance (gold, e.g. "1,250 emc";
  it replaced the seed and map debug text, and the seed is still in the URL
  and on the start screen), turn count, two 40 px icon buttons and "New
  Game":
  - **Ranking** (list icon): every player's ship, ranked by level, then
    XP, then turn order, with level, XP and upgrades (picks spent,
    Instant Repairs included). The active player's row is highlighted.
  - **Worlds** (planet icon): the inhabited worlds the active team has
    discovered, nearest the active ship first, with species, attitude
    toward explorers and distance in hexes; "No inhabited worlds
    discovered yet" when empty.

  Both open one shared card (same family as the tile report) with a
  table; tapping a row closes it and centres the map on that ship or
  world. The × or a tap on the backdrop closes it.
- **HUD strip** — a fixed bar (bottom, for thumb reach) showing: whose turn
  it is ("Ann's turn · ICV Enterprise", in the team colour; tap it to centre
  the map on that ship), that player's XP/level, moves remaining this turn, and an "End Turn"
  button.
- **Pass-and-play interstitial** — a full-screen "Pass to <name>"
  tap-to-continue screen shown immediately after a turn ends and before the
  next player's map/fog-of-war is revealed. This is a real information-hiding
  requirement (not just cosmetic): every player shares one physical screen,
  and one team's fog-of-war/discoveries must not be visible to another
  during handoff.
- **Notification area** — a column of round icons on the right edge for the
  active player's own events: pirate attacks, inhabited worlds and anomalies
  they discovered, and emc bounties (a gold "emc" circle per paying world). Tap one to center on it and show its text for about 7 s;
  swipe one sideways to remove it. Ending a turn clears the list. It sits
  under the interstitial, so it's hidden during handoff.
- **World card** — opened by tapping an inhabited world's name tag (or the
  tile report's "View world"). It's laid out like a video call, in one
  column at every screen width so the scene stays the biggest thing on it.
  - A header names who's on the line: the government's name (for an
    Anarchy, which has none, its flavoured form, e.g. "Free Cities") in bold, then the world and species names; under it, the
    attitude toward explorers.
  - Then the 3:2 scene: the world's landscape through a room's window, the
    species portrait in front on the left. It shows only once all three
    images have loaded.
  - Then a tab bar (Communications, Details, Diplomacy) over a panel of a
    fixed height, so switching tabs never resizes the card; longer content
    scrolls inside the panel. It always opens on Communications, a
    messenger-style chat: the world's bubbles on the left (dark navy), the
    player's on the right (blue), a log that scrolls and starts at the newest
    message, and the player's choices as pill buttons in a row along the
    bottom. A choice the player can't use (e.g. Pay without enough emc) is
    dimmed with its reason beside it. After a choice, the player's bubble
    appears, a "…" typing bubble shows for about 0.6 s, then the reply and
    the next choices. "Bye" closes the card about 1 s after its reply.
    Details holds the world's class and type,
    the species name and description, the government (its own name, e.g.
    "Republic of Anxor", none for an Anarchy; then its flavoured form, plus
    the type when the form doesn't say it) and the ethics (a one-line list
    of its non-Balanced views, no scales, to keep it compact and in-world).
    Diplomacy holds the attitudes toward explorers and pirates and the
    known neighbours with their diplomatic state, closest first.
  - The scene shrinks to leave room for the header, tabs and panel. Only a
    tap on the backdrop or the × closes the card, so the tabs and the
    panel's scrolling work. The aim is to give the player one topic at a
    time, and room to add more later.
- **Tile report** — opened by long-pressing a hex, since a tap already moves
  the ship. It's a card over the dimmed map in the same style as the world
  card. It shows the coordinates, what the hex is (with an inhabited world's
  attitude toward explorers), its system, zone, defense
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
