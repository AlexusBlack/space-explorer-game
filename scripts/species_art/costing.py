"""Cost estimates, actual cost from API `usage`, and the budget guard."""

import json

from .config import SPEND_LOG
from .state import now


class BudgetExceeded(Exception):
    pass


def _approx_text_tokens(prompt):
    return max(1, len(prompt) // 4)


def estimate(cfg, quality, size, prompt, batch=False):
    pr = cfg["pricing"]
    per_image = pr["per_image"].get(f"{quality}@{size}")
    if per_image is None:  # unknown size: scale the square price by pixel count
        w, h = (int(x) for x in size.split("x"))
        per_image = pr["per_image"][f"{quality}@1024x1024"] * (w * h) / (1024 * 1024)
    usd = per_image + _approx_text_tokens(prompt) * pr["text_input_per_m"] / 1e6
    return usd * (pr["batch_discount"] if batch else 1.0)


def actual_from_usage(cfg, usage, batch=False):
    """usage: dict from ImagesResponse.usage (input_tokens, output_tokens,
    input_tokens_details{text_tokens,image_tokens}). Returns USD or None."""
    if not usage or "output_tokens" not in usage:
        return None
    pr = cfg["pricing"]
    details = usage.get("input_tokens_details") or {}
    text_in = details.get("text_tokens", usage.get("input_tokens", 0))
    image_in = details.get("image_tokens", 0)
    usd = (text_in * pr["text_input_per_m"] + image_in * pr["image_input_per_m"]
           + usage["output_tokens"] * pr["image_output_per_m"]) / 1e6
    return usd * (pr["batch_discount"] if batch else 1.0)


class BudgetGuard:
    """Checks spent + reserved + estimate against min(stage cap, total cap)."""

    def __init__(self, cfg, state, stage):
        self.cfg, self.state, self.stage = cfg, state, stage
        self.pending = 0.0  # estimates reserved by in-progress sync requests

    def headroom(self):
        total_left = self.cfg["budget_usd_total"] - self.state.spent() - self.state.reserved()
        cap = self.cfg["stage_caps"].get(self.stage, self.cfg["budget_usd_total"])
        stage_left = cap - self.state.spent(self.stage) - self.state.reserved(self.stage)
        return min(total_left, stage_left) - self.pending

    def reserve(self, usd):
        with self.state.lock:
            if usd > self.headroom() + 1e-9:
                raise BudgetExceeded(
                    f"stage '{self.stage}': next image (~${usd:.3f}) exceeds remaining budget "
                    f"(${max(self.headroom(), 0):.3f}); spent ${self.state.spent(self.stage):.3f} "
                    f"this stage, ${self.state.spent():.3f} total")
            self.pending += usd

    def release(self, usd):
        with self.state.lock:
            self.pending -= usd


def log_spend(job, usd, source):
    SPEND_LOG.parent.mkdir(parents=True, exist_ok=True)
    rec = {"ts": now(), "species_id": job["species_id"], "job": job["id"], "stage": job["stage"],
           "usage": job.get("usage"), "usd": round(usd, 6), "source": source}
    with open(SPEND_LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")
