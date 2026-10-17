// World communications: the world card's chat with a world's government.
// The world opens with a one-sentence greeting, flavoured by its attitude
// toward explorers and its dominant ethic; the player then picks messages
// from a small dialogue tree and every one gets a reply. Only the greeting
// varies by world for now; the replies are the same everywhere.
//
// Each player keeps their own history per world (`player.comms`, keyed by
// axialKey, persisted). An open offer is not: it lasts only while the card
// is open, and a Pay re-quotes so a stale price never applies. Pure: the
// caller renders and saves.

import { axialKey } from "./hexgrid.js";
import { attitudeToPlayers } from "./ethics.js";
import { maxHealthForPlayer } from "./state.js";
import { formatEmc } from "./economy.js";

// Tunable. Price per HP repaired; Friendly and Allied worlds knock some off.
export const REPAIR_EMC_PER_HP = 5;
export const FRIENDLY_REPAIR_DISCOUNT = 1;
export const ALLIED_REPAIR_DISCOUNT = 2;

// Dominant ethic: the axis with the largest |value|, ties going in this
// order (xeno matters most toward visitors), named by its pole.
const POLE_ORDER = ["xeno", "war", "spirit", "order"];
const POLE_NAMES = {
  xeno: ["xenophobe", "xenophile"],
  war: ["pacifist", "militarist"],
  spirit: ["spiritualist", "materialist"],
  order: ["authoritarian", "individualist"],
};

// Greetings by attitude toward explorers (-2..+2), then dominant pole; two
// lines each, one picked per world. {world} is the world's name. Only the
// cells that can occur are written (attitude comes from xeno and spirit,
// so e.g. a xenophile is never Hostile, and a xenophobe is friendly only to
// its kin, the players' own species); any other falls back to the
// tier's "balanced" line — tunable wording.
export const GREETINGS = {
  "-2": {
    balanced: [
      "This is {world}: you are not welcome here, so leave while you can.",
      "{world} has nothing to say to you except go away.",
    ],
    xenophobe: [
      "This is {world}: turn your ship around, outsiders are not welcome here.",
      "{world} will not suffer alien filth in its skies, so leave now.",
    ],
    pacifist: [
      "{world} wants no part of you, so take your ship and go in peace while we still offer it.",
      "This is {world}: we will not fight you, but we will not speak with your kind either, so go.",
    ],
    spiritualist: [
      "The faithful of {world} see a curse on your ship; depart before you defile our heavens.",
      "{world} is holy ground and your kind are not, so keep your distance.",
    ],
    militarist: [
      "This is {world} defence command: our guns are tracking you, so leave this system.",
      "{world} gives you one warning, outsider: come closer and we open fire.",
    ],
  },
  "-1": {
    balanced: [
      "This is {world}; state your business and keep it short.",
      "{world} acknowledges your signal, nothing more.",
    ],
    xenophobe: [
      "This is {world}: we tolerate your presence, barely, so do not linger.",
      "{world} sees you, outsider; keep your distance from our worlds.",
    ],
    pacifist: [
      "{world} asks that you keep your weapons cold and your visit short.",
      "This is {world}; we seek no trouble, and we hope you bring none.",
    ],
    spiritualist: [
      "The elders of {world} are wary of your machines; speak quickly.",
      "{world} is watching you, stranger, and so are our gods.",
    ],
    militarist: [
      "This is {world} patrol: you are being watched, so mind your heading.",
      "{world} has you on its scopes, explorer; give us no reason to act.",
    ],
    authoritarian: [
      "This is the {world} authority: you are entering controlled space, so follow our directives.",
      "{world} requires that you identify yourself and obey our traffic control.",
    ],
    individualist: [
      "{world} here; we don't much care for strangers, but go on, talk.",
      "This is {world}; nobody here vouched for you, so watch yourself.",
    ],
  },
  "0": {
    balanced: [
      "This is {world}; we receive you, explorer.",
      "{world} acknowledges your hail; go ahead.",
    ],
    xenophobe: [
      "This is {world}; we rarely speak with outsiders, so keep this brief.",
      "{world} will hear you out, outsider, for now.",
    ],
    xenophile: [
      "{world} receives you, traveller; it is not often we see new faces.",
      "This is {world}; our people are curious about yours.",
    ],
    pacifist: [
      "This is {world}; you come in peace, we trust, and so do we.",
      "{world} greets you calmly, explorer; what brings you here?",
    ],
    spiritualist: [
      "{world} receives you under the watch of our faith.",
      "This is {world}; may the stars guide your words.",
    ],
    materialist: [
      "{world} logs your arrival, explorer; transmit your query.",
      "This is {world} control; your signal is clear, go ahead.",
    ],
    militarist: [
      "This is {world} command; we read you, explorer.",
      "{world} defence net acknowledges your ship; state your purpose.",
    ],
    authoritarian: [
      "This is the {world} authority; your hail is registered.",
      "{world} acknowledges your vessel; proceed with your request.",
    ],
    individualist: [
      "{world} here; anyone's free to talk, so what's on your mind?",
      "This is {world}; you've got our ear, explorer.",
    ],
  },
  "1": {
    balanced: [
      "This is {world}; good to hear from you, explorer.",
      "{world} welcomes you; how can we help?",
    ],
    xenophobe: [
      "{world} has no love for outsiders, but you are our own kind, so be welcome.",
      "This is {world}; aliens we turn away, but kin we welcome.",
    ],
    xenophile: [
      "Welcome to {world}, traveller; our people are glad to meet you!",
      "This is {world}; new friends are always welcome here.",
    ],
    pacifist: [
      "{world} welcomes you in peace, explorer.",
      "This is {world}; peaceful travellers are welcome here.",
    ],
    spiritualist: [
      "{world} welcomes you, traveller; the stars brought you to us for a reason.",
      "This is {world}; be welcome, and be blessed.",
    ],
    materialist: [
      "{world} welcomes you, explorer; your survey work interests us greatly.",
      "This is {world}; a science vessel is always welcome here.",
    ],
    militarist: [
      "This is {world} command; welcome, captain, it is good to see a sturdy ship.",
      "{world} salutes you, explorer; you are clear to approach.",
    ],
    authoritarian: [
      "The {world} authority welcomes you and grants you leave to approach.",
      "This is {world}; you are welcome here, explorer, as long as you respect our laws.",
    ],
    individualist: [
      "{world} here; welcome, friend, make yourself at home.",
      "This is {world}; glad you dropped by, explorer.",
    ],
  },
  "2": {
    balanced: [
      "This is {world}; welcome, friend, it is wonderful to hear from you!",
      "{world} greets you warmly, explorer; you are always welcome here.",
    ],
    xenophobe: [
      "{world} counts you as one of our own, explorer; welcome home.",
      "This is {world}; you are kin to us, and kin are always welcome.",
    ],
    xenophile: [
      "{world} greets you, friends from the stars!",
      "This is {world}; what a joy to hear from you, friends, welcome!",
    ],
    pacifist: [
      "{world} welcomes you with open arms, friend; peace be with you.",
      "This is {world}; friends of peace are family to us, welcome!",
    ],
    materialist: [
      "{world} welcomes you, colleague; our scientists can't wait to compare notes!",
      "This is {world}; fellow seekers of knowledge are always welcome!",
    ],
    militarist: [
      "This is {world} command; welcome, ally, our docks and our guns are yours.",
      "{world} salutes you, comrade; it is an honour to have you here.",
    ],
    authoritarian: [
      "The {world} authority extends its full welcome to you, honoured guest.",
      "This is {world}; you are an honoured friend of our state, welcome.",
    ],
    individualist: [
      "{world} here; hey, friend, great to hear from you!",
      "This is {world}; welcome, friend, everyone here's glad you came!",
    ],
  },
};

export const HOME_GREETINGS = {
  home: "This is Earth Control; welcome home, explorer.",
  luna: "This is Luna Control; welcome back to the home system, explorer.",
};

export function dominantPole(ethics) {
  let best = null;
  let bestValue = 0;
  for (const axis of POLE_ORDER) {
    if (Math.abs(ethics[axis]) > bestValue) {
      bestValue = Math.abs(ethics[axis]);
      best = axis;
    }
  }
  return best ? POLE_NAMES[best][ethics[best] > 0 ? 1 : 0] : "balanced";
}

// FNV-1a: a world always picks the same line, without using any rng.
function stableHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function greeting(tile) {
  if (tile.home) return HOME_GREETINGS.home;
  if (tile.luna) return HOME_GREETINGS.luna;
  const tier = GREETINGS[attitudeToPlayers(tile)];
  const lines = tier[dominantPole(tile.ethics)] ?? tier.balanced;
  const line = lines[stableHash(axialKey(tile.q, tile.r)) % lines.length];
  return line.replaceAll("{world}", tile.ownName);
}

// What a full repair would take: HP missing, the price per HP and the total.
// Earth and Luna repair for free.
export function repairQuote(tile, player) {
  const hp = maxHealthForPlayer(player) - player.currentHealth;
  const attitude = attitudeToPlayers(tile);
  const discount = attitude >= 2 ? ALLIED_REPAIR_DISCOUNT : attitude === 1 ? FRIENDLY_REPAIR_DISCOUNT : 0;
  const rate = tile.home || tile.luna ? 0 : REPAIR_EMC_PER_HP - discount;
  return { hp, rate, cost: hp * rate };
}

// The choices with nothing else going on: repairs only while the ship is
// damaged, and Bye always, which ends the call (`closes` tells the caller to
// shut the card after the reply).
export function mainChoices(player) {
  const damaged = player.currentHealth < maxHealthForPlayer(player);
  return [
    ...(damaged ? [{ id: "repair", label: "Request ship repairs" }] : []),
    { id: "bye", label: "Bye" },
  ];
}

function offerChoices(tile, player, quote) {
  if (quote.cost === 0) {
    return [{ id: "repair-accept", label: "Accept repairs" }, { id: "repair-decline", label: "Decline" }];
  }
  const short = player.emc < quote.cost;
  return [
    {
      id: "repair-accept",
      label: `Pay ${formatEmc(quote.cost)}`,
      ...(short ? { disabled: true, note: "not enough emc" } : {}),
    },
    { id: "repair-decline", label: "Decline" },
  ];
}

// The player picks `choiceId`; returns what they say, the world's reply and
// the next choices (plus `closes` for Bye), applying any repair and payment
// to `player`. Unknown or
// unaffordable picks get a reply but change nothing.
export function respond(tile, player, choiceId) {
  const docked = player.q === tile.q && player.r === tile.r;
  if (choiceId === "repair") {
    const playerText = "Can you repair our ship?";
    if (attitudeToPlayers(tile) < 0) {
      return { playerText, replyText: "We do not service outsiders' ships.", choices: mainChoices(player) };
    }
    if (!docked) {
      return {
        playerText,
        replyText: `Bring your ship to ${tile.ownName} and our docks will look at it.`,
        choices: mainChoices(player),
      };
    }
    const quote = repairQuote(tile, player);
    if (quote.hp <= 0) {
      return { playerText, replyText: "Your hull reads intact. No repairs needed.", choices: mainChoices(player) };
    }
    const replyText = quote.cost === 0
      ? `Welcome home. We'll repair ${quote.hp} HP at no charge.`
      : `We can repair ${quote.hp} HP for ${formatEmc(quote.cost)}.`;
    return { playerText, replyText, choices: offerChoices(tile, player, quote) };
  }
  if (choiceId === "repair-accept") {
    // Re-quote: HP or balance may have changed since the offer was made.
    const quote = repairQuote(tile, player);
    const playerText = quote.cost === 0 ? "We accept, thank you." : `We'll pay ${formatEmc(quote.cost)}.`;
    if (!docked || attitudeToPlayers(tile) < 0 || quote.hp <= 0) {
      return { playerText, replyText: "That offer no longer stands.", choices: mainChoices(player) };
    }
    if (player.emc < quote.cost) {
      return { playerText, replyText: "Your funds don't cover it.", choices: offerChoices(tile, player, quote) };
    }
    player.emc -= quote.cost;
    player.currentHealth = maxHealthForPlayer(player);
    return { playerText, replyText: "Repairs complete. Hull at full strength.", choices: mainChoices(player) };
  }
  if (choiceId === "repair-decline") {
    return {
      playerText: "No, thank you.",
      replyText: "Understood. The offer stands if you change your mind.",
      choices: mainChoices(player),
    };
  }
  if (choiceId === "bye") {
    return { playerText: "Bye.", replyText: "Safe travels, explorer.", choices: [], closes: true };
  }
  return { playerText: "…", replyText: "We didn't catch that.", choices: mainChoices(player) };
}

// This player's history with `tile`, oldest first, as [{ from: "world" |
// "player", text }]; started with the world's greeting on first contact.
export function chatHistory(player, tile) {
  const key = axialKey(tile.q, tile.r);
  player.comms ??= {};
  if (!player.comms[key]) player.comms[key] = [{ from: "world", text: greeting(tile) }];
  return player.comms[key];
}

// Records one exchange (the player's message and the reply) in the history.
export function appendExchange(player, tile, { playerText, replyText }) {
  chatHistory(player, tile).push({ from: "player", text: playerText }, { from: "world", text: replyText });
}
