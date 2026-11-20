"""Turn captured terminal cells into a small GIF and static fallback (Pillow)."""

import json
import math
import os
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont


def render_frames(capture):
    font_path = os.environ.get("PREVIEW_FONT") or subprocess.check_output(
        ["fc-match", "-f", "%{file}", "monospace"], text=True
    ).strip()
    font = ImageFont.truetype(font_path, capture.get("fontSize", 32))
    bold_path = Path(font_path).with_stem(Path(font_path).stem + "-Bold")
    bold_font = ImageFont.truetype(str(bold_path), capture.get("fontSize", 32)) if bold_path.exists() else font
    fallback_fonts = {}

    def glyph_font(glyph, primary):
        mask, missing = primary.getmask(glyph), primary.getmask("\U0010ffff")
        if mask.size != missing.size or bytes(mask) != bytes(missing):
            return primary
        if glyph not in fallback_fonts:
            path = os.environ.get("PREVIEW_SYMBOL_FONT") or subprocess.check_output(["fc-match", "-f", "%{file}", f":charset={ord(glyph):x}"], text=True).strip()
            fallback = ImageFont.truetype(path, capture.get("fontSize", 32))
            fallback_mask, fallback_missing = fallback.getmask(glyph), fallback.getmask("\U0010ffff")
            assert fallback_mask.size != fallback_missing.size or bytes(fallback_mask) != bytes(fallback_missing), f"Missing glyph {glyph}: install a symbol font or set PREVIEW_SYMBOL_FONT"
            if fallback.getlength(glyph) > cell_width:
                fallback = ImageFont.truetype(path, max(1, int(fallback.size * cell_width / fallback.getlength(glyph))))
            fallback_fonts[glyph] = fallback
        return fallback_fonts[glyph]
    ascent, descent = font.getmetrics()
    cell_width = math.ceil(font.getlength("M"))
    cell_height = ascent + descent + 8
    size = (capture["columns"] * cell_width, capture["rows"] * cell_height)
    images = []
    for frame in capture["frames"]:
        image = Image.new("RGB", size, "#0a0a0a")
        draw = ImageDraw.Draw(image)
        for row, spans in enumerate(frame):
            column = 0
            for span in spans:
                span_font = bold_font if span.get("attributes", 0) & 1 else font
                x, y = column * cell_width, row * cell_height
                draw.rectangle(
                    (x, y, x + span["width"] * cell_width - 1, y + cell_height - 1),
                    fill=tuple(span["bg"][:3]),
                )
                for offset, glyph in enumerate(span["text"]):
                    if glyph != " ":
                        selected_font = glyph_font(glyph, span_font)
                        glyph_x = x + offset * cell_width + (cell_width - selected_font.getlength(glyph)) / 2
                        baseline = y + (cell_height - ascent - descent) / 2 + ascent
                        draw.text((glyph_x, baseline), glyph, font=selected_font, fill=tuple(span["fg"][:3]), anchor="ls")
                        if span.get("attributes", 0) & 8:
                            draw.line((x + offset * cell_width, baseline + 2, x + (offset + 1) * cell_width - 1, baseline + 2), fill=tuple(span["fg"][:3]))
                column += span["width"]
            assert column == capture["columns"], "Every captured column is drawn"
        images.append(image)
    return images


def main():
    capture = json.load(sys.stdin)
    destination = Path(sys.argv[1])
    destination.mkdir(parents=True, exist_ok=True)
    images = render_frames(capture)
    size = images[0].size
    # One shared palette prevents color flicker and retains antialiased glyphs.
    all_frames = Image.new("RGB", (size[0], size[1] * len(images)))
    for index, image in enumerate(images):
        all_frames.paste(image, (0, index * size[1]))
    palette = all_frames.quantize(colors=256)
    animated = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    gif = destination / "busy-status.gif"
    animated[0].save(
        gif, save_all=True, append_images=animated[1:], duration=capture["duration"],
        loop=0, disposal=2, optimize=False,
    )
    images[5].save(destination / "busy-status.png")
    with Image.open(gif) as saved:
        assert saved.n_frames == len(images), "GIF includes the full scanner round trip"
        assert saved.info["loop"] == 0, "GIF loops indefinitely"
        durations = []
        for index in range(saved.n_frames):
            saved.seek(index)
            durations.append(saved.info["duration"])
        assert set(durations) == {capture["duration"]}, "GIF preserves the scanner's actual timing"
    print(f"PASS: {gif.name}: {len(images)} frames, {capture['duration']} ms/frame, infinite loop, {size[0]}×{size[1]}, {gif.stat().st_size} bytes")
    print("PASS: busy-status.png: static fallback from the same captured renderer frames")


if __name__ == "__main__":
    main()
