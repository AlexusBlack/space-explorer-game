"""Background removal. Every method reads an untouched raw and returns straight
(un-premultiplied) RGBA, so any species can be re-cut later without re-generating.

  A   native transparency: validate alpha, snap near-opaque, decontaminate edge colour
  B   grey background: the matting model mask + analytic un-mix against the measured background
  C1  black background: as B
  C2  black background: union of the matting model mask and luminance alpha, for glow/translucency
  D   chroma green: the matting model mask minus near-pure-backdrop holes, unmix + despill
"""

import numpy as np
from PIL import Image

_sessions = {}


def matting_mask(img, cfg):
    """Float HxW alpha in 0..1 from the rembg session named in config (ONNX, CPU)."""
    from rembg import new_session, remove
    name = cfg["cutout"]["matting_model"]
    if name not in _sessions:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.enable_cpu_mem_arena = False  # lower peak RAM; the matting model at 1024 is memory-hungry
        _sessions[name] = new_session(name, providers=["CPUExecutionProvider"], sess_opts=opts)
    mask = remove(img.convert("RGB"), session=_sessions[name], only_mask=True)
    return np.asarray(mask, dtype=np.float32) / 255.0


def border_color(rgb, width=8):
    b = np.concatenate([rgb[:width].reshape(-1, 3), rgb[-width:].reshape(-1, 3),
                        rgb[:, :width].reshape(-1, 3), rgb[:, -width:].reshape(-1, 3)])
    return np.median(b, axis=0)


def unmix(rgb, alpha, bg):
    """Solve I = a*F + (1-a)*B for F where alpha is meaningful."""
    a = alpha[..., None]
    fg = np.where(a > 0.02, (rgb - (1 - a) * bg) / np.maximum(a, 0.02), rgb)
    return np.clip(fg, 0, 1)


def _rgba(fg, alpha):
    out = np.dstack([fg, alpha])
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def _stats(alpha, flags):
    return {"coverage": round(float((alpha > 0.03).mean()), 4),
            "semi": round(float(((alpha > 0.03) & (alpha < 0.97)).mean()), 4),
            "flags": flags}


def cut(raw_path, method, cfg, mask_fn=None):
    """Return (rgba uint8 HxWx4, stats). mask_fn(img, cfg) overrides the matting model (tests)."""
    mask_fn = mask_fn or matting_mask
    img = Image.open(raw_path)
    flags = []

    if method == "A":
        if img.mode != "RGBA":
            flags.append("opaque_returned")
            img = img.convert("RGBA")
        arr = np.asarray(img, dtype=np.float32) / 255.0
        rgb, alpha = arr[..., :3], arr[..., 3].copy()
        corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
        if (alpha < 250 / 255).mean() < 0.05 or max(corners) > 0.5:
            flags.append("opaque_returned")
        alpha[alpha >= 250 / 255] = 1.0   # preview quirk: opaque areas arrive as 252-254
        alpha[alpha <= 3 / 255] = 0.0
        from pymatting import estimate_foreground_ml
        fg = estimate_foreground_ml(rgb.astype(np.float64), alpha.astype(np.float64))
        return _rgba(fg, alpha), _stats(alpha, flags)

    rgb = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    bg = border_color(rgb)
    mask = mask_fn(img, cfg)

    if method in ("B", "C1"):
        return _rgba(unmix(rgb, mask, bg), mask), _stats(mask, flags)

    if method == "C2":
        c = cfg["cutout"]
        lum = rgb.max(axis=2)
        lum_alpha = np.clip((lum - c["lum_floor"]) / (1 - c["lum_floor"]) * c["lum_gain"], 0, 1)
        alpha = np.maximum(mask, lum_alpha)
        return _rgba(unmix(rgb, alpha, bg), alpha), _stats(alpha, flags)

    if method == "D":
        # Matting mask, then the green screen's one unambiguous signal: pixels that are
        # >= ~97% backdrop (holes between legs, through fins) are cleared. A full chroma
        # matte isn't attempted: it needs the local subject colour, which the matting model + unmix
        # already handles better.
        green_dominance = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
        gd_bg = max(float(bg[1] - max(bg[0], bg[2])), 0.1)
        backdrop = np.clip((green_dominance / gd_bg - 0.9) / 0.08, 0, 1)
        alpha = np.minimum(mask, 1 - backdrop)
        fg = unmix(rgb, alpha, bg)
        fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]))  # residual despill
        return _rgba(fg, alpha), _stats(alpha, flags)

    raise ValueError(f"unknown method {method}")
