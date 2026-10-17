// The world card scene: three stacked images, back to front a landscape seen
// through a room's window, the room, and the species portrait. Which landscape
// and room a world shows follows from its attributes (display only); mapgen's
// assignRooms stores the picks on the tile. File names follow the art
// catalogues in scripts/species_art (backgrounds.py VARIANTS, rooms.py).

import { axialKey } from "./hexgrid.js";
import { AXES } from "./ethics.js";
import { GOVERNMENTS } from "./government.js";

// Room name per extreme ethic, [at -2, at +2], for each AXES id; rooms.py's
// ETHIC_ROOM keys.
export const ETHIC_ROOM_POLES = {
  spirit: ["spiritualist", "materialist"],
  war: ["pacifist", "militarist"],
  order: ["authoritarian", "individualist"],
  xeno: ["xenophobe", "xenophile"],
};

// The grey airless moon has rooms of its own (pressure hatches, oxygen
// lines); every other world uses its planet class's rooms.
export function roomClass(tile) {
  return tile.sprite === "moon-grey" ? "rocky-moon-only" : tile.planetClass;
}

// Every room a world may show: its government's base room first, then one
// per extreme ethic (an ethic room replaces the government).
export function roomCandidates(tile) {
  const cls = roomClass(tile);
  const rooms = [`${cls}-${GOVERNMENTS[tile.government].toLowerCase()}`];
  for (const { id } of AXES) {
    const v = tile.ethics?.[id];
    if (v === -2 || v === 2) rooms.push(`${cls}-${ETHIC_ROOM_POLES[id][v > 0 ? 1 : 0]}`);
  }
  return rooms;
}

// The landscape behind the window: the world's own sprite, seen from a planet,
// from a moon of a gas giant (the giant fills its sky) or from a moon of any
// other planet.
export function landscapeKey(tile, tiles) {
  if (tile.type !== "moon") return `${tile.sprite}-planet`;
  const parent = tiles.get(axialKey(tile.parent.q, tile.parent.r));
  return `${tile.sprite}-${parent?.planetClass === "gas-giant" ? "giant-moon" : "planet-moon"}`;
}

export function roomImagePath(key) {
  return `rooms/images-opt/${key}.webp`;
}

export function landscapeImagePath(key) {
  return `backgrounds/images-opt/${key}.webp`;
}
