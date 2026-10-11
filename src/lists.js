// Navigation helpers for large maps: the ranking and worlds lists behind the
// top bar's icon buttons, and the zoom that fits the whole map on screen.
// Pure data (no DOM) so they can be verified headlessly; main.js renders them.

import { axialKey, hexDistance, HEX_SIZE, HEX_WIDTH, HEX_HEIGHT } from "./hexgrid.js";
import { playerLevel } from "./state.js";
import { attitudeToPlayers } from "./ethics.js";

// Never zoom out further than needed just because the map is small.
export const MAX_MIN_ZOOM = 0.25;
// Share of the screen the whole map may fill at the fit zoom.
export const FIT_MARGIN = 0.92;

// Every player, highest level first, then XP, then turn order, as
// { player, index, level, xp, upgrades }. Upgrades counts spent picks,
// repeatable Instant Ship Repairs included.
export function rankPlayers(players) {
  return players
    .map((player, index) => ({
      player,
      index,
      level: playerLevel(player),
      xp: player.xp,
      upgrades: player.unlockedUpgrades.size + (player.instantRepairsUsed ?? 0),
    }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp || a.index - b.index);
}

// Inhabited worlds the team has discovered, nearest to `from` first, as
// { tile, name, attitude, distance }.
export function worldsList(mapData, discovered, from) {
  const out = [];
  for (const tile of mapData.tiles.values()) {
    if (!tile.ethics || !discovered.has(axialKey(tile.q, tile.r))) continue;
    out.push({
      tile,
      name: tile.ownName ?? tile.name,
      attitude: attitudeToPlayers(tile),
      distance: hexDistance(from, tile),
    });
  }
  out.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
  return out;
}

// The zoom at which a hexagonal map of `mapRadius` fits a viewW x viewH
// screen (flat-top hexes: ±1.5·S·R across, ±√3·S·R down, plus half a tile).
export function fitZoom(mapRadius, viewW, viewH) {
  const halfW = 1.5 * HEX_SIZE * mapRadius + HEX_WIDTH / 2;
  const halfH = Math.sqrt(3) * HEX_SIZE * mapRadius + HEX_HEIGHT / 2;
  return FIT_MARGIN * Math.min(viewW / (2 * halfW), viewH / (2 * halfH));
}

// The furthest the camera may zoom out: the whole map, but no further out
// than MAX_MIN_ZOOM on small maps.
export function minZoomFor(mapRadius, viewW, viewH) {
  return Math.min(MAX_MIN_ZOOM, fitZoom(mapRadius, viewW, viewH));
}
