// Tile report: the facts shown when a player long-presses a hex. Pure data
// (no DOM) so it can be verified headlessly; main.js turns the result into
// the #tile-report window. Everything is seen from the ACTIVE player's
// side: an undiscovered hex reveals nothing beyond its coordinates and
// distance, and pirates are listed only on discovered hexes (the same fog
// rule render.js draws them by).

import { axialKey, hexDistance } from "./hexgrid.js";
import { terrainDefenseBonus } from "./combat.js";
import {
  xpForTile,
  maxHealthForPlayer,
  attackForPlayer,
  playerLevel,
  movesPerTurnForPlayer,
  visionRadiusForPlayer,
} from "./state.js";
import { PIRATE_BASE_ATTACK, PIRATE_BASE_SUPPORT_CAP } from "./pirates.js";
import { shipTitle } from "./setup.js";

export const CLASS_DISPLAY_NAMES = {
  rocky: "Rocky",
  ice: "Ice",
  "gas-giant": "Gas giant",
  toxic: "Toxic",
  molten: "Molten",
};

// Star sprite (see star-classes.js's STAR_COLORS) -> colour label.
const STAR_COLOR_NAMES = {
  "star-red": "Red",
  star: "Yellow",
  "star-orange": "Orange",
  "star-white": "White",
  "star-blue": "Blue",
};

const ZONE_NAMES = {
  inner: "Inner",
  medium: "Medium",
  outer: "Outer",
  interstellar: "Interstellar",
  "deep-space": "Deep space",
};

const FEATURE_TITLES = {
  band: "Empty space",
  "asteroid-belt": "Asteroid belt",
  "wonder-blackhole": "Black hole",
  anomaly: "Anomaly",
};

function distanceText(viewer, q, r, movesRemaining) {
  const d = hexDistance({ q: viewer.q, r: viewer.r }, { q, r });
  if (d === 0) return "Your ship is here";
  const hexes = `${d} hex${d === 1 ? "" : "es"}`;
  return d <= movesRemaining ? `${hexes}, reachable` : `${hexes}, out of range this turn`;
}

function worldName(tile) {
  return tile.ownName ?? tile.name;
}

function describeTile(mapData, tile) {
  const rows = [];
  let title;
  if (tile.type === "star") {
    title = tile.name ?? "Star";
    rows.push(["Type", `${STAR_COLOR_NAMES[tile.sprite] ?? "Unknown"} star`]);
  } else if (tile.type === "planet" || tile.type === "moon") {
    title = worldName(tile);
    rows.push(["Type", `${CLASS_DISPLAY_NAMES[tile.planetClass] ?? ""} ${tile.type}`.trim()]);
    if (tile.ownName && tile.name && tile.ownName !== tile.name) {
      rows.push(["Designation", tile.name]);
    }
    if (tile.type === "moon" && tile.parent) {
      const parent = mapData.tiles.get(axialKey(tile.parent.q, tile.parent.r));
      if (parent) rows.push(["Orbits", worldName(parent)]);
    }
    rows.push([
      "Life",
      tile.inhabited && tile.species ? `Inhabited by the ${tile.species.name}` : "Uninhabited",
    ]);
  } else if (tile.type === "anomaly") {
    const wormhole = tile.anomalyKind === "wormhole";
    title = wormhole ? "Wormhole" : FEATURE_TITLES.anomaly;
    rows.push([
      "Effect",
      wormhole
        ? "Ending a move here relocates your ship to a random spot"
        : "Ending a move here gives XP, a sensor sweep or an upgrade",
    ]);
  } else {
    title = FEATURE_TITLES[tile.type] ?? tile.type;
  }

  const system =
    tile.regionId === -1 || tile.regionId == null
      ? "Deep space"
      : mapData.systems.find((s) => s.id === tile.regionId)?.name ?? "Unnamed system";
  rows.push(["System", system]);
  if (tile.band) rows.push(["Zone", ZONE_NAMES[tile.band] ?? tile.band]);
  const bonus = terrainDefenseBonus(tile);
  rows.push(["Defense bonus", bonus > 0 ? `+${Math.round(bonus * 100)}%` : "None"]);
  rows.push(["Discovery XP", String(xpForTile(tile))]);
  return { title, rows };
}

function playerEntity(player, isViewer) {
  return {
    title: `${shipTitle(player)} — ${player.name}${isViewer ? " (you)" : ""}`,
    rows: [
      ["HP", `${player.currentHealth}/${maxHealthForPlayer(player)}`],
      ["Attack", String(attackForPlayer(player))],
      ["Level", String(playerLevel(player))],
      ["Moves/turn", String(movesPerTurnForPlayer(player))],
      ["Vision", String(visionRadiusForPlayer(player))],
    ],
  };
}

export function buildTileReport(mapData, gameState, q, r) {
  const viewerIndex = gameState.activePlayerIndex;
  const viewer = gameState.players[viewerIndex];
  const tile = mapData.tiles.get(axialKey(q, r)) ?? null;
  const discovered = !!tile && viewer.discovered.has(axialKey(q, r));

  let title;
  let rows;
  if (!tile) {
    title = "Beyond the map";
    rows = [];
  } else if (!discovered) {
    title = "Unexplored";
    rows = [];
  } else {
    ({ title, rows } = describeTile(mapData, tile));
  }
  if (tile) rows.unshift(["Distance", distanceText(viewer, q, r, gameState.movesRemaining)]);

  // Player ships are always drawn, so they are listed even under fog.
  const entities = [];
  gameState.players.forEach((player, index) => {
    if (player.q === q && player.r === r) {
      entities.push(playerEntity(player, index === viewerIndex));
    }
  });
  if (discovered) {
    for (const base of gameState.pirateBases) {
      if (base.q !== q || base.r !== r) continue;
      const raiders = gameState.pirateShips.filter((s) => s.baseId === base.id).length;
      entities.push({
        title: "Pirate base",
        rows: [
          ["HP", `${base.health}/${base.maxHealth}`],
          ["Attack", String(PIRATE_BASE_ATTACK)],
          ["Raiders", `${raiders}/${PIRATE_BASE_SUPPORT_CAP}`],
        ],
      });
    }
    for (const ship of gameState.pirateShips) {
      if (ship.q !== q || ship.r !== r) continue;
      entities.push({
        title: "Pirate raider",
        rows: [
          ["HP", `${ship.health}/${ship.maxHealth}`],
          ["Attack", String(ship.attack)],
        ],
      });
    }
  }

  const worldTile =
    discovered && (tile.type === "planet" || tile.type === "moon") && tile.inhabited && tile.species
      ? tile
      : null;

  return { title, coords: `${q}, ${r}`, rows, entities, worldTile };
}
