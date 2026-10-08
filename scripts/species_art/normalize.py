"""Common bounding convention for final cutouts.

Trim to the alpha bbox, scale to fit a fit_box x fit_box square (upscale capped),
then place on a size x size transparent canvas:
  grounded body plans  -> bottom-centre, lowest opaque pixel bottom_pad px above the edge
  floaters / swimmers  -> visual centre (bbox centre on canvas centre)
"""

import numpy as np
from PIL import Image

GROUNDED = {"legged", "bird", "serpentine", "sessile"}


def _resize(img, size):
    # premultiplied resampling avoids dark/colour fringes from transparent pixels
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def normalize(rgba, body_plan, cfg):
    c = cfg["canvas"]
    arr = np.array(rgba, dtype=np.uint8)
    arr[arr[..., 3] <= 8] = 0
    ys, xs = np.nonzero(arr[..., 3])
    if len(xs) == 0:
        raise ValueError("cutout is empty (no opaque pixels)")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = Image.fromarray(arr[y0:y1, x0:x1], "RGBA")
    w, h = crop.size
    scale = min(c["fit_box"] / w, c["fit_box"] / h, c["max_upscale"])
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    crop = _resize(crop, (nw, nh))

    S = c["size"]
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    x = (S - nw) // 2
    if body_plan in GROUNDED:
        anchor, y, pivot = "bottom-center", S - c["bottom_pad"] - nh, [S // 2, S - c["bottom_pad"]]
    else:
        anchor, y, pivot = "center", (S - nh) // 2, [S // 2, S // 2]
    canvas.paste(crop, (x, y))
    meta = {"anchor": anchor, "pivot": pivot, "bbox": [x, y, x + nw, y + nh], "scale": round(scale, 4)}
    return canvas, meta


def save_final(canvas, cutout_path, thumb_path, cfg):
    c = cfg["canvas"]
    cutout_path.parent.mkdir(parents=True, exist_ok=True)
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(cutout_path, "WEBP", lossless=True, method=6)
    _resize(canvas, (c["thumb"], c["thumb"])).save(thumb_path, "WEBP", quality=c["thumb_quality"], method=6)
