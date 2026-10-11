"""Planet landscape backgrounds: which (sprite, variant) pairs exist, and their prompts.

One background per planet sprite and variant:
  planet       the world is a planet orbiting its star
  giant-moon   the world is a moon of a gas giant (a generic ringed giant in its sky)
  planet-moon  the world is a moon of a rocky or ice planet

VARIANTS mirrors mapgen.js's populateSystem: inner molten/toxic planets have no moons,
medium rocky planets take rocky/molten moons, outer ice planets take ice moons, and gas
giants take every class except gas giant. moon-grey is moon-only (MOON_ONLY_SPRITES).

The images are pure landscapes: a later room layer frames them in a window, so the
prompt keeps the subject centred and the picture even out to every edge.
"""

from .config import REPO

ICONS = REPO / "images" / "icons"

VARIANTS = {
    "molten": ("planet", "giant-moon", "planet-moon"),
    "toxic": ("planet", "giant-moon"),
    "rocky": ("planet", "giant-moon", "planet-moon"),
    "rocky-moon-only": ("giant-moon", "planet-moon"),
    "ice": ("planet", "giant-moon", "planet-moon"),
    "gas-giant": ("planet",),
}

# sprite -> (class, palette in words, terrain). Written from the tile sprites themselves.
SPRITES = {
    "planet-uninhabited": ("molten", "charcoal black and smouldering crimson",
                           "cracked black basalt plains veined with glowing red lava, drifting smoke"),
    "planet-furs": ("molten", "fiery orange, coral red and molten gold",
                    "rivers and falls of bright orange lava across red rock, an ember-lit haze"),
    "planet-ivory": ("toxic", "sickly pale yellow, olive and mustard",
                     "pale yellow sulphur flats, olive acid pools and a thick yellowish haze"),
    "planet-fruit": ("toxic", "toxic seafoam green and mint with streaks of magenta pink",
                     "mint-green acid seas and pink chemical streaks across a pale green crust, "
                     "a luminous green haze"),
    "planet-inhabited": ("rocky", "deep teal ocean blue and mossy green",
                         "teal seas, mossy green continents and white clouds"),
    "planet-wine": ("rocky", "dark rust brown, ochre and amber",
                    "rust-brown canyons and mesas, ochre dust, a dim amber sky"),
    "planet-wheat": ("rocky", "vivid royal blue and white with small golden islands",
                     "a deep blue ocean with scattered golden-yellow islands, bright white clouds"),
    "planet-spice": ("rocky", "warm orange, sandy tan and terracotta",
                     "rolling orange and tan dunes and terracotta rock, a dusty sky"),
    "planet-oasis": ("rocky", "soft periwinkle blue and white with patches of green",
                     "blue lakes and seas among green oases, swirling white clouds"),
    "planet-silk": ("rocky", "vivid lime green with reddish-brown streaks",
                    "lush lime-green alien vegetation crossed by reddish-brown ridges and rivers"),
    "moon-grey": ("rocky-moon-only", "neutral greys and white",
                  "barren grey dust plains, craters and pale white rock under a dark thin sky"),
    "planet-whales": ("gas-giant", "magenta, violet and deep purple",
                      "swirling magenta and violet cloud bands"),
    "planet-gas-brown": ("gas-giant", "copper brown, tan and cream",
                         "swirling copper and tan cloud bands"),
    "planet-gas-yellow": ("gas-giant", "golden yellow, ochre and cream",
                          "swirling golden and ochre cloud bands"),
    "planet-gas-cyan": ("gas-giant", "pale cyan, aqua and teal-grey",
                        "swirling pale cyan and aqua cloud bands"),
    "planet-gas-blue": ("gas-giant", "deep blue, cobalt and periwinkle",
                        "swirling cobalt and periwinkle cloud bands"),
    "planet-gas-green": ("gas-giant", "green, olive and pale sage",
                         "swirling green and sage cloud bands"),
    "planet-shield": ("ice", "icy white and pale blue",
                      "snowfields and pale blue glaciers under white cloud"),
    "planet-buffalo": ("ice", "cyan-teal and white",
                       "a teal frozen sea of cracked white ice floes and cyan glacier cliffs"),
}

SETTLEMENT = {
    "molten": "heat-shielded domes and dark ceramic towers on raised basalt, windows glowing",
    "toxic": "sealed domes and tall spires with air-filter stacks, linked by enclosed walkways",
    "rocky": "alien towers and terraces built into the landscape",
    "rocky-moon-only": "low pressurised domes and slender towers",
    "ice": "insulated domes and towers half-sunk into the ice, warm lights in the windows",
    "gas-giant": ("a floating city of domes and towers on broad platforms held aloft above "
                  "the clouds, more floating platforms in the distance"),
}

PLANET_MOON_SKY = {
    "ice": "a smaller icy white and pale blue planet",
    "default": ("a smaller alien rocky planet with rust and ochre continents and teal seas, "
                "unmistakably not Earth"),
}
# Moons whose own sky has no air, so nothing drifts in front of the parent planet.
AIRLESS = {"moon-grey"}

STYLE = ("Painterly-realistic digital art, natural daylight from the scene's own sun, "
         "cinematic depth and atmospheric perspective.")
NEGATIVE = ("No people, no creatures, no text, no watermark, no logo, no border, no window "
            "frame, no vignette.")


# Gas giants are made in two steps: a plain Saturn view the model knows well (from its own
# cloud tops, the rings a huge near-straight band rising steeply out of the horizon, as in
# NASA's Cassini Grand Finale art), then an image edit per gas giant sprite that
# keeps the camera and rings and changes only colours and the city. Asked for directly, the
# model drew the rings hanging in mid-sky like another planet's.
SATURN_BASE = (
    "The view from inside Saturn's upper atmosphere, just above the cloud tops, close to the "
    "ring plane, in daylight. Below, out to a flat, softly glowing hazy horizon near the "
    "vertical middle: Saturn's pale butterscotch, cream and tan cloud bands, streaky cloud "
    "tops and a swirling storm vortex. Saturn's own rings, seen from very close, dominate the "
    "sky: one huge, bright white band, about a third of the image wide, made of many fine "
    "parallel striations with thin dark gaps between them, slightly translucent at its edges. "
    "The band rises steeply and almost straight out of the horizon just left of centre and "
    "runs up to the top edge of the image on the right, leaning to the right, with only the "
    "faintest curve because the rings are so enormous. Deep blue-black sky above, fading to "
    "pale blue haze at the horizon, a small bright distant sun. Wide eye-level view, the "
    "picture even out to every edge. " + STYLE + " No text, no watermark, no logo, no "
    "border, no vignette, no spacecraft, no other planets or moons.")


def build_gas_edit(sprite, note=None):
    """Edit prompt applied to a chosen Saturn base image for one gas giant sprite."""
    cls, colours, terrain = SPRITES[sprite]
    if cls != "gas-giant":
        raise ValueError(f"{sprite} is not a gas giant")
    hexes = ", ".join(hex_palette(sprite))
    parts = [
        "Keep this image's camera, horizon, cloud layout and the ring band exactly where and "
        "how they are.",
        f"Recolour the clouds and sky into an alien gas giant: {terrain}, a palette dominated by "
        f"{colours} (about {hexes}). The rings stay pale cream, tan and grey.",
        f"Add {SETTLEMENT[cls]}, the city centred on the horizon within the central third of "
        "the frame.",
        STYLE,
        "No people, no text, no watermark, no logo, no border, no vignette, no other planets.",
    ]
    if note:
        parts.append(f"Correction: {note}")
    return " ".join(parts)


def combos():
    """Every (sprite, variant) the game can show, in catalogue order."""
    return [(s, v) for s, (cls, _, _) in SPRITES.items() for v in VARIANTS[cls]]


def hex_palette(sprite, n=4):
    """n dominant colours of the sprite's lit surface (dark shadow side and gas giant rings
    left out), most common first."""
    import numpy as np
    from PIL import Image
    a = np.array(Image.open(ICONS / f"{sprite}.png").convert("RGBA"))
    h, w = a.shape[:2]
    mask = a[..., 3] > 200
    mask &= a[..., :3].astype(int).sum(2) > 150  # drop the night side
    if SPRITES[sprite][0] == "gas-giant":  # wide sprite: keep the globe, not the rings
        yy, xx = np.mgrid[:h, :w]
        mask &= (yy - h / 2) ** 2 + (xx - w / 2) ** 2 < (0.2 * w) ** 2
    px = a[mask][:, :3]
    q = Image.fromarray(px[None]).quantize(n + 2, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    cols = [tuple(pal[i * 3:i * 3 + 3]) for _, i in sorted(q.getcolors(), reverse=True)]
    # Medium-cut averages blend vivid streaks into greys, which would mute the scene; skip
    # near-greys unless the sprite is grey itself (moon-grey).
    vivid = [c for c in cols if max(c) - min(c) > 0.15 * max(max(c), 1)]
    return ["#%02x%02x%02x" % c for c in (vivid if len(vivid) >= n else cols)[:n]]


def sky_clause(cls, variant, sprite=None):
    if variant == "giant-moon":
        return ("A huge ringed gas giant with soft cream and tan bands, half lit by the sun, "
                "fills about a third of the sky in the upper centre; the whole giant, rings "
                "included, sits inside the frame.")
    if variant == "planet-moon":
        # One generic parent per kind repeats across images: keep it modest in size, give it
        # its own swirling cloud cover, and veil it with this world's clouds where there's air.
        body = PLANET_MOON_SKY.get(cls, PLANET_MOON_SKY["default"])
        veil = (" It is muted and low in contrast, its colours desaturated toward this scene's "
                "greys so it blends into the sky rather than looking crisp and vivid."
                if sprite in AIRLESS else
                " It is seen through this world's atmosphere, like the Moon by day: washed in the "
                "sky's own hue, low in contrast and partly translucent, blending into the sky. "
                "Wisps of this world's own clouds and haze drift across part of it, softening it.")
        return (f"{body[0].upper()}{body[1:]}, about a sixth of the image wide, hangs in the "
                "upper part of the sky, wholly inside the frame; thick swirling white cloud "
                "bands and storm spirals cover much of its surface, so only parts of its "
                f"continents and seas show through.{veil}")
    if cls == "gas-giant":
        # From the cloud tops the giant's own rings are a band seen from below that springs
        # from the horizon; a closed ring arc in mid-sky reads as another planet's rings.
        return ("The viewer is on this gas giant, beneath its own ring system: the rings are "
                "seen from below as one immense broad band like Saturn's rings, made of many "
                "fine parallel stripes of cream, tan and grey with a distinct dark gap between "
                "its inner and outer rings, slightly translucent with the sky showing through; "
                "the band rises out of the horizon at the far left, arches high across the whole "
                "sky and sinks back into the horizon at the far right, both ends touching the "
                "horizon, wider overhead and narrowing toward the horizon in perspective; it is "
                "not a rainbow. There is no planet in the sky and no ringed body anywhere. The "
                "small bright sun sits low.")
    return "Its sun shines in the sky; no large planet looms overhead."


def build(sprite, variant, note=None):
    cls, colours, terrain = SPRITES[sprite]
    if variant not in VARIANTS[cls]:
        raise ValueError(f"{sprite} ({cls}) has no '{variant}' variant; it has {VARIANTS[cls]}")
    if cls == "gas-giant":
        world = "a gas giant, seen across its endless cloud tops with no solid ground"
    elif variant == "planet":
        world = "an alien planet"
    else:
        world = "an alien moon"
    hexes = ", ".join(hex_palette(sprite))
    parts = [
        f"A wide eye-level landscape on {world}, viewed from inside one of its settlements.",
        f"Terrain: {terrain}.",
        f"Colour palette dominated by {colours} (about {hexes}); ground, water, haze and sky all "
        "take these hues, so the scene reads at a glance as this world.",
        f"In the middle distance, {SETTLEMENT[cls]}.",
        sky_clause(cls, variant, sprite),
        "Clearly an alien world, nothing Earth-like: unfamiliar rock forms, alien plants or none, "
        "a strange sky.",
        "Composition: horizon near the vertical middle; the settlement and "
        + ("the sun" if cls == "gas-giant" else "anything in the sky")
        + " stay within the central two-thirds of the frame; the picture runs evenly to every edge "
        "with nothing large close to the camera.",
        STYLE,
        NEGATIVE,
    ]
    if note:
        parts.append(f"Correction: {note}")
    return " ".join(parts)
