"""Config loading and repo paths for the species portrait pipeline."""

import tomllib
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
REPO = PKG_DIR.parents[1]
SPECIES_DIR = REPO / "species"
WORK = SPECIES_DIR / "work"
RAW_DIR = WORK / "raw"
VARIANT_DIR = WORK / "variants"
PROMPT_DIR = WORK / "prompts"
BATCH_DIR = WORK / "batches"
SET_DIR = WORK / "sets"
STATE_PATH = WORK / "state.json"
REVIEW_PATH = WORK / "review.json"
SPEND_LOG = WORK / "spend.log"
CUTOUT_DIR = SPECIES_DIR / "images" / "cutout"
THUMB_DIR = SPECIES_DIR / "images" / "thumb"
MANIFEST_PATH = SPECIES_DIR / "species_images.json"
CONFIG_PATH = PKG_DIR / "config.toml"

METHODS = ("A", "B", "C1", "C2", "D")
# Which generation background each cutout method consumes.
METHOD_BG = {"A": "A", "B": "B", "C1": "C", "C2": "C", "D": "D"}
QUALITIES = ("low", "medium", "high")


class ConfigError(Exception):
    pass


def load(path=CONFIG_PATH):
    with open(path, "rb") as f:
        cfg = tomllib.load(f)
    validate(cfg)
    return cfg


def validate(cfg):
    w, _, h = cfg["size"].partition("x")
    w, h = int(w), int(h)
    if w % 16 or h % 16 or max(w, h) > 3840 or max(w, h) / min(w, h) > 3:
        raise ConfigError(f"size {cfg['size']} violates gpt-image-2 size rules")
    if not 655_360 <= w * h <= 8_294_400:
        raise ConfigError(f"size {cfg['size']} pixel count out of range")
    if cfg["quality"] not in QUALITIES:
        raise ConfigError(f"quality must be one of {QUALITIES}")
    if cfg["locked"]["method"] not in METHODS:
        raise ConfigError(f"locked.method must be one of {METHODS}")
    if cfg["budget_usd_total"] <= 0:
        raise ConfigError("budget_usd_total must be positive")


def ensure_work_dirs():
    for d in (WORK, RAW_DIR, VARIANT_DIR, PROMPT_DIR, BATCH_DIR, SET_DIR):
        d.mkdir(parents=True, exist_ok=True)
