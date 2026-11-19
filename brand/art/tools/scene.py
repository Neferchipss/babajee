# Layered scenes from the piece library (brand/art/library).
# A layer: (piece, cx, cy, h, rot=0, flip=False); listed back to front.
from PIL import Image, ImageFilter
LIB = "brand/art/library"
_cache = {}
def piece(n):
    if n not in _cache: _cache[n] = Image.open(f"{LIB}/{n}.webp").convert("RGBA")
    return _cache[n]
def shadow(p, blur=6, alpha=70):
    a = p.split()[3].point(lambda v: v * alpha // 255)
    s = Image.new("RGBA", p.size, (20, 8, 30, 0)); s.putalpha(a)
    return s.filter(ImageFilter.GaussianBlur(blur))
def render(layers, W, H, shade=True):
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for L in layers:
        n, cx, cy, h = L[:4]; rot = L[4] if len(L) > 4 else 0; flip = L[5] if len(L) > 5 else False
        p = piece(n); s = h / p.height
        p = p.resize((max(1, round(p.width * s)), max(1, round(p.height * s))), Image.LANCZOS)
        if flip: p = p.transpose(Image.FLIP_LEFT_RIGHT)
        if rot: p = p.rotate(rot, expand=True, resample=Image.BICUBIC)
        x, y = round(cx - p.width / 2), round(cy - p.height / 2)
        if shade and h > 40:
            sh = shadow(p, blur=max(2, h // 30)); lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); lay.paste(sh, (x + 3, y + 5), sh); c = Image.alpha_composite(c, lay)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); lay.paste(p, (x, y), p); c = Image.alpha_composite(c, lay)
    return c
def sea(x0, x1, y, h, step, flip0=False, piece_name="wave-low"):
    # a run of overlapping swells along a line (the eyeless low wave by
    # default), sizes, heights, tilts and directions varied so it reads as one
    SZ = (1.0, 0.78, 0.92, 0.72, 0.86); DY = (0, 0.16, 0.05, 0.2, 0.1); RT = (0, 4, -3, 6, -4)
    out, i, x = [], 0, x0
    while x <= x1:
        k = i % 5
        out.append((piece_name, x, y + h * DY[k], h * SZ[k], RT[k], ((i * 7) % 3 == 1) ^ flip0)); x += step * (0.8 + 0.4 * ((i * 3) % 4) / 3); i += 1
    return out
