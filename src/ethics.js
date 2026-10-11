// Ethics of inhabited worlds and the attitudes they imply (display only for
// now: nothing in the game acts on them yet). Each world has a position on
// four axes, -2..+2, the first-named pole negative. Attitudes toward players
// and pirates, and diplomatic states between worlds, are computed from ethics
// alone (static, never persisted), each on a -2..+2 scale.

import { axialKey, hexDistance } from "./hexgrid.js";

export const AXES = [
  { id: "spirit", labels: ["Extreme spiritualist", "Spiritualist", "Balanced", "Materialist", "Extreme materialist"] },
  { id: "war", labels: ["Extreme pacifist", "Pacifist", "Balanced", "Militarist", "Extreme militarist"] },
  { id: "order", labels: ["Extreme authoritarian", "Authoritarian", "Balanced", "Individualist", "Extreme individualist"] },
  { id: "xeno", labels: ["Extreme xenophobe", "Xenophobe", "Balanced", "Xenophile", "Extreme xenophile"] },
];

// Chance (percent) of positions -2..+2, the same for every axis — tunable.
export const ETHIC_WEIGHTS = [10, 20, 40, 20, 10];

// Earth and Luna don't roll: the players' home is fixed.
export const HOME_ETHICS = { spirit: 1, war: 0, order: 1, xeno: 1 };

export const ATTITUDE_LABELS = ["Hostile", "Wary", "Neutral", "Friendly", "Allied"];

// Toward players: xenophiles welcome alien explorers, materialists value a
// science mission. Worlds of the players' own species (`tile.kin`, set by
// mapgen) count as fully xenophile toward them.
export const PLAYER_XENO_WEIGHT = 2; // tunable
export const PLAYER_SPIRIT_WEIGHT = 1; // tunable
export const KIN_XENO_SCORE = 4; // tunable — PLAYER_XENO_WEIGHT x extreme xenophile

// Toward pirates: individualists tolerate freebooters, authoritarians want
// order; militarists hunt raiders, pacifists appease them. The bias makes a
// balanced world start Wary.
export const PIRATE_ORDER_WEIGHT = 2; // tunable
export const PIRATE_WAR_WEIGHT = 1; // tunable
export const PIRATE_BIAS = -2; // tunable

// Between worlds: each world holds an opinion of every other, 0 (neutral) by
// default, built from modifiers below. Opinion maps to a diplomatic state,
// and the state two worlds share is the lower of their two views. Worlds
// WORLD_RELATION_RANGE hexes or more apart are always at peace (Neutral).
//
// Spirit, war and order: viewer and target on opposite sides of an axis
// cost opinion, on the same side gain it, except that spiritualists (spirit
// < 0) lose it to each other too, since their religions rival each other.
// Indexed [viewer intensity][target intensity], intensity 1 or 2 (0 = none).
export const ETHIC_OPINION = [
  [0, 0, 0],
  [0, 25, 75],
  [0, 50, 150],
]; // tunable
export const OPINION_AXES = ["spirit", "war", "order"];
// Xeno is about everyone: xenophobes dislike every other world, xenophiles
// like every other world, indexed by the viewer's xeno -2..+2.
export const XENO_OPINION = [-75, -25, 0, 25, 75]; // tunable
export const SAME_SPECIES_OPINION = 50; // tunable

export const DIPLOMATIC_STATES = ["War", "Rivalry", "Neutral", "Friendship", "Alliance"];
// Opinion at or past these gives the state — tunable.
export const WAR_OPINION = -100;
export const RIVALRY_OPINION = -50;
export const FRIENDSHIP_OPINION = 50;
export const ALLIANCE_OPINION = 100;
export const WORLD_RELATION_RANGE = 40; // hexes — tunable
export const KNOWN_WORLDS_LIMIT = 6; // world card list length — tunable

export function rollEthics(rng) {
  const total = ETHIC_WEIGHTS.reduce((a, b) => a + b, 0);
  const ethics = {};
  for (const axis of AXES) {
    let roll = rng() * total;
    let i = 0;
    while (i < ETHIC_WEIGHTS.length - 1 && roll >= ETHIC_WEIGHTS[i]) roll -= ETHIC_WEIGHTS[i++];
    ethics[axis.id] = i - 2;
  }
  return ethics;
}

export function ethicLabel(axisId, value) {
  return AXES.find((a) => a.id === axisId).labels[value + 2];
}

// Raw score -> attitude -2..+2. Symmetric thresholds, no rounding.
export function attitudeTier(raw) {
  if (raw >= 4) return 2;
  if (raw >= 2) return 1;
  if (raw <= -4) return -2;
  if (raw <= -2) return -1;
  return 0;
}

export function attitudeLabel(attitude) {
  return ATTITUDE_LABELS[attitude + 2];
}

export function attitudeToPlayers(tile) {
  const { spirit, xeno } = tile.ethics;
  const xenoScore = tile.kin ? KIN_XENO_SCORE : PLAYER_XENO_WEIGHT * xeno;
  return attitudeTier(xenoScore + PLAYER_SPIRIT_WEIGHT * spirit);
}

export function attitudeToPirates(tile) {
  const { order, war } = tile.ethics;
  return attitudeTier(PIRATE_ORDER_WEIGHT * order - PIRATE_WAR_WEIGHT * war + PIRATE_BIAS);
}

// A's opinion of B (distance doesn't change it, only the range cut-off).
export function worldOpinion(a, b) {
  let opinion = XENO_OPINION[a.ethics.xeno + 2];
  if (a.species && b.species && a.species.id === b.species.id) opinion += SAME_SPECIES_OPINION;
  for (const axis of OPINION_AXES) {
    const va = a.ethics[axis], vb = b.ethics[axis];
    if (!va || !vb) continue;
    const weight = ETHIC_OPINION[Math.abs(va)][Math.abs(vb)];
    const sameSide = Math.sign(va) === Math.sign(vb);
    opinion += sameSide && !(axis === "spirit" && va < 0) ? weight : -weight;
  }
  return opinion;
}

// Opinion -> state, -2 (War) .. +2 (Alliance).
export function diplomaticTier(opinion) {
  if (opinion <= WAR_OPINION) return -2;
  if (opinion <= RIVALRY_OPINION) return -1;
  if (opinion >= ALLIANCE_OPINION) return 2;
  if (opinion >= FRIENDSHIP_OPINION) return 1;
  return 0;
}

export function diplomaticLabel(state) {
  return DIPLOMATIC_STATES[state + 2];
}

// The state between two worlds: the lower of their two views; Neutral at or
// past WORLD_RELATION_RANGE.
export function diplomaticState(a, b) {
  if (hexDistance(a, b) >= WORLD_RELATION_RANGE) return 0;
  return Math.min(diplomaticTier(worldOpinion(a, b)), diplomaticTier(worldOpinion(b, a)));
}

// The world card's "Known worlds": other inhabited worlds within range that
// `discovered` holds, closest first, as { tile, distance, state }.
export function knownWorldRelations(mapData, tile, discovered, limit = KNOWN_WORLDS_LIMIT) {
  const out = [];
  for (const other of mapData.tiles.values()) {
    if (other === tile || !other.ethics || !discovered.has(axialKey(other.q, other.r))) continue;
    const distance = hexDistance(tile, other);
    if (distance >= WORLD_RELATION_RANGE) continue;
    out.push({ tile: other, distance, state: diplomaticState(tile, other) });
  }
  out.sort((x, y) => x.distance - y.distance);
  return out.slice(0, limit);
}
