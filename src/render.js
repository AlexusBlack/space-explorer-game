// Canvas 2D rendering: per-tile band background image (precomputed at
// generation time, see mapgen.js) with a feature icon layered on top where
// present. All feature icons (star/planet/black-hole/asteroid-belt) are real
// sprites cropped from terrain1.png/terrain2.png — see
// docs/graphics-and-assets.md for exact source cells.

import { HEX_WIDTH, HEX_HEIGHT, axialToPixel, pixelToAxial, axialKey } from "./hexgrid.js";

const BACKGROUND = "#05070d";

// Target icon diameter as a fraction of min(hw, hh) — the larger of the
// icon's own width/height is scaled to this, aspect ratio preserved.
const ICON_SIZE_FRAC = {
  star: 0.9,
  starSecondary: 0.6,
  "planet-uninhabited": 0.55,
  "planet-inhabited": 0.6,
  "wonder-blackhole": 1.4,
  "asteroid-belt": 1.3,
};

// The band art template is 276x241px: a 256x221 (HEX_WIDTH x HEX_HEIGHT) hex
// silhouette centered with a 10px alignment-guide margin on each side. The
// full image must be scaled (not cropped) so its *content* exactly fills the
// tile, or that margin shows up as a visible transparent gap between tiles.
const TEMPLATE_IMAGE_WIDTH = 276;
const TEMPLATE_IMAGE_HEIGHT = 241;

export function worldToScreen(camera, canvasW, canvasH, x, y) {
  return {
    x: (x - camera.x) * camera.zoom + canvasW / 2,
    y: (y - camera.y) * camera.zoom + canvasH / 2,
  };
}

function drawIcon(ctx, img, cx, cy, targetSize) {
  if (!img) return;
  const scale = targetSize / Math.max(img.width, img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// Only 2 source sprites exist, so each belt tile's precomputed rotation/flip
// (see mapgen.js's pickBeltAppearance) is what keeps many belt tiles from
// all looking identical.
function drawAsteroidBelt(ctx, tile, iconImages, cx, cy, targetSize) {
  const img = iconImages && iconImages[`asteroid-belt-${tile.variant}`];
  if (!img) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tile.rotation);
  if (tile.flip) ctx.scale(-1, 1);
  drawIcon(ctx, img, 0, 0, targetSize);
  ctx.restore();
}

function drawLabel(ctx, text, p, hh, zoom) {
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `${Math.max(10, 12 * zoom)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, p.x, p.y + hh + 14 * zoom);
}

function tileWorldBounds(radius) {
  return { halfW: radius * HEX_WIDTH, halfH: radius * HEX_HEIGHT };
}

export { tileWorldBounds };

// Only the hexes actually within the viewport are looked up (plus a small
// margin), rather than scanning every stored tile every frame — this is what
// keeps per-frame cost bounded by screen size, not total map size.
function visibleHexRange(camera, canvasW, canvasH) {
  const left = camera.x - canvasW / 2 / camera.zoom - HEX_WIDTH;
  const right = camera.x + canvasW / 2 / camera.zoom + HEX_WIDTH;
  const top = camera.y - canvasH / 2 / camera.zoom - HEX_HEIGHT;
  const bottom = camera.y + canvasH / 2 / camera.zoom + HEX_HEIGHT;

  const corners = [
    pixelToAxial(left, top),
    pixelToAxial(right, top),
    pixelToAxial(left, bottom),
    pixelToAxial(right, bottom),
  ];
  const qs = corners.map((c) => c.q);
  const rs = corners.map((c) => c.r);
  return {
    qMin: Math.min(...qs),
    qMax: Math.max(...qs),
    rMin: Math.min(...rs),
    rMax: Math.max(...rs),
  };
}

export function render(ctx, canvasW, canvasH, camera, mapData, bandImages, iconImages) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const hw = (HEX_WIDTH / 2) * camera.zoom;
  const hh = (HEX_HEIGHT / 2) * camera.zoom;

  const { qMin, qMax, rMin, rMax } = visibleHexRange(camera, canvasW, canvasH);

  // Labels are queued and drawn in a separate final pass (see below) so a
  // later-drawn neighboring tile's opaque background can never paint over a
  // label that spills past this tile's own edge.
  const pendingLabels = [];

  const imgScale = (hw * 2) / HEX_WIDTH;
  const imgDrawW = TEMPLATE_IMAGE_WIDTH * imgScale;
  const imgDrawH = TEMPLATE_IMAGE_HEIGHT * imgScale;

  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      const tile = mapData.tiles.get(axialKey(q, r));
      if (!tile) continue;

      const world = axialToPixel(tile.q, tile.r);
      const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);

      const bandImg = bandImages && bandImages[tile.band];
      if (bandImg) {
        ctx.drawImage(bandImg, p.x - imgDrawW / 2, p.y - imgDrawH / 2, imgDrawW, imgDrawH);
      }

      const minDim = Math.min(hw, hh);

      switch (tile.type) {
        case "band":
          break;
        case "star": {
          const sizeFrac = tile.secondary ? ICON_SIZE_FRAC.starSecondary : ICON_SIZE_FRAC.star;
          drawIcon(ctx, iconImages && iconImages.star, p.x, p.y, minDim * sizeFrac);
          if (tile.sol && camera.zoom > 0.5) {
            pendingLabels.push(["Sol", p]);
          }
          break;
        }
        case "asteroid-belt":
          drawAsteroidBelt(ctx, tile, iconImages, p.x, p.y, minDim * ICON_SIZE_FRAC["asteroid-belt"]);
          break;
        case "wonder-blackhole":
          drawIcon(
            ctx,
            iconImages && iconImages["wonder-blackhole"],
            p.x,
            p.y,
            minDim * ICON_SIZE_FRAC["wonder-blackhole"]
          );
          break;
        case "planet-uninhabited":
        case "planet-inhabited":
          drawIcon(ctx, iconImages && iconImages[tile.type], p.x, p.y, minDim * ICON_SIZE_FRAC[tile.type]);
          if (tile.home && camera.zoom > 0.5) {
            pendingLabels.push(["Earth", p]);
          }
          break;
        default:
          break;
      }
    }
  }

  for (const [text, p] of pendingLabels) {
    drawLabel(ctx, text, p, hh, camera.zoom);
  }
}
