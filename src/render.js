// Canvas 2D rendering: per-tile band background image (precomputed at
// generation time, see mapgen.js) with a feature icon layered on top where
// present. All feature icons (star/planet/moon/black-hole/asteroid-belt) are
// real sprites cropped from terrain1.png/hills.png — see
// docs/graphics-and-assets.md for exact source cells.

import { HEX_WIDTH, HEX_HEIGHT, axialToPixel, pixelToAxial, axialKey } from "./hexgrid.js";

const BACKGROUND = "#05070d";
// Names and tags show when zoom > LABEL_ZOOM (the old label threshold); plain designations
// of bodies and companion stars only when zoomed in further.
const LABEL_ZOOM = 0.5;
const DESIGNATION_ZOOM = 1;
// Font size caps (px), so labels stop growing once zoomed in past ~1.2.
const LABEL_MAX_PX = 14;
const TAG_MAX_PX = 16;

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
// Planets and moons are the deliberate exception: the icon pass below passes
// each one's own mapgen `scale` (times 0.5 for moons), pre-multiplied into
// `zoom` here.
function drawIcon(ctx, img, cx, cy, zoom) {
  if (!img) return;
  const w = img.width * zoom;
  const h = img.height * zoom;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// images/select-alpha.png is a 4-frame horizontal strip (96x48 per frame)
// of a white dashed "marching ants" selection oval — drawn as-is (no
// per-player recolor; it reads fine as a neutral highlight under any ship).
const SELECT_FRAME_WIDTH = 96;
const SELECT_FRAME_HEIGHT = 48;
export const SELECT_FRAME_COUNT = 4;

function drawSelectionPulse(ctx, img, frameIndex, cx, cy, zoom) {
  if (!img) return;
  const w = SELECT_FRAME_WIDTH * zoom;
  const h = SELECT_FRAME_HEIGHT * zoom;
  ctx.drawImage(
    img,
    frameIndex * SELECT_FRAME_WIDTH, 0, SELECT_FRAME_WIDTH, SELECT_FRAME_HEIGHT,
    cx - w / 2, cy - h / 2, w, h
  );
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

// Small floating health bar, drawn above a pirate base/ship marker (MVP4).
function drawHealthBar(ctx, cx, cy, zoom, frac) {
  const w = 24 * zoom;
  const h = 4 * zoom;
  const x = cx - w / 2;
  const y = cy - 28 * zoom;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = frac > 0.5 ? "#8fe3a0" : frac > 0.25 ? "#ffd166" : "#ff5555";
  ctx.fillRect(x, y, w * Math.max(0, frac), h);
}

// Labels hang just under `anchor`, the bottom centre of their drawn icon
// (see labelAnchor), so they follow a body's size and moon offset. Text
// grows with zoom up to LABEL_MAX_PX, then stays at that readable size.
function drawLabel(ctx, text, anchor, zoom) {
  const size = Math.min(LABEL_MAX_PX, Math.max(10, 12 * zoom));
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  // Baseline = small gap (0.17) + text ascent (0.82), both relative to size.
  ctx.fillText(text, anchor.x, anchor.y + size * 0.99);
}

// Inhabited worlds' own names: bold, slightly larger white text in a dark
// blue rounded box, its top just under `anchor` like a plain label.
function drawTag(ctx, text, anchor, zoom) {
  const size = Math.min(TAG_MAX_PX, Math.max(11, 14 * zoom));
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  const padX = size * 0.45;
  const padY = size * 0.25;
  const top = anchor.y + size * 0.14;
  const w = ctx.measureText(text).width + 2 * padX;
  const h = size + 2 * padY;
  ctx.fillStyle = "rgba(27,47,107,0.9)";
  ctx.beginPath();
  ctx.roundRect(anchor.x - w / 2, top, w, h, size * 0.35);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, anchor.x, top + padY + size * 0.82);
}

// Bottom centre of an icon drawn at `centre` with drawIcon's `zoom`; falls
// back to the hex's half-height while the image is still loading.
function labelAnchor(img, centre, zoom, hh) {
  return { x: centre.x, y: centre.y + (img ? (img.height * zoom) / 2 : hh) };
}

// Inhabited planets/moons show their own name as a tag; the rest show their
// designation ("GD-17 III-a") only when zoomed in, to keep the map readable.
function pushBodyLabel(pendingLabels, tile, anchor, zoom) {
  if (tile.ownName) {
    if (zoom > LABEL_ZOOM) pendingLabels.push([tile.ownName, anchor, "tag"]);
  } else if (tile.name && zoom >= DESIGNATION_ZOOM) {
    pendingLabels.push([tile.name, anchor]);
  }
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

export function render(
  ctx, canvasW, canvasH, camera, mapData, bandImages, iconImages, discovered, ships, selectFrame,
  pirateBases, pirateShips
) {
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
        case "star": {
          const img = iconImages && iconImages[tile.sprite];
          pendingIcons.push([img, p]);
          // Every star is always visible, so its name is too. Companion
          // stars ("GD-17 B") only show close up, like body designations.
          const system = mapData.systems[tile.regionId];
          const primary = tile.q === system.q && tile.r === system.r;
          if (primary ? camera.zoom > LABEL_ZOOM : camera.zoom >= DESIGNATION_ZOOM) {
            pendingLabels.push([tile.name, labelAnchor(img, p, camera.zoom, hh)]);
          }
          break;
        }
        case "asteroid-belt":
          pendingIcons.push([iconImages && iconImages[`asteroid-belt-${tile.variant}`], p]);
          break;
        case "wonder-blackhole":
          pendingIcons.push([iconImages && iconImages["wonder-blackhole"], p]);
          break;
        case "anomaly":
          pendingIcons.push([iconImages && iconImages["anomaly"], p]);
          break;
        case "planet":
        case "moon": {
          const img = iconImages && iconImages[tile.sprite];
          // A moon is half size and shifted within its own hex by a fraction
          // of the half-width/height; its label follows it.
          const moon = tile.type === "moon";
          const scale = moon ? 0.5 * tile.scale : tile.scale;
          const centre = moon ? { x: p.x + tile.offset.x * hw, y: p.y + tile.offset.y * hh } : p;
          pendingIcons.push([img, centre, scale]);
          pushBodyLabel(pendingLabels, tile, labelAnchor(img, centre, camera.zoom * scale, hh), camera.zoom);
          break;
        }
        default:
          break;
      }
    }
  }

  for (const [img, p, scale = 1] of pendingIcons) {
    drawIcon(ctx, img, p.x, p.y, camera.zoom * scale);
  }

  for (const [text, anchor, style] of pendingLabels) {
    (style === "tag" ? drawTag : drawLabel)(ctx, text, anchor, camera.zoom);
  }

  // Pirate bases/ships (MVP4): dynamic markers, not tile features, so they
  // draw in their own pass rather than the tile-type switch above. Unlike
  // player ships below, pirates ARE fog-gated — only drawn once the active
  // player has discovered that hex — so an always-visible pirate base
  // can't leak map structure through enemy vision. Drawn before player
  // ships so a player standing on a pirate's tile reads as "on top of" it.
  if (pirateBases) {
    const baseImg = iconImages && iconImages["pirate-base"];
    for (const base of pirateBases) {
      const key = axialKey(base.q, base.r);
      if (discovered && !discovered.has(key)) continue;
      const world = axialToPixel(base.q, base.r);
      const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);
      drawIcon(ctx, baseImg, p.x, p.y, camera.zoom);
      drawHealthBar(ctx, p.x, p.y, camera.zoom, base.health / base.maxHealth);
    }
  }
  if (pirateShips) {
    const shipImg = iconImages && iconImages["pirate-ship"];
    for (const ship of pirateShips) {
      const key = axialKey(ship.q, ship.r);
      if (discovered && !discovered.has(key)) continue;
      const world = axialToPixel(ship.q, ship.r);
      const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);
      drawIcon(ctx, shipImg, p.x, p.y, camera.zoom);
      drawHealthBar(ctx, p.x, p.y, camera.zoom, ship.health / ship.maxHealth);
    }
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
        drawSelectionPulse(ctx, selectImg, selectFrame ?? 0, p.x, p.y, camera.zoom);
      }
      drawIcon(ctx, shipImg, p.x, p.y, camera.zoom);
      drawOwnerDot(ctx, p.x, p.y, hw, hh, camera.zoom, ship.color);
    }
  }
}
