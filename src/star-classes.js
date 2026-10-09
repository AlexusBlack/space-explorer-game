// Star colour -> sprite catalog with spawn weights, consumed by mapgen.js
// (generation) and assets.js (loading). "star" is the original yellow
// sprite; the others are recoloured from it by scripts/extract-icons.py.
// Weights keep the real-world order (red dwarfs most common, blue rarest)
// but boost yellow to second place, because players expect Sun-like stars.
export const STAR_COLORS = [
  { sprite: "star-red", weight: 40 },
  { sprite: "star", weight: 30 },
  { sprite: "star-orange", weight: 15 },
  { sprite: "star-white", weight: 10 },
  { sprite: "star-blue", weight: 5 },
];

const TOTAL_WEIGHT = STAR_COLORS.reduce((s, c) => s + c.weight, 0);

export function pickStarSprite(rng) {
  let roll = rng() * TOTAL_WEIGHT;
  for (const { sprite, weight } of STAR_COLORS) {
    roll -= weight;
    if (roll < 0) return sprite;
  }
  return STAR_COLORS[STAR_COLORS.length - 1].sprite;
}
