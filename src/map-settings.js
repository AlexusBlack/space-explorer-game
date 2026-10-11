// Map generator settings: the start screen's Map section, saved with the game
// and carried in the URL. A map is fully determined by seed + settings
// (mapgen.js's generateMap). Pure data (no DOM) so it can be verified
// headlessly; main.js renders the form.

// Option A from the spacing rebalance: tighter clusters on a smaller map
// than the original cluster release (see LEGACY_MAP_SETTINGS).
export const DEFAULT_MAP_SETTINGS = {
  layout: "clusters",
  systemCount: 120,
  mapRadius: 110,
  systemRadiusMin: 5,
  systemRadiusMax: 7,
  systemGap: 1,
  clusterCountMin: 8,
  clusterCountMax: 12,
  clusterGap: 15,
  clusterDensity: 7.5,
  clusterCore: 75,
  loneShare: 10,
  anomalySystemChance: 96,
  anomalyDeepSpace: 6.4,
};

// The constants every map used before settings existed. Saves from then
// (versions 3 and 4) load with these, so they keep their exact map.
export const LEGACY_MAP_SETTINGS = {
  ...DEFAULT_MAP_SETTINGS,
  mapRadius: 150,
  systemGap: 2,
  clusterGap: 30,
  clusterDensity: 6,
  clusterCore: 55,
};

export const MAP_LAYOUTS = [
  { id: "clusters", name: "Clusters" },
  { id: "even", name: "Even" },
];

// Picking a layout on the start screen applies its preset.
export const MAP_PRESETS = {
  clusters: DEFAULT_MAP_SETTINGS,
  even: { ...DEFAULT_MAP_SETTINGS, layout: "even", mapRadius: 90, systemGap: 2 },
};

// Every numeric setting: form label, range, step, and the layout it applies
// to (null = both). `key` is its short name in the URL's `map=` value.
export const MAP_SETTING_FIELDS = [
  { id: "systemCount", key: "n", label: "Star systems", min: 10, max: 300, step: 1, layout: null },
  { id: "mapRadius", key: "r", label: "Map radius (hexes)", min: 30, max: 200, step: 1, layout: null },
  { id: "systemRadiusMin", key: "s", label: "System size, min", min: 3, max: 8, step: 1, layout: null },
  { id: "systemRadiusMax", key: "S", label: "System size, max", min: 3, max: 8, step: 1, layout: null },
  { id: "systemGap", key: "g", label: "Gap between systems", min: 0, max: 20, step: 1, layout: null },
  { id: "clusterCountMin", key: "c", label: "Clusters, min", min: 1, max: 20, step: 1, layout: "clusters" },
  { id: "clusterCountMax", key: "C", label: "Clusters, max", min: 1, max: 20, step: 1, layout: "clusters" },
  { id: "clusterGap", key: "G", label: "Gap between clusters", min: 0, max: 60, step: 1, layout: "clusters" },
  { id: "clusterDensity", key: "d", label: "Cluster density (systems / 1000 hexes)", min: 1, max: 15, step: 0.5, layout: "clusters" },
  { id: "clusterCore", key: "k", label: "Cluster core (% of radius)", min: 0, max: 95, step: 5, layout: "clusters" },
  { id: "loneShare", key: "l", label: "Lone systems (%)", min: 0, max: 50, step: 1, layout: "clusters" },
  { id: "anomalySystemChance", key: "a", label: "Anomaly chance per system (%, rolled twice)", min: 0, max: 100, step: 1, layout: null },
  { id: "anomalyDeepSpace", key: "A", label: "Deep-space anomalies (per 1000 hexes)", min: 0, max: 50, step: 0.1, layout: null },
];

function clampField(field, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stepped = Math.round(n / field.step) * field.step;
  return Math.min(field.max, Math.max(field.min, Number(stepped.toFixed(4))));
}

// Fills missing or invalid fields from the defaults, clamps each to its
// range, and keeps every min ≤ its max.
export function normalizeMapSettings(raw = {}) {
  const out = {
    layout: MAP_LAYOUTS.some((l) => l.id === raw.layout) ? raw.layout : DEFAULT_MAP_SETTINGS.layout,
  };
  for (const field of MAP_SETTING_FIELDS) {
    out[field.id] = clampField(field, raw[field.id]) ?? DEFAULT_MAP_SETTINGS[field.id];
  }
  for (const [lo, hi] of [["systemRadiusMin", "systemRadiusMax"], ["clusterCountMin", "clusterCountMax"]]) {
    if (out[lo] > out[hi]) [out[lo], out[hi]] = [out[hi], out[lo]];
  }
  return out;
}

export function sameMapSettings(a, b) {
  return encodeMapSettings(a) === encodeMapSettings(b);
}

// Compact URL value listing only what differs from the defaults
// ("L:even,r:90"); all defaults encode to "".
export function encodeMapSettings(settings) {
  const s = normalizeMapSettings(settings);
  const parts = s.layout === DEFAULT_MAP_SETTINGS.layout ? [] : [`L:${s.layout}`];
  for (const field of MAP_SETTING_FIELDS) {
    if (s[field.id] !== DEFAULT_MAP_SETTINGS[field.id]) parts.push(`${field.key}:${s[field.id]}`);
  }
  return parts.join(",");
}

export function decodeMapSettings(text) {
  const raw = {};
  for (const part of (text ?? "").split(",")) {
    const [key, value] = part.split(":");
    if (key === "L") raw.layout = value;
    const field = MAP_SETTING_FIELDS.find((f) => f.key === key);
    if (field) raw[field.id] = value;
  }
  return normalizeMapSettings(raw);
}
