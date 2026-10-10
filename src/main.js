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
  pickableUpgrades,
  cumulativeXpForLevel,
  checkAnomalyLanding,
  triggerAnomaly,
  applyDestroyedAnomalies,
  clearNotifications,
  pruneNotifications,
  trailTurnsForPlayer,
} from "./state.js";
import { currentStep, recordTrail, pruneTrails, playerTrailId, trailsForViewer } from "./trails.js";
import { findPirateAt, resolvePlayerAttack, tickPirates, ATTACK_MOVE_COST } from "./pirates.js";
import { buildTileReport, CLASS_DISPLAY_NAMES } from "./tile-report.js";
import {
  TEAM_COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  SHIP_PREFIX,
  defaultSetup,
  addPlayer,
  removePlayer,
  pickShipName,
  normalizeSetup,
  shipTitle,
} from "./setup.js";

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
const tileReport = document.getElementById("tile-report");
const tileReportTitle = document.getElementById("tile-report-title");
const tileReportCoords = document.getElementById("tile-report-coords");
const tileReportRows = document.getElementById("tile-report-rows");
const tileReportEntities = document.getElementById("tile-report-entities");
const tileReportWorld = document.getElementById("tile-report-world");
const setupScreen = document.getElementById("setup");
const setupSeed = document.getElementById("setup-seed");
const setupSeedReroll = document.getElementById("setup-seed-reroll");
const setupPlayerList = document.getElementById("setup-players");
const setupAdd = document.getElementById("setup-add");
const setupCancel = document.getElementById("setup-cancel");
const setupStart = document.getElementById("setup-start");
const tileReportClose = document.getElementById("tile-report-close");
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
  writeSeedToUrl(seed);
  requestRedraw();
}

// Generates a fresh map AND a brand-new game for the start screen's roster
// (`setup`, see setup.js) — always overwrites any existing save, since
// there's only one save slot.
function startNewGame(seed, setup) {
  loadMap(seed);
  gameState = createNewGame(mapData, setup);
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
  // No game yet on a first launch: only the start screen shows.
  if (needsRedraw && gameState) {
    const active = gameState.players[gameState.activePlayerIndex];
    const ships = gameState.players.map((p, i) => ({
      q: p.q,
      r: p.r,
      color: p.color,
      label: shipTitle(p),
      health: p.currentHealth,
      maxHealth: maxHealthForPlayer(p),
      active: i === gameState.activePlayerIndex,
    }));
    ({ tagHits } = render(
      ctx, window.innerWidth, window.innerHeight, camera, mapData, bandImages, iconImages,
      active.discovered, ships, selectFrame, gameState.pirateBases, gameState.pirateShips,
      trailsForViewer(gameState, trailTurnsForPlayer(active))
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
  turnLabel.textContent = `${active.name}'s turn · ${shipTitle(active)}`;
  turnLabel.style.color = active.color;
  levelLabel.textContent = `Level ${level}`;
  xpLabel.textContent = `XP: ${active.xp}/${cumulativeXpForLevel(level + 1)}`;
  movesLabel.textContent = `Moves: ${gameState.movesRemaining}/${movesPerTurnForPlayer(active)}`;
  healthLabel.textContent = `HP: ${active.currentHealth}/${maxHealthForPlayer(active)}`;
  // Every ship renders with the same sprite on the map (see render.js) —
  // this corner badge, in the active player's team colour, shows whose turn
  // it is. It keeps the turn-order number because teammates share a colour.
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
  const options = pickableUpgrades(player);
  upgradePickerOptions.innerHTML = "";
  for (const upgrade of options) {
    const btn = document.createElement("button");
    const hp = upgrade.repeatable ? ` (${player.currentHealth}/${maxHealthForPlayer(player)} HP)` : "";
    btn.textContent = `${upgrade.name} — ${upgrade.description}${hp}`;
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
// spend it on. Instant Ship Repair is offered whenever the ship is damaged,
// so a banked pick reopens the picker once the player takes damage.
function maybeShowUpgradePicker() {
  const active = gameState.players[gameState.activePlayerIndex];
  const owed = pendingUpgradePicks(active);
  const options = pickableUpgrades(active);
  if (owed > 0 && options.length > 0) {
    renderUpgradeOptions(active);
    upgradePicker.classList.add("visible");
  } else {
    upgradePicker.classList.remove("visible");
    requestRedraw();
  }
}

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
    img.src = kind
      ? speciesImagePath(kind)
      : notification.kind === "wormhole"
        ? "images/icons/wormhole-glyph.png"
        : "images/icons/pirate-ship.png";
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
  // An inhabited world opens its world card, which already says everything
  // the caption would.
  if (notification.kind === "species") {
    const tile = mapData.tiles.get(axialKey(notification.q, notification.r));
    if (tile) {
      hideNoticeCaption();
      showWorldCard(tile);
      return;
    }
  }
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

// Tile report window, opened by long-pressing a hex (see input.js). The
// facts come from tile-report.js; this only lays them out.
let tileReportWorldTile = null;

function appendRows(dl, rows) {
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
}

function showTileReport(screenPos) {
  const { q, r } = screenToHex(screenPos);
  const report = buildTileReport(mapData, gameState, q, r);
  tileReportTitle.textContent = report.title;
  tileReportCoords.textContent = `Coordinates ${report.coords}`;
  tileReportRows.replaceChildren();
  appendRows(tileReportRows, report.rows);
  tileReportEntities.replaceChildren();
  for (const entity of report.entities) {
    const section = document.createElement("div");
    section.className = "tile-report-entity";
    const heading = document.createElement("h3");
    heading.textContent = entity.title;
    const dl = document.createElement("dl");
    appendRows(dl, entity.rows);
    section.append(heading, dl);
    tileReportEntities.append(section);
  }
  tileReportWorldTile = report.worldTile;
  tileReportWorld.hidden = !report.worldTile;
  tileReport.classList.add("visible");
}

function dismissTileReport() {
  tileReport.classList.remove("visible");
  tileReportWorldTile = null;
}

// Any full-screen window that should swallow map gestures.
function overlayOpen() {
  return [
    interstitial, upgradePicker, anomalyOverlay, combatOverlay, worldCard, tileReport, setupScreen,
  ].some((el) => el.classList.contains("visible"));
}

function screenToHex(screenPos) {
  const worldX = (screenPos.x - window.innerWidth / 2) / camera.zoom + camera.x;
  const worldY = (screenPos.y - window.innerHeight / 2) / camera.zoom + camera.y;
  return pixelToAxial(worldX, worldY);
}

function handleLongPress(screenPos) {
  if (overlayOpen()) return;
  showTileReport(screenPos);
}

function handleTap(screenPos) {
  if (overlayOpen()) return;

  // A tap on an inhabited world's name tag opens its card instead of moving.
  const tagged = tagAt(screenPos);
  if (tagged) {
    showWorldCard(tagged);
    return;
  }

  const active = gameState.players[gameState.activePlayerIndex];
  const target = screenToHex(screenPos);
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
    moveActive(active, approachPath);
    gameState.movesRemaining = Math.max(0, gameState.movesRemaining - ATTACK_MOVE_COST);

    const combatResult = resolvePlayerAttack(mapData, gameState, active, pirateAtTarget);
    pendingCombatEvents.push(combatResult.message);
    suppressUpgradePicker = true;
    if (combatResult.defenderDefeated) {
      moveActive(active, [approachPath[approachPath.length - 1], target]); // vacated — advance in
    }
    if (combatResult.attackerDefeated) {
      // Ship lost this turn — forfeit remaining moves. Only this path
      // (the player's own live turn) does this; a round-tick pirate
      // attack has no "current active player's moves" to forfeit (see
      // state.js's applyShipLoss comment).
      gameState.movesRemaining = 0;
    }
  } else {
    moveActive(active, path);
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

// applyMove plus the Vessel Trail Detector's record of the hexes moved
// through (path includes the start hex).
function moveActive(active, path) {
  applyMove(mapData, active, path);
  const index = gameState.players.indexOf(active);
  recordTrail(gameState, playerTrailId(index), active.color, path, currentStep(gameState));
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
    // Pirates act once per full round (every player's turn complete), not
    // per-player-turn or per-move — see docs/game-design.md's Pirates
    // section. Each fight goes to the attacked player's own notification
    // area (not a blocking overlay), so they see it on their next turn.
    const events = tickPirates(mapData, gameState);
    for (const { playerIndex, q, r, message } of events) {
      gameState.players[playerIndex].notifications.push({ kind: "pirate", q, r, message });
    }
    tickPassiveHealing(gameState);
  }
  pruneTrails(gameState);
  const nextActive = gameState.players[gameState.activePlayerIndex];
  gameState.movesRemaining = movesPerTurnForPlayer(nextActive);
  saveGame(currentSeed, gameState);
  updateHud();
  interstitialMessage.textContent = `Pass to ${nextActive.name}`;
  interstitial.classList.add("visible");
  requestRedraw();
}

function dismissInterstitial() {
  interstitial.classList.remove("visible");
  const active = gameState.players[gameState.activePlayerIndex];
  centerCameraOn(active.q, active.r);
  if (!showNextCombatOverlay()) maybeShowUpgradePicker();
}

// --- Start screen -------------------------------------------------------
// Edited in place by the #setup form; handed to startNewGame on Start.
let setupPlayers = [];

function randomSeed() {
  return Math.random().toString(36).slice(2);
}

// `cancellable` only when a game is already running to return to.
function showSetup({ cancellable, seed = randomSeed() }) {
  setupPlayers = defaultSetup();
  setupSeed.value = seed;
  setupCancel.hidden = !cancellable;
  renderSetup();
  setupScreen.classList.add("visible");
}

function hideSetup() {
  setupScreen.classList.remove("visible");
}

function setupButton(text, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

function setupTextInput(value, label, onInput) {
  const input = document.createElement("input");
  input.value = value;
  input.maxLength = NAME_MAX_LENGTH;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

// One row per player: team colour, name, "ICV" + ship name with a reroll,
// and remove. Rebuilt after add/remove/reroll; typing edits setupPlayers
// directly without a rebuild (so focus isn't lost).
function renderSetup() {
  setupPlayerList.replaceChildren();
  setupPlayers.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "setup-row";

    // iOS can't colour individual <option>s, so the select itself shows
    // the chosen team colour.
    const team = document.createElement("select");
    team.className = "setup-team";
    team.setAttribute("aria-label", "Team colour");
    for (const { color, name } of TEAM_COLORS) {
      const option = document.createElement("option");
      option.value = color;
      option.textContent = name;
      team.append(option);
    }
    team.value = player.color;
    team.style.background = player.color;
    team.addEventListener("change", () => {
      player.color = team.value;
      team.style.background = team.value;
    });

    const name = setupTextInput(player.name, "Player name", (v) => {
      player.name = v;
    });
    name.className = "setup-name";
    name.placeholder = "Player name";

    const ship = document.createElement("span");
    ship.className = "setup-ship";
    const prefix = document.createElement("span");
    prefix.textContent = SHIP_PREFIX;
    const shipInput = setupTextInput(player.shipName, "Ship name", (v) => {
      player.shipName = v;
    });
    shipInput.placeholder = "Ship name";
    const reroll = setupButton("🎲", "Random ship name", () => {
      player.shipName = pickShipName(setupPlayers);
      renderSetup();
    });
    ship.append(prefix, shipInput, reroll);

    const remove = setupButton("×", "Remove player", () => {
      removePlayer(setupPlayers, index);
      renderSetup();
    });
    remove.className = "setup-remove";
    remove.disabled = setupPlayers.length <= MIN_PLAYERS;

    row.append(team, name, ship, remove);
    setupPlayerList.append(row);
  });
  setupAdd.disabled = setupPlayers.length >= MAX_PLAYERS;
}

window.addEventListener("resize", resizeCanvas);
attachCameraControls(canvas, camera, requestRedraw, handleTap, handleLongPress);

newMapButton.addEventListener("click", () => showSetup({ cancellable: true }));
setupSeedReroll.addEventListener("click", () => {
  setupSeed.value = randomSeed();
});
setupAdd.addEventListener("click", () => {
  addPlayer(setupPlayers);
  renderSetup();
});
setupCancel.addEventListener("click", hideSetup);
setupStart.addEventListener("click", () => {
  const seed = setupSeed.value.trim() || randomSeed();
  const setup = normalizeSetup(setupPlayers);
  hideSetup();
  startNewGame(seed, setup);
  maybeShowUpgradePicker();
});

endTurnButton.addEventListener("click", endTurn);
interstitial.addEventListener("pointerdown", dismissInterstitial);
anomalyOverlay.addEventListener("pointerdown", dismissAnomalyOverlay);
combatOverlay.addEventListener("pointerdown", dismissCombatOverlay);
worldCard.addEventListener("pointerdown", dismissWorldCard);
// Only the backdrop and the close button dismiss, so "View world" stays pressable.
tileReport.addEventListener("pointerdown", (e) => {
  if (e.target === tileReport) dismissTileReport();
});
tileReportClose.addEventListener("click", dismissTileReport);
tileReportWorld.addEventListener("click", () => {
  const tile = tileReportWorldTile;
  dismissTileReport();
  if (tile) showWorldCard(tile);
});

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
  showSetup({ cancellable: false, seed: urlSeed || randomSeed() });
}

const [bandImages, iconImages] = await Promise.all([loadBandImages(), loadIconImages()]);
requestAnimationFrame(() => frame(bandImages, iconImages));
