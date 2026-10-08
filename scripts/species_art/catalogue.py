"""Species catalogue: species.json (source of truth) merged with visual_overrides.json."""

import json
from dataclasses import dataclass

from .config import SPECIES_DIR

OVERRIDES_PATH = SPECIES_DIR / "visual_overrides.json"
BODY_PLANS = ("legged", "bird", "swimmer", "floater", "serpentine", "sessile")


@dataclass(frozen=True)
class Species:
    id: int
    key: str
    group: str
    prototype: str
    scientific: str
    planetoids: tuple
    description: str
    image_notes: str
    visual: str
    traits: str
    body_plan: str
    pose: str | None
    method: str | None
    curated: bool

    @property
    def slug(self):
        return f"{self.id:03d}-{self.key}"


def load():
    """Return {id: Species}, ordered by id."""
    records = json.loads((SPECIES_DIR / "species.json").read_text())
    overrides = json.loads(OVERRIDES_PATH.read_text())["species"]
    out = {}
    for r in sorted(records, key=lambda r: r["id"]):
        ov = overrides.get(str(r["id"]), {})
        visual = ov.get("visual") or r["image_notes"].split(";")[0].strip()
        body_plan = ov.get("body_plan", "legged")
        if body_plan not in BODY_PLANS:
            raise ValueError(f"species {r['id']}: bad body_plan {body_plan!r}")
        out[r["id"]] = Species(
            id=r["id"], key=r["key"], group=r["group"], prototype=r["prototype"],
            scientific=r["scientific"], planetoids=tuple(r["planetoids"]),
            description=r["description"], image_notes=r["image_notes"],
            visual=visual, traits=ov.get("traits", ""), body_plan=body_plan,
            pose=ov.get("pose"), method=ov.get("method"), curated=bool(ov.get("curated")),
        )
    return out
