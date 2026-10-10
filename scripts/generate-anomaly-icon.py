#!/usr/bin/env python3
"""Synthesizes the anomaly icons:
- images/icons/anomaly.png: a black circle with a white "?" (regular anomaly);
- images/icons/wormhole.png: a purple circle with a white spiral (wormhole);
- images/icons/wormhole-glyph.png: the spiral alone, for the purple
  notification bubble (index.html's .notice-wormhole), which has its own ring.

Unlike every other icon, this isn't cropped from a FreeCiv tilesheet (no
such icon exists there) -- same treatment as images/select-alpha.png.
Run directly: python3 scripts/generate-anomaly-icon.py
"""
import math

from PIL import Image, ImageDraw, ImageFont

SIZE = 48  # matches the ~50x47px scale of planet/star icons
WORMHOLE_PURPLE = (75, 42, 122, 255)  # #4b2a7a, the notification bubble's colour
SUPERSAMPLE = 4

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
    write_wormhole_icons()


# Two and a half turns of an Archimedean spiral, drawn at SUPERSAMPLE x and
# scaled down so the curve stays smooth at 48px.
def spiral(draw, size, radius, width):
    cx = cy = size / 2
    turns = 2.5
    steps = 240
    points = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * 2 * math.pi
        rr = radius * (0.12 + 0.88 * t)
        points.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    draw.line(points, fill=(255, 255, 255, 255), width=width, joint="curve")


def write_wormhole_icons():
    big = SIZE * SUPERSAMPLE
    pad = 2 * SUPERSAMPLE

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([pad, pad, big - pad, big - pad], fill=WORMHOLE_PURPLE,
                 outline=(255, 255, 255, 220), width=2 * SUPERSAMPLE)
    spiral(draw, big, big * 0.3, 3 * SUPERSAMPLE)
    img.resize((SIZE, SIZE), Image.LANCZOS).save("images/icons/wormhole.png")
    print("wrote images/icons/wormhole.png")

    glyph = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    spiral(ImageDraw.Draw(glyph), big, big * 0.36, 3 * SUPERSAMPLE)
    glyph.resize((SIZE, SIZE), Image.LANCZOS).save("images/icons/wormhole-glyph.png")
    print("wrote images/icons/wormhole-glyph.png")


if __name__ == "__main__":
    main()
