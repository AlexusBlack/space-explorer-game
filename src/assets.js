// Loads the per-band hex background art and feature icon sprites once at startup.

import { PLANET_CLASSES } from "./planet-classes.js";

const BAND_IMAGE_PATHS = {
  inner: "images/starfield-inner-hex.png",
  medium: "images/starfield-medium-hex.png",
  outer: "images/starfield-base-outer-hex.png",
  interstellar: "images/starfield-interstellar-hex.png",
  "deep-space": "images/starfield-deep-space-hex.png",
};

// Cropped from images/terrain1.png / images/hills.png / images/units.png —
// see docs/graphics-and-assets.md for exact source cells.
const ICON_IMAGE_PATHS = {
  star: "images/icons/star.png",
  "wonder-blackhole": "images/icons/wonder-blackhole.png",
  ship: "images/icons/ship.png",
  // Not cropped/chroma-keyed like the sprites above — already has real
  // per-pixel alpha. An 8-frame (48x48 each) horizontal strip, recolored
  // per-player at draw time in render.js rather than baked into a file.
  select: "images/select-alpha.png",
};
for (const sprites of Object.values(PLANET_CLASSES)) {
  for (const sprite of sprites) {
    ICON_IMAGE_PATHS[sprite] = `images/icons/${sprite}.png`;
  }
}
for (let i = 1; i <= 16; i++) {
  ICON_IMAGE_PATHS[`asteroid-belt-${i}`] = `images/icons/asteroid-belt-${i}.png`;
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
    img.src = path;
  });
}

async function loadImageMap(paths) {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await loadImage(path)])
  );
  return Object.fromEntries(entries);
}

export function loadBandImages() {
  return loadImageMap(BAND_IMAGE_PATHS);
}

export function loadIconImages() {
  return loadImageMap(ICON_IMAGE_PATHS);
}
