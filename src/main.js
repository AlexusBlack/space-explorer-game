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
  clearNotifications,
  pruneNotifications,
} from "./state.js";
import { availableUpgrades } from "./upgrades.js";
import { findPirateAt, resolvePlayerAttack, tickPirates, ATTACK_MOVE_COST } from "./pirates.js";

// Star/planet name list for mapgen's naming pass (data, not code: no build step).
const names = await fetch("data/star_planet_names.json").then((r) => r.json());
// Species catalogue: mapgen assigns one to each inhabited world, and the world
// card shows its portrait and description.
const species = await fetch("species/species.json").then((r) => r.json());
const speciesById = new Map(species.map((s) => [s.id, s]));

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
const worldCard = document.getElementById("world-card");
const worldCardName = document.getElementById("world-card-name");
const worldCardType = document.getElementById("world-card-type");
const worldCardImage = document.getElementById("world-card-image");
const worldCardSpecies = document.getElementById("world-card-species");
const worldCardDescription = document.getElementById("world-card-description");
const notificationList = document.getElementById("notifications");
const noticeCaption = document.getElementById("notice-caption");

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
// Name tags drawn in the last frame ({rect, tile}), for tap hit-testing.
let tagHits = [];

// Loads/generates the map for `seed` without touching player/turn state —
// used both by startNewGame (below) and by the resume-from-save path, since
// the map itself is always cheaply/deterministically rebuilt from the seed
// rather than persisted.
function loadMap(seed) {
  currentSeed = seed;
  mapData = generateMap({ seed, names, species });
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
    ({ tagHits } = render(
      ctx, window.innerWidth, window.innerHeight, camera, mapData, bandImages, iconImages,
      active.discovered, ships, selectFrame, gameState.pirateBases, gameState.pirateShips
    ));
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
  renderNotifications();
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
  for (const player of gameState.players) pruneNotifications(mapData, player);
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

// Queued combat result messages (MVP4) for the active player's own attacks.
// End-of-round pirate attacks used to queue here too; they now go to the
// attacked player's notification area instead (see endTurn).
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

const CLASS_DISPLAY_NAMES = {
  rocky: "Rocky",
  ice: "Ice",
  "gas-giant": "Gas giant",
  toxic: "Toxic",
  molten: "Molten",
};

// The tag drawn last is on top, so it wins an overlap.
function tagAt(screenPos) {
  for (let i = tagHits.length - 1; i >= 0; i--) {
    const { rect, tile } = tagHits[i];
    if (
      screenPos.x >= rect.x && screenPos.x <= rect.x + rect.w &&
      screenPos.y >= rect.y && screenPos.y <= rect.y + rect.h
    ) {
      return tile;
    }
  }
  return null;
}

function speciesImagePath(kind) {
  return `species/images-opt/${String(kind.id).padStart(3, "0")}-${kind.key}.webp`;
}

// Right-edge notification area: the active player's own list, rebuilt from
// player.notifications whenever state changes. Tap centers on the object and
// shows its message for a few seconds; a horizontal swipe removes it.
const NOTICE_CAPTION_MS = 7000;
const NOTICE_SWIPE_DISTANCE = 40;
const NOTICE_TAP_THRESHOLD = 10; // same as input.js's TAP_MOVE_THRESHOLD
let noticeCaptionTimer = null;

function renderNotifications() {
  const active = gameState.players[gameState.activePlayerIndex];
  notificationList.replaceChildren(...active.notifications.map((n) => noticeElement(active, n)));
}

function noticeElement(player, notification) {
  const el = document.createElement("div");
  el.className = `notice notice-${notification.kind}`;
  el.title = notification.message;
  const kind = notification.kind === "species" ? speciesById.get(notification.speciesId) : null;
  if (notification.kind === "anomaly") {
    el.textContent = "?";
  } else {
    const img = document.createElement("img");
    img.alt = "";
    img.src = kind ? speciesImagePath(kind) : "images/icons/pirate-ship.png";
    el.appendChild(img);
  }

  let downX = null;
  let dx = 0;
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    el.classList.remove("snap");
    downX = e.clientX;
    dx = 0;
  });
  el.addEventListener("pointermove", (e) => {
    if (downX === null) return;
    dx = e.clientX - downX;
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 120));
  });
  const release = (e) => {
    if (downX === null) return;
    downX = null;
    el.classList.add("snap");
    if (Math.abs(dx) >= NOTICE_SWIPE_DISTANCE) {
      const i = player.notifications.indexOf(notification);
      if (i >= 0) player.notifications.splice(i, 1);
      saveGame(currentSeed, gameState);
      renderNotifications();
      return;
    }
    el.style.transform = "";
    el.style.opacity = "";
    if (e.type === "pointerup" && Math.abs(dx) < NOTICE_TAP_THRESHOLD) openNotification(notification);
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  return el;
}

function openNotification(notification) {
  centerCameraOn(notification.q, notification.r);
  noticeCaption.textContent = notification.message;
  noticeCaption.hidden = false;
  clearTimeout(noticeCaptionTimer);
  noticeCaptionTimer = setTimeout(hideNoticeCaption, NOTICE_CAPTION_MS);
}

function hideNoticeCaption() {
  clearTimeout(noticeCaptionTimer);
  noticeCaption.hidden = true;
}

// Info card for an inhabited world, opened by tapping its name tag. Display
// only: nothing in the game reads species.
function showWorldCard(tile) {
  const kind = tile.species ? speciesById.get(tile.species.id) : null;
  worldCardName.textContent = tile.ownName;
  worldCardType.textContent = `${CLASS_DISPLAY_NAMES[tile.planetClass]} ${tile.type}`;
  worldCardSpecies.textContent = tile.species ? tile.species.name : "Unknown species";
  worldCardDescription.textContent = kind ? kind.description : "";
  worldCardImage.hidden = !kind;
  if (kind) {
    worldCardImage.src = speciesImagePath(kind);
    worldCardImage.alt = tile.species.name;
  }
  worldCard.classList.add("visible");
}

function dismissWorldCard() {
  worldCard.classList.remove("visible");
}

function handleTap(screenPos) {
  if (interstitial.classList.contains("visible")) return;
  if (upgradePicker.classList.contains("visible")) return;
  if (anomalyOverlay.classList.contains("visible")) return;
  if (combatOverlay.classList.contains("visible")) return;
  if (worldCard.classList.contains("visible")) return;

  // A tap on an inhabited world's name tag opens its card instead of moving.
  const tagged = tagAt(screenPos);
  if (tagged) {
    showWorldCard(tagged);
    return;
  }

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
  // Cleared before the pirate tick below, so an attack on the player who
  // just ended their turn still reaches them at their next turn.
  clearNotifications(gameState.players[gameState.activePlayerIndex]);
  hideNoticeCaption();
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
    // section. Each fight goes to the attacked player's own notification
    // area (not a blocking overlay), so they see it on their next turn.
    const events = tickPirates(mapData, gameState);
    for (const { playerIndex, q, r, message } of events) {
      gameState.players[playerIndex].notifications.push({ kind: "pirate", q, r, message });
    }
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
worldCard.addEventListener("pointerdown", dismissWorldCard);

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
  for (const player of gameState.players) pruneNotifications(mapData, player);
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
