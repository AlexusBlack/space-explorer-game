// Seeded procedural map generator: distinct, spaced-out star systems in a true
// hex grid, carved as concentric rings with a wobbled boundary — ported from
// freecivx's space map generator (see docs/graphics-and-assets.md /
// docs/technical-architecture.md for the research this is based on).
//
// Design departure from freecivx: that generator used a non-hex isometric
// square grid specifically because its circle-carving math only works there
// (dx²+dy² distorts into hexagons on hex coordinates). We use TRUE hex
// topology instead and carve with native hex distance directly — which does
// not have that problem, since we never square it.
//
// Every tile within the map radius is materialized (including deep space) and
// tagged with a `band` ('inner' | 'medium' | 'outer' | 'interstellar' |
// 'deep-space') at generation time, so the renderer never has to compute
// distance-to-nearest-system per frame — just look up the tile's precomputed
// band and draw the matching background image. A tile's `type` is either the
// generic "band" (plain backdrop, nothing on it) or a specific feature
// (star / planet-uninhabited / planet-inhabited / wonder-blackhole /
// asteroid-belt) layered on top of its own band.

import { createRng } from "./rng.js";
import { hexesInRadius, hexDistance, axialKey, axialToPixel } from "./hexgrid.js";

const MAP_RADIUS = 90;
const SYSTEM_COUNT = 120;

const SYS_RADIUS_MAX = 7;
const SYS_RADIUS_MIN = Math.round(SYS_RADIUS_MAX * 0.7);
const SYS_ABS_MIN = 4;
const MIN_GAP = 2;
const NEAR_SPACE_BAND = 2;
const MAX_DART_ATTEMPTS = 250;
const HOME_RADIUS = 6;

const RING_FRACS = { inner: 0.35, medium: 0.65, outer: 1.0 };
const WOBBLE_HARMONICS = [
  { freq: 2, weight: 1 },
  { freq: 3, weight: 0.5 },
  { freq: 5, weight: 0.3 },
];
const WOBBLE_NORM = WOBBLE_HARMONICS.reduce((s, h) => s + h.weight, 0);
const WOBBLE_AMPLITUDE = 0.15;

function randomHexInRadius(rng, radius) {
  const q = Math.floor(rng() * (2 * radius + 1)) - radius;
  const rMin = Math.max(-radius, -q - radius);
  const rMax = Math.min(radius, -q + radius);
  const r = rMin + Math.floor(rng() * (rMax - rMin + 1));
  return { q, r };
}

function pickStarCount(rng) {
  const roll = rng();
  if (roll < 0.65) return 1;
  if (roll < 0.9) return 2;
  return 3;
}

function placeSystems(rng) {
  const home = {
    id: 0,
    q: 0,
    r: 0,
    radius: HOME_RADIUS,
    isHome: true,
    starCount: 1,
    phases: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
  };
  const placed = [home];

  const requests = [];
  for (let i = 1; i < SYSTEM_COUNT; i++) {
    const radius = SYS_RADIUS_MIN + Math.floor(rng() * (SYS_RADIUS_MAX - SYS_RADIUS_MIN + 1));
    requests.push({
      radius,
      starCount: pickStarCount(rng),
      phases: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
    });
  }
  requests.sort((a, b) => b.radius - a.radius);

  let skipped = 0;
  for (const request of requests) {
    let radius = request.radius;
    let placedThisSystem = false;
    while (radius >= SYS_ABS_MIN && !placedThisSystem) {
      for (let attempt = 0; attempt < MAX_DART_ATTEMPTS; attempt++) {
        const candidate = randomHexInRadius(rng, MAP_RADIUS - radius);
        const clear = placed.every(
          (other) => hexDistance(candidate, other) >= radius + other.radius + MIN_GAP
        );
        if (clear) {
          placed.push({
            id: placed.length,
            q: candidate.q,
            r: candidate.r,
            radius,
            isHome: false,
            starCount: request.starCount,
            phases: request.phases,
          });
          placedThisSystem = true;
          break;
        }
      }
      if (!placedThisSystem) radius -= 1;
    }
    if (!placedThisSystem) skipped++;
  }

  return { systems: placed, skipped };
}

function wobbleFactor(phases, angle) {
  let sum = 0;
  for (let i = 0; i < WOBBLE_HARMONICS.length; i++) {
    const { freq, weight } = WOBBLE_HARMONICS[i];
    sum += weight * Math.sin(freq * angle + phases[i]);
  }
  return 1 + WOBBLE_AMPLITUDE * (sum / WOBBLE_NORM);
}

// Picks (count) distinct neighbor offsets without replacement, for placing
// a multi-star system's secondary stars (no risk of double-picking the same
// neighbor, unlike independent random picks).
function pickSecondaryStarOffsets(rng, count) {
  const neighbors = hexesInRadius(1).filter((o) => o.q !== 0 || o.r !== 0);
  for (let i = neighbors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
  }
  return neighbors.slice(0, count);
}

// Scans a system's bounding area once, writing a plain "band" backdrop tile
// for every ring/halo hex (so every tile in a system has background art from
// the moment it's generated), writing star tiles directly, and collecting
// inner/medium/outer ring coordinates (each tagged with its band) for later
// body placement.
function carveSystem(tiles, system, rng) {
  const zoneCoords = { inner: [], medium: [], outer: [] };
  const boundingRadius = system.radius + NEAR_SPACE_BAND;

  const secondaryOffsets =
    system.starCount > 1 ? pickSecondaryStarOffsets(rng, system.starCount - 1) : [];
  const starKeys = new Set([axialKey(system.q, system.r)]);
  for (const o of secondaryOffsets) starKeys.add(axialKey(system.q + o.q, system.r + o.r));

  for (const offset of hexesInRadius(boundingRadius)) {
    const dist = hexDistance({ q: 0, r: 0 }, offset);
    const q = system.q + offset.q;
    const r = system.r + offset.r;
    if (dist === 0 || starKeys.has(axialKey(q, r))) continue; // star tiles, placed below

    const pixel = axialToPixel(offset.q, offset.r);
    const angle = Math.atan2(pixel.y, pixel.x);
    const wobble = wobbleFactor(system.phases, angle);

    const innerR = RING_FRACS.inner * system.radius * wobble;
    const mediumR = RING_FRACS.medium * system.radius * wobble;
    const outerR = RING_FRACS.outer * system.radius * wobble;
    const haloR = outerR + NEAR_SPACE_BAND;

    let band;
    if (dist <= innerR) band = "inner";
    else if (dist <= mediumR) band = "medium";
    else if (dist <= outerR) band = "outer";
    else if (dist <= haloR) band = "interstellar";
    else continue; // beyond this system's halo — left for the deep-space sweep

    if (band !== "interstellar") zoneCoords[band].push({ q, r, band });
    tiles.set(axialKey(q, r), { q, r, type: "band", band, regionId: system.id });
  }

  tiles.set(axialKey(system.q, system.r), {
    q: system.q,
    r: system.r,
    type: "star",
    band: "inner",
    sol: system.isHome,
    regionId: system.id,
  });

  for (const o of secondaryOffsets) {
    const q = system.q + o.q;
    const r = system.r + o.r;
    tiles.set(axialKey(q, r), {
      q,
      r,
      type: "star",
      band: "inner",
      regionId: system.id,
    });
  }

  return zoneCoords;
}

// Two belt sprite variants (cropped from terrain2.png); each tile picks one
// plus a random rotation/flip so a handful of source images still read as
// varied across the many belt tiles on a map.
function pickBeltAppearance(rng) {
  return {
    variant: rng() < 0.5 ? 1 : 2,
    rotation: rng() * Math.PI * 2,
    flip: rng() < 0.5,
  };
}

function takeRandom(rng, list) {
  if (list.length === 0) return null;
  const index = Math.floor(rng() * list.length);
  return list.splice(index, 1)[0];
}

function farEnough(coord, chosen, minSep) {
  return chosen.every((c) => hexDistance(coord, c) >= minSep);
}

// A plain backdrop tile (type "band") is free for a feature to claim; a tile
// already holding a star/planet/wonder/belt is not.
function isClaimable(tiles, key) {
  const existing = tiles.get(key);
  return !existing || existing.type === "band";
}

function populateSystem(tiles, system, zoneCoords, rng) {
  const chosen = [];
  const minSep = 2;

  const innerPool = [...zoneCoords.inner];
  const mediumPool = [...zoneCoords.medium];
  const outerPool = [...zoneCoords.outer];

  if (system.isHome) {
    const pool = mediumPool.length ? mediumPool : innerPool.length ? innerPool : outerPool;
    const earthCoord = takeRandom(rng, pool);
    if (earthCoord) {
      chosen.push(earthCoord);
      tiles.set(axialKey(earthCoord.q, earthCoord.r), {
        ...earthCoord,
        type: "planet-inhabited",
        home: true,
        regionId: system.id,
      });
    }
  }

  const innerPlanetCount = Math.floor(rng() * 2);
  for (let i = 0; i < innerPlanetCount; i++) {
    let tries = 8;
    while (tries-- > 0 && innerPool.length) {
      const coord = takeRandom(rng, innerPool);
      if (farEnough(coord, chosen, minSep)) {
        chosen.push(coord);
        tiles.set(axialKey(coord.q, coord.r), { ...coord, type: "planet-uninhabited", regionId: system.id });
        break;
      }
    }
  }

  const mediumPlanetCount = Math.floor(rng() * 3);
  for (let i = 0; i < mediumPlanetCount; i++) {
    let tries = 8;
    while (tries-- > 0 && mediumPool.length) {
      const coord = takeRandom(rng, mediumPool);
      if (farEnough(coord, chosen, minSep)) {
        chosen.push(coord);
        const inhabited = rng() < 0.3;
        tiles.set(axialKey(coord.q, coord.r), {
          ...coord,
          type: inhabited ? "planet-inhabited" : "planet-uninhabited",
          regionId: system.id,
        });
        break;
      }
    }
  }

  const outerPlanetCount = Math.floor(rng() * 2);
  for (let i = 0; i < outerPlanetCount; i++) {
    let tries = 8;
    while (tries-- > 0 && outerPool.length) {
      const coord = takeRandom(rng, outerPool);
      if (farEnough(coord, chosen, minSep)) {
        chosen.push(coord);
        tiles.set(axialKey(coord.q, coord.r), { ...coord, type: "planet-uninhabited", regionId: system.id });
        break;
      }
    }
  }

  if (rng() < 0.15) {
    const pool = outerPool.length ? outerPool : mediumPool.length ? mediumPool : innerPool;
    const coord = takeRandom(rng, pool);
    if (coord) {
      tiles.set(axialKey(coord.q, coord.r), { ...coord, type: "wonder-blackhole", regionId: system.id });
    }
  }

  const beltPool = rng() < 0.5 ? zoneCoords.medium : zoneCoords.outer;
  const beltBandStart = rng();
  for (const coord of beltPool) {
    const key = axialKey(coord.q, coord.r);
    if (!isClaimable(tiles, key)) continue;
    const pixel = axialToPixel(coord.q - system.q, coord.r - system.r);
    const angle = Math.atan2(pixel.y, pixel.x);
    const coverage = 0.5 + 0.5 * Math.sin(angle * 3 + beltBandStart * 10);
    if (coverage > 0.4 && rng() < 0.5) {
      tiles.set(key, {
        ...coord,
        type: "asteroid-belt",
        regionId: system.id,
        ...pickBeltAppearance(rng),
      });
    }
  }
}

export function generateMap({ seed } = {}) {
  const rng = createRng(seed);
  const { systems, skipped } = placeSystems(rng);

  const tiles = new Map();
  for (const system of systems) {
    const zoneCoords = carveSystem(tiles, system, rng);
    populateSystem(tiles, system, zoneCoords, rng);
  }

  // Deep-space sweep: materialize every remaining hex in the map radius as a
  // plain deep-space backdrop tile, computed once here rather than inferred
  // per frame at render time.
  for (const { q, r } of hexesInRadius(MAP_RADIUS)) {
    const key = axialKey(q, r);
    if (!tiles.has(key)) {
      tiles.set(key, { q, r, type: "band", band: "deep-space", regionId: -1 });
    }
  }

  let earth = { q: 0, r: 0 };
  for (const tile of tiles.values()) {
    if (tile.home) {
      earth = { q: tile.q, r: tile.r };
      break;
    }
  }

  const totalHexCount = 3 * MAP_RADIUS * MAP_RADIUS + 3 * MAP_RADIUS + 1;

  return {
    seed,
    mapRadius: MAP_RADIUS,
    systems,
    systemsSkipped: skipped,
    totalHexCount,
    tiles,
    earth,
  };
}
