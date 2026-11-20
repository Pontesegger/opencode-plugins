"""Write each plugin's captured terminal frame to its own PNG screenshot."""

import json
import importlib.util
from pathlib import Path
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("preview_renderer", Path(__file__).with_name("write-busy-preview.py"))
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def main():
    captures = json.load(sys.stdin)
    destination = Path(sys.argv[1])
    destination.mkdir(parents=True, exist_ok=True)
    for capture in captures:
        image = renderer.render_frames(capture)[0]
        target = destination / f"{capture['name']}.png"
        image.save(target)
        print(f"PASS: {target.name}: {image.width}×{image.height}, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
