// Per-player game state: fog-of-war, position, XP, leveling/upgrades,
// turn/move budget, and localStorage persistence. Pure logic, no
// DOM/canvas — see main.js for wiring and render.js for how `discovered`
// drives what's actually drawn.
//
// Fog-of-war is deliberately kept OFF the shared `mapData.tiles` objects
// (both players read the same Map built once by generateMap) and instead
// lives as two independent per-player Sets of axialKey strings — storing it
// on the tile itself would leak one player's discoveries into the other's
// render pass immediately.

import { axialKey, hexesInRadius } from "./hexgrid.js";
import { UPGRADES, availableUpgrades } from "./upgrades.js";

export const PLAYER_COLORS = ["#4fd1ff", "#ff9f4f"];
export const SAVE_KEY = "explorer-game:save:v1";
const SAVE_VERSION = 1;

// --- XP table -------------------------------------------------------------
// Flat XP for a tile with no notable feature: plain band tiles (deep
// space), star tiles, and asteroid/Kuiper belts — game-design.md
// explicitly treats belts "as a normal explorable tile for XP purposes."
export const BASE_XP = 1;
// Planet/moon tiles, split by the independent `inhabited` boolean.
export const UNINHABITED_FEATURE_XP = 5;
export const INHABITED_FEATURE_XP = 10;
// Natural wonders (currently only wonder-blackhole) are the single
// highest flat reward, per game-design.md's Planets & Natural Wonders
// table. First-pass numbers — tunable during playtesting.
export const WONDER_XP = 20;

export function xpForTile(tile) {
  switch (tile.type) {
    case "wonder-blackhole":
      return WONDER_XP;
    case "planet":
    case "moon":
      return tile.inhabited ? INHABITED_FEATURE_XP : UNINHABITED_FEATURE_XP;
    default:
      return BASE_XP; // band (deep space), star, asteroid-belt
  }
}

// --- Leveling ---------------------------------------------------------
// `xp` is a MONOTONIC LIFETIME TOTAL — it must never be decremented, even
// if a future feature lets XP double as a spendable currency for
// something else (that would need its own separate spendable-balance
// field). `level` is derived from this lifetime total, so decrementing xp
// would make level go backwards, which must never happen.
//
// Cumulative XP to REACH a level (level 1 is free/0 XP, and costs grow
// each level — 100, 200, 300... more XP than the last). First-pass
// numbers, explicitly tunable alongside the upgrade catalog in
// upgrades.js.
export const LEVEL_XP_STEP = 50;
export function cumulativeXpForLevel(level) {
  return LEVEL_XP_STEP * level * (level - 1);
}
export function levelForXp(xp) {
  let level = 1;
  while (xp >= cumulativeXpForLevel(level + 1)) level += 1;
  return level;
}
export function playerLevel(player) {
  return levelForXp(player.xp);
}

// Reaching a level grants one upgrade PICK (not a fixed automatic effect —
// see upgrades.js) — how many the player has earned (by level) but not
// yet spent (recorded in unlockedUpgrades). Level 1 owes none; every
// level past that owes exactly one pick each.
export function pendingUpgradePicks(player) {
  return Math.max(0, playerLevel(player) - 1 - player.unlockedUpgrades.size);
}

export const MOVES_PER_TURN_BASE = 8;
export const VISION_RADIUS_BASE = 1;

function sumUpgradeBonus(player, field) {
  let total = 0;
  for (const id of player.unlockedUpgrades) {
    total += UPGRADES[id]?.[field] ?? 0;
  }
  return total;
}
export function movesPerTurnForPlayer(player) {
  return MOVES_PER_TURN_BASE + sumUpgradeBonus(player, "movesPerTurnBonus");
}
export function visionRadiusForPlayer(player) {
  return VISION_RADIUS_BASE + sumUpgradeBonus(player, "visionRadiusBonus");
}
export function xpBonusForPlayer(player) {
  return sumUpgradeBonus(player, "xpBonusPerTile");
}

// Records a chosen upgrade. Returns false (no-op) if it isn't actually
// offerable right now (already taken, or its prerequisite isn't yet) —
// defensive guard against a caller bug, mirrors revealTile's own "return
// whether it happened" pattern.
export function unlockUpgrade(player, upgradeId) {
  const offered = availableUpgrades(player.unlockedUpgrades).some((u) => u.id === upgradeId);
  if (!offered) return false;
  player.unlockedUpgrades.add(upgradeId);
  return true;
}

// Marks one tile discovered for `player` if it isn't already. Returns
// whether it was newly revealed. `awardXp:false` lets a tile be marked seen
// without granting XP (used for the initial spawn reveal).
export function revealTile(player, tile, { awardXp = true } = {}) {
  const key = axialKey(tile.q, tile.r);
  if (player.discovered.has(key)) return false;
  player.discovered.add(key);
  if (awardXp) player.xp += xpForTile(tile) + xpBonusForPlayer(player);
  return true;
}

// Reveals every tile within `radius` (default: the player's derived,
// upgrade-dependent vision radius) of `center` (itself always included, at
// offset {0,0}). Both the initial spawn reveal and every step of a move
// funnel through this with the default radius; an anomaly's local-reveal
// effect passes an explicit, larger radius instead.
export function revealAround(mapData, player, center, { awardXp = true, radius } = {}) {
  const r = radius ?? visionRadiusForPlayer(player);
  for (const offset of hexesInRadius(r)) {
    const tile = mapData.tiles.get(axialKey(center.q + offset.q, center.r + offset.r));
    if (tile) revealTile(player, tile, { awardXp });
  }
}

function createPlayer(color) {
  return {
    color,
    q: 0,
    r: 0,
    xp: 0,
    unlockedUpgrades: new Set(), // chosen upgrade ids — real progress, persisted
    discovered: new Set(),
  };
}

// Walks every hex in `path` (path includes the start hex), revealing the
// vision disk around each step so a move's fog clears in a swath along the
// route rather than only at the single destination tile, then moves the
// player to the path's final hex.
export function applyMove(mapData, player, path) {
  for (const hex of path) {
    revealAround(mapData, player, hex);
  }
  const last = path[path.length - 1];
  player.q = last.q;
  player.r = last.r;
}

export function createNewGame(mapData) {
  const players = PLAYER_COLORS.map((color) => {
    const player = createPlayer(color);
    player.q = mapData.earth.q;
    player.r = mapData.earth.r;
    revealAround(mapData, player, mapData.earth, { awardXp: false });
    return player;
  });
  return {
    activePlayerIndex: 0,
    movesRemaining: movesPerTurnForPlayer(players[0]),
    turnNumber: 1,
    won: false,
    // Shared across both players, NOT per-player — an anomaly tile is a
    // one-shot world resource: whichever player lands on it first destroys
    // it (reverts to a plain band tile) for both. Stores the axialKey of
    // every destroyed anomaly so loadGame can replay the destruction onto a
    // freshly-regenerated mapData (mapData itself is never persisted — see
    // applyDestroyedAnomalies below).
    destroyedAnomalies: new Set(),
    players,
  };
}

// --- Anomalies --------------------------------------------------------
// Visiting an anomaly tile destroys it (one-time only, shared across both
// players — see createNewGame's destroyedAnomalies comment) and triggers
// one of four random effects. Unlike every other discovery (XP for
// planets/wonders), this does NOT fire on mere reveal/vision — only when a
// player's move actually lands on the tile (confirmed design choice; see
// docs/game-design.md's Anomalies section).
export const ANOMALY_BULK_XP = 50; // first-pass, tunable
export const ANOMALY_REVEAL_RADIUS = 5; // first-pass, tunable — bigger than
                                         // any MVP2 vision radius

const ANOMALY_EFFECTS = ["wormhole", "bulk-xp", "local-reveal", "free-upgrade"];

// If `player` is standing on a still-live anomaly tile, destroys it
// (mutates the shared mapData tile in place to a plain band tile, so it
// renders and behaves as empty space for both players from now on) and
// records the destruction so it survives a reload. Returns the
// pre-destruction tile for the caller to pass to triggerAnomaly, or null if
// the player isn't on a live anomaly.
export function checkAnomalyLanding(mapData, gameState, player) {
  const tile = mapData.tiles.get(axialKey(player.q, player.r));
  if (!tile || tile.type !== "anomaly") return null;
  gameState.destroyedAnomalies.add(axialKey(tile.q, tile.r));
  tile.type = "band";
  return tile;
}

// Replays previously-destroyed anomalies onto a freshly-regenerated
// mapData (generateMap is deterministic from the seed alone and knows
// nothing about session history, so without this a reload would
// resurrect every anomaly a player already consumed).
export function applyDestroyedAnomalies(mapData, gameState) {
  for (const key of gameState.destroyedAnomalies) {
    const tile = mapData.tiles.get(key);
    if (tile) tile.type = "band";
  }
}

// Resolves one of the four anomaly effects for `player` and mutates state
// accordingly. `rng` defaults to Math.random (this doesn't need to be
// seeded/deterministic like map generation does — same as the plain
// Math.random() already used for "New Game" seed strings in main.js) but is
// injectable so tests can force every branch. If "free ability grant" is
// rolled but the catalog has nothing left to offer, rerolls among the
// other three rather than wasting the anomaly on a no-op.
export function triggerAnomaly(mapData, player, tile, rng = Math.random) {
  let effect = ANOMALY_EFFECTS[Math.floor(rng() * ANOMALY_EFFECTS.length)];
  if (effect === "free-upgrade" && availableUpgrades(player.unlockedUpgrades).length === 0) {
    const fallback = ANOMALY_EFFECTS.filter((e) => e !== "free-upgrade");
    effect = fallback[Math.floor(rng() * fallback.length)];
  }
  switch (effect) {
    case "wormhole": {
      const candidates = [...mapData.tiles.values()].filter((t) => t.type !== "anomaly");
      const dest = candidates[Math.floor(rng() * candidates.length)];
      player.q = dest.q;
      player.r = dest.r;
      revealAround(mapData, player, dest);
      return {
        effect,
        message: "Wormhole! Your ship is yanked through a tear in space to a new region of the map.",
      };
    }
    case "bulk-xp":
      player.xp += ANOMALY_BULK_XP;
      return { effect, message: `Salvaged data cache: +${ANOMALY_BULK_XP} XP.` };
    case "local-reveal":
      // awardXp defaults true — the bonus discoveries this uncovers should
      // pay out XP exactly like any other reveal, not just unfog silently.
      revealAround(mapData, player, player, { radius: ANOMALY_REVEAL_RADIUS });
      return { effect, message: "Long-range sensor burst reveals the surrounding region." };
    case "free-upgrade": {
      const options = availableUpgrades(player.unlockedUpgrades);
      const choice = options[Math.floor(rng() * options.length)];
      unlockUpgrade(player, choice.id);
      return { effect, message: `Salvaged tech installed: ${choice.name}!` };
    }
  }
}

// Every placed system's primary star tile sits at exactly (system.q,
// system.r) (see mapgen.js's carveSystem) — win condition is the union of
// both players' discovered sets covering every one of those coordinates.
export function checkWinCondition(mapData, players) {
  return mapData.systems.every((system) => {
    const key = axialKey(system.q, system.r);
    return players.some((player) => player.discovered.has(key));
  });
}

export function serializeState(seed, gameState) {
  return {
    version: SAVE_VERSION,
    seed,
    activePlayerIndex: gameState.activePlayerIndex,
    movesRemaining: gameState.movesRemaining,
    turnNumber: gameState.turnNumber,
    destroyedAnomalies: [...gameState.destroyedAnomalies],
    players: gameState.players.map((player) => ({
      color: player.color,
      q: player.q,
      r: player.r,
      xp: player.xp,
      unlockedUpgrades: [...player.unlockedUpgrades],
      discovered: [...player.discovered],
    })),
  };
}

export function deserializeState(raw) {
  return {
    activePlayerIndex: raw.activePlayerIndex,
    movesRemaining: raw.movesRemaining,
    // Old saves predating the turn counter default to turn 1 rather than
    // surfacing as "Turn undefined" in the HUD.
    turnNumber: raw.turnNumber ?? 1,
    won: false,
    // Old saves predating MVP3 have no destroyed anomalies yet.
    destroyedAnomalies: new Set(raw.destroyedAnomalies ?? []),
    players: raw.players.map((p) => ({
      color: p.color,
      q: p.q,
      r: p.r,
      xp: p.xp,
      // Old saves predating leveling (or a stale visionRadius field, now
      // fully derived and no longer read) start with no upgrades chosen.
      unlockedUpgrades: new Set(p.unlockedUpgrades ?? []),
      discovered: new Set(p.discovered),
    })),
  };
}

export function saveGame(seed, gameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState(seed, gameState)));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — persistence is
    // a nice-to-have, never fatal to gameplay.
  }
}

// Returns the saved { seed, gameState } pair, or null if there's no save, it
// can't be parsed, or it's from an incompatible schema version.
export function loadGame() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== SAVE_VERSION) return null;
    return { seed: parsed.seed, gameState: deserializeState(parsed) };
  } catch {
    return null;
  }
}
