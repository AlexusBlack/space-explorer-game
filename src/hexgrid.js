// Axial hex coordinates <-> true flat-top hex screen pixels.
// See docs/technical-architecture.md and docs/graphics-and-assets.md.
//
// HEX_SIZE matches the art template exactly (center-to-vertex distance) so
// tile art renders at native resolution when camera.zoom === 1.

export const HEX_SIZE = 128;
export const HEX_WIDTH = 2 * HEX_SIZE;
export const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;

export function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * 1.5 * q,
    y: HEX_SIZE * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r),
  };
}

export function pixelToAxial(x, y) {
  const qf = (2 / 3) * (x / HEX_SIZE);
  const rf = (-1 / 3) * (x / HEX_SIZE) + (Math.sqrt(3) / 3) * (y / HEX_SIZE);
  return roundAxial(qf, rf);
}

function roundAxial(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  let s = Math.round(sf);
  const qDiff = Math.abs(q - qf);
  const rDiff = Math.abs(r - rf);
  const sDiff = Math.abs(s - sf);
  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }
  return { q, r };
}

export const AXIAL_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialNeighbors(q, r) {
  return AXIAL_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

export function axialKey(q, r) {
  return `${q},${r}`;
}

// All axial coordinates within `radius` hexes of the origin (a filled hexagon).
export function hexesInRadius(radius) {
  const results = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      results.push({ q, r });
    }
  }
  return results;
}
