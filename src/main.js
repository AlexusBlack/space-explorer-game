import { generateMap } from "./mapgen.js";
import { render } from "./render.js";
import { attachCameraControls } from "./input.js";
import { loadBandImages, loadIconImages } from "./assets.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const seedLabel = document.getElementById("seed-label");
const seedInput = document.getElementById("seed-input");
const newMapButton = document.getElementById("new-map");

function readSeedFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("seed");
}

function writeSeedToUrl(seed) {
  const params = new URLSearchParams(location.search);
  params.set("seed", seed);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

// Zoomed out by default since tile art renders at native (large) resolution
// at zoom 1 — see hexgrid.js's HEX_SIZE.
const DEFAULT_ZOOM = 0.3;

const camera = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
let mapData;
let needsRedraw = true;

function loadMap(seed) {
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

function requestRedraw() {
  needsRedraw = true;
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

function frame(bandImages, iconImages) {
  if (needsRedraw) {
    render(ctx, window.innerWidth, window.innerHeight, camera, mapData, bandImages, iconImages);
    needsRedraw = false;
  }
  requestAnimationFrame(() => frame(bandImages, iconImages));
}

window.addEventListener("resize", resizeCanvas);
attachCameraControls(canvas, camera, requestRedraw);

newMapButton.addEventListener("click", () => {
  loadMap(Math.random().toString(36).slice(2));
});

seedInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadMap(seedInput.value.trim() || "earth");
});

resizeCanvas();
loadMap(readSeedFromUrl() || "earth");

const [bandImages, iconImages] = await Promise.all([loadBandImages(), loadIconImages()]);
requestAnimationFrame(() => frame(bandImages, iconImages));
