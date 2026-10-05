// Ship upgrades a player can pick one of each time they level up. Each
// belongs to a "track" (a themed progression — speed, vision, science)
// purely for display grouping; a tier's `requires` is the id of any OTHER
// upgrade (same track or a different one) that must already be unlocked
// before this one is offered — e.g. "science-1" requires "vision-1" even
// though they're different tracks. MVP2 implements the tracks matching
// docs/game-design.md's first leveling unlocks (moves, vision) plus one
// extra (science/XP) to exercise cross-track gating; MVP4 adds more
// (health, attack) once pirates/combat exist for them to matter against.
export const UPGRADES = {
  "speed-1": {
    id: "speed-1",
    track: "speed",
    requires: null,
    name: "Thrusters Mk I",
    description: "+2 moves per turn",
    movesPerTurnBonus: 2,
  },
  "speed-2": {
    id: "speed-2",
    track: "speed",
    requires: "speed-1",
    name: "Thrusters Mk II",
    description: "+2 moves per turn",
    movesPerTurnBonus: 2,
  },
  "vision-1": {
    id: "vision-1",
    track: "vision",
    requires: null,
    name: "Extended Vision Mk I",
    description: "+1 vision radius",
    visionRadiusBonus: 1,
  },
  "vision-2": {
    id: "vision-2",
    track: "vision",
    requires: "vision-1",
    name: "Extended Vision Mk II",
    description: "+1 vision radius",
    visionRadiusBonus: 1,
  },
  "science-1": {
    id: "science-1",
    track: "science",
    requires: "vision-1", // cross-track prerequisite
    name: "Onboard Science Lab Mk I",
    description: "+1 XP per tile discovered",
    xpBonusPerTile: 1,
  },
  "science-2": {
    id: "science-2",
    track: "science",
    requires: "science-1",
    name: "Onboard Science Lab Mk II",
    description: "+1 XP per tile discovered",
    xpBonusPerTile: 1,
  },
};

// Upgrades currently offerable given the ids a player already has: not
// already taken, and its prerequisite (if any, from any track) already
// is taken.
export function availableUpgrades(unlockedIds) {
  return Object.values(UPGRADES).filter((u) => {
    if (unlockedIds.has(u.id)) return false;
    if (u.requires && !unlockedIds.has(u.requires)) return false;
    return true;
  });
}
