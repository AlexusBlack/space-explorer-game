// Start-screen roster model: team colours, ship names and the add/remove/
// default-name rules. Pure data (no DOM) so it can be verified headlessly;
// main.js renders it as the #setup screen and hands the result to
// state.js's createNewGame.

// A team is just a colour. The first two are the original two player
// colours, so saves from before teams keep theirs. No red: it reads as
// pirates.
export const TEAM_COLORS = [
  { color: "#4fd1ff", name: "Cyan" },
  { color: "#ff9f4f", name: "Orange" },
  { color: "#6ee06e", name: "Green" },
  { color: "#e070ff", name: "Magenta" },
  { color: "#ffe14f", name: "Yellow" },
  { color: "#f2f2f2", name: "White" },
];

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
export const NAME_MAX_LENGTH = 20;

// Lore prefix shown before every player ship's name: Interstellar
// Commonwealth Vehicle. Stored names never include it.
export const SHIP_PREFIX = "ICV";

export const SHIP_NAMES = [
  "Enterprise", "Voyager", "Pioneer", "Endeavour", "Discovery", "Defiant",
  "Serenity", "Galactica", "Rocinante", "Odyssey", "Nostromo", "Normandy",
  "Challenger", "Columbia", "Atlantis", "Mariner", "Viking", "Cassini",
  "Magellan", "Kepler", "Explorer", "Intrepid", "Excelsior", "Valiant",
  "Dauntless", "Prometheus", "Endurance", "Hermes", "Orion", "Apollo",
  "Gemini", "Mercury", "Vanguard", "Horizon", "Constellation", "Resolute",
  "Aurora", "Pathfinder", "Tranquility", "Daedalus",
];

export function shipTitle(player) {
  return `${SHIP_PREFIX} ${player.shipName}`;
}

// Lowest "Player N" not already taken, so removing Player 2 of 3 makes the
// next added player "Player 2" again.
export function defaultPlayerName(players) {
  const taken = new Set(players.map((p) => p.name));
  let n = 1;
  while (taken.has(`Player ${n}`)) n++;
  return `Player ${n}`;
}

// A random ship name nobody in `players` uses yet.
export function pickShipName(players, rng = Math.random) {
  const taken = new Set(players.map((p) => p.shipName));
  const free = SHIP_NAMES.filter((name) => !taken.has(name));
  if (free.length) return free[Math.floor(rng() * free.length)];
  // Unreachable with MAX_PLAYERS far below the list size; kept so the
  // function never returns a duplicate.
  let suffix = 2;
  while (taken.has(`${SHIP_NAMES[0]} ${suffix}`)) suffix++;
  return `${SHIP_NAMES[0]} ${suffix}`;
}

// Two players on one team.
export function defaultSetup(rng = Math.random) {
  const players = [];
  addPlayer(players, rng);
  addPlayer(players, rng);
  return players;
}

// Appends a player with the default name and a fresh ship name, on the
// first player's team (same team by default). No-op at MAX_PLAYERS.
export function addPlayer(players, rng = Math.random) {
  if (players.length >= MAX_PLAYERS) return false;
  players.push({
    name: defaultPlayerName(players),
    shipName: pickShipName(players, rng),
    color: players[0]?.color ?? TEAM_COLORS[0].color,
  });
  return true;
}

export function removePlayer(players, index) {
  if (players.length <= MIN_PLAYERS) return false;
  players.splice(index, 1);
  return true;
}

// Run on Start: trims and truncates names, and refills blank ones with
// defaults (generated against the already-normalized players, so they
// stay unique). Returns a new array.
export function normalizeSetup(players, rng = Math.random) {
  const result = [];
  for (const p of players.slice(0, MAX_PLAYERS)) {
    const name = String(p.name ?? "").trim().slice(0, NAME_MAX_LENGTH);
    const shipName = String(p.shipName ?? "").trim().slice(0, NAME_MAX_LENGTH);
    const color = TEAM_COLORS.some((t) => t.color === p.color) ? p.color : TEAM_COLORS[0].color;
    const entry = { name, shipName, color };
    if (!entry.name) entry.name = defaultPlayerName([...result, ...players]);
    if (!entry.shipName) entry.shipName = pickShipName([...result, ...players], rng);
    result.push(entry);
  }
  return result;
}
