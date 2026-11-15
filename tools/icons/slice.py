# Slice the generated 5x4 icon sheet into one transparent PNG per category.
# Every icon gets the same crop size (centred on its own drawing) so the
# stroke weight stays identical across icons.
import sys
from PIL import Image

SLUGS = [
    "all", "rolling-paper", "accessory", "rolling-tray", "storage",
    "bong", "bong-accessory", "ashtray", "pipe", "grinder",
    "filter", "rolling-tobacco", "roach", "cigars", "lighter",
    "blunt-wraps", "cleaning-accessory", "blunt-pre-rolled-cone", "keychain", "lighter-refills",
]
src, out, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGBA")
a = im.getchannel("A").point(lambda v: 255 if v > 24 else 0)
cw, ch = im.width / 5, im.height / 4
boxes = []
for i in range(20):
    r, c = divmod(i, 5)
    cell = (int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch))
    bb = a.crop(cell).getbbox()
    boxes.append((cell[0] + bb[0], cell[1] + bb[1], cell[0] + bb[2], cell[1] + bb[3]))
side = max(max(b[2] - b[0], b[3] - b[1]) for b in boxes) + 8
for slug, (x0, y0, x1, y1) in zip(SLUGS, boxes):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    # keep only this icon's own pixels (neighbours can poke into the square)
    tile = Image.new("RGBA", im.size, (0, 0, 0, 0))
    tile.paste(im.crop((x0, y0, x1, y1)), (x0, y0))
    tile = tile.crop(box)
    alpha = tile.getchannel("A")
    solid = Image.new("RGBA", tile.size, (0, 0, 0, 255))
    solid.putalpha(alpha)
    solid.resize((size, size), Image.LANCZOS).save(f"{out}/{slug}.png", optimize=True)
    print(slug, x1 - x0, y1 - y0)
print("side", side)
