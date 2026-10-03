// Loads the per-band hex background art and feature icon sprites once at startup.

const BAND_IMAGE_PATHS = {
  inner: "images/starfield-inner-hex.png",
  medium: "images/starfield-medium-hex.png",
  outer: "images/starfield-base-outer-hex.png",
  interstellar: "images/starfield-interstellar-hex.png",
  "deep-space": "images/starfield-deep-space-hex.png",
};

// Cropped from images/terrain1.png — see docs/graphics-and-assets.md for exact source cells.
const ICON_IMAGE_PATHS = {
  star: "images/icons/star.png",
  "planet-uninhabited": "images/icons/planet-uninhabited.png",
  "planet-inhabited": "images/icons/planet-inhabited.png",
  "wonder-blackhole": "images/icons/wonder-blackhole.png",
};

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
