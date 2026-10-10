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
// Ships (player and pirate) and the player selection oval scale with zoom
// only up to native size.
const SHIP_MAX_ZOOM = 1;
// Vessel Trail Detector lines (see trails.js): the last turn's trail fades
// from TRAIL_ALPHA_HEAD at the ship to TRAIL_ALPHA_TAIL where it started; the
// turn before is flat at the faintest TRAIL_ALPHA_OLD.
const TRAIL_ALPHA_HEAD = 0.75;
const TRAIL_ALPHA_TAIL = 0.2;
const TRAIL_ALPHA_OLD = 0.12;
const TRAIL_WIDTH = 4; // px at zoom 1, capped like ships

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

// Small per-player-colored marker at a ship's hex's upper-left vertex —
// lets two same-sprite ships be told apart directly on the map, rather than
// only via the screen-corner #player-badge (which only says whose turn it
// is, not which on-screen ship is whose). The upper-right vertex holds the
// stack count (drawStackCount).
function drawOwnerDot(ctx, cx, cy, hw, hh, zoom, color) {
  const dotX = cx - hw * 0.55;
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

// One trail record ({ color, path, age }) as a line through hex centres, one
// segment per step so each can take its own opacity. A step only draws when
// both its hexes are in the viewer's discovered set, like pirate ships.
function drawTrail(ctx, camera, canvasW, canvasH, trail, discovered) {
  const { path, age, color } = trail;
  const steps = path.length - 1;
  ctx.lineWidth = TRAIL_WIDTH * Math.min(camera.zoom, SHIP_MAX_ZOOM);
  ctx.lineCap = "butt";
  ctx.strokeStyle = color;
  for (let i = 0; i < steps; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a.q === b.q && a.r === b.r) continue;
    if (discovered && (!discovered.has(axialKey(a.q, a.r)) || !discovered.has(axialKey(b.q, b.r)))) continue;
    ctx.globalAlpha = age === 1
      ? TRAIL_ALPHA_TAIL + (TRAIL_ALPHA_HEAD - TRAIL_ALPHA_TAIL) * ((i + 1) / steps)
      : TRAIL_ALPHA_OLD;
    const wa = axialToPixel(a.q, a.r);
    const wb = axialToPixel(b.q, b.r);
    const pa = worldToScreen(camera, canvasW, canvasH, wa.x, wa.y);
    const pb = worldToScreen(camera, canvasW, canvasH, wb.x, wb.y);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Number of ships on a hex, in a small dark circle at its upper-right
// vertex (mirroring the owner dot). Only drawn for stacks of two or more.
function drawStackCount(ctx, cx, cy, hw, hh, zoom, count) {
  const x = cx + hw * 0.55;
  const y = cy - hh * 0.8;
  const radius = Math.max(6, 8 * zoom);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(5,7,13,0.9)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * zoom);
  ctx.strokeStyle = "#cfe0ff";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(radius * 1.3)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), x, y);
  ctx.textBaseline = "alphabetic";
}

// Groups visible ships by hex, best-first: the active player's ship, then
// other players' ships, then everything else (pirates now, AI ships later),
// each group in its incoming order. Only a stack's first ship is drawn.
// Players' ships are always visible; other ships only on hexes the active
// player has discovered (`discovered` null = no fog). Returns
// Map<"q,r", ship[]>, where each ship is { kind: "player"|"pirate", q, r, ... }.
export function shipStacks(playerShips, otherShips, discovered) {
  const rank = (ship) => (ship.kind !== "player" ? 2 : ship.active ? 0 : 1);
  const stacks = new Map();
  const add = (ship) => {
    const key = axialKey(ship.q, ship.r);
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(ship);
  };
  for (const ship of playerShips ?? []) add({ ...ship, kind: "player" });
  for (const ship of otherShips ?? []) {
    if (discovered && !discovered.has(axialKey(ship.q, ship.r))) continue;
    add({ ...ship, kind: "pirate" });
  }
  // Array.prototype.sort is stable, so equal ranks keep their order.
  for (const stack of stacks.values()) stack.sort((a, b) => rank(a) - rank(b));
  return stacks;
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
// blue rounded box, its top just under `anchor` like a plain label. Returns
// the box's screen rect, so a tap on the tag can open the world card.
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
  return { x: anchor.x - w / 2, y: top, w, h };
}

// A player ship's "ICV <name>" label: bold text in the ship's team colour
// on a dark pill, its top just under `anchor` (the ship sprite's bottom).
// Sized like a plain label. Not a tap target, unlike drawTag. The ship
// sprite is about as tall as a planet's, so on a world hex the world's own
// label/tag is pushed down below this one (see render's shipLabelBottoms).
function shipLabelBox(zoom) {
  const size = Math.min(LABEL_MAX_PX, Math.max(10, 12 * zoom));
  const padY = size * 0.15;
  const gap = size * 0.1;
  return { size, padX: size * 0.4, padY, gap, h: size + 2 * padY };
}

function drawShipLabel(ctx, text, anchor, zoom, color) {
  const { size, padX, padY, gap, h } = shipLabelBox(zoom);
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  const top = anchor.y + gap;
  const w = ctx.measureText(text).width + 2 * padX;
  ctx.fillStyle = "rgba(5,7,13,0.75)";
  ctx.beginPath();
  ctx.roundRect(anchor.x - w / 2, top, w, h, size * 0.35);
  ctx.fill();
  ctx.fillStyle = color;
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
    if (zoom > LABEL_ZOOM) pendingLabels.push([tile.ownName, anchor, "tag", tile]);
  } else if (tile.name && zoom >= DESIGNATION_ZOOM) {
    pendingLabels.push([tile.name, anchor, "label", tile]);
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
  pirateBases, pirateShips, trails
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
            pendingLabels.push([tile.name, labelAnchor(img, p, camera.zoom, hh), "label", tile]);
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

  // Vessel Trail Detector trails: over the map's sprites but under every
  // label, base and ship, so names stay readable and ships sit on the line's
  // end. Older (age 2) records first, so the brighter last-turn line wins
  // where they cross.
  if (trails) {
    for (const trail of [...trails].sort((a, b) => b.age - a.age)) {
      drawTrail(ctx, camera, canvasW, canvasH, trail, discovered);
    }
  }

  // Player ship stacks (drawn below, after pirate bases) are worked out
  // here so a hex's own label can make room for the ship's "ICV" label:
  // where a labelled player ship sits, the tile's name/tag moves down to
  // start under the ship label instead of overlapping it.
  const shipZoom = Math.min(camera.zoom, SHIP_MAX_ZOOM);
  const playerImg = iconImages && iconImages.ship;
  const stacks = [...shipStacks(ships, pirateShips, discovered).values()];
  const shipLabelBottoms = new Map(); // "q,r" -> screen y of the ship label's bottom
  const shipLabelAnchors = new Map(); // "q,r" -> the ship label's anchor
  if (camera.zoom > LABEL_ZOOM) {
    const box = shipLabelBox(camera.zoom);
    for (const stack of stacks) {
      const top = stack[0];
      if (top.kind !== "player" || !top.label) continue;
      const world = axialToPixel(top.q, top.r);
      const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);
      const anchor = labelAnchor(playerImg, p, shipZoom, hh);
      const key = axialKey(top.q, top.r);
      shipLabelAnchors.set(key, anchor);
      shipLabelBottoms.set(key, anchor.y + box.gap + box.h);
    }
  }

  // Drawn name tags' screen rects, returned so main.js can hit-test taps.
  const tagHits = [];
  for (let [text, anchor, style, tile] of pendingLabels) {
    const below = shipLabelBottoms.get(axialKey(tile.q, tile.r));
    if (below !== undefined && below > anchor.y) anchor = { x: anchor.x, y: below };
    if (style === "tag") tagHits.push({ rect: drawTag(ctx, text, anchor, camera.zoom), tile });
    else drawLabel(ctx, text, anchor, camera.zoom);
  }

  // Pirate bases (MVP4): dynamic markers, not tile features, so they draw
  // in their own pass rather than the tile-type switch above. Unlike
  // player ships below, pirates ARE fog-gated — only drawn once the active
  // player has discovered that hex — so an always-visible pirate base
  // can't leak map structure through enemy vision. Bases are structures,
  // not ships: always drawn (below any ship stack on their hex) and never
  // counted in it.
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
  // Ships (player and pirate) share one pass: each hex draws only the top
  // ship of its stack (see shipStacks) plus a count when more are there; the
  // long-press tile report lists the whole stack. Player ships use the same
  // sprite for every player — the "ICV <name>" label, the screen-corner
  // #player-badge, the team-coloured owner dot and the active-player
  // selection pulse tell them apart — and are
  // drawn regardless of whose turn it is: unlike fog, seeing where the
  // ships are isn't privileged information. Ships and the selection oval
  // never draw above their native pixel size: they stay sharp and don't
  // swell to planet size when zoomed in.
  const pirateImg = iconImages && iconImages["pirate-ship"];
  const selectImg = iconImages && iconImages.select;
  // Pirate-topped stacks first, so a player ship reads as on top where
  // sprites overlap neighboring hexes.
  stacks.sort((a, b) => (a[0].kind === "player") - (b[0].kind === "player"));
  const shipLabels = []; // drawn after every ship, so no sprite covers one
  for (const stack of stacks) {
    const top = stack[0];
    const world = axialToPixel(top.q, top.r);
    const p = worldToScreen(camera, canvasW, canvasH, world.x, world.y);
    if (top.kind === "player") {
      if (top.active) drawSelectionPulse(ctx, selectImg, selectFrame ?? 0, p.x, p.y, shipZoom);
      drawIcon(ctx, playerImg, p.x, p.y, shipZoom);
      drawOwnerDot(ctx, p.x, p.y, hw, hh, camera.zoom, top.color);
      const labelAt = shipLabelAnchors.get(axialKey(top.q, top.r));
      if (labelAt) shipLabels.push([top.label, labelAt, top.color]);
    } else {
      drawIcon(ctx, pirateImg, p.x, p.y, shipZoom);
      drawHealthBar(ctx, p.x, p.y, shipZoom, top.health / top.maxHealth);
    }
    if (stack.length > 1) drawStackCount(ctx, p.x, p.y, hw, hh, camera.zoom, stack.length);
  }
  for (const [text, anchor, color] of shipLabels) {
    drawShipLabel(ctx, text, anchor, camera.zoom, color);
  }

  return { tagHits };
}
