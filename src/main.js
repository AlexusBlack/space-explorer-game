import { generateMap } from "./mapgen.js";
import { render, SELECT_FRAME_COUNT } from "./render.js";
import { attachCameraControls } from "./input.js";
import { loadBandImages, loadIconImages } from "./assets.js";
import { hexDistance, hexLine, pixelToAxial, axialToPixel, axialKey } from "./hexgrid.js";
import {
  createNewGame,
  applyMove,
  checkWinCondition,
  saveGame,
  loadGame,
  movesPerTurnForPlayer,
  maxHealthForPlayer,
  tickPassiveHealing,
  playerLevel,
  pendingUpgradePicks,
  unlockUpgrade,
  cumulativeXpForLevel,
  checkAnomalyLanding,
  triggerAnomaly,
  applyDestroyedAnomalies,
} from "./state.js";
import { availableUpgrades } from "./upgrades.js";
import { findPirateAt, resolvePlayerAttack, tickPirates, ATTACK_MOVE_COST } from "./pirates.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const seedLabel = document.getElementById("seed-label");
const turnCountLabel = document.getElementById("turn-count-label");
const seedInput = document.getElementById("seed-input");
const newMapButton = document.getElementById("new-map");
const turnLabel = document.getElementById("turn-label");
const levelLabel = document.getElementById("level-label");
const xpLabel = document.getElementById("xp-label");
const movesLabel = document.getElementById("moves-label");
const healthLabel = document.getElementById("health-label");
const endTurnButton = document.getElementById("end-turn");
const winBanner = document.getElementById("win-banner");
const playerBadge = document.getElementById("player-badge");
const interstitial = document.getElementById("interstitial");
const interstitialMessage = document.getElementById("interstitial-message");
const upgradePicker = document.getElementById("upgrade-picker");
const upgradePickerOptions = document.getElementById("upgrade-picker-options");
const anomalyOverlay = document.getElementById("anomaly-overlay");
const anomalyMessage = document.getElementById("anomaly-message");
const combatOverlay = document.getElementById("combat-overlay");
const combatMessage = document.getElementById("combat-message");

function readSeedFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("seed");
}

function writeSeedToUrl(seed) {
  const params = new URLSearchParams(location.search);
  params.set("seed", seed);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

// Left at 0.6 (not re-compensated for the latest HEX_SIZE halving) so tiles
// actually render smaller on screen by default, per direct feedback that
// they still looked too large even after the first halving.
const DEFAULT_ZOOM = 0.6;

const camera = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
let mapData;
let gameState;
let currentSeed;
let needsRedraw = true;

// Loads/generates the map for `seed` without touching player/turn state —
// used both by startNewGame (below) and by the resume-from-save path, since
// the map itself is always cheaply/deterministically rebuilt from the seed
// rather than persisted.
function loadMap(seed) {
  currentSeed = seed;
  mapData = generateMap({ seed });
  camera.x = 0;
  camera.y = 0;
  camera.zoom = DEFAULT_ZOOM;
  const placed = mapData.systems.length;
  seedLabel.textContent = `seed: ${seed} (${placed} systems${
    mapData.systemsSkipped ? `, ${mapData.systemsSkipped} skipped` : ""
  }, ${mapData.tiles.size} tiles)`;
  seedInput.value = seed;
  writeSeedToUrl(seed);
  requestRedraw();
}

// Generates a fresh map AND resets both players to a brand-new game —
// always overwrites any existing save for this seed, since MVP1 has only
// one save slot. Used by "New Game" and by typing a seed into the input.
function startNewGame(seed) {
  loadMap(seed);
  gameState = createNewGame(mapData);
  saveGame(currentSeed, gameState);
  updateHud();
  hideWinBanner();
  centerCameraOn(mapData.earth.q, mapData.earth.r);
}

function requestRedraw() {
  needsRedraw = true;
}

function centerCameraOn(q, r) {
  const world = axialToPixel(q, r);
  camera.x = world.x;
  camera.y = world.y;
  requestRedraw();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestRedraw();
}

// SELECT_FRAME_COUNT frames * 150ms = a short "marching ants" cycle for the
// active player's selection animation. This is the one periodic (not purely
// dirty-flag) redraw source in the render loop — suppressed while the
// pass-and-play interstitial covers the screen, since nothing need animate
// underneath it.
const SELECT_FRAME_MS = 150;
let lastSelectFrame = -1;

function frame(bandImages, iconImages) {
  const interstitialVisible = interstitial.classList.contains("visible");
  const selectFrame = Math.floor(performance.now() / SELECT_FRAME_MS) % SELECT_FRAME_COUNT;
  if (!interstitialVisible && selectFrame !== lastSelectFrame) {
    lastSelectFrame = selectFrame;
    requestRedraw();
  }
  if (needsRedraw) {
    const active = gameState.players[gameState.activePlayerIndex];
    const ships = gameState.players.map((p, i) => ({
      q: p.q,
      r: p.r,
      color: p.color,
      active: i === gameState.activePlayerIndex,
    }));
    render(
      ctx, window.innerWidth, window.innerHeight, camera, mapData, bandImages, iconImages,
      active.discovered, ships, selectFrame, gameState.pirateBases, gameState.pirateShips
    );
    needsRedraw = false;
  }
  requestAnimationFrame(() => frame(bandImages, iconImages));
}

function updateHud() {
  const active = gameState.players[gameState.activePlayerIndex];
  const playerNum = gameState.activePlayerIndex + 1;
  const level = playerLevel(active);
  turnCountLabel.textContent = `Turn ${gameState.turnNumber ?? 1}`;
  turnLabel.textContent = `Player ${playerNum}'s turn`;
  turnLabel.style.color = active.color;
  levelLabel.textContent = `Level ${level}`;
  xpLabel.textContent = `XP: ${active.xp}/${cumulativeXpForLevel(level + 1)}`;
  movesLabel.textContent = `Moves: ${gameState.movesRemaining}/${movesPerTurnForPlayer(active)}`;
  healthLabel.textContent = `HP: ${active.currentHealth}/${maxHealthForPlayer(active)}`;
  // Both ships render with the same sprite on the map (see render.js) — this
  // corner badge, colored per the active player, is the actual way to tell
  // players apart, i.e. whose turn it currently is.
  playerBadge.style.background = active.color;
  playerBadge.textContent = `P${playerNum}`;
}

function showWinBanner() {
  winBanner.classList.add("visible");
}

function hideWinBanner() {
  winBanner.classList.remove("visible");
}

// `suppressUpgradePicker` lets the anomaly-landing path defer the upgrade
// picker check until after the anomaly result overlay is dismissed, so the
// two blocking overlays never try to show at once.
function afterStateChange({ suppressUpgradePicker = false } = {}) {
  gameState.won = checkWinCondition(mapData, gameState.players);
  if (gameState.won) showWinBanner();
  saveGame(currentSeed, gameState);
  updateHud();
  requestRedraw();
  if (!suppressUpgradePicker) maybeShowUpgradePicker();
}

// Shows the result of a just-triggered anomaly in a blocking overlay (same
// pattern as the pass-and-play interstitial). Recenter the camera first if
// the effect was a teleport, so the player immediately sees where they
// ended up once they dismiss the message.
function showAnomalyOverlay(result) {
  if (result.effect === "wormhole") {
    const active = gameState.players[gameState.activePlayerIndex];
    centerCameraOn(active.q, active.r);
  }
  anomalyMessage.textContent = result.message;
  anomalyOverlay.classList.add("visible");
  requestRedraw();
}

function dismissAnomalyOverlay() {
  anomalyOverlay.classList.remove("visible");
  if (!showNextCombatOverlay()) maybeShowUpgradePicker();
}

// Queued combat result messages (MVP4): more than one can arrive from a
// single end-of-round pirate tick (several ships may each fight someone),
// so — unlike the anomaly overlay, which only ever has one message at a
// time — these are shown one at a time via this queue rather than all at
// once.
let pendingCombatEvents = [];

function showNextCombatOverlay() {
  if (!pendingCombatEvents.length) return false;
  combatMessage.textContent = pendingCombatEvents.shift();
  combatOverlay.classList.add("visible");
  requestRedraw();
  return true;
}

function dismissCombatOverlay() {
  combatOverlay.classList.remove("visible");
  if (!showNextCombatOverlay()) maybeShowUpgradePicker();
}

function renderUpgradeOptions(player) {
  const options = availableUpgrades(player.unlockedUpgrades);
  upgradePickerOptions.innerHTML = "";
  for (const upgrade of options) {
    const btn = document.createElement("button");
    btn.textContent = `${upgrade.name} — ${upgrade.description}`;
    btn.addEventListener("click", () => {
      unlockUpgrade(player, upgrade.id);
      saveGame(currentSeed, gameState);
      updateHud();
      maybeShowUpgradePicker();
    });
    upgradePickerOptions.appendChild(btn);
  }
}

// Shows (or keeps showing, refreshed) the picker if the active player has
// both a pending pick AND something the catalog can currently offer them;
// hides it and resumes play otherwise — including the case where a pick
// is banked/owed but nothing's offerable yet (e.g. every upgrade already
// taken), which is a graceful no-op until a later MVP adds more tracks to
// spend it on.
function maybeShowUpgradePicker() {
  const active = gameState.players[gameState.activePlayerIndex];
  const owed = pendingUpgradePicks(active);
  const options = availableUpgrades(active.unlockedUpgrades);
  if (owed > 0 && options.length > 0) {
    renderUpgradeOptions(active);
    upgradePicker.classList.add("visible");
  } else {
    upgradePicker.classList.remove("visible");
    requestRedraw();
  }
}

function handleTap(screenPos) {
  if (interstitial.classList.contains("visible")) return;
  if (upgradePicker.classList.contains("visible")) return;
  if (anomalyOverlay.classList.contains("visible")) return;
  if (combatOverlay.classList.contains("visible")) return;

  const active = gameState.players[gameState.activePlayerIndex];
  const worldX = (screenPos.x - window.innerWidth / 2) / camera.zoom + camera.x;
  const worldY = (screenPos.y - window.innerHeight / 2) / camera.zoom + camera.y;
  const target = pixelToAxial(worldX, worldY);
  const current = { q: active.q, r: active.r };

  const tile = mapData.tiles.get(axialKey(target.q, target.r));
  if (!tile) return;

  const distance = hexDistance(current, target);
  if (distance <= 0 || distance > gameState.movesRemaining) return;

  const path = hexLine(current, target);
  // Live pirate at the TAPPED TARGET, checked before committing any
  // movement — needed for the "attacking ship doesn't move onto the
  // target's tile unless it destroys the opponent" rule below.
  const pirateAtTarget = findPirateAt(gameState, target.q, target.r);

  let suppressUpgradePicker = false;

  if (pirateAtTarget) {
    // Stop one hex short of a live pirate; only advance onto its tile if
    // this attack finishes it off. Attacking costs a flat ATTACK_MOVE_COST
    // regardless of how far the ship traveled to engage (or whether it
    // was already adjacent) — simpler than, and replaces, the earlier
    // "full tapped distance" rule.
    const approachPath = path.length > 1 ? path.slice(0, -1) : [current];
    applyMove(mapData, active, approachPath);
    gameState.movesRemaining = Math.max(0, gameState.movesRemaining - ATTACK_MOVE_COST);

    const combatResult = resolvePlayerAttack(mapData, gameState, active, pirateAtTarget);
    pendingCombatEvents.push(combatResult.message);
    suppressUpgradePicker = true;
    if (combatResult.defenderDefeated) {
      applyMove(mapData, active, [target]); // vacated — advance in
    }
    if (combatResult.attackerDefeated) {
      // Ship lost this turn — forfeit remaining moves. Only this path
      // (the player's own live turn) does this; a round-tick pirate
      // attack has no "current active player's moves" to forfeit (see
      // state.js's applyShipLoss comment).
      gameState.movesRemaining = 0;
    }
  } else {
    applyMove(mapData, active, path);
    gameState.movesRemaining -= distance;
  }

  // Always checked against the player's FINAL actual position (full move,
  // or the kill-then-advance path above) — never fires against a tile the
  // player merely stopped short of. Since a live pirate can never occupy
  // the same tile as a just-destroyed one, there's no risk of this
  // double-firing against a tile that also happens to hold a pirate.
  const anomalyTile = checkAnomalyLanding(mapData, gameState, active);
  let anomalyResult = null;
  if (anomalyTile) {
    anomalyResult = triggerAnomaly(mapData, active, anomalyTile);
    suppressUpgradePicker = true;
  }

  afterStateChange({ suppressUpgradePicker });
  if (anomalyTile) {
    showAnomalyOverlay(anomalyResult);
  } else if (pendingCombatEvents.length) {
    showNextCombatOverlay();
  }
}

function endTurn() {
  saveGame(currentSeed, gameState);
  gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  // "Turn N" counts full rounds, not individual End Turn presses — only
  // increment once the turn has wrapped back around to the first player.
  // Nullish-coalesced rather than a plain `+= 1` so a gameState object
  // that somehow reached here without turnNumber (e.g. a stale in-memory
  // reference from before this field existed) self-heals to "Turn 2"
  // instead of permanently latching onto NaN.
  if (gameState.activePlayerIndex === 0) {
    gameState.turnNumber = (gameState.turnNumber ?? 1) + 1;
    // Pirates act once per full round (both players' turns complete), not
    // per-player-turn or per-move — see docs/game-design.md's Pirates
    // section. Any resulting combat messages queue behind whatever's
    // already pending and surface once the pass-and-play interstitial
    // below is dismissed (see dismissInterstitial's tail).
    const events = tickPirates(mapData, gameState);
    for (const event of events) pendingCombatEvents.push(event.message);
    tickPassiveHealing(gameState);
  }
  const nextActive = gameState.players[gameState.activePlayerIndex];
  gameState.movesRemaining = movesPerTurnForPlayer(nextActive);
  saveGame(currentSeed, gameState);
  updateHud();
  interstitialMessage.textContent = `Pass to Player ${gameState.activePlayerIndex + 1}`;
  interstitial.classList.add("visible");
  requestRedraw();
}

function dismissInterstitial() {
  interstitial.classList.remove("visible");
  const active = gameState.players[gameState.activePlayerIndex];
  centerCameraOn(active.q, active.r);
  if (!showNextCombatOverlay()) maybeShowUpgradePicker();
}

window.addEventListener("resize", resizeCanvas);
attachCameraControls(canvas, camera, requestRedraw, handleTap);

newMapButton.addEventListener("click", () => {
  startNewGame(Math.random().toString(36).slice(2));
});

seedInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startNewGame(seedInput.value.trim() || "earth");
});

endTurnButton.addEventListener("click", endTurn);
interstitial.addEventListener("pointerdown", dismissInterstitial);
anomalyOverlay.addEventListener("pointerdown", dismissAnomalyOverlay);
combatOverlay.addEventListener("pointerdown", dismissCombatOverlay);

resizeCanvas();

const urlSeed = readSeedFromUrl();
const saved = loadGame();
if (saved && (!urlSeed || urlSeed === saved.seed)) {
  loadMap(saved.seed);
  gameState = saved.gameState;
  // mapData was just regenerated fresh from the seed (never persisted
  // directly) — replay any anomalies a prior session already destroyed so
  // they don't reappear.
  applyDestroyedAnomalies(mapData, gameState);
  updateHud();
  if (checkWinCondition(mapData, gameState.players)) {
    gameState.won = true;
    showWinBanner();
  }
  const active = gameState.players[gameState.activePlayerIndex];
  centerCameraOn(active.q, active.r);
  maybeShowUpgradePicker();
} else {
  startNewGame(urlSeed || "earth");
  maybeShowUpgradePicker();
}

const [bandImages, iconImages] = await Promise.all([loadBandImages(), loadIconImages()]);
requestAnimationFrame(() => frame(bandImages, iconImages));
