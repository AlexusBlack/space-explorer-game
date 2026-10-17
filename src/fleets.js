// Inhabited worlds' military fleets: a world keeps a few military ships that
// patrol within WORLD_SHIP_PATROL_RADIUS of it and act on its attitudes
// (ethics.js). They hunt pirates when the world is Wary or worse of them, or
// when a pirate has just attacked any ship near them; they attack players
// when the world is Hostile toward explorers, and other worlds' ships when
// the two worlds are at War. Like pirate raiders they run when outmatched,
// and they are fully repaired on reaching their home world. Ships are
// dynamic gameState records (gameState.worldShips), like pirate ships, so
// nothing here mutates mapData.

import { axialKey, axialNeighbors, hexDistance } from "./hexgrid.js";
import { resolveCombat, terrainDefenseBonus } from "./combat.js";
import { attitudeToPlayers, attitudeToPirates, diplomaticState } from "./ethics.js";
import { attackForPlayer, maxHealthForPlayer, applyShipLoss, SHIP_LOSS_XP_PENALTY } from "./state.js";
import { shipTitle } from "./setup.js";
import { removeBase, removeShip, COMBAT_SURVIVAL_XP, PIRATE_BASE_ATTACK } from "./pirates.js";
import { currentStep, recordTrail, worldShipTrailId, WORLD_SHIP_TRAIL_COLOR, PIRATE_TIME_OFFSET } from "./trails.js";

export const WORLD_SHIP_ATTACK = 10; // tunable — between a raider (6) and a player ship (12)
export const WORLD_SHIP_MAX_HEALTH = 100; // tunable
// Ships a world keeps, by its war axis — tunable.
export const WORLD_FLEET_SIZE = 1;
export const PACIFIST_FLEET_SIZE = 0; // extreme pacifists (war -2)
export const MILITARIST_FLEET_SIZE = 2; // extreme militarists (war +2)
// A ship never steps farther than this from its home world and only sees
// targets inside it, so it never chases out of its zone.
export const WORLD_SHIP_PATROL_RADIUS = 8; // hexes — tunable
export const WORLD_SHIP_SPEED = 6; // hexes per round — tunable, same as a raider
export const WORLD_SHIP_CHASE_CHANCE = 0.9; // tunable — ceiling, scaled by health ratio
export const WORLD_SHIP_FLEE_HEALTH_RATIO = 0.5; // tunable — below it a ship runs home
export const WORLD_SHIP_REBUILD_CHANCE = 0.25; // per world under its fleet size, per round — tunable
// A pirate that attacked any ship stays a target for this many rounds after
// the round of the attack (rule (b)).
export const PIRATE_WANTED_ROUNDS = 1; // tunable

export function worldName(tile) {
  return tile.ownName ?? tile.name;
}

export function fleetSize(tile) {
  if (tile.ethics.war === -2) return PACIFIST_FLEET_SIZE;
  if (tile.ethics.war === 2) return MILITARIST_FLEET_SIZE;
  return WORLD_FLEET_SIZE;
}

export function homeWorld(mapData, ship) {
  return mapData.tiles.get(axialKey(ship.homeQ, ship.homeR));
}

function fleetWorlds(mapData) {
  return [...mapData.tiles.values()].filter((t) => t.inhabited && t.ethics);
}

function launchShip(gameState, home) {
  gameState.worldShips.push({
    id: gameState.nextWorldShipId++,
    q: home.q,
    r: home.r,
    homeQ: home.q,
    homeR: home.r,
    health: WORLD_SHIP_MAX_HEALTH,
    maxHealth: WORLD_SHIP_MAX_HEALTH,
    attack: WORLD_SHIP_ATTACK,
  });
}

function shipsOf(gameState, home) {
  return gameState.worldShips.filter((s) => s.homeQ === home.q && s.homeR === home.r).length;
}

// Every world's full fleet, on its home hex: a new game, or a save from
// before fleets existed (gameState.worldShips null).
export function seedWorldFleets(mapData, gameState) {
  gameState.worldShips = [];
  gameState.nextWorldShipId ??= 1;
  for (const home of fleetWorlds(mapData)) {
    for (let i = 0; i < fleetSize(home); i++) launchShip(gameState, home);
  }
}

export function rebuildWorldFleets(mapData, gameState, rng = Math.random) {
  for (const home of fleetWorlds(mapData)) {
    if (shipsOf(gameState, home) >= fleetSize(home)) continue;
    if (rng() >= WORLD_SHIP_REBUILD_CHANCE) continue;
    launchShip(gameState, home);
  }
}

function pirateWanted(gameState, pirate, ship) {
  const attack = pirate.lastAttack;
  return Boolean(attack) &&
    gameState.turnNumber - attack.turn <= PIRATE_WANTED_ROUNDS &&
    hexDistance(attack, ship) <= WORLD_SHIP_PATROL_RADIUS;
}

// Everything `ship` may attack, inside its patrol zone, as
// { kind: "pirate" | "base" | "player" | "world", entity, healthFrac }.
export function worldShipTargets(mapData, gameState, ship) {
  const home = homeWorld(mapData, ship);
  if (!home) return [];
  const inZone = (e) => hexDistance(home, e) <= WORLD_SHIP_PATROL_RADIUS;
  const out = [];
  const wary = attitudeToPirates(home) <= -1;
  for (const pirate of gameState.pirateShips) {
    if (!inZone(pirate) || !(wary || pirateWanted(gameState, pirate, ship))) continue;
    out.push({ kind: "pirate", entity: pirate, healthFrac: pirate.health / pirate.maxHealth });
  }
  if (wary) {
    for (const base of gameState.pirateBases) {
      if (inZone(base)) out.push({ kind: "base", entity: base, healthFrac: base.health / base.maxHealth });
    }
  }
  if (attitudeToPlayers(home) === -2) {
    for (const player of gameState.players) {
      if (inZone(player)) {
        out.push({ kind: "player", entity: player, healthFrac: player.currentHealth / maxHealthForPlayer(player) });
      }
    }
  }
  for (const other of gameState.worldShips) {
    if (other === ship || !inZone(other)) continue;
    const otherHome = homeWorld(mapData, other);
    if (otherHome && otherHome !== home && diplomaticState(home, otherHome) === -2) {
      out.push({ kind: "world", entity: other, healthFrac: other.health / other.maxHealth });
    }
  }
  return out;
}

// Materialized neighbours that stay inside the patrol zone.
function zoneNeighbors(mapData, ship, home) {
  return axialNeighbors(ship.q, ship.r).filter(
    (n) => mapData.tiles.has(axialKey(n.q, n.r)) && hexDistance(n, home) <= WORLD_SHIP_PATROL_RADIUS
  );
}

// Greedy step toward `target` (same simple rule as pirates.js's stepToward).
function zoneStepToward(neighbors, from, target) {
  let best = from;
  let bestDist = hexDistance(from, target);
  for (const n of neighbors) {
    const d = hexDistance(n, target);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

function recordWorldShipStep(gameState, ship, from) {
  const time = currentStep(gameState) + PIRATE_TIME_OFFSET;
  recordTrail(gameState, worldShipTrailId(ship.id), WORLD_SHIP_TRAIL_COLOR, [from, ship], time);
}

function moveShip(gameState, ship, to) {
  const from = { q: ship.q, r: ship.r };
  ship.q = to.q;
  ship.r = to.r;
  recordWorldShipStep(gameState, ship, from);
}

function removeWorldShip(gameState, ship) {
  gameState.worldShips = gameState.worldShips.filter((s) => s !== ship);
}

// One ship's round: up to WORLD_SHIP_SPEED steps, each re-evaluated, the
// same chase/flee rule as a pirate raider's (see pirates.js's
// stepPirateShip) except that running means heading home. A damaged ship
// with nothing to chase heads home too; reaching home repairs it fully and
// ends its round. A step onto a target's hex is a fight that ends the round.
// Returns a player event { playerIndex, q, r, message } or null.
function stepWorldShip(mapData, gameState, ship, rng) {
  const home = homeWorld(mapData, ship);
  if (!home) return null;
  for (let step = 0; step < WORLD_SHIP_SPEED; step++) {
    if (ship.q === home.q && ship.r === home.r && ship.health < ship.maxHealth) {
      ship.health = ship.maxHealth;
      return null;
    }
    const targets = worldShipTargets(mapData, gameState, ship);
    let nearest = null;
    let nearestDist = Infinity;
    for (const t of targets) {
      const d = hexDistance(ship, t.entity);
      if (d < nearestDist) {
        nearest = t;
        nearestDist = d;
      }
    }
    const neighbors = zoneNeighbors(mapData, ship, home);
    const damaged = ship.health < ship.maxHealth;
    let next;
    if (nearest) {
      const healthRatio = Math.min(1, ship.health / ship.maxHealth / Math.max(nearest.healthFrac, 0.01));
      if (rng() < WORLD_SHIP_CHASE_CHANCE * healthRatio) {
        next = zoneStepToward(neighbors, ship, nearest.entity);
      } else if (healthRatio < WORLD_SHIP_FLEE_HEALTH_RATIO) {
        next = zoneStepToward(neighbors, ship, home);
      } else {
        next = neighbors.length ? neighbors[Math.floor(rng() * neighbors.length)] : ship;
      }
    } else if (damaged) {
      next = zoneStepToward(neighbors, ship, home);
    } else {
      next = neighbors.length ? neighbors[Math.floor(rng() * neighbors.length)] : ship;
    }
    if (next.q === ship.q && next.r === ship.r) return null; // nowhere to go

    const here = targets.filter((t) => t.entity.q === next.q && t.entity.r === next.r);
    if (here.length) {
      return attackTarget(mapData, gameState, ship, here.includes(nearest) ? nearest : here[0], rng);
    }
    moveShip(gameState, ship, next);
  }
  return null;
}

// True while `at` still holds something `ship` can't share a hex with: any
// pirate ship or base (even one its world isn't hunting), or another of its
// targets. A kill then doesn't let the ship move in, e.g. after sinking a
// raider parked on its base or one ship of a stack.
function hexHeld(mapData, gameState, ship, at) {
  const on = (e) => e.q === at.q && e.r === at.r;
  return gameState.pirateShips.some(on) || gameState.pirateBases.some(on) ||
    worldShipTargets(mapData, gameState, ship).some((t) => on(t.entity));
}

// `ship` attacks `target` on the neighbouring hex, moving in only on a kill
// that leaves the hex clear (see hexHeld).
function attackTarget(mapData, gameState, ship, target, rng) {
  const entity = target.entity;
  const tile = mapData.tiles.get(axialKey(entity.q, entity.r)); // defender's tile
  const bonus = terrainDefenseBonus(tile);
  if (target.kind === "player") return attackPlayer(mapData, gameState, ship, entity, tile, rng);

  const defender = target.kind === "base"
    ? { attack: PIRATE_BASE_ATTACK, health: entity.health, maxHealth: entity.maxHealth }
    : entity;
  const result = resolveCombat(ship, defender, bonus, rng);
  entity.health = defender.health;
  if (result.defenderDefeated) {
    if (target.kind === "pirate") removeShip(gameState, entity.id);
    else if (target.kind === "base") removeBase(gameState, entity.id);
    else removeWorldShip(gameState, entity);
    if (!hexHeld(mapData, gameState, ship, entity)) moveShip(gameState, ship, entity);
  }
  if (result.attackerDefeated) removeWorldShip(gameState, ship);
  return null;
}

function attackPlayer(mapData, gameState, ship, player, tile, rng) {
  player.inCombatThisRound = true;
  const defender = { attack: attackForPlayer(player), health: player.currentHealth, maxHealth: maxHealthForPlayer(player) };
  const result = resolveCombat(ship, defender, terrainDefenseBonus(tile), rng);
  player.currentHealth = defender.health;

  const name = worldName(homeWorld(mapData, ship));
  const victim = shipTitle(player);
  const where = { playerIndex: gameState.players.indexOf(player), q: player.q, r: player.r };
  if (result.defenderDefeated) {
    applyShipLoss(mapData, gameState, player);
    if (!hexHeld(mapData, gameState, ship, where)) moveShip(gameState, ship, where);
    return { ...where, message: `A ${name} military ship destroyed ${victim}! Respawned at Earth, -${SHIP_LOSS_XP_PENALTY} XP.` };
  }
  player.xp += COMBAT_SURVIVAL_XP;
  if (result.attackerDefeated) {
    removeWorldShip(gameState, ship);
    return { ...where, message: `${victim} fought off and destroyed a ${name} military ship! +${COMBAT_SURVIVAL_XP} XP.` };
  }
  return {
    ...where,
    message: `A ${name} military ship attacked ${victim} — it's at ${ship.health}/${ship.maxHealth} HP, ${victim} ${player.currentHealth}/${maxHealthForPlayer(player)} HP. +${COMBAT_SURVIVAL_XP} XP.`,
  };
}

// The fleets' part of a round, run right after tickPirates: rebuild, then
// every ship moves and fights. rng defaults to Math.random, injectable for
// tests.
export function tickWorldFleets(mapData, gameState, rng = Math.random) {
  rebuildWorldFleets(mapData, gameState, rng);
  return moveWorldFleets(mapData, gameState, rng);
}

// Every ship's moves and fights for the round; player events in the pirate
// event format.
export function moveWorldFleets(mapData, gameState, rng = Math.random) {
  const events = [];
  for (const ship of [...gameState.worldShips]) {
    if (!gameState.worldShips.includes(ship)) continue; // destroyed earlier this round
    const event = stepWorldShip(mapData, gameState, ship, rng);
    if (event) events.push(event);
  }
  return events;
}

// A military ship at (q, r) that a player may attack: only a world Hostile
// toward explorers. Every other world's ships share hexes with players.
export function findHostileWorldShipAt(mapData, gameState, q, r) {
  const ship = (gameState.worldShips ?? []).find((s) => {
    if (s.q !== q || s.r !== r) return false;
    const home = homeWorld(mapData, s);
    return home && attitudeToPlayers(home) === -2;
  });
  return ship ? { kind: "world", entity: ship } : null;
}

// Player-as-attacker against a hostile world's military ship, the same
// shape as pirates.js's resolvePlayerAttack (main.js stops the player one
// hex short and advances only on a kill). Combat XP, no emc bounty.
export function resolvePlayerAttackOnWorldShip(mapData, gameState, player, ship, rng = Math.random) {
  player.inCombatThisRound = true;
  const tile = mapData.tiles.get(axialKey(ship.q, ship.r)); // defender's tile
  const attacker = { attack: attackForPlayer(player), health: player.currentHealth, maxHealth: maxHealthForPlayer(player) };
  const result = resolveCombat(attacker, ship, terrainDefenseBonus(tile), rng);
  player.currentHealth = attacker.health;
  const name = worldName(homeWorld(mapData, ship));

  if (!result.attackerDefeated) player.xp += COMBAT_SURVIVAL_XP;
  if (result.defenderDefeated) {
    removeWorldShip(gameState, ship);
    return {
      message: `${name} military ship destroyed! +${COMBAT_SURVIVAL_XP} XP.`,
      defenderDefeated: true,
      attackerDefeated: false,
    };
  }
  if (result.attackerDefeated) {
    applyShipLoss(mapData, gameState, player);
    return {
      message: `Your ship was destroyed! Respawned at Earth, -${SHIP_LOSS_XP_PENALTY} XP.`,
      defenderDefeated: false,
      attackerDefeated: true,
    };
  }
  return {
    message: `Exchanged fire with the ${name} military ship — it's at ${ship.health}/${ship.maxHealth} HP, your ship at ${player.currentHealth}/${maxHealthForPlayer(player)} HP. +${COMBAT_SURVIVAL_XP} XP.`,
    defenderDefeated: false,
    attackerDefeated: false,
  };
}
