# Space Explorer

A peaceful, friendly, browser-based 2D hot-seat space exploration game, built to be played by two people sharing one tablet. Inspired by the early-game "send an Explorer/Trireme out to map the world" loop from Civilization 5.

This repo is currently in the design/pre-code stage. Start here:

- [`concept-and-approach.md`](concept-and-approach.md) — the original one-page pitch (kept as-is, historical anchor).
- [`docs/game-design.md`](docs/game-design.md) — mechanics: map, ships, XP/leveling, anomalies, pirates.
- [`docs/mvp-roadmap.md`](docs/mvp-roadmap.md) — staged, independently-shippable MVPs (MVP0 → MVP4+).
- [`docs/graphics-and-assets.md`](docs/graphics-and-assets.md) — what art exists, what's usable, what's missing.
- [`docs/ui-ux-spec.md`](docs/ui-ux-spec.md) — screen layout, touch interactions, hot-seat pass-and-play flow.
- [`docs/technical-architecture.md`](docs/technical-architecture.md) — data model, coordinate system, map generation, persistence.
- [`docs/open-questions.md`](docs/open-questions.md) — decisions still open, tracked as they come up.

## Tech direction

HTML5 Canvas, vanilla JavaScript, zero (or near-zero) runtime dependencies, no backend. Static files, deployable anywhere (e.g. GitHub Pages).

## License

Project code is licensed under the **GNU Affero General Public License v3.0** (see [`LICENSE`](LICENSE)) — chosen so that if this ever runs as a hosted/network service, users interacting with it are guaranteed access to the corresponding source, not just users who receive a binary/copy. The bundled tile art in [`images/`](images/) is **GPL v2**, sourced from the FreeCiv "Amplio v2.0" tileset and Battle for Wesnoth — see [`images/CREDITS.md`](images/CREDITS.md) for full attribution. The art is bundled as separate asset files alongside the AGPLv3 code, each under its own stated license (a common pattern for engine-code-plus-game-art projects); this isn't a substitute for actual legal advice if the mix of AGPLv3 code and GPLv2 assets ever becomes a real concern (e.g. before any commercial/closed distribution).
