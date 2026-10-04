// Canvas 2D rendering: per-tile band background image (precomputed at
// generation time, see mapgen.js) with a feature icon layered on top where
// present. All feature icons (star/planet/moon/black-hole/asteroid-belt) are
// real sprites cropped from terrain1.png/hills.png — see
// docs/graphics-and-assets.md for exact source cells.

import { HEX_WIDTH, HEX_HEIGHT, axialToPixel, pixelToAxial, axialKey } from "./hexgrid.js";

const BACKGROUND = "#05070d";

// The band art template is 76x67px: a 64x55 (HEX_WIDTH x HEX_HEIGHT) hex
// silhouette centered with a 6px alignment-guide margin on each side. The
// full image must be scaled (not cropped) so its *content* exactly fills the
// tile, or that margin shows up as a visible transparent gap between tiles.
const TEMPLATE_IMAGE_WIDTH = 76;
const TEMPLATE_IMAGE_HEIGHT = 67;

export function worldToScreen(camera, canvasW, canvasH, x, y) {
  return {
    x: (x - camera.x) * camera.zoom + canvasW / 2,
    y: (y - camera.y) * camera.zoom + canvasH / 2,
  };
}

// Icons are drawn at their native pixel resolution (scaled only by camera
// zoom, never stretched to fit the tile) — sharp at any zoom level, and
// consistent with every other icon regardless of tile/role (e.g. secondary
// stars in binary/trinary systems are the same size as a primary star).
// Moons are the one deliberate exception: the icon pass below passes an
// extra 0.5 scale multiplier for them, pre-multiplied into `zoom` here.
function drawIcon(ctx, img, cx, cy, zoom) {
  if (!img) return;
  const w = img.width * zoom;
  const h = img.height * zoom;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// Reusable scratch canvas for recoloring the selection-pulse sprite at draw
// time (one per player color, since the asset itself is a neutral grayscale
// alpha mask) — created once rather than allocating a canvas every frame.
const SELECT_FRAME_SIZE = 48;
// Raw asset averages ~8% alpha per frame; boosted so the pulse is actually
// visible (canvas clamps the composited result to fully opaque regardless
// of how far past 1 this goes) — tuned by eye during manual verification.
const SELECT_BOOST = 3;
const selectScratch = document.createElement("canvas");
selectScratch.width = SELECT_FRAME_SIZE;
selectScratch.height = SELECT_FRAME_SIZE;
const selectCtx = selectScratch.getContext("2d");

// images/select-alpha.png is a grayscale, native-alpha 8-frame strip
// (confirmed ~8% average alpha per frame) rather than a flat-color sprite,
// so it can be recolored per-player the same way scripts/extract-icons.py's
// boost_and_tint keeps a shape's alpha but swaps its color — done here at
// runtime instead of baked into a file, since the tint must follow whatever
// color a player is assigned rather than being fixed ahead of time. `boost`
// compensates for the asset's low native opacity (canvas clamps the result
// to fully opaque regardless, so it's safe to push past 1).
function drawSelectionPulse(ctx, img, frameIndex, cx, cy, zoom, color, boost) {
  if (!img) return;
  selectCtx.clearRect(0, 0, SELECT_FRAME_SIZE, SELECT_FRAME_SIZE);
  selectCtx.drawImage(
    img,
    frameIndex * SELECT_FRAME_SIZE, 0, SELECT_FRAME_SIZE, SELECT_FRAME_SIZE,
    0, 0, SELECT_FRAME_SIZE, SELECT_FRAME_SIZE
  );
  selectCtx.globalCompositeOperation = "source-in";
  selectCtx.fillStyle = color;
  selectCtx.fillRect(0, 0, SELECT_FRAME_SIZE, SELECT_FRAME_SIZE);
  selectCtx.globalCompositeOperation = "source-over";

  const w = SELECT_FRAME_SIZE * zoom;
  const h = SELECT_FRAME_SIZE * zoom;
  ctx.save();
  ctx.globalAlpha = boost;
  ctx.drawImage(selectScratch, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

// Small per-player-colored marker at a ship's hex's upper-right vertex —
// lets two same-sprite ships be told apart directly on the map, rather than
// only via the screen-corner #player-badge (which only says whose turn it
// is, not which on-screen ship is whose).
function drawOwnerDot(ctx, cx, cy, hw, hh, zoom, color) {
  const dotX = cx + hw * 0.55;
  const dotY = cy - hh * 0.8;
  const radius = Math.max(3, 5 * zoom);
  ctx.beginPath();
  ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * zoom);
  ctx.strokeStyle = "rgba(5,7,13,0.9)";
  ctx.stroke();
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

export function render(ctx, canvasW, canvasH, camera, mapData, bandImages, iconImages, discovered, ships, selectFrame) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const hw = (HEX_WIDTH / 2) * camera.zoom;
  const hh = (HEX_HEIGHT / 2) * camera.zoom;

  const { qMin, qMax, rMin, rMax } = visibleHexRange(camera, canvasW, canvasH);

  // Backgrounds, icons, and labels are drawn in three separate passes over
  // the same tiles, rather than interleaved tile-by-tile. Icons (and
  // labels) routinely extend beyond their own tile's hex footprint — tiles
  // are small (HEX_WIDTH=64 at HEX_SIZE=32) but icons stay at native pixel
  // size, e.g. the ~86px-wide wonder-blackhole sprite. Drawing everything
  // for one tile before moving to the next meant a later-processed
  // neighboring tile's opaque background would silently paint over the
  // spillover part of an earlier tile's icon. Collecting icons/labels and
  // drawing them only after every background is down guarantees nothing
  // ever clips them, regardless of iteration order.
  const pendingIcons = [];
  const pendingLabels = [];

  const imgScale = (hw * 2) / HEX_WIDTH;
  const imgDrawW = TEMPLATE_IMAGE_WIDTH * imgScale;
  const imgDrawH = TEMPLATE_IMAGE_HEIGHT * imgScale;

  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      const tile = mapData.tiles.get(axialKey(q, r));
      if (!tile) continue;
      // Fog of war: every star tile is always visible (a wayfinding aid
      // toward the win condition — seeing a star this way is not the same
      // as "discovering" it, which still only comes from actually visiting
      // it, see state.js's revealTile), everything else stays blank
      // (the BACKGROUND fill above) until the active player has it in
      // their own discovered set.
      if (tile.type !== "star" && discovered && !discovered.has(axialKey(tile.q, tile.r))) continue;

      const world = axialToPixel(tile.q, tile.r);
      const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);

      const bandImg = bandImages && bandImages[tile.band];
      if (bandImg) {
        ctx.drawImage(bandImg, p.x - imgDrawW / 2, p.y - imgDrawH / 2, imgDrawW, imgDrawH);
      }

      switch (tile.type) {
        case "band":
          break;
        case "star":
          pendingIcons.push([iconImages && iconImages.star, p]);
          if (tile.sol && camera.zoom > 0.5) {
            pendingLabels.push(["Sol", p]);
          }
          break;
        case "asteroid-belt":
          pendingIcons.push([iconImages && iconImages[`asteroid-belt-${tile.variant}`], p]);
          break;
        case "wonder-blackhole":
          pendingIcons.push([iconImages && iconImages["wonder-blackhole"], p]);
          break;
        case "planet":
          pendingIcons.push([iconImages && iconImages[tile.sprite], p, 1]);
          if (tile.home && camera.zoom > 0.5) {
            pendingLabels.push(["Earth", p]);
          } else if (tile.inhabited && camera.zoom > 0.5) {
            pendingLabels.push(["Inhabited", p]);
          }
          break;
        case "moon":
          pendingIcons.push([iconImages && iconImages[tile.sprite], p, 0.5]);
          if (tile.inhabited && camera.zoom > 0.5) {
            pendingLabels.push(["Inhabited", p]);
          }
          break;
        default:
          break;
      }
    }
  }

  for (const [img, p, scale = 1] of pendingIcons) {
    drawIcon(ctx, img, p.x, p.y, camera.zoom * scale);
  }

  for (const [text, p] of pendingLabels) {
    drawLabel(ctx, text, p, hh, camera.zoom);
  }

  // Ship markers (the same sprite for every player — the screen-corner
  // #player-badge, the per-tile owner dot below, and the active-player
  // selection pulse are how players are actually told apart) are drawn for
  // both players regardless of whose turn it is: unlike fog, seeing where
  // the ships are isn't privileged information.
  if (ships) {
    const shipImg = iconImages && iconImages.ship;
    const selectImg = iconImages && iconImages.select;
    for (const ship of ships) {
      const world = axialToPixel(ship.q, ship.r);
      const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);
      if (ship.active) {
        drawSelectionPulse(ctx, selectImg, selectFrame ?? 0, p.x, p.y, camera.zoom, ship.color, SELECT_BOOST);
      }
      drawIcon(ctx, shipImg, p.x, p.y, camera.zoom);
      drawOwnerDot(ctx, p.x, p.y, hw, hh, camera.zoom, ship.color);
    }
  }
}
