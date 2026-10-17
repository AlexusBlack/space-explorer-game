// Inhabited worlds' cargo and transport ships: civilian traffic that flies
// short loops from its home world to 1-3 friendly worlds (not at War with
// home) within TRADE_SHIP_RADIUS and back. The two types behave the same and
// differ only in sprite and name. Trade ships never attack; pirates, and the
// military ships of worlds at War with their home, attack them, they hit
// back, and every such attack sends a distress call to nearby players. A
// damaged ship is fully repaired on any friendly world, and one badly
// damaged runs to the closest. Ships are dynamic gameState records
// (gameState.tradeShips), like pirate and military ships.
//
// A leaf module: pirates.js and fleets.js import distressEvents and
// removeTradeShip from here, so nothing here imports them.

import { axialKey, axialNeighbors, hexDistance } from "./hexgrid.js";
import { diplomaticState } from "./ethics.js";
import { currentStep, recordTrail, tradeShipTrailId, TRADE_SHIP_TRAIL_COLOR, PIRATE_TIME_OFFSET } from "./trails.js";

export const TRADE_SHIP_ATTACK = 4; // tunable — they only ever hit back
export const TRADE_SHIP_MAX_HEALTH = 100; // tunable
// Ships of EACH type a world keeps, by its xeno axis — tunable.
export const TRADE_FLEET_SIZE = 1;
export const XENOPHOBE_TRADE_FLEET_SIZE = 0; // extreme xenophobes (xeno -2)
export const XENOPHILE_TRADE_FLEET_SIZE = 2; // extreme xenophiles (xeno +2)
// A trade ship never steps farther than this from home, and only trades
// with worlds inside it.
export const TRADE_SHIP_RADIUS = 30; // hexes — tunable
export const TRADE_SHIP_SPEED = 5; // hexes per round — tunable
export const TRADE_ROUTE_MIN_STOPS = 1; // tunable
export const TRADE_ROUTE_MAX_STOPS = 3; // tunable
export const TRADE_SHIP_FLEE_HEALTH_RATIO = 0.5; // tunable — below it, run to the closest friendly world
export const TRADE_SHIP_REBUILD_CHANCE = 0.25; // per world and type under its fleet size, per round — tunable
export const DISTRESS_RADIUS = 8; // hexes from the fight to a player's ship — tunable
export const TRADE_SHIP_TYPES = { cargo: "Cargo ship", transport: "Transport ship" };

export function tradeFleetSize(tile) {
  if (tile.ethics.xeno === -2) return XENOPHOBE_TRADE_FLEET_SIZE;
  if (tile.ethics.xeno === 2) return XENOPHILE_TRADE_FLEET_SIZE;
  return TRADE_FLEET_SIZE;
}

function homeOf(mapData, ship) {
  return mapData.tiles.get(axialKey(ship.homeQ, ship.homeR));
}

function worldName(tile) {
  return tile.ownName ?? tile.name;
}

// "a Vell military ship", "an Orin cargo ship".
export function withArticle(phrase) {
  return `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;
}

// "Xarr cargo ship".
export function tradeShipName(mapData, ship) {
  const home = homeOf(mapData, ship);
  const type = TRADE_SHIP_TYPES[ship.type].toLowerCase();
  return home ? `${worldName(home)} ${type}` : type;
}

// Every inhabited world, computed once per map.
const worldsByMap = new WeakMap();
function inhabitedWorlds(mapData) {
  if (!worldsByMap.has(mapData)) {
    worldsByMap.set(mapData, [...mapData.tiles.values()].filter((t) => t.inhabited && t.ethics));
  }
  return worldsByMap.get(mapData);
}

// A world `home`'s ships may trade with and be repaired at: any inhabited
// world not at War with it, home included.
export function isFriendlyPort(home, tile) {
  if (!tile || !tile.inhabited || !tile.ethics) return false;
  return tile === home || diplomaticState(home, tile) > -2;
}

function portsInZone(mapData, home) {
  return inhabitedWorlds(mapData).filter(
    (t) => hexDistance(t, home) <= TRADE_SHIP_RADIUS && isFriendlyPort(home, t)
  );
}

function launchShip(gameState, home, type) {
  gameState.tradeShips.push({
    id: gameState.nextTradeShipId++,
    type,
    q: home.q,
    r: home.r,
    homeQ: home.q,
    homeR: home.r,
    health: TRADE_SHIP_MAX_HEALTH,
    maxHealth: TRADE_SHIP_MAX_HEALTH,
    attack: TRADE_SHIP_ATTACK,
    route: [],
  });
}

function shipsOf(gameState, home, type) {
  return gameState.tradeShips.filter((s) => s.type === type && s.homeQ === home.q && s.homeR === home.r).length;
}

// Every world's full trade fleet, on its home hex: a new game, or a save from
// before trade ships existed (gameState.tradeShips null).
export function seedTradeFleets(mapData, gameState) {
  gameState.tradeShips = [];
  gameState.nextTradeShipId ??= 1;
  for (const home of inhabitedWorlds(mapData)) {
    for (const type of Object.keys(TRADE_SHIP_TYPES)) {
      for (let i = 0; i < tradeFleetSize(home); i++) launchShip(gameState, home, type);
    }
  }
}

export function rebuildTradeFleets(mapData, gameState, rng = Math.random) {
  for (const home of inhabitedWorlds(mapData)) {
    for (const type of Object.keys(TRADE_SHIP_TYPES)) {
      if (shipsOf(gameState, home, type) >= tradeFleetSize(home)) continue;
      if (rng() >= TRADE_SHIP_REBUILD_CHANCE) continue;
      launchShip(gameState, home, type);
    }
  }
}

export function removeTradeShip(gameState, ship) {
  gameState.tradeShips = (gameState.tradeShips ?? []).filter((s) => s !== ship);
}

// A new loop: 1-3 distinct friendly worlds in the zone, in random order,
// then home. Empty when there's nobody to trade with.
export function pickRoute(mapData, ship, rng = Math.random) {
  const home = homeOf(mapData, ship);
  if (!home) return [];
  const pool = portsInZone(mapData, home).filter((t) => t !== home);
  if (!pool.length) return [];
  const span = TRADE_ROUTE_MAX_STOPS - TRADE_ROUTE_MIN_STOPS + 1;
  const stops = Math.min(pool.length, TRADE_ROUTE_MIN_STOPS + Math.floor(rng() * span));
  const route = [];
  for (let i = 0; i < stops; i++) {
    const [pick] = pool.splice(Math.floor(rng() * pool.length), 1);
    route.push({ q: pick.q, r: pick.r });
  }
  route.push({ q: home.q, r: home.r });
  return route;
}

// Hexes a trade ship won't step onto: any pirate ship or base, or a military
// ship of a world at War with its home.
function blocked(mapData, gameState, home, hex) {
  const on = (e) => e.q === hex.q && e.r === hex.r;
  if (gameState.pirateShips.some(on) || gameState.pirateBases.some(on)) return true;
  return (gameState.worldShips ?? []).some((s) => {
    if (!on(s)) return false;
    const theirs = mapData.tiles.get(axialKey(s.homeQ, s.homeR));
    return theirs && theirs !== home && diplomaticState(home, theirs) === -2;
  });
}

// Greedy step toward `dest`, inside the zone and around blocked hexes: the
// closest open neighbour that gets nearer, else one that keeps the distance
// (to slip around a pirate base in the way), else null (wait).
function tradeStep(mapData, gameState, ship, home, dest) {
  const here = hexDistance(ship, dest);
  let best = null;
  let bestDist = Infinity;
  for (const n of axialNeighbors(ship.q, ship.r)) {
    if (!mapData.tiles.has(axialKey(n.q, n.r)) || hexDistance(n, home) > TRADE_SHIP_RADIUS) continue;
    if (blocked(mapData, gameState, home, n)) continue;
    const d = hexDistance(n, dest);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best && bestDist <= here ? best : null;
}

function closestPort(mapData, home, from) {
  let best = null;
  let bestDist = Infinity;
  for (const t of portsInZone(mapData, home)) {
    const d = hexDistance(t, from);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

function moveShip(gameState, ship, to) {
  const from = { q: ship.q, r: ship.r };
  ship.q = to.q;
  ship.r = to.r;
  const time = currentStep(gameState) + PIRATE_TIME_OFFSET;
  recordTrail(gameState, tradeShipTrailId(ship.id), TRADE_SHIP_TRAIL_COLOR, [from, ship], time);
}

// Where the ship is heading right now: the closest friendly world when badly
// damaged, otherwise the next stop of its route (null when it has none).
export function tradeShipDestination(mapData, ship) {
  const home = homeOf(mapData, ship);
  if (!home) return null;
  if (ship.health / ship.maxHealth < TRADE_SHIP_FLEE_HEALTH_RATIO) return closestPort(mapData, home, ship) ?? home;
  return ship.route[0] ?? null;
}

// One ship's round: up to TRADE_SHIP_SPEED steps along its loop. A damaged
// ship on a friendly world is repaired there, which ends its round; arriving
// at a stop moves on to the next; at home with no route it picks a new loop
// (or waits a round when there's nobody to trade with).
function stepTradeShip(mapData, gameState, ship, rng) {
  const home = homeOf(mapData, ship);
  if (!home) return;
  ship.route ??= [];
  for (let step = 0; step < TRADE_SHIP_SPEED; step++) {
    const tile = mapData.tiles.get(axialKey(ship.q, ship.r));
    if (ship.health < ship.maxHealth && isFriendlyPort(home, tile)) {
      ship.health = ship.maxHealth;
      return;
    }
    while (ship.route.length && ship.route[0].q === ship.q && ship.route[0].r === ship.r) ship.route.shift();
    if (!ship.route.length) {
      if (ship.q === home.q && ship.r === home.r) ship.route = pickRoute(mapData, ship, rng);
      else ship.route = [{ q: home.q, r: home.r }];
      if (!ship.route.length) return; // nobody to trade with
    }
    const dest = tradeShipDestination(mapData, ship);
    const next = tradeStep(mapData, gameState, ship, home, dest);
    if (!next) return;
    moveShip(gameState, ship, next);
  }
}

// The trade fleets' part of a round, run after the military fleets: rebuild,
// then every ship moves. Trade ships never start a fight, so there are no
// events. rng defaults to Math.random, injectable for tests.
export function tickTradeShips(mapData, gameState, rng = Math.random) {
  rebuildTradeFleets(mapData, gameState, rng);
  moveTradeShips(mapData, gameState, rng);
}

export function moveTradeShips(mapData, gameState, rng = Math.random) {
  for (const ship of [...gameState.tradeShips]) stepTradeShip(mapData, gameState, ship, rng);
}

// A distress call from `ship`, attacked at `at` by `attacker` (text such as
// "pirates" or "a Vell military ship"): one event per player whose ship is
// within DISTRESS_RADIUS of the fight, whatever their team. `outcome` is
// "attacked", "destroyed" (the trade ship was lost) or "won" (it destroyed
// its attacker).
export function distressEvents(mapData, gameState, ship, at, attacker, outcome) {
  const name = tradeShipName(mapData, ship);
  const message =
    outcome === "destroyed"
      ? `Distress call: the ${name} was destroyed by ${attacker}!`
      : outcome === "won"
        ? `Distress call: the ${name} fought off ${attacker} and destroyed the attacker.`
        : `Distress call: the ${name} is under attack by ${attacker}! It's at ${ship.health}/${ship.maxHealth} HP.`;
  const events = [];
  gameState.players.forEach((player, playerIndex) => {
    if (hexDistance(player, at) > DISTRESS_RADIUS) return;
    events.push({ kind: "distress", playerIndex, q: at.q, r: at.r, message, shipType: ship.type });
  });
  return events;
}
