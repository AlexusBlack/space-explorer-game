// Pirate base/ship spawn, production, roam AI, and combat orchestration
// (MVP4). Pirate entities are dynamic gameState records layered on top of
// whatever tile they're standing on — unlike MVP3's anomaly destruction,
// nothing here mutates mapData.tiles, so there's no "replay onto a
// freshly-regenerated map" step needed on load (see state.js's
// createNewGame comment).

import { axialKey, axialNeighbors, hexDistance, hexesInRadius } from "./hexgrid.js";
import { resolveCombat, terrainDefenseBonus } from "./combat.js";
import { attackForPlayer, maxHealthForPlayer, applyShipLoss, SHIP_LOSS_XP_PENALTY } from "./state.js";
import { shipTitle } from "./setup.js";

export const PIRATE_BASE_SPAWN_CHANCE = 0.05; // per eligible region, per round — tunable
// ~100 HP/attack scale (Civ5-like) — see state.js's HEALTH_BASE/ATTACK_BASE
// comment for why this scale, not the original MVP4 first-pass numbers
// (PIRATE_BASE_MAX_HEALTH was 30, PIRATE_SHIP_MAX_HEALTH was 8,
// PIRATE_SHIP_ATTACK was 4, PIRATE_BASE_ATTACK was 6).
export const PIRATE_BASE_MAX_HEALTH = 100; // tunable — same pool as a raider/player ship
export const PIRATE_BASE_ATTACK = 8; // tunable — bases don't initiate attacks in this MVP,
                                      // but still need an attack value when a player
                                      // attacks one (see resolvePlayerAttack); hits harder
                                      // than a raider (6) to stay a credible siege target
export const PIRATE_BASE_SUPPORT_CAP = 3; // max concurrent ships per base — tunable
export const PIRATE_BASE_PRODUCTION_CHANCE = 0.5; // per base under cap, per round — tunable
export const PIRATE_SHIP_MAX_HEALTH = 100; // tunable
export const PIRATE_SHIP_ATTACK = 6; // tunable — player's ATTACK_BASE is ~2x this
export const PIRATE_BASE_BOUNTY_XP = 30; // tunable
// Flat cost for a melee attack action, replacing the earlier "full tapped
// distance" rule — regardless of how far the ship traveled to engage (or
// whether it was already adjacent), attacking costs exactly this many
// moves. Clamped at 0 by the caller (main.js), never goes negative.
export const ATTACK_MOVE_COST = 4; // tunable
export const PIRATE_SHIP_DETECTION_RADIUS = 6; // hexes — tunable
// Chase chance is no longer a flat value — it's this CEILING, scaled down
// by how a pirate ship's own health fraction compares to the specific
// player it's facing (see stepPirateShip's healthRatio). At full relative
// health (its HP% >= the player's HP%, clamped to 1) it chases 90% of the
// time; the weaker it gets relative to that player, the less it chases.
export const PIRATE_CHASE_CHANCE = 0.9; // tunable — ceiling, scaled by health ratio
// Below this pirate-vs-player relative-health ratio, a step that rolls
// "don't chase" actively flees (steps toward the neighbor that maximizes
// distance from the player) instead of wandering randomly — the "run away
// when hurt" behavior. At or above this ratio, "don't chase" falls back
// to plain random wander as before.
export const PIRATE_FLEE_HEALTH_RATIO = 0.5; // tunable
// Hexes a pirate ship advances per round-tick (re-evaluating chase/wander
// each step, so it can react mid-round if the nearest player changes).
// Engaging combat (see stepPirateShip) always consumes the rest of this
// budget for the round, same as a player's own attack action.
export const PIRATE_SHIP_SPEED = 6; // tunable

// Picks a free coordinate for a new base: scans hexesInRadius(system.radius)
// offset from (system.q, system.r), filtered to materialized "band" tiles
// with matching regionId (never overlaps a star/planet/moon/belt/wonder —
// same "band is free, anything else is claimed" rule mapgen.js's
// isClaimable uses) — bounded by system.radius (<=7), not a scan of all
// mapData.tiles. Does not mutate the tile; the base sits on top of it.
function pickBaseSpawnCoord(mapData, system, rng) {
  const candidates = [];
  for (const offset of hexesInRadius(system.radius)) {
    const q = system.q + offset.q;
    const r = system.r + offset.r;
    const tile = mapData.tiles.get(axialKey(q, r));
    if (tile && tile.type === "band" && tile.regionId === system.id) {
      candidates.push({ q, r });
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

export function spawnPirateBases(mapData, gameState, rng = Math.random) {
  const regionsWithBase = new Set(gameState.pirateBases.map((b) => b.regionId));
  for (const system of mapData.systems) {
    if (system.isHome) continue; // never in the shared home system
    if (regionsWithBase.has(system.id)) continue;
    if (rng() >= PIRATE_BASE_SPAWN_CHANCE) continue;
    const coord = pickBaseSpawnCoord(mapData, system, rng);
    if (!coord) continue;
    gameState.pirateBases.push({
      id: gameState.nextPirateEntityId++,
      q: coord.q,
      r: coord.r,
      regionId: system.id,
      health: PIRATE_BASE_MAX_HEALTH,
      maxHealth: PIRATE_BASE_MAX_HEALTH,
    });
  }
}

export function produceFromBases(gameState, rng = Math.random) {
  for (const base of gameState.pirateBases) {
    const shipCount = gameState.pirateShips.filter((s) => s.baseId === base.id).length;
    if (shipCount >= PIRATE_BASE_SUPPORT_CAP) continue;
    if (rng() >= PIRATE_BASE_PRODUCTION_CHANCE) continue;
    gameState.pirateShips.push({
      id: gameState.nextPirateEntityId++,
      q: base.q,
      r: base.r,
      health: PIRATE_SHIP_MAX_HEALTH,
      maxHealth: PIRATE_SHIP_MAX_HEALTH,
      attack: PIRATE_SHIP_ATTACK,
      baseId: base.id,
    });
  }
}

function removeBase(gameState, baseId) {
  // Deliberately does NOT remove ships already produced by this base —
  // they become ownerless orphans, harmless, since produceFromBases only
  // ever counts ships whose baseId matches a STILL-PRESENT base's id, and
  // the region is implicitly "freed" simply because no entry in
  // gameState.pirateBases references it anymore (no separate flag).
  gameState.pirateBases = gameState.pirateBases.filter((b) => b.id !== baseId);
}

function removeShip(gameState, shipId) {
  gameState.pirateShips = gameState.pirateShips.filter((s) => s.id !== shipId);
}

function randomNeighbor(mapData, from, rng) {
  const neighbors = axialNeighbors(from.q, from.r).filter((n) => mapData.tiles.has(axialKey(n.q, n.r)));
  if (!neighbors.length) return from;
  return neighbors[Math.floor(rng() * neighbors.length)];
}

// Greedy step: the materialized neighbor that minimizes hexDistance to
// `target`. Not real pathfinding (can get stuck going around a system's
// own halo) — deliberately simple for an MVP roam AI.
function stepToward(mapData, from, target) {
  const neighbors = axialNeighbors(from.q, from.r).filter((n) => mapData.tiles.has(axialKey(n.q, n.r)));
  if (!neighbors.length) return from;
  let best = neighbors[0];
  let bestDist = hexDistance(best, target);
  for (const n of neighbors.slice(1)) {
    const d = hexDistance(n, target);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

// Greedy flee: the materialized neighbor that MAXIMIZES hexDistance from
// `avoid` — the mirror image of stepToward, used when a pirate ship is
// badly outmatched (relative health) by the player it's facing.
function stepAwayFrom(mapData, from, avoid) {
  const neighbors = axialNeighbors(from.q, from.r).filter((n) => mapData.tiles.has(axialKey(n.q, n.r)));
  if (!neighbors.length) return from;
  let best = neighbors[0];
  let bestDist = hexDistance(best, avoid);
  for (const n of neighbors.slice(1)) {
    const d = hexDistance(n, avoid);
    if (d > bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

function findNearestPlayer(players, from) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const player of players) {
    const d = hexDistance(from, player);
    if (d < nearestDist) {
      nearest = player;
      nearestDist = d;
    }
  }
  return { player: nearest, distance: nearestDist };
}

// One pirate ship's roam for this round: up to PIRATE_SHIP_SPEED single-hex
// steps, each re-evaluating behavior fresh. Within PIRATE_SHIP_DETECTION_
// RADIUS of the nearer player, chase chance isn't flat — it's
// PIRATE_CHASE_CHANCE scaled by healthRatio, the pirate's own HP fraction
// relative to that player's (clamped to 1, so being relatively healthier
// never chases MORE than the ceiling): a ship at full relative health
// chases aggressively, a battered one rarely does. When a step rolls
// "don't chase" AND healthRatio has dropped below PIRATE_FLEE_HEALTH_
// RATIO, it actively flees (steps away from the player) instead of
// wandering — otherwise (healthy but unlucky roll, or no player in range
// at all) it's a plain random materialized-neighbor step, same as always.
// Ships move freely across any tile type, same as players.
//
// If a candidate step lands on a player's tile, resolves combat with the
// PIRATE as attacker WITHOUT moving there first — per the "attacking ship
// doesn't occupy the target's tile unless it destroys the opponent" rule,
// the ship only actually advances onto that hex if the player is
// defeated; otherwise it stays at its prior position, having spent the
// REST of this round's movement attacking rather than advancing (mirrors
// Civ5: a melee attack consumes the unit's action for the turn). Returns
// a {playerIndex, q, r, message} event for the attacked player's
// notification area, or null if the ship used its
// whole speed budget without ever encountering a player.
function stepPirateShip(mapData, gameState, ship, rng) {
  for (let step = 0; step < PIRATE_SHIP_SPEED; step++) {
    const { player: nearest, distance } = findNearestPlayer(gameState.players, ship);
    let next;
    if (nearest && distance <= PIRATE_SHIP_DETECTION_RADIUS) {
      const pirateHealthFrac = ship.health / ship.maxHealth;
      const playerHealthFrac = nearest.currentHealth / maxHealthForPlayer(nearest);
      const healthRatio = Math.min(1, pirateHealthFrac / Math.max(playerHealthFrac, 0.01));
      const chaseChance = PIRATE_CHASE_CHANCE * healthRatio;
      if (rng() < chaseChance) {
        next = stepToward(mapData, ship, nearest);
      } else if (healthRatio < PIRATE_FLEE_HEALTH_RATIO) {
        next = stepAwayFrom(mapData, ship, nearest);
      } else {
        next = randomNeighbor(mapData, ship, rng);
      }
    } else {
      next = randomNeighbor(mapData, ship, rng);
    }

    const playerHere = gameState.players.find((p) => p.q === next.q && p.r === next.r);
    if (!playerHere) {
      ship.q = next.q;
      ship.r = next.r;
      continue;
    }

    return resolvePirateAttack(mapData, gameState, ship, playerHere, next, rng);
  }
  return null;
}

// Resolves one pirate-as-attacker fight against `playerHere`, who occupies
// `next` (the candidate hex the ship was about to step onto). Factored out
// of stepPirateShip's loop since combat always ends that ship's movement
// for the round regardless of which step number encountered the player.
function resolvePirateAttack(mapData, gameState, ship, playerHere, next, rng) {
  playerHere.inCombatThisRound = true;
  const tile = mapData.tiles.get(axialKey(next.q, next.r)); // defender's tile
  const attacker = { attack: ship.attack, health: ship.health, maxHealth: ship.maxHealth };
  const defender = {
    attack: attackForPlayer(playerHere),
    health: playerHere.currentHealth,
    maxHealth: maxHealthForPlayer(playerHere),
  };
  const result = resolveCombat(attacker, defender, terrainDefenseBonus(tile), rng);
  ship.health = attacker.health;
  playerHere.currentHealth = defender.health;

  const playerIndex = gameState.players.indexOf(playerHere);
  const victim = shipTitle(playerHere);
  // Routed to the attacked player's notification area, pointing at the fight.
  const where = { playerIndex, q: next.q, r: next.r };
  if (result.defenderDefeated) {
    applyShipLoss(mapData, gameState, playerHere);
    ship.q = next.q; // vacated — advance in
    ship.r = next.r;
    return {
      ...where,
      message: `A pirate raider destroyed ${victim}! Respawned at Earth, -${SHIP_LOSS_XP_PENALTY} XP.`,
    };
  }
  if (result.attackerDefeated) {
    removeShip(gameState, ship.id); // stays put — irrelevant, it's gone
    return { ...where, message: `${victim} fought off and destroyed a pirate raider!` };
  }
  return {
    ...where,
    message: `A pirate raider clashed with ${victim} — raider ${ship.health}/${ship.maxHealth} HP, ${victim} ${playerHere.currentHealth}/${maxHealthForPlayer(playerHere)} HP.`,
  };
}

// Orchestrates one full round: spawn -> produce -> roam/attack each ship.
// Called once per full round (every player's turn complete), NOT seeded
// like map generation — rng defaults to Math.random, injectable for tests,
// same convention as state.js's triggerAnomaly.
export function tickPirates(mapData, gameState, rng = Math.random) {
  const events = [];
  spawnPirateBases(mapData, gameState, rng);
  produceFromBases(gameState, rng);
  for (const ship of [...gameState.pirateShips]) {
    if (!gameState.pirateShips.includes(ship)) continue; // removed earlier this tick
    const event = stepPirateShip(mapData, gameState, ship, rng);
    if (event) events.push(event);
  }
  return events;
}

// Is there a live pirate base/ship at exactly (q, r)? Position-based rather
// than player-based (unlike MVP4's original checkPirateLanding, which it
// replaces) so main.js can check the player's TAPPED TARGET before
// committing the move — needed for the "stop short unless destroyed" rule,
// since whether the player's move actually completes now depends on the
// fight's outcome, not just on where they end up.
export function findPirateAt(gameState, q, r) {
  const base = gameState.pirateBases.find((b) => b.q === q && b.r === r);
  if (base) return { kind: "base", entity: base };
  const ship = gameState.pirateShips.find((s) => s.q === q && s.r === r);
  if (ship) return { kind: "ship", entity: ship };
  return null;
}

// Resolves player-as-attacker combat against whatever findPirateAt
// returned ({kind, entity}) at the player's TAPPED TARGET — main.js calls
// this from the player's one-hex-short approach position (see handleTap),
// never after actually moving onto the target's tile, so the terrain
// bonus is looked up from the DEFENDER's tile, not the attacker's. A
// destroyed base pays PIRATE_BASE_BOUNTY_XP and is removed (freeing its
// region to spawn a new one later); a destroyed ship is simply removed.
// Exposes `defenderDefeated` so the caller knows whether to complete the
// player's move onto the now-vacated tile.
export function resolvePlayerAttack(mapData, gameState, player, target, rng = Math.random) {
  player.inCombatThisRound = true;
  const entity = target.entity;
  const tile = mapData.tiles.get(axialKey(entity.q, entity.r)); // defender's tile
  const attacker = { attack: attackForPlayer(player), health: player.currentHealth, maxHealth: maxHealthForPlayer(player) };
  const defender = {
    attack: target.kind === "base" ? PIRATE_BASE_ATTACK : entity.attack,
    health: entity.health,
    maxHealth: entity.maxHealth,
  };
  const result = resolveCombat(attacker, defender, terrainDefenseBonus(tile), rng);
  player.currentHealth = attacker.health;
  entity.health = defender.health;

  if (result.defenderDefeated) {
    if (target.kind === "base") {
      removeBase(gameState, entity.id);
      player.xp += PIRATE_BASE_BOUNTY_XP;
      return {
        message: `Pirate base destroyed! +${PIRATE_BASE_BOUNTY_XP} XP bounty.`,
        defenderDefeated: true,
        attackerDefeated: false,
      };
    }
    removeShip(gameState, entity.id);
    return { message: "Pirate ship destroyed!", defenderDefeated: true, attackerDefeated: false };
  }
  if (result.attackerDefeated) {
    applyShipLoss(mapData, gameState, player);
    return {
      message: `Your ship was destroyed! Respawned at Earth, -${SHIP_LOSS_XP_PENALTY} XP.`,
      defenderDefeated: false,
      attackerDefeated: true,
    };
  }
  const label = target.kind === "base" ? "Pirate base" : "Pirate raider";
  return {
    message: `Exchanged fire with the ${label} — it's at ${entity.health}/${entity.maxHealth} HP, your ship at ${player.currentHealth}/${maxHealthForPlayer(player)} HP.`,
    defenderDefeated: false,
    attackerDefeated: false,
  };
}
