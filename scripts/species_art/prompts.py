"""Deterministic prompt builder.

prompt = style block + subject clause + pose clause + background clause + negative tail.
Editing any block changes the prompt text, therefore the job's params hash, so only
species you explicitly regenerate get re-billed; existing raws stay valid.
"""

STYLES = {
    # Candidate A: painterly-realistic game portrait (proposed default).
    "A": (
        "Stylised game creature portrait in a painterly-realistic digital art style, "
        "full body completely inside the frame, three-quarter view facing left, centred, "
        "the creature fills about 80% of the frame height, consistent scale and framing. "
        "Neutral soft studio key light from the upper left with a subtle cool rim light, "
        "no cast shadow, no ground plane."
    ),
    # Candidate B: graphic-novel cel shading.
    "B": (
        "Stylised game creature portrait in a clean cel-shaded graphic-novel style with "
        "confident ink linework and flat colour planes with soft gradients, full body "
        "completely inside the frame, three-quarter view facing left, centred, the creature "
        "fills about 80% of the frame height. Even soft studio light with a thin cool rim "
        "light, no cast shadow, no ground plane."
    ),
    # Candidate C: naturalist specimen plate.
    "C": (
        "Scientific naturalist specimen plate of a creature, detailed gouache and "
        "watercolour illustration, full body completely inside the frame, three-quarter "
        "view facing left, centred, the creature fills about 80% of the frame height. "
        "Soft diffuse even studio light with a faint rim light, no cast shadow, no ground plane."
    ),
}

POSES = {
    "legged": "standing on all its limbs in a neutral stance",
    "bird": "standing, wings folded",
    "swimmer": "level swimming pose, side three-quarter view",
    "floater": "drifting upright, tentacles hanging straight down",
    "serpentine": "resting in a loose S-coil",
    "sessile": "upright on its own base",
}

# Generation background modes (cutout methods map onto these via config.METHOD_BG).
# A must contain no backdrop words: they override background="transparent".
BACKGROUNDS = {
    "A": "Isolated subject on a transparent background.",
    "B": "Plain perfectly flat uniform mid-grey (#808080) background, nothing else in the image.",
    "C": "Plain pure black (#000000) background, nothing else in the image.",
    "D": ("Plain flat chroma-key green (#00B140) background, nothing else in the image; "
          "no green tones on the creature itself."),
}

NEGATIVE = ("No text, no watermark, no border, no frame, no logo, no scenery, no props, "
            "no ground, no cast shadow, no other creatures.")


def subject_clause(sp):
    s = (f"An alien species inspired by the {sp.prototype} ({sp.scientific}), "
         f"clearly not an Earth animal: {sp.visual}.")
    if sp.traits:
        s += " " + sp.traits.rstrip(".") + "."
    return s


def pose_clause(sp):
    return "Pose: " + (sp.pose or POSES[sp.body_plan]).rstrip(".") + "."


def build(sp, style="A", bg="B", note=None):
    parts = [STYLES[style], subject_clause(sp), pose_clause(sp)]
    if note:
        parts.append(f"Correction: {note.rstrip('.')}.")
    parts += [BACKGROUNDS[bg], NEGATIVE]
    return " ".join(parts)


# ---- portrait builder (comms / planet-info screen) -------------------------
# The species are sentient, tool-using peoples derived from an Earth animal, seen
# as if on a video call. Separate from build() so pilot raws and hashes stay valid.

SAPIENCE = {
    "legged": ("Upright or semi-upright posture; its forelimbs end in dexterous clawed "
               "fingers with an opposable digit, and one hand is visible"),
    "bird": "Upright posture; its wing-wrists carry small dexterous fingers",
    "swimmer": ("An expressive face; dexterous manipulators that suit its body (fingered "
                "fins, feelers or prehensile arm tips) holding a small device"),
    "floater": ("Prehensile tentacle tips manipulating a small glowing instrument; "
                "a recognisable sensory 'face' area"),
    "serpentine": ("Raised upright in a coil; a pair of small dexterous arms or a "
                   "prehensile tail tip"),
    "sessile": ("A cluster of fine manipulator tendrils; a clear sensory focus turned "
                "towards the viewer"),
}

FRAMING = {
    "bust": ("Framed like a video call: head and upper body, centred, facing the viewer, "
             "looking directly into the camera with calm, intelligent eye contact, the "
             "neutral expression of someone mid-conversation."),
    "full": "Full figure, standing, facing the viewer, looking directly into the camera.",
}

# Clothing only for body plans with a torso; others got human-style shirts on a
# human-shaped torso, so they get gear fitted to their own anatomy instead.
CLOTHED_PLANS = ("legged", "bird")
CULTURE_CLOTHED = ("Wears simple functional clothing, harness or jewellery suited to its "
                   "body and home world; subtle hints of technology.")
CULTURE_HARNESS = ("Wears a harness, straps or jewellery fitted to its own body shape, no "
                   "human-style garments; its body keeps its own non-human anatomy; subtle "
                   "hints of technology.")

# Opt-in (--strict-anatomy): the default "head and upper body" framing makes the
# model invent a humanoid torso for headless body plans. Kept optional because a
# face-like focus is what makes a portrait readable to people.
STRICT_FRAMING = ("Framed like a video call: the upper part of its body, wherever its "
                  "sensory organs are, centred, facing the viewer, looking directly into "
                  "the camera with calm, intelligent eye contact, the neutral expression of "
                  "someone mid-conversation.")
STRICT_PLANS = ("swimmer", "floater")
STRICT_FLOATER = "No humanoid torso, shoulders or arms; all its limbs are tentacles."

# Portraits are placed in a wider room scene, so the sides must never crop the subject;
# only the bottom edge may cut through the body.
SIDE_MARGIN = ("The whole width of its body, including shoulders, limbs and tentacles, fits "
               "inside the frame with clear empty space on the left and right; only the "
               "bottom edge of the image may cut through the body.")

PORTRAIT_STYLE = ("Painterly-realistic digital art, cinematic soft key light from the upper "
                  "left, subtle cool rim light; plain softly lit neutral dark-grey studio "
                  "backdrop.")

# --transparent: no backdrop words at all, they override background="transparent".
PORTRAIT_STYLE_TRANSPARENT = ("Painterly-realistic digital art, cinematic soft key light "
                              "from the upper left, subtle cool rim light; isolated subject "
                              "on a transparent background.")

PORTRAIT_NEGATIVE = "No text, no watermark, no border, no logo, no other characters."


def build_portrait(sp, framing="bust", note=None, strict_anatomy=False, transparent=False,
                   no_pose=False):
    parts = [
        ("Portrait of a member of an intelligent, sentient alien species that has a "
         f"technological civilisation. Its people evolved from a creature like the "
         f"{sp.prototype} ({sp.scientific}) but are clearly a thinking person, not an "
         f"animal: {sp.visual.rstrip('.')}."),
        SAPIENCE[sp.body_plan] + ".",
        CULTURE_CLOTHED if sp.body_plan in CLOTHED_PLANS else CULTURE_HARNESS,
    ]
    # no_pose: a catalogue pose like "lying flat with arms spread" can override SIDE_MARGIN
    # and push limbs off the side edges; drop it when that happens.
    if sp.pose and not no_pose:
        parts.append(sp.pose[0].upper() + sp.pose[1:].rstrip(".") + ".")
    if strict_anatomy and framing == "bust" and sp.body_plan in STRICT_PLANS:
        parts.append(STRICT_FRAMING)
    else:
        parts.append(FRAMING[framing])
    if framing == "bust":
        parts.append(SIDE_MARGIN)
    if strict_anatomy and sp.body_plan == "floater":
        parts.append(STRICT_FLOATER)
    if note:
        parts.append(f"Correction: {note.rstrip('.')}.")
    parts += [PORTRAIT_STYLE_TRANSPARENT if transparent else PORTRAIT_STYLE,
              PORTRAIT_NEGATIVE]
    return " ".join(parts)
