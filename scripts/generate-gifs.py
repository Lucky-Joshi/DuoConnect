"""Generate the small built-in GIF pack used by the chat picker.

Requires Pillow and the Windows Segoe UI Emoji font. The generated files are
committed to client/public/gifs, so this script only needs to run when the
pack changes.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = Path(r"C:\Windows\Fonts\seguiemj.ttf")
OUT_DIR = Path(__file__).resolve().parent.parent / "client" / "public" / "gifs"
SIZE = 128
FRAMES = 12
DURATION = 90

# id: (emoji, background, accent)
PACK = {
    "wave": ("👋", (237, 233, 254), (196, 181, 253)),
    "heart": ("❤️", (253, 242, 248), (244, 114, 182)),
    "laugh": ("😂", (254, 243, 199), (251, 191, 36)),
    "party": ("🎉", (253, 242, 248), (217, 70, 239)),
    "fire": ("🔥", (255, 237, 213), (249, 115, 22)),
    "thumbsup": ("👍", (254, 243, 199), (245, 158, 11)),
    "clap": ("👏", (255, 247, 237), (251, 146, 60)),
    "cat": ("🐱", (255, 237, 213), (234, 88, 12)),
    "coffee": ("☕", (237, 233, 254), (139, 92, 246)),
    "music": ("🎵", (207, 250, 254), (34, 211, 238)),
    "yes": ("✅", (207, 250, 254), (16, 185, 129)),
    "wow": ("😮", (224, 242, 254), (96, 165, 250)),
}

FONT = ImageFont.truetype(str(FONT_PATH), 84)


def transform(frame_index: int, kind: str) -> tuple[float, float, float]:
    """Return (scale, rotation, y_offset) for one animation frame."""
    phase = frame_index / FRAMES * math.tau
    if kind == "wave":
        return 1.0, 18 * math.sin(phase), 0
    if kind in {"heart", "thumbsup", "yes"}:
        return 1 + 0.12 * math.sin(phase), 0, -3 * math.sin(phase)
    if kind in {"laugh", "cat", "wow"}:
        return 1 + 0.04 * math.sin(phase * 2), 4 * math.sin(phase), -6 * abs(math.sin(phase))
    if kind == "party":
        return 1 + 0.06 * math.sin(phase * 2), 10 * math.sin(phase * 2), -4 * math.sin(phase)
    if kind == "fire":
        return 1 + 0.09 * math.sin(phase * 3), 5 * math.sin(phase), -2 * math.cos(phase * 2)
    if kind == "clap":
        return 1 + 0.08 * abs(math.sin(phase)), 0, -2 * math.sin(phase * 2)
    if kind == "coffee":
        return 1.0, 0, -5 * math.sin(phase)
    return 1.0, 0, 0


def make_frames(emoji: str, background: tuple[int, int, int], kind: str) -> list[Image.Image]:
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)
    draw.text((SIZE // 2, SIZE // 2), emoji, font=FONT, anchor="mm", embedded_color=True)

    frames = []
    for index in range(FRAMES):
        scale, rotation, y_offset = transform(index, kind)
        sprite = base.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=False)
        if scale != 1:
            width = max(1, int(SIZE * scale))
            sprite = sprite.resize((width, width), Image.Resampling.LANCZOS)
            sprite = sprite.crop(
                (
                    (width - SIZE) // 2,
                    (width - SIZE) // 2 + int(y_offset),
                    (width + SIZE) // 2,
                    (width + SIZE) // 2 + int(y_offset),
                )
            )

        frame = Image.new("RGBA", (SIZE, SIZE), (*background, 255))
        frame.alpha_composite(sprite)
        frames.append(frame.convert("RGB"))
    return frames


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (emoji, background, _accent) in PACK.items():
        frames = make_frames(emoji, background, name)
        path = OUT_DIR / f"{name}.gif"
        frames[0].save(
            path,
            save_all=True,
            append_images=frames[1:],
            duration=DURATION,
            loop=0,
            disposal=2,
            optimize=True,
        )
        print(f"{path.name}: {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
