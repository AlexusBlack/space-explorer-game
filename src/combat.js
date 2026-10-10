// Civ5-inspired melee combat resolution: a single mutual exchange per fight
// (not a multi-round loop) — the attacker hits first; the defender only
// counters if it survives that hit, same as Civ5's own melee combat. Pure
// math, no dependency on any other project module.

// Damage per hit at a 1:1 strength ratio is MIN + 0..SPREAD, so 24-36 (30
// on average, 30% of a 100-HP ship): Civ5's ATTACK_SAME_STRENGTH_MIN_DAMAGE
// and ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE. These were 4/4 (6% a hit)
// until the combat damage fix; they had never been moved to the 100-HP scale.
export const COMBAT_MIN_DAMAGE = 24; // tunable
export const COMBAT_DAMAGE_SPREAD = 12; // tunable
export const COMBAT_RATIO_MIDPOINT = 0.5; // Civ5's constant term
export const COMBAT_RATIO_SCALE = 1 / 512; // Civ5's (r+3)^4/512 scale

// Flat additive % bonus to the DEFENDER's effective strength, keyed by the
// tile type combat occurs on (always a single shared hex, since this
// game's landing-trigger model always puts attacker and defender on the
// same tile). Progressively stronger through planet/moon -> asteroid-belt
// -> star -> wonder-blackhole, per docs/game-design.md's Pirates section.
// `anomaly` never actually applies in practice — a live anomaly is
// destroyed the instant something lands on it (see state.js's MVP3
// checkAnomalyLanding), so combat can never occur on one; kept as a
// defensive +0% fallback only.
export const TERRAIN_DEFENSE_BONUS = {
  band: 0,
  planet: 0.15,
  moon: 0.15,
  "asteroid-belt": 0.25,
  star: 0.5,
  "wonder-blackhole": 0.75,
  anomaly: 0,
};
export function terrainDefenseBonus(tile) {
  return TERRAIN_DEFENSE_BONUS[tile?.type] ?? 0;
}

// Civ5's wounded-unit penalty (`1 - floor(damage/2)/10`) assumes a
// 100-point HP scale; this game's pools are much smaller (8-30), so the
// penalty is reshaped onto the same 0..1 "fraction of health lost" input
// instead of a literal port: each 20% of health lost costs 10% effective
// strength, floored so a unit never drops below 20% effective strength (a
// one-hit-point sliver still fights, just badly).
function woundedMultiplier(unit) {
  const lostFrac = 1 - unit.health / unit.maxHealth;
  return Math.max(0.2, 1 - lostFrac * 0.5);
}

function effectiveStrength(unit, terrainBonusPct = 0) {
  return unit.attack * woundedMultiplier(unit) * (1 + terrainBonusPct);
}

// Civ5's r/m formula, applied symmetrically: the weaker side's modifier is
// the reciprocal of the stronger side's.
function strengthModifier(mine, theirs) {
  const r = Math.max(mine, theirs) / Math.max(Math.min(mine, theirs), 0.01);
  const m = COMBAT_RATIO_MIDPOINT + Math.pow(r + 3, 4) * COMBAT_RATIO_SCALE;
  return mine >= theirs ? m : 1 / m;
}

function rollDamage(strengthMod, rng) {
  const base = COMBAT_MIN_DAMAGE + Math.floor(rng() * (COMBAT_DAMAGE_SPREAD + 1));
  return Math.max(1, Math.round(base * strengthMod));
}

// attacker/defender: plain {attack, health, maxHealth} snapshots the caller
// builds from a PlayerState or a pirate ship/base record. MUTATES
// attacker.health/defender.health in place (same convention as state.js's
// triggerAnomaly mutating its tile argument) — the caller copies .health
// back onto whatever persisted record it came from afterward.
// `defenderTerrainBonusPct` is the single shared tile's bonus — there is no
// attacker-side terrain bonus in this MVP (no fortify mechanic exists yet).
export function resolveCombat(attacker, defender, defenderTerrainBonusPct = 0, rng = Math.random) {
  const atkStr = effectiveStrength(attacker, 0);
  const defStr = effectiveStrength(defender, defenderTerrainBonusPct);
  const damageToDefender = rollDamage(strengthModifier(atkStr, defStr), rng);
  defender.health = Math.max(0, defender.health - damageToDefender);
  const defenderDefeated = defender.health <= 0;

  let damageToAttacker = 0;
  if (!defenderDefeated) {
    damageToAttacker = rollDamage(strengthModifier(defStr, atkStr), rng);
    attacker.health = Math.max(0, attacker.health - damageToAttacker);
  }
  return {
    damageToDefender,
    damageToAttacker,
    defenderDefeated,
    attackerDefeated: attacker.health <= 0,
  };
}
