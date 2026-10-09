// Single source of truth for the planet/moon class -> sprite catalog,
// consumed by mapgen.js (generation) and assets.js (loading). See
// docs/graphics-and-assets.md for where each sprite was cropped from.
export const PLANET_CLASSES = {
  molten: ["planet-uninhabited", "planet-furs"],
  toxic: ["planet-ivory", "planet-fruit"],
  rocky: ["planet-inhabited", "planet-wine", "planet-wheat", "planet-spice", "planet-oasis", "planet-silk"],
  // planet-whales is the original purple; the rest are recoloured from it
  // by scripts/extract-icons.py (Jupiter, Saturn, Uranus, Neptune, green).
  "gas-giant": [
    "planet-whales", "planet-gas-brown", "planet-gas-yellow",
    "planet-gas-cyan", "planet-gas-blue", "planet-gas-green",
  ],
  ice: ["planet-shield", "planet-buffalo"],
};

export const PLANET_CLASS_NAMES = Object.keys(PLANET_CLASSES);

// Classes a moon may be. Gas giants can't be moons (a gas giant orbiting a
// gas giant doesn't make sense) — every other class is fair game.
export const MOON_CLASS_NAMES = PLANET_CLASS_NAMES.filter((name) => name !== "gas-giant");
