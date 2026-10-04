// Per-player game state: fog-of-war, position, XP, turn/move budget, and
// localStorage persistence. Pure logic, no DOM/canvas — see main.js for
// wiring and render.js for how `discovered` drives what's actually drawn.
//
// Fog-of-war is deliberately kept OFF the shared `mapData.tiles` objects
// (both players read the same Map built once by generateMap) and instead
// lives as two independent per-player Sets of axialKey strings — storing it
// on the tile itself would leak one player's discoveries into the other's
// render pass immediately.

import { axialKey, hexesInRadius } from "./hexgrid.js";

export const MOVES_PER_TURN = 8;
export const BASE_XP = 1;
// Flat XP bonus for any planet/moon/wonder-blackhole tile. No distinction by
// inhabited/class/wonder-vs-planet yet — that real table is MVP2 scope (see
// docs/game-design.md's Planets & Natural Wonders XP table). This is
// deliberately the simplest thing that satisfies "worth more than a blank
// tile" for MVP1.
export const FEATURE_XP = 2;
// Hexes within this many steps of the ship are auto-revealed whenever the
// ship occupies or passes through a hex — not just the single hex it's on.
// Stored per-player (not a global constant used directly) so a future MVP's
// leveling unlock can simply increase one player's number in place.
export const DEFAULT_VISION_RADIUS = 1;
export const PLAYER_COLORS = ["#4fd1ff", "#ff9f4f"];
export const SAVE_KEY = "explorer-game:save:v1";
const SAVE_VERSION = 1;

function isFeatureTile(tile) {
  return tile.type === "planet" || tile.type === "moon" || tile.type === "wonder-blackhole";
}

export function xpForTile(tile) {
  return isFeatureTile(tile) ? FEATURE_XP : BASE_XP;
}

// Marks one tile discovered for `player` if it isn't already. Returns
// whether it was newly revealed. `awardXp:false` lets a tile be marked seen
// without granting XP (used for the initial spawn reveal).
export function revealTile(player, tile, { awardXp = true } = {}) {
  const key = axialKey(tile.q, tile.r);
  if (player.discovered.has(key)) return false;
  player.discovered.add(key);
  if (awardXp) player.xp += xpForTile(tile);
  return true;
}

// Reveals every tile within `player.visionRadius` of `center` (which is
// itself always included, at offset {0,0}). The only place vision radius is
// actually applied — both the initial spawn reveal and every step of a move
// funnel through this, so increasing visionRadius later needs no other
// code changes.
export function revealAround(mapData, player, center, { awardXp = true } = {}) {
  for (const offset of hexesInRadius(player.visionRadius)) {
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
    visionRadius: DEFAULT_VISION_RADIUS,
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
    movesRemaining: MOVES_PER_TURN,
    turnNumber: 1,
    won: false,
    players,
  };
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
    players: gameState.players.map((player) => ({
      color: player.color,
      q: player.q,
      r: player.r,
      xp: player.xp,
      visionRadius: player.visionRadius,
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
    players: raw.players.map((p) => ({
      color: p.color,
      q: p.q,
      r: p.r,
      xp: p.xp,
      visionRadius: p.visionRadius ?? DEFAULT_VISION_RADIUS,
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
