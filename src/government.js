// Governments of inhabited worlds (display only for now: nothing in the game
// acts on them yet). The type is rolled on a spectrum ordered by how many
// hold power, independent of ethics; the world's ethics then give it its
// flavour, worked out on display and never stored.

// Fewest power-holders first. Anarchy is many competing governments with no
// central one. A world stores the index (`tile.government`).
export const GOVERNMENTS = ["Anarchy", "Democracy", "Oligarchy", "Monarchy", "Dictatorship"];

// Chance (percent) of each type, in GOVERNMENTS order — tunable.
export const GOVERNMENT_WEIGHTS = [20, 20, 20, 20, 20];

// Earth and Luna don't roll: the players' home is a Democracy.
export const HOME_GOVERNMENT = 1;

// The form each type takes, by the Authoritarian–Individualist axis
// (order -2..+2) — tunable wording.
export const GOVERNMENT_FORMS = [
  ["Warlord States", "Rival Fiefdoms", "Anarchy", "Free Cities", "Stateless Communes"],
  ["Managed Democracy", "Guided Democracy", "Democracy", "Liberal Democracy", "Direct Democracy"],
  ["One-Party State", "Ruling Council", "Oligarchy", "Merchant Republic", "Corporate Plutocracy"],
  ["Absolute Monarchy", "Autocratic Monarchy", "Monarchy", "Constitutional Monarchy", "Elective Monarchy"],
  ["Totalitarian State", "Autocracy", "Dictatorship", "Plebiscite Dictatorship", "Enlightened Despotism"],
];

// An extreme view on another axis adds one adjective: [at -2, at +2]. When
// several axes are extreme, the first listed here wins.
export const GOVERNMENT_ADJECTIVES = [
  { axis: "spirit", labels: ["Theocratic", "Technocratic"] },
  { axis: "war", labels: ["Pacifist", "Military"] },
  { axis: "xeno", labels: ["Isolationist", "Cosmopolitan"] },
];

// A government's own name, from its type: a title word plus the world's or
// its species' name, as "<Title> of <Name>" or "<Name> <Title>". Anarchy
// has no central government, so no name — tunable wording.
export const STATE_TITLES = [
  null,
  ["Republic", "Commonwealth", "Federation", "Union", "Confederacy"],
  ["Directorate", "Hegemony", "Syndicate", "Concord", "Combine"],
  ["Kingdom", "Empire", "Realm", "Dominion", "Crown"],
  ["State", "Regime", "Protectorate", "Order", "Autarchy"],
];

// Earth and Luna don't roll a name either.
export const HOME_STATE_NAME = "Earth Federation";
export const LUNA_STATE_NAME = "Republic of Luna";

export function rollGovernment(rng) {
  const total = GOVERNMENT_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let i = 0;
  while (i < GOVERNMENT_WEIGHTS.length - 1 && roll >= GOVERNMENT_WEIGHTS[i]) roll -= GOVERNMENT_WEIGHTS[i++];
  return i;
}

// The plain spectrum type, e.g. "Oligarchy".
export function governmentType(tile) {
  return GOVERNMENTS[tile.government];
}

// Who speaks for the world on its card: the state's own name, or for an
// Anarchy, which has none, its flavoured name (e.g. "Free Cities").
export function stateLabel(tile) {
  return tile.stateName ?? governmentName(tile);
}

// The flavoured name, e.g. "Theocratic Absolute Monarchy".
export function governmentName(tile) {
  const form = GOVERNMENT_FORMS[tile.government][tile.ethics.order + 2];
  for (const { axis, labels } of GOVERNMENT_ADJECTIVES) {
    const value = tile.ethics[axis];
    if (Math.abs(value) === 2) return `${labels[value > 0 ? 1 : 0]} ${form}`;
  }
  return form;
}

// Null for Anarchy. Otherwise three draws (title, name source, form), all
// taken whatever comes out, so later worlds' names never shift. The species
// name is used half the time, when the world has one.
export function rollStateName(rng, government, worldName, speciesName) {
  const titles = STATE_TITLES[government];
  if (!titles) return null;
  const title = titles[Math.floor(rng() * titles.length)];
  const useSpecies = rng() < 0.5 && !!speciesName;
  const titleFirst = rng() < 0.5;
  const name = useSpecies ? speciesName : worldName;
  return titleFirst ? `${title} of ${name}` : `${name} ${title}`;
}
