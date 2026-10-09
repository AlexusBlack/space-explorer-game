// Seeded 2D gradient (Perlin-style) noise, used by mapgen.js to give star
// clusters irregular, natural-looking edges. Same seed -> same field.

import { createRng } from "./rng.js";

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Returns noise(x, y) in roughly [-1, 1], smooth over a feature size of ~1 unit.
export function createNoise2D(seed) {
  const rng = createRng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const gradients = perm.map((p) => {
    const angle = (p / 256) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const gradientAt = (ix, iy) => gradients[perm[(perm[ix & 255] + iy) & 255]];
  const dot = (ix, iy, x, y) => {
    const [gx, gy] = gradientAt(ix, iy);
    return gx * (x - ix) + gy * (y - iy);
  };

  return function noise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const u = fade(x - x0);
    const v = fade(y - y0);
    const top = lerp(dot(x0, y0, x, y), dot(x0 + 1, y0, x, y), u);
    const bottom = lerp(dot(x0, y0 + 1, x, y), dot(x0 + 1, y0 + 1, x, y), u);
    // A 2D gradient lattice peaks around ±0.7; scale to roughly ±1.
    return lerp(top, bottom, v) * Math.SQRT2;
  };
}

// Fractal sum of `octaves` noise layers, each twice the frequency and half the
// amplitude of the last; result stays in roughly [-1, 1].
export function fbm(noise, x, y, octaves = 3) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(x * frequency, y * frequency);
    norm += amplitude;
    amplitude /= 2;
    frequency *= 2;
  }
  return sum / norm;
}
