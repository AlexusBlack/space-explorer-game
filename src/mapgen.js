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
// (star / planet / moon / wonder-blackhole / asteroid-belt) layered on top
// of its own band. Planet/moon tiles carry a `planetClass` (molten / toxic /
// rocky / gas-giant / ice, from planet-classes.js) and `sprite`, plus an
// `inhabited` boolean that is fully independent of class/sprite, and a
// visual-only `scale` (moons also an `offset` within their hex). Moons are
// real, separately-discoverable tiles claiming one of their parent planet's
// own unclaimed same-zone neighbor hexes (see placeMoons below), not a
// decorative overlay on the parent's own tile.
//
// Names (nameMap below, from its own `names` stream): each system gets a
// `name`, also stored on its primary star tile; companion stars, planets and
// moons get a designation `name` ("GD-17 B", "GD-17 III", "GD-17 III-a"), and
// inhabited planets/moons an `ownName` as well.

import { createRng } from "./rng.js";
import { hexesInRadius, hexDistance, axialKey, axialToPixel, axialNeighbors, HEX_SIZE } from "./hexgrid.js";
import { PLANET_CLASSES, MOON_ONLY_SPRITES, MOON_CLASS_NAMES } from "./planet-classes.js";
import { pickStarSprite } from "./star-classes.js";
import { createNoise2D, fbm } from "./noise.js";
import { rollEthics, HOME_ETHICS } from "./ethics.js";
import { DEFAULT_MAP_SETTINGS, normalizeMapSettings } from "./map-settings.js";

// Map size, system count and size, spacing and cluster shape come from the
// map settings (map-settings.js), passed to generateMap.

// Star clusters (see buildClusterField): systems gather in a settings-chosen
// number of noise-shaped blobs with empty voids between them, plus a share of
// lone systems out in the voids. Distances are in hexes. All clusters share
// one total hex area (systemCount / clusterDensity), split between them (so
// more clusters means smaller ones), each radius then jittered by
// CLUSTER_RADIUS_JITTER. Each is at full density out to the settings'
// clusterCore share of its radius, then fades to its edge.
const CLUSTER_RADIUS_JITTER = [0.85, 1.15];
const CLUSTER_WARP = 9; // max hexes the noise pushes a cluster's edge in or out
const CLUSTER_WARP_SCALE = 30; // noise feature size, in hexes
const CLUSTER_SPREAD = 1.25; // candidates are drawn within this many radii
const LONE_MAX_DENSITY = 0.02;
const NEAR_SPACE_BAND = 2;
const MAX_DART_ATTEMPTS = 250;
const HOME_RADIUS = 6;

const RING_FRACS = { inner: 0.35, medium: 0.65, outer: 1.0 };

// Flat probability that any single planet or moon, regardless of class, is
// marked inhabited (drives only a text label today — see render.js). A
// single easily-tunable knob, deliberately not varied by class/zone.
const INHABITED_CHANCE = 0.05;
// Visual variety only (render.js): each planet is drawn at a random fraction
// of its sprite's size, each moon at a random fraction of its 50% moon size,
// shifted within its hex by up to MOON_OFFSET_MAX of the hex half-width and
// half-height. Rolled from the separate `bodyRng` stream (see generateMap).
const PLANET_SCALE = [0.75, 1];
const MOON_SCALE = [0.8, 1.2];
const MOON_OFFSET_MAX = 0.5;
// Anomaly placement: a per-system chance (same mechanism as the
// wonder-blackhole roll below), rolled twice per system (the second roll in
// placeSecondAnomalies), plus a very sparse scatter directly in deep space,
// so flying through otherwise-empty space has a real payoff too. Both rates
// are map settings (anomalySystemChance %, anomalyDeepSpace per 1000 hexes);
// the defaults 96% and 6.4 are the playtested rates (8x, then 2x more, the
// MVP3 first pass of 12% and 0.4).
// Share of anomalies that are wormholes, marked at generation so players can
// see (and avoid) them; 1 in 4, the share the old trigger-time roll gave.
export const ANOMALY_WORMHOLE_SHARE = 0.25;
// Share of non-home systems named with a catalogue designation ("GD-17")
// instead of a name from data/star_planet_names.json.
const DESIGNATION_CHANCE = 0.4;
const RESERVED_NAMES = ["Sol", "Earth", "Luna"];
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

// Distance unit for the cluster field: one hex step (axialToPixel neighbours
// are sqrt(3) * HEX_SIZE apart), so cluster sizes read in hexes.
const HEX_STEP = Math.sqrt(3) * HEX_SIZE;

// Picks cluster centres and radii from their own stream (the home cluster is
// always centred on Sol at the origin) and returns them with a density(q, r)
// in [0, 1]: 1 deep inside a cluster, 0 in the voids. Distances are measured
// from a noise-warped position, so cluster edges come out as irregular blobs
// with arms and bays rather than circles.
function buildClusterField(seed, settings) {
  const { mapRadius, clusterCountMin, clusterCountMax } = settings;
  const totalArea = (settings.systemCount * 1000) / settings.clusterDensity;
  const plateau = settings.clusterCore / 100;
  const rng = createRng(`${seed}:clusters`);
  const warpX = createNoise2D(`${seed}:cluster-warp-x`);
  const warpY = createNoise2D(`${seed}:cluster-warp-y`);

  const count = clusterCountMin + Math.floor(rng() * (clusterCountMax - clusterCountMin + 1));
  const baseRadius = Math.sqrt(totalArea / count / 3);
  const radii = Array.from({ length: count }, () => Math.round(baseRadius * rollInRange(rng, CLUSTER_RADIUS_JITTER)));
  radii.sort((a, b) => b - a);

  const clusters = [{ q: 0, r: 0, radius: radii[0] }];
  // Same shrink-and-retry as placeSystems, so the cluster count holds.
  for (let radius of radii.slice(1)) {
    let placed = false;
    while (!placed && radius >= baseRadius / 2) {
      for (let attempt = 0; attempt < MAX_DART_ATTEMPTS && !placed; attempt++) {
        const c = randomHexInRadius(rng, mapRadius - Math.round(radius * 0.5));
        if (clusters.every((o) => hexDistance(c, o) >= radius + o.radius + settings.clusterGap)) {
          clusters.push({ ...c, radius });
          placed = true;
        }
      }
      radius -= 1;
    }
  }
  for (const c of clusters) c.center = axialToPixel(c.q, c.r);

  function density(q, r) {
    const p = axialToPixel(q, r);
    const x = p.x / HEX_STEP;
    const y = p.y / HEX_STEP;
    const wx = x + CLUSTER_WARP * fbm(warpX, x / CLUSTER_WARP_SCALE, y / CLUSTER_WARP_SCALE);
    const wy = y + CLUSTER_WARP * fbm(warpY, x / CLUSTER_WARP_SCALE, y / CLUSTER_WARP_SCALE);
    let best = 0;
    for (const c of clusters) {
      const d = Math.hypot(wx - c.center.x / HEX_STEP, wy - c.center.y / HEX_STEP) / c.radius;
      const f = d <= plateau ? 1 : Math.max(0, (1 - d) / (1 - plateau));
      if (f > best) best = f;
    }
    return best;
  }

  return { clusters, density };
}

// Candidate centre for a system of `radius`. With no cluster field (the even
// layout) it darts anywhere on the map. A lone system darts anywhere and
// keeps only void spots; a cluster system darts near a random cluster and is
// kept with probability equal to the density there. Null = rejected.
function pickSystemCandidate(rng, field, radius, lone, mapRadius) {
  if (!field) return randomHexInRadius(rng, mapRadius - radius);
  if (lone) {
    const c = randomHexInRadius(rng, mapRadius - radius);
    return field.density(c.q, c.r) <= LONE_MAX_DENSITY ? c : null;
  }
  const cluster = field.clusters[Math.floor(rng() * field.clusters.length)];
  const offset = randomHexInRadius(rng, Math.round(cluster.radius * CLUSTER_SPREAD));
  const c = { q: cluster.q + offset.q, r: cluster.r + offset.r };
  if (hexDistance(c, { q: 0, r: 0 }) > mapRadius - radius) return null;
  return rng() < field.density(c.q, c.r) ? c : null;
}

function placeSystems(rng, field, settings) {
  const { systemRadiusMin, systemRadiusMax, systemGap, mapRadius } = settings;
  // Shrink-and-retry floor for a system that doesn't fit.
  const absMin = Math.max(3, systemRadiusMin - 1);
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
  for (let i = 1; i < settings.systemCount; i++) {
    const radius = systemRadiusMin + Math.floor(rng() * (systemRadiusMax - systemRadiusMin + 1));
    requests.push({
      radius,
      starCount: pickStarCount(rng),
      phases: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
      // Drawn in both layouts so the draw order matches; only clusters use it.
      lone: rng() < settings.loneShare / 100 && field !== null,
    });
  }
  requests.sort((a, b) => b.radius - a.radius);

  let skipped = 0;
  for (const request of requests) {
    let radius = request.radius;
    let placedThisSystem = false;
    while (radius >= absMin && !placedThisSystem) {
      for (let attempt = 0; attempt < MAX_DART_ATTEMPTS; attempt++) {
        const candidate = pickSystemCandidate(rng, field, radius, request.lone, mapRadius);
        if (!candidate) continue;
        const clear = placed.every(
          (other) => hexDistance(candidate, other) >= radius + other.radius + systemGap
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
            lone: request.lone,
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
// body placement. Star colours come from their own `starRng` stream (see
// generateMap), not `rng`.
function carveSystem(tiles, system, rng, starRng) {
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
    const key = axialKey(q, r);
    if (dist === 0 || starKeys.has(key)) continue; // star tiles, placed below
    // Neighboring systems' halos are allowed to touch/overlap by design (see
    // technical-architecture.md's Map Generation section), but whichever
    // system is processed first "owns" a hex it already reached — skip
    // entirely rather than overwrite it, so a later-processed system's halo
    // can never stomp an earlier system's already-placed band/planet/moon.
    if (tiles.has(key)) continue;

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
    tiles.set(key, { q, r, type: "band", band, regionId: system.id });
  }

  tiles.set(axialKey(system.q, system.r), {
    q: system.q,
    r: system.r,
    type: "star",
    // Sol is always the original yellow; the roll still happens so every
    // system draws the same number of starRng values.
    sprite: system.isHome ? (starRng(), "star") : pickStarSprite(starRng),
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
      sprite: pickStarSprite(starRng),
      band: "inner",
      regionId: system.id,
    });
  }

  return zoneCoords;
}

// 16 belt sprite variants (cropped from hills.png), rendered as-is — enough
// real variety that no synthetic rotation/flip is needed.
function pickBeltAppearance(rng) {
  return {
    variant: 1 + Math.floor(rng() * 16),
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
// already holding a star/planet/moon/wonder/belt is not.
function isClaimable(tiles, key) {
  const existing = tiles.get(key);
  return !existing || existing.type === "band";
}

// Picks one {planetClass, sprite} from the pooled sprite lists of the given
// classes, plus their moon-only sprites when `forMoon`. Always draws rng()
// even when the pool has only one entry, so that adding a sprite to a class
// (as the gas giant colour variants did) doesn't change how many rng() calls
// happen at this point — only which sprite gets picked.
function pickClassAndSprite(rng, classNames, forMoon = false) {
  const entries = [];
  for (const cls of classNames) {
    const sprites = [...PLANET_CLASSES[cls], ...(forMoon ? MOON_ONLY_SPRITES[cls] ?? [] : [])];
    for (const sprite of sprites) entries.push({ planetClass: cls, sprite });
  }
  return entries[Math.floor(rng() * entries.length)];
}

function rollInRange(rng, [lo, hi]) {
  return lo + rng() * (hi - lo);
}

function rollMoonLook(bodyRng) {
  return {
    scale: rollInRange(bodyRng, MOON_SCALE),
    offset: {
      x: rollInRange(bodyRng, [-MOON_OFFSET_MAX, MOON_OFFSET_MAX]),
      y: rollInRange(bodyRng, [-MOON_OFFSET_MAX, MOON_OFFSET_MAX]),
    },
  };
}

function rollInhabited(rng) {
  return rng() < INHABITED_CHANCE;
}

// Generalizes pickSecondaryStarOffsets' shuffle-then-slice approach, but
// filtered to membership in a specific zone pool (rather than a fixed
// 6-neighbor template) so a moon can never claim a hex outside its parent's
// own system/zone. Splices claimed entries out of `pool`. Returns however
// many distinct same-zone neighbors were actually available — gracefully
// fewer than maxCount if the planet's hex is crowded.
function claimNeighborsFromPool(rng, pool, center, maxCount) {
  if (maxCount <= 0) return [];
  const neighborKeys = new Set(axialNeighbors(center.q, center.r).map((n) => axialKey(n.q, n.r)));
  const candidateIdx = [];
  for (let i = 0; i < pool.length; i++) {
    if (neighborKeys.has(axialKey(pool[i].q, pool[i].r))) candidateIdx.push(i);
  }
  for (let i = candidateIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidateIdx[i], candidateIdx[j]] = [candidateIdx[j], candidateIdx[i]];
  }
  const takeCount = Math.min(maxCount, candidateIdx.length);
  const chosenIdx = candidateIdx.slice(0, takeCount).sort((a, b) => b - a);
  return chosenIdx.map((i) => pool.splice(i, 1)[0]);
}

// Rolls a 0..maxMoons moon count (always draws rng(), even if the result is
// 0) and claims that many of the parent's unclaimed same-zone neighbor
// hexes, writing a "moon" tile for each.
function placeMoons(tiles, system, pool, rng, bodyRng, parentCoord, maxMoons, moonClassPool) {
  const moonCount = Math.floor(rng() * (maxMoons + 1));
  const moonCoords = claimNeighborsFromPool(rng, pool, parentCoord, moonCount);
  for (const coord of moonCoords) {
    const { planetClass, sprite } = pickClassAndSprite(rng, moonClassPool, true);
    tiles.set(axialKey(coord.q, coord.r), {
      ...coord,
      type: "moon",
      planetClass,
      sprite,
      ...rollMoonLook(bodyRng),
      inhabited: rollInhabited(rng),
      parent: { q: parentCoord.q, r: parentCoord.r },
      regionId: system.id,
    });
  }
}

// Rolls 0..(span-1)+min bodies from `pool` (min..min+span-1 total), each
// retried up to 8 times against the shared `chosen` minimum-separation list
// (same pattern across inner/medium/outer zones — this replaces 3
// copy-pasted blocks). `rollBody(rng)` returns
// {planetClass, sprite, maxMoons, moonClassPool} for a successfully claimed
// body.
function placeBodiesInZone(tiles, system, pool, chosen, rng, bodyRng, { min, span, rollBody }) {
  const minSep = 2;
  const count = min + Math.floor(rng() * span);
  for (let i = 0; i < count; i++) {
    let tries = 8;
    while (tries-- > 0 && pool.length) {
      const coord = takeRandom(rng, pool);
      if (farEnough(coord, chosen, minSep)) {
        chosen.push(coord);
        const { planetClass, sprite, maxMoons, moonClassPool } = rollBody(rng);
        tiles.set(axialKey(coord.q, coord.r), {
          ...coord,
          type: "planet",
          planetClass,
          sprite,
          scale: rollInRange(bodyRng, PLANET_SCALE),
          inhabited: rollInhabited(rng),
          regionId: system.id,
        });
        if (maxMoons > 0) {
          placeMoons(tiles, system, pool, rng, bodyRng, coord, maxMoons, moonClassPool);
        }
        break;
      }
    }
  }
}

function populateSystem(tiles, system, zoneCoords, rng, bodyRng, anomalyChance) {
  const chosen = [];

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
        type: "planet",
        planetClass: "rocky",
        sprite: "planet-inhabited",
        // Earth always looks the same; the roll still happens, as for Sol's colour.
        scale: (bodyRng(), 1),
        inhabited: true,
        home: true,
        regionId: system.id,
      });
      // Earth always has exactly one moon, Luna: grey, inhabited, named in nameMap.
      for (const coord of claimNeighborsFromPool(rng, pool, earthCoord, 1)) {
        tiles.set(axialKey(coord.q, coord.r), {
          ...coord,
          type: "moon",
          planetClass: "rocky",
          sprite: "moon-grey",
          ...rollMoonLook(bodyRng),
          inhabited: true,
          luna: true,
          parent: { q: earthCoord.q, r: earthCoord.r },
          regionId: system.id,
        });
      }
    }
  }

  placeBodiesInZone(tiles, system, innerPool, chosen, rng, bodyRng, {
    min: 0,
    span: 4, // 0-3 bodies
    rollBody: (rng) => ({
      ...pickClassAndSprite(rng, ["molten", "toxic"]),
      maxMoons: 0,
      moonClassPool: null,
    }),
  });

  placeBodiesInZone(tiles, system, mediumPool, chosen, rng, bodyRng, {
    min: 0,
    span: 4, // 0-3 bodies
    rollBody: (rng) => ({
      ...pickClassAndSprite(rng, ["rocky"]),
      maxMoons: 2,
      moonClassPool: ["rocky", "molten"],
    }),
  });

  placeBodiesInZone(tiles, system, outerPool, chosen, rng, bodyRng, {
    min: 1,
    span: 3, // 1-3 bodies
    rollBody: (rng) => {
      const isGasGiant = rng() < 0.5;
      return {
        ...pickClassAndSprite(rng, isGasGiant ? ["gas-giant"] : ["ice"]),
        maxMoons: isGasGiant ? 5 : 2,
        moonClassPool: isGasGiant ? MOON_CLASS_NAMES : ["ice"],
      };
    },
  });

  if (rng() < 0.15) {
    const pool = outerPool.length ? outerPool : mediumPool.length ? mediumPool : innerPool;
    const coord = takeRandom(rng, pool);
    if (coord) {
      tiles.set(axialKey(coord.q, coord.r), { ...coord, type: "wonder-blackhole", regionId: system.id });
    }
  }

  // Anomalies carry no extra gen-time data — which of the four discovery
  // effects fires is rolled at trigger time (see state.js's triggerAnomaly),
  // same "nothing special to store yet" treatment as wonder-blackhole above.
  if (rng() < anomalyChance) {
    const pool = outerPool.length ? outerPool : mediumPool.length ? mediumPool : innerPool;
    const coord = takeRandom(rng, pool);
    if (coord) {
      tiles.set(axialKey(coord.q, coord.r), { ...coord, type: "anomaly", regionId: system.id });
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

function randomDesignation(rng, used) {
  const letter = () => String.fromCharCode(65 + Math.floor(rng() * 26));
  for (;;) {
    // Digit count first, so "GD-7" is as likely as "GD-4821".
    const digits = 1 + Math.floor(rng() * 4);
    const lo = 10 ** (digits - 1);
    const number = lo + Math.floor(rng() * (10 ** digits - lo));
    const name = `${letter()}${letter()}-${number}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

// Removes and returns a random unused name, or null once the pool runs dry.
function takeName(rng, pool, used) {
  while (pool.length > 0) {
    const [name] = pool.splice(Math.floor(rng() * pool.length), 1);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return null;
}

function namePool(names, uses) {
  return names.filter((n) => uses.includes(n.use)).map((n) => n.name);
}

// Bearing of `tile` seen from `center`, clockwise from north, in [0, 2π).
function bearing(center, tile) {
  const a = axialToPixel(center.q, center.r);
  const b = axialToPixel(tile.q, tile.r);
  const angle = Math.atan2(b.x - a.x, a.y - b.y);
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

function byBearing(center) {
  return (a, b) => bearing(center, a) - bearing(center, b);
}

function toRoman(n) {
  const numerals = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

// Final pass, after the whole map exists: its own stream, so naming never
// shifts a layout draw. Planets are numbered by hex distance from the primary
// star (ties clockwise from north), moons lettered clockwise around their
// parent, companion stars lettered B, C... clockwise around the primary.
function nameMap(tiles, systems, names, seed) {
  const rng = createRng(`${seed}:names`);
  const used = new Set(RESERVED_NAMES);
  const pools = {
    system: namePool(names, ["star", "any"]),
    planet: namePool(names, ["planet", "any"]),
    moon: namePool(names, ["moon", "any"]),
  };

  const bySystem = new Map(systems.map((s) => [s.id, { stars: [], planets: [], moons: [] }]));
  for (const tile of tiles.values()) {
    const group = bySystem.get(tile.regionId);
    if (!group) continue;
    if (tile.type === "star") group.stars.push(tile);
    else if (tile.type === "planet") group.planets.push(tile);
    else if (tile.type === "moon") group.moons.push(tile);
  }

  for (const system of systems) {
    const { stars, planets, moons } = bySystem.get(system.id);
    if (system.isHome) system.name = "Sol";
    else if (rng() < DESIGNATION_CHANCE) system.name = randomDesignation(rng, used);
    else system.name = takeName(rng, pools.system, used) ?? randomDesignation(rng, used);

    const primary = stars.find((t) => t.q === system.q && t.r === system.r);
    primary.name = system.name;
    stars
      .filter((t) => t !== primary)
      .sort(byBearing(primary))
      .forEach((t, i) => {
        t.name = `${system.name} ${String.fromCharCode(66 + i)}`;
      });

    const dist = (t) => hexDistance(primary, t);
    planets
      .sort((a, b) => dist(a) - dist(b) || bearing(primary, a) - bearing(primary, b))
      .forEach((t, i) => {
        t.name = `${system.name} ${toRoman(i + 1)}`;
      });

    const moonsByParent = new Map();
    for (const moon of moons) {
      const key = axialKey(moon.parent.q, moon.parent.r);
      if (!moonsByParent.has(key)) moonsByParent.set(key, []);
      moonsByParent.get(key).push(moon);
    }
    for (const [key, group] of moonsByParent) {
      const parent = tiles.get(key);
      group.sort(byBearing(parent)).forEach((t, i) => {
        t.name = `${parent.name}-${String.fromCharCode(97 + i)}`;
      });
    }

    for (const tile of [...planets, ...moons]) {
      if (tile.home) tile.ownName = "Earth";
      else if (tile.luna) tile.ownName = "Luna";
      else if (tile.inhabited) {
        tile.ownName = takeName(rng, pools[tile.type], used) ?? tile.name;
      }
    }
  }
}

// species.json's `planetoids` vocabulary for each planet class.
const CLASS_TO_PLANETOID = {
  rocky: "rocky",
  ice: "frozen",
  "gas-giant": "gas_giant",
  toxic: "toxic",
  molten: "molten",
};
const HUMAN_SPECIES = { key: "Humani", name: "Human" };

// Final pass, after naming: its own stream, so species never shift a layout
// or name draw (existing saves keep their map). Every inhabited planet/moon
// gets a random species that lives on its class (repeats allowed) and one of
// its names, the species key included; Earth and Luna are always Human.
// Stores `species: { id, name }`; the card looks the rest up by id.
function assignSpecies(tiles, species, seed) {
  if (!species.length) return;
  const rng = createRng(`${seed}:species`);
  const byPlanetoid = {};
  for (const s of species) {
    for (const p of s.planetoids) (byPlanetoid[p] ??= []).push(s);
  }
  const human = species.find((s) => s.key === HUMAN_SPECIES.key);
  for (const tile of tiles.values()) {
    if (!tile.inhabited) continue;
    if ((tile.home || tile.luna) && human) {
      tile.species = { id: human.id, name: HUMAN_SPECIES.name };
      continue;
    }
    const pool = byPlanetoid[CLASS_TO_PLANETOID[tile.planetClass]];
    if (!pool) continue;
    const pick = pool[Math.floor(rng() * pool.length)];
    const variants = [pick.key, ...pick.name_variants];
    tile.species = { id: pick.id, name: variants[Math.floor(rng() * variants.length)] };
  }
}

// After species, on its own stream so ethics never shift a layout, name or
// species draw (existing saves keep their map). Every inhabited planet/moon
// rolls its own ethics, independent of its species; Earth and Luna get
// HOME_ETHICS and take no draw. Worlds of the players' own species also get
// `kin`, which ethics.js reads for their attitude toward players.
function assignEthics(tiles, species, seed) {
  const rng = createRng(`${seed}:ethics`);
  const humanId = species.find((s) => s.key === HUMAN_SPECIES.key)?.id;
  for (const tile of tiles.values()) {
    if (!tile.inhabited) continue;
    tile.ethics = tile.home || tile.luna ? { ...HOME_ETHICS } : rollEthics(rng);
    if (tile.home || tile.luna || (humanId != null && tile.species?.id === humanId)) tile.kin = true;
  }
}

// Each system's second anomaly roll, on its own stream so it never shifts a
// layout draw (existing saves keep their map). Claims a plain band hex of
// the system, outer zone first, like the first roll in populateSystem.
function placeSecondAnomalies(tiles, systems, seed, anomalyChance) {
  const rng = createRng(`${seed}:anomalies`);
  const free = new Map();
  for (const tile of tiles.values()) {
    if (tile.type !== "band" || tile.band === "interstellar" || tile.regionId < 0) continue;
    const zones = free.get(tile.regionId) ?? free.set(tile.regionId, { inner: [], medium: [], outer: [] }).get(tile.regionId);
    zones[tile.band].push(tile);
  }
  for (const system of systems) {
    if (rng() >= anomalyChance) continue;
    const zones = free.get(system.id);
    if (!zones) continue;
    const pool = zones.outer.length ? zones.outer : zones.medium.length ? zones.medium : zones.inner;
    const tile = takeRandom(rng, pool);
    if (tile) tiles.set(axialKey(tile.q, tile.r), { q: tile.q, r: tile.r, type: "anomaly", band: tile.band, regionId: system.id });
  }
}

// Marks each anomaly as a wormhole or not, on its own stream so it never
// shifts a layout draw (existing saves keep their map). Runs after the
// deep-space sweep, which places anomalies of its own.
function assignAnomalyKinds(tiles, seed) {
  const rng = createRng(`${seed}:anomaly-kinds`);
  for (const tile of tiles.values()) {
    if (tile.type === "anomaly" && rng() < ANOMALY_WORMHOLE_SHARE) tile.anomalyKind = "wormhole";
  }
}

// System placement only: the cluster field (none in the even layout) and
// every system's centre and radius, without carving or populating tiles.
// Returns the main `rng` too, since generateMap keeps drawing from it.
function layout(seed, settings) {
  const rng = createRng(seed);
  const field = settings.layout === "clusters" ? buildClusterField(seed, settings) : null;
  const { systems, skipped } = placeSystems(rng, field, settings);
  return { rng, field, systems, skipped };
}

// The cheap first step of generateMap, for the start screen's preview: the
// same systems the full map will have for this seed and settings.
export function layoutSystems(seed, settings = DEFAULT_MAP_SETTINGS) {
  const { field, systems, skipped } = layout(seed, normalizeMapSettings(settings));
  return { systems, skipped, clusters: field ? field.clusters : [] };
}

export function generateMap({ seed, names = [], species = [], settings = DEFAULT_MAP_SETTINGS } = {}) {
  settings = normalizeMapSettings(settings);
  const { rng, field, systems, skipped } = layout(seed, settings);
  const { mapRadius } = settings;

  // Star colours use a separate stream derived from the same seed: drawing
  // them from `rng` would shift every later draw and change every seed's
  // layout (and break existing saves, whose map is regenerated from seed).
  const starRng = createRng(`${seed}:stars`);
  // Same reason for planet/moon sizes and moon offsets.
  const bodyRng = createRng(`${seed}:bodies`);

  const tiles = new Map();
  for (const system of systems) {
    const zoneCoords = carveSystem(tiles, system, rng, starRng);
    populateSystem(tiles, system, zoneCoords, rng, bodyRng, settings.anomalySystemChance / 100);
  }
  placeSecondAnomalies(tiles, systems, seed, settings.anomalySystemChance / 100);

  // Deep-space sweep: materialize every remaining hex in the map radius as a
  // plain deep-space backdrop tile, computed once here rather than inferred
  // per frame at render time.
  for (const { q, r } of hexesInRadius(mapRadius)) {
    const key = axialKey(q, r);
    if (!tiles.has(key)) {
      tiles.set(
        key,
        rng() < settings.anomalyDeepSpace / 1000
          ? { q, r, type: "anomaly", band: "deep-space", regionId: -1 }
          : { q, r, type: "band", band: "deep-space", regionId: -1 }
      );
    }
  }

  assignAnomalyKinds(tiles, seed);
  nameMap(tiles, systems, names, seed);
  assignSpecies(tiles, species, seed);
  assignEthics(tiles, species, seed);

  let earth = { q: 0, r: 0 };
  for (const tile of tiles.values()) {
    if (tile.home) {
      earth = { q: tile.q, r: tile.r };
      break;
    }
  }

  const totalHexCount = 3 * mapRadius * mapRadius + 3 * mapRadius + 1;

  return {
    seed,
    mapRadius,
    settings,
    systems,
    systemsSkipped: skipped,
    clusters: field ? field.clusters : [],
    totalHexCount,
    tiles,
    earth,
  };
}
