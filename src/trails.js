// Vessel Trail Detector: a short movement history for every ship, player and
// pirate, shown to a viewer who owns the upgrade (see upgrades.js's trail
// track). Pure data (no DOM) so it can be verified headlessly; main.js and
// pirates.js record moves here, render.js draws what trailsForViewer returns.
//
// Time is counted in player turns ("steps"): step = (turnNumber - 1) * P +
// activePlayerIndex, P being the player count, so it's derived from fields
// gameState already has. The pirate round runs after the last player's turn
// and before the next round's player 0, so its moves are stamped half a step
// before that player-0 turn (PIRATE_TIME_OFFSET).
//
// A viewer at step S sees age 1 ("last turn") for anything from their own
// previous turn (S - P) up to now, and age 2 for the window before it
// ([S - 2P, S - P)). That puts the viewer's own last move, every other
// player's move since, and exactly one pirate round in "last turn", whichever
// seat the viewer is in.

export const PIRATE_TRAIL_COLOR = "#ff4040";
export const PIRATE_TIME_OFFSET = -0.5;
export const MAX_TRAIL_TURNS = 2;

export function currentStep(gameState) {
  const turnNumber = gameState.turnNumber ?? 1;
  return (turnNumber - 1) * gameState.players.length + gameState.activePlayerIndex;
}

export function playerTrailId(index) {
  return `p${index}`;
}

export function pirateTrailId(shipId) {
  return `s${shipId}`;
}

// Appends `path` (a list of hexes, its first one the ship's position before
// the move) to the ship's trail. Extends the ship's latest record when it has
// the same time and the move starts where that record ends; otherwise starts
// a new record — so a teleport (wormhole, respawn at Earth), which is never
// recorded as a move, breaks the line instead of drawing a streak across it.
export function recordTrail(gameState, ship, color, path, time) {
  if (!path || path.length < 2) return;
  gameState.trails ??= [];
  const hexes = path.map(({ q, r }) => ({ q, r }));
  let latest = null;
  for (let i = gameState.trails.length - 1; i >= 0; i--) {
    if (gameState.trails[i].ship === ship) {
      latest = gameState.trails[i];
      break;
    }
  }
  const end = latest && latest.path[latest.path.length - 1];
  if (latest && latest.time === time && end.q === hexes[0].q && end.r === hexes[0].r) {
    latest.path.push(...hexes.slice(1));
    return;
  }
  gameState.trails.push({ ship, color, time, path: hexes });
}

// Drops records no viewer can see any more (older than MAX_TRAIL_TURNS full
// rounds). Run on every End Turn.
export function pruneTrails(gameState) {
  if (!gameState.trails) return;
  const oldest = currentStep(gameState) - MAX_TRAIL_TURNS * gameState.players.length;
  gameState.trails = gameState.trails.filter((t) => t.time >= oldest);
}

// The records `viewer` can see at their detector depth (`turns`, 0 = none),
// each tagged with its age (1 = last turn, 2 = the turn before).
export function trailsForViewer(gameState, turns) {
  if (!turns || !gameState.trails) return [];
  const now = currentStep(gameState);
  const players = gameState.players.length;
  const result = [];
  for (const t of gameState.trails) {
    if (t.time > now) continue;
    // A difference of exactly P (the viewer's own previous turn) is still
    // "last turn"; anything newer than that, too.
    const age = Math.max(1, Math.ceil((now - t.time) / players));
    if (age > Math.min(turns, MAX_TRAIL_TURNS)) continue;
    result.push({ color: t.color, path: t.path, age });
  }
  return result;
}
