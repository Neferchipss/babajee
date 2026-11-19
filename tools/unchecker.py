"""Turn a ChatGPT 'transparent' PNG whose checkerboard is painted in into a
real RGBA PNG: flood-fill from the border through light, low-saturation
pixels (the checker squares), stopping at the art's ink outlines.

    python tools/unchecker.py in.png out.png [--thresh 200]
"""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
T = int(sys.argv[sys.argv.index("--thresh") + 1]) if "--thresh" in sys.argv else 200
im = Image.open(src).convert("RGB")
w, h = im.size
px = im.load()

def bg(x, y):
    r, g, b = px[x, y]
    return min(r, g, b) >= T and max(r, g, b) - min(r, g, b) <= 18

mask = bytearray(w * h)  # 1 = background
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bg(x, y): q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if bg(x, y): q.append((x, y))
while q:
    x, y = q.popleft()
    i = y * w + x
    if mask[i]: continue
    mask[i] = 1
    for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
        if 0 <= nx < w and 0 <= ny < h and not mask[ny * w + nx] and bg(nx, ny):
            q.append((nx, ny))

# checker pockets the border fill can't reach (enclosed by smoke curls etc.):
# any other light region bigger than MIN_POCKET px is background too; small
# ones (an eye's white, a highlight) stay
MIN_POCKET = int(sys.argv[sys.argv.index("--pocket") + 1]) if "--pocket" in sys.argv else 1500
seen = bytearray(mask)
for sy in range(h):
    for sx in range(w):
        if seen[sy * w + sx] or not bg(sx, sy):
            continue
        comp, q = [], deque([(sx, sy)])
        seen[sy * w + sx] = 1
        while q:
            x, y = q.popleft()
            comp.append(y * w + x)
            for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and bg(nx, ny):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
        if len(comp) >= MIN_POCKET:
            for i in comp:
                mask[i] = 1

alpha = Image.frombytes("L", (w, h), bytes(0 if m else 255 for m in mask))
# soften the cut edge by one pixel so the ink doesn't look jagged
alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
out = im.convert("RGBA")
out.putalpha(alpha)
out.save(dst, optimize=True)
print(f"{dst}: {w}x{h}, background {sum(mask)*100//(w*h)}%")
