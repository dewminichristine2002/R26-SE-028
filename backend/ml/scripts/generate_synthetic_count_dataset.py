from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


BACKGROUND_COLORS = [
    (187, 132, 96),
    (205, 154, 118),
    (165, 106, 82),
    (220, 174, 138),
]

TABLET_COLORS = [
    (244, 244, 235),
    (235, 219, 101),
    (241, 160, 188),
    (207, 230, 250),
    (230, 150, 90),
]


def draw_tablet(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int, color: tuple[int, int, int]) -> None:
    width_scale = random.uniform(0.8, 1.45)
    height_scale = random.uniform(0.65, 1.05)
    rx = int(radius * width_scale)
    ry = int(radius * height_scale)
    bbox = (cx - rx, cy - ry, cx + rx, cy + ry)
    draw.ellipse(bbox, fill=color, outline=tuple(max(0, value - 35) for value in color), width=2)

    if random.random() < 0.35:
        draw.line((cx - int(rx * 0.55), cy, cx + int(rx * 0.55), cy), fill=(180, 180, 170), width=1)


def generate_image(count: int, width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), random.choice(BACKGROUND_COLORS))
    draw = ImageDraw.Draw(image)

    for _ in range(random.randint(5, 12)):
        x = random.randint(0, width)
        y = random.randint(0, height)
        shade = random.randint(-12, 18)
        color = tuple(max(0, min(255, channel + shade)) for channel in image.getpixel((min(x, width - 1), min(y, height - 1))))
        draw.ellipse((x - 70, y - 45, x + 90, y + 65), fill=color)

    placed: list[tuple[int, int, int]] = []
    attempts = 0
    while len(placed) < count and attempts < 200:
        attempts += 1
        radius = random.randint(13, 24)
        cx = random.randint(radius + 18, width - radius - 18)
        cy = random.randint(radius + 18, height - radius - 18)
        if any(((cx - px) ** 2 + (cy - py) ** 2) ** 0.5 < radius + pr + 12 for px, py, pr in placed):
            continue
        placed.append((cx, cy, radius))

    for cx, cy, radius in placed:
        draw_tablet(draw, cx, cy, radius, random.choice(TABLET_COLORS))

    image = image.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.0, 0.6)))
    return image


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a synthetic palm/tablet-count dataset.")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--images-per-count", type=int, default=80)
    parser.add_argument("--max-count", type=int, default=5)
    parser.add_argument("--width", type=int, default=360)
    parser.add_argument("--height", type=int, default=260)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    manifest_path = args.output_dir / "manifest.csv"
    rows: list[dict[str, str | int]] = []

    for count in range(0, args.max_count + 1):
        for index in range(args.images_per_count):
            split = "val" if index >= int(args.images_per_count * 0.8) else "train"
            folder = args.output_dir / "images" / split / f"count_{count}"
            folder.mkdir(parents=True, exist_ok=True)
            image_path = folder / f"count_{count}_{index:04d}.jpg"
            image = generate_image(count=count, width=args.width, height=args.height)
            image.save(image_path, quality=88)
            rows.append(
                {
                    "image_path": str(image_path),
                    "count": count,
                    "split": split,
                }
            )

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image_path", "count", "split"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {manifest_path}")


if __name__ == "__main__":
    main()
