#!/usr/bin/env python3
"""Synthesizes images/icons/anomaly.png: a black circle with a white "?".

Unlike every other icon, this isn't cropped from a FreeCiv tilesheet (no
such icon exists there) -- same treatment as images/select-alpha.png.
Run directly: python3 scripts/generate-anomaly-icon.py
"""
from PIL import Image, ImageDraw, ImageFont

SIZE = 48  # matches the ~50x47px scale of planet/star icons

def main():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = 2
    draw.ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=(10, 10, 14, 255), outline=(255, 255, 255, 220), width=2)

    font = None
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        try:
            font = ImageFont.truetype(path, int(SIZE * 0.62))
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    text = "?"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (SIZE / 2 - tw / 2 - bbox[0], SIZE / 2 - th / 2 - bbox[1]),
        text,
        fill=(255, 255, 255, 255),
        font=font,
    )

    out_path = "images/icons/anomaly.png"
    img.save(out_path)
    print(f"wrote {out_path} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
