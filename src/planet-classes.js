// Single source of truth for the planet/moon class -> sprite catalog,
// consumed by mapgen.js (generation) and assets.js (loading). See
// docs/graphics-and-assets.md for where each sprite was cropped from.
export const PLANET_CLASSES = {
  molten: ["planet-uninhabited", "planet-furs"],
  toxic: ["planet-ivory", "planet-fruit"],
  rocky: ["planet-inhabited", "planet-wine", "planet-wheat", "planet-spice", "planet-oasis", "planet-silk"],
  "gas-giant": ["planet-whales"],
  ice: ["planet-shield", "planet-buffalo"],
};

export const PLANET_CLASS_NAMES = Object.keys(PLANET_CLASSES);
