// emc, Exotic Matter Currency: each player's own balance (`player.emc`), with
// no cap and nothing to spend it on yet. The first way to earn it is pirate
// bounties: when a player destroys a pirate ship or base, every inhabited
// world the player's team has discovered within BOUNTY_RADIUS hexes of the
// kill, and whose attitude toward pirates is Neutral or worse, pays a bounty.
// Pure: the caller routes the returned notices.

import { axialKey, hexDistance } from "./hexgrid.js";
import { attitudeToPirates } from "./ethics.js";
import { stateLabel } from "./government.js";

// Tunable.
export const BOUNTY_RADIUS = 12;
export const SHIP_BOUNTY_EMC = 100;
export const BASE_BOUNTY_EMC = 300;

const BOUNTY_TARGET_NAMES = { ship: "pirate raider", base: "pirate base" };

// The worlds that pay for a kill at (q, r), closest first. Only discovered
// ones, so a notice never gives away a world still hidden by fog.
export function bountyWorlds(mapData, q, r, discovered) {
  const site = { q, r };
  const worlds = [];
  for (const tile of mapData.tiles.values()) {
    if (!tile.inhabited || !tile.ethics) continue;
    const distance = hexDistance(tile, site);
    if (distance > BOUNTY_RADIUS || attitudeToPirates(tile) > 0) continue;
    if (!discovered.has(axialKey(tile.q, tile.r))) continue;
    worlds.push({ tile, distance });
  }
  return worlds.sort((a, b) => a.distance - b.distance);
}

// Pays `player` every bounty for destroying a pirate `kind` ("ship" or
// "base") at (q, r). Returns the total and one notification entry per
// paying world, pointing at that world.
export function awardBounties(mapData, player, kind, q, r) {
  const amount = kind === "base" ? BASE_BOUNTY_EMC : SHIP_BOUNTY_EMC;
  const notices = bountyWorlds(mapData, q, r, player.discovered).map(({ tile, distance }) => ({
    kind: "bounty",
    q: tile.q,
    r: tile.r,
    message: `${stateLabel(tile)} paid a ${formatEmc(amount)} bounty for a ${BOUNTY_TARGET_NAMES[kind]} destroyed ${
      distance === 0 ? "at" : `${distance} ${distance === 1 ? "hex" : "hexes"} from`
    } ${tile.ownName}.`,
  }));
  const total = amount * notices.length;
  player.emc += total;
  return { total, notices };
}

// E.g. "1,250 emc".
export function formatEmc(amount) {
  return `${amount.toLocaleString("en-US")} emc`;
}
