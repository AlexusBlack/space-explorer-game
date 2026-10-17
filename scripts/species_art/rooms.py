"""Room backgrounds: the interior a species is seen in, with a transparent window.

The world card scene is three layers: the planet landscape (bg.py) at the back, a room with a
window cut out of it (this module) in the middle, and the species portrait (one.py) in front on
the left. Rooms are 1536x1024 with native transparency: the window panes are clear, everything
else opaque, so the layers stack with plain CSS or canvas and no keying.

Two families (78 rooms), always led by the world class, which decides materials, shapes, light
and window shape; a world may use any room it qualifies for, picked at random:
  base   world class x government (6 x 5 = 30)
  ethic  world class x extreme ethic pole (6 x 8 = 48); the ethic replaces the government

Earth and Luna get no rooms of their own for now: they use the base room of their class and
government like any other world.

World classes are backgrounds.VARIANTS' keys; governments follow GOVERNMENTS in
src/government.js (same order, lower case).
"""

from .backgrounds import VARIANTS

CLASSES = tuple(VARIANTS)
GOVERNMENTS = ("anarchy", "democracy", "oligarchy", "monarchy", "dictatorship")

# The world comes first: it decides the building materials, the shapes and the light, so it
# leads the prompt and gets the most words. Government (and later ethics) only add objects and
# a mood on top. Matches the landscapes' SETTLEMENT words.
CLASS_ARCH = {
    "molten": ("a molten lava world: a thick heat-proof wall of dark volcanic basalt and glassy "
               "black obsidian, fused ceramic tiles and riveted heat-blackened bronze, glowing "
               "ember-orange heat vents and heavy heat-shield shutters, warm orange light; "
               "everything built to withstand scorching heat"),
    "toxic": ("a toxic world with a poisonous atmosphere: a sealed habitat wall of pale "
              "chemical-resistant composite and glazed ceramic, stained here and there with "
              "yellow-green residue, air-filter grilles, pressure seals and gauges, a heavy "
              "airlock-style hatch housing around the window, sickly greenish light"),
    "rocky": ("a temperate world of seas and green continents: a wall of carved local stone and "
              "polished wood of alien trees, in flowing organic shapes unlike any Earth style, "
              "inlaid with iridescent shell and mineral patterns, warm natural light"),
    "rocky-moon-only": ("an airless moon: a pressurised habitat wall of grey regolith concrete and "
                        "riveted metal panels, a thick pressure hatch around the window, oxygen "
                        "lines, valves and pressure gauges, cool recessed lighting"),
    "ice": ("a frozen ice world: a thick insulated wall of carved blue-white ice blocks and "
            "frost-rimed stone, hung with heavy furs and quilted felt, glowing heaters and warm "
            "lamps against the cold, frost creeping on every surface"),
    "gas-giant": ("a city floating high in a gas giant's clouds: a light, airy wall like the "
                  "inside of an airship's hull, curved pale alloy ribs and taut membrane panels, "
                  "slender struts, cables and wind vanes, bright diffuse cloud light"),
}

# Who owns the room, per government. Each one shapes the whole wall (its structure, finish
# and palette), not just a few objects, so rooms on one world still look clearly different.
GOV_ROOM = {
    "anarchy": ("a commune's meeting place: the whole wall is a lived-in patchwork of mismatched "
                "repairs, salvaged plates and panels of different colours bolted over each other, "
                "hand-painted shapes and pinned notices without legible text"),
    "democracy": ("the civic office of an elected council: open, bright and orderly, light "
                  "even panelling, a wall screen showing abstract coloured charts"),
    "oligarchy": ("the boardroom of a wealthy ruling council: the whole wall is faced with rare "
                  "polished materials and inlaid with gold, costly art objects in lit niches, "
                  "an air of exclusive, discreet luxury"),
    "monarchy": ("the audience chamber of a royal palace: grand and ornate throughout, rich "
                 "drapes, gilded ornament, jewellery, crowns and treasures displayed in niches"),
    "dictatorship": ("the command office of an absolute ruler: the whole wall is stark, massive "
                     "and rigidly symmetrical, huge plain pilasters, an abstract geometric relief, "
                     "surveillance devices, a cold, hard, colourless light"),
}

# Ethic rooms: an extreme ethic pole replaces the government, so the room is world + ethic.
# Pole names follow src/ethics.js's AXES labels (spirit, war, order, xeno; both poles each).
ETHIC_ROOM = {
    "spiritualist": ("a temple's contemplation hall: the wall carved with sacred patterns, "
                     "shrines and sacred relics in niches, candles and incense burners"),
    "materialist": ("a research laboratory: the wall lined with machines, pipes and cabling, "
                    "scientific devices and instruments, glowing schematic displays"),
    "pacifist": ("a calm meditation and music room: soft rounded shapes and gentle colours, "
                 "musical instruments, a gentle water feature running down the wall, peace "
                 "offerings"),
    "militarist": ("a war hall: the wall hung with mounted weapons, armour and battle trophies"),
    "authoritarian": ("an administration hall of a regimented state: the whole wall divided "
                      "into a strict grid of identical panels, rows of identical plaques, "
                      "rigid symmetry and order, a muted uniform palette"),
    "individualist": ("a private collector's study: the whole wall crowded with eclectic "
                      "personal collections, mismatched keepsakes and odd trinkets on uneven "
                      "shelves and hooks, every piece different"),
    "xenophobe": ("a fortified inner chamber: the whole wall reinforced with heavy bars, thick "
                  "riveted plates and armoured shutters, heavy locks, only crude native-made "
                  "objects, a closed, defensive feel"),
    "xenophile": ("an embassy salon: curiosities and gifts from many different alien worlds, "
                  "in many styles and colours, displayed across the wall"),
}
ETHICS = tuple(ETHIC_ROOM)

# Window shape per world class; all stay tall and about the same size so the layout holds.
WINDOW_SHAPE = {
    "molten": "a heavy rectangle with bevelled corners",
    "toxic": "a rectangle with well rounded corners, like a sealed airlock port",
    "rocky": "with a gently arched top",
    "rocky-moon-only": "a rectangle with rounded corners, like a pressure port",
    "ice": "with a rounded arched top",
    "gas-giant": "a tall rounded oval, like an airship's porthole",
}

STYLE = ("Painterly-realistic digital art, cinematic interior lighting that matches the world, "
         "its light falling in through the window.")
# Rooms are reused across worlds and species, so nothing may tie one to a nation or to Earth.
NEGATIVE = ("No people, no creatures, no furniture, no chairs, no tables, no potted plants or "
            "Earth plants, nothing that looks human-made or from Earth, no flags, no banners, no emblems or insignia, no maps, no "
            "globes, no pictures of planets or landscapes on the walls or screens, no text, no "
            "letters, no watermark, no logo, no border.")

# The fixed layout every room shares, so the window and the portrait land in the same places.
LAYOUT = [
    "A video call background: a single flat wall seen straight on from eye level, filling the "
    "whole wide 3:2 image edge to edge. No floor, no ceiling, no side walls, no corners and no "
    "visible depth of a room; only the wall itself and what is mounted on it.",
    "Exactly one large tall window in the wall, {shape}, about two thirds of the image height tall "
    "and a quarter of the image width wide, its centre about three quarters of the way across "
    "the image and a little above the vertical middle, entirely inside the image with wall all "
    "around it. It must read unmistakably as a window, not a picture on the wall: a deep recess "
    "through the thick wall with visible side reveals, a sturdy, clearly shaped frame, a deep "
    "sill, curtains or drapes gathered at both sides, and shutters, a blind or a hatch housing "
    "around the opening, all kept clear of the opening itself.",
    "The opening is a single undivided pane with no mullions, bars or crosspieces, and it is "
    "fully transparent: an empty cut-out with no glass, no tint, no frosting, no reflections, no "
    "scenery and no sky, and nothing standing in front of it. Everything else in the image is "
    "fully opaque, out to every edge.",
    "A person will stand in front of the middle of the left half, so that area is a calm, "
    "plain stretch of wall; the room's character and decoration fill the rest: along the top, "
    "down the far left edge and all around the window.",
]


def combos():
    """Every base (class, government) pair, in catalogue order."""
    return [(c, g) for c in CLASSES for g in GOVERNMENTS]


def ethic_combos():
    """Every ethic (class, pole) pair, in catalogue order."""
    return [(c, e) for c in CLASSES for e in ETHICS]


def _build(cls, room, note):
    parts = [
        f"A wall inside a building on {CLASS_ARCH[cls]}.",
        f"The room is {room}. This shapes the whole wall, not just a few objects, all made "
        "from this world's own materials.",
        *(part.format(shape=WINDOW_SHAPE[cls]) for part in LAYOUT),
        STYLE,
        NEGATIVE,
    ]
    if note:
        parts.append(f"Correction: {note}")
    return " ".join(parts)


def build_base(cls, government, note=None):
    if cls not in CLASS_ARCH:
        raise ValueError(f"unknown world class {cls!r}; one of {CLASSES}")
    if government not in GOV_ROOM:
        raise ValueError(f"unknown government {government!r}; one of {GOVERNMENTS}")
    return _build(cls, GOV_ROOM[government], note)


def build_ethic(cls, ethic, note=None):
    if cls not in CLASS_ARCH:
        raise ValueError(f"unknown world class {cls!r}; one of {CLASSES}")
    if ethic not in ETHIC_ROOM:
        raise ValueError(f"unknown ethic pole {ethic!r}; one of {ETHICS}")
    return _build(cls, ETHIC_ROOM[ethic], note)
