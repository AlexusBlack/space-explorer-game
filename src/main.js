import { generateMap } from "./mapgen.js";
import { render } from "./render.js";
import { attachCameraControls } from "./input.js";
import { loadBandImages, loadIconImages } from "./assets.js";
import { hexDistance, hexLine, pixelToAxial, axialToPixel, axialKey } from "./hexgrid.js";
import {
  MOVES_PER_TURN,
  createNewGame,
  applyMove,
  checkWinCondition,
  saveGame,
  loadGame,
} from "./state.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const seedLabel = document.getElementById("seed-label");
const turnCountLabel = document.getElementById("turn-count-label");
const seedInput = document.getElementById("seed-input");
const newMapButton = document.getElementById("new-map");
const turnLabel = document.getElementById("turn-label");
const xpLabel = document.getElementById("xp-label");
const movesLabel = document.getElementById("moves-label");
const endTurnButton = document.getElementById("end-turn");
const winBanner = document.getElementById("win-banner");
const playerBadge = document.getElementById("player-badge");
const interstitial = document.getElementById("interstitial");
const interstitialMessage = document.getElementById("interstitial-message");

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

// 8 frames * 150ms = a 1.2s pulse loop for the active player's selection
// animation. This is the one periodic (not purely dirty-flag) redraw
// source in the render loop — suppressed while the pass-and-play
// interstitial covers the screen, since nothing need animate underneath it.
const SELECT_FRAME_MS = 150;
let lastSelectFrame = -1;

function frame(bandImages, iconImages) {
  const interstitialVisible = interstitial.classList.contains("visible");
  const selectFrame = Math.floor(performance.now() / SELECT_FRAME_MS) % 8;
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
    render(ctx, window.innerWidth, window.innerHeight, camera, mapData, bandImages, iconImages, active.discovered, ships, selectFrame);
    needsRedraw = false;
  }
  requestAnimationFrame(() => frame(bandImages, iconImages));
}

function updateHud() {
  const active = gameState.players[gameState.activePlayerIndex];
  const playerNum = gameState.activePlayerIndex + 1;
  turnCountLabel.textContent = `Turn ${gameState.turnNumber}`;
  turnLabel.textContent = `Player ${playerNum}'s turn`;
  turnLabel.style.color = active.color;
  xpLabel.textContent = `XP: ${active.xp}`;
  movesLabel.textContent = `Moves: ${gameState.movesRemaining}/${MOVES_PER_TURN}`;
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

function afterStateChange() {
  gameState.won = checkWinCondition(mapData, gameState.players);
  if (gameState.won) showWinBanner();
  saveGame(currentSeed, gameState);
  updateHud();
  requestRedraw();
}

function handleTap(screenPos) {
  if (interstitial.classList.contains("visible")) return;

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
  applyMove(mapData, active, path);
  gameState.movesRemaining -= distance;
  afterStateChange();
}

function endTurn() {
  saveGame(currentSeed, gameState);
  gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  // "Turn N" counts full rounds, not individual End Turn presses — only
  // increment once the turn has wrapped back around to the first player.
  if (gameState.activePlayerIndex === 0) {
    gameState.turnNumber += 1;
  }
  gameState.movesRemaining = MOVES_PER_TURN;
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

resizeCanvas();

const urlSeed = readSeedFromUrl();
const saved = loadGame();
if (saved && (!urlSeed || urlSeed === saved.seed)) {
  loadMap(saved.seed);
  gameState = saved.gameState;
  updateHud();
  if (checkWinCondition(mapData, gameState.players)) {
    gameState.won = true;
    showWinBanner();
  }
  const active = gameState.players[gameState.activePlayerIndex];
  centerCameraOn(active.q, active.r);
} else {
  startNewGame(urlSeed || "earth");
}

const [bandImages, iconImages] = await Promise.all([loadBandImages(), loadIconImages()]);
requestAnimationFrame(() => frame(bandImages, iconImages));
