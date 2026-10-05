// Ship upgrades a player can pick one of each time they level up. Each
// belongs to a "track" (a themed progression — speed, vision, science,
// health, attack, repair) purely for display grouping; a tier's `requires`
// is the id of any OTHER upgrade (same track or a different one) that must
// already be unlocked before this one is offered — e.g. "science-1"
// requires "vision-1" even though they're different tracks, and
// "attack-1"/"repair-1" both require "health-1" (armor before either
// weapons or repair systems) the same way. MVP2 shipped speed/vision/
// science; MVP4 adds health/attack/repair now that pirates/combat exist
// for them to matter against. health-1/2's and attack-1/2's bonuses were
// rescaled 5x/1.5x (to +25/+3 per tier) alongside the combat-rebalance
// update's ~100 HP/attack baseline — see state.js's HEALTH_BASE/ATTACK_BASE.
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
  "health-1": {
    id: "health-1",
    track: "health",
    requires: null,
    name: "Reinforced Hull Mk I",
    description: "+25 max health",
    maxHealthBonus: 25,
  },
  "health-2": {
    id: "health-2",
    track: "health",
    requires: "health-1",
    name: "Reinforced Hull Mk II",
    description: "+25 max health",
    maxHealthBonus: 25,
  },
  "attack-1": {
    id: "attack-1",
    track: "attack",
    requires: "health-1", // cross-track prerequisite: armor before weapons
    name: "Laser Cannon Mk I",
    description: "+3 attack",
    attackBonus: 3,
  },
  "attack-2": {
    id: "attack-2",
    track: "attack",
    requires: "attack-1",
    name: "Laser Cannon Mk II",
    description: "+3 attack",
    attackBonus: 3,
  },
  "repair-1": {
    id: "repair-1",
    track: "repair",
    requires: "health-1", // armor before repair systems, mirrors attack-1
    name: "Auto-Repair Mk I",
    description: "+5 passive healing per round",
    passiveHealBonus: 5,
  },
  "repair-2": {
    id: "repair-2",
    track: "repair",
    requires: "repair-1",
    name: "Auto-Repair Mk II",
    description: "+5 passive healing per round",
    passiveHealBonus: 5,
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
