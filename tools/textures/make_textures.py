"""Turns the generated surface pictures in src/ into the shop's textures.

Each one is made to tile without a seam (crossfaded with a copy of itself
shifted by half), scaled to 1024, and written to public/textures as
<name>.webp (colour), <name>_n.webp (a normal map: the relief, from its
brightness at two scales, fine detail over broad undulation) and <name>_r.webp
(a roughness map: where it is polished and where it is dull, by the rules in
ROUGH below).

    python tools/textures/make_textures.py
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "..", "..", "public", "textures")
SIZE = 1024
# how much relief each surface gets (0 = none), and whether its dark parts are
# the low ones (veins and grain lines are cut in; plaster's light burnished
# patches are the high ones)
RELIEF = {"marble_ivory": 0.6, "marble_black": 0.6, "plaster_plum": 2.4, "wood_lacquer": 1.6, "brass": 1.8, "velvet": 2.2}
# roughness: (polished end, dull end, what drives it). "dark" = darker is duller
# (marble veins, wood grain lines); "light" = lighter is duller (velvet's raised
# pile catches light and is matte); "burnish" = lighter is smoother (plaster
# rubbed to a sheen); "streak" = local contrast is duller (brush marks in brass)
ROUGH = {
    "marble_ivory": (0.08, 0.32, "dark"),
    "marble_black": (0.07, 0.3, "light"),
    "plaster_plum": (0.45, 0.9, "burnish"),
    "wood_lacquer": (0.18, 0.5, "dark"),
    "brass": (0.22, 0.55, "streak"),
    "velvet": (0.75, 0.98, "light"),
}


def seamless(a):
    """Crossfade the picture with itself shifted by half: the shifted copy's
    seams are in the middle, where the original is kept, and its middle is at
    the edges, where it takes over. Both edges then come from the same place."""
    h, w = a.shape[:2]
    shifted = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    edge = np.maximum(x, y)  # 0 in the middle, 1 at the edges
    m = np.clip((edge - 0.55) / 0.4, 0, 1)
    m = (m * m * (3 - 2 * m))[..., None]
    return a * (1 - m) + shifted * m


def luma(rgb):
    return (rgb @ np.array([0.299, 0.587, 0.114])) / 255.0


def blur(g, r):
    """A blur that wraps round the edges, so the result still tiles."""
    n = int(r * 3) + 1
    k = np.exp(-0.5 * (np.arange(-n, n + 1) / r) ** 2)
    k /= k.sum()
    out = g
    for axis in (0, 1):
        out = sum(w * np.roll(out, i - n, axis) for i, w in enumerate(k))
    return out


def normalise(g):
    lo, hi = np.percentile(g, 2), np.percentile(g, 98)
    return np.clip((g - lo) / max(1e-6, hi - lo), 0, 1)


def normal_map(rgb, strength):
    g = luma(rgb)
    # fine detail over a broader undulation
    h = 0.65 * blur(g, 1.0) + 0.35 * blur(g, 6.0)
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(g)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def rough_map(rgb, lo, hi, how):
    g = blur(luma(rgb), 0.8)
    if how == "dark":
        t = 1 - normalise(g)
    elif how == "light":
        t = normalise(g)
    elif how == "burnish":
        t = 1 - normalise(blur(g, 3.0))
    else:  # streak: how far each spot is from its surroundings
        t = normalise(np.abs(g - blur(g, 4.0)))
    return ((lo + (hi - lo) * t) * 255).astype(np.uint8)


os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    name, ext = os.path.splitext(f)
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
        continue
    im = Image.open(os.path.join(SRC, f)).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    a = seamless(np.asarray(im, dtype=np.float64))
    rgb = np.clip(a, 0, 255).astype(np.uint8)
    Image.fromarray(rgb).save(os.path.join(OUT, f"{name}.webp"), quality=88, method=6)
    Image.fromarray(normal_map(a, RELIEF.get(name, 1.0))).save(os.path.join(OUT, f"{name}_n.webp"), quality=90, method=6)
    lo, hi, how = ROUGH.get(name, (0.5, 0.5, "dark"))
    Image.fromarray(rough_map(a, lo, hi, how)).save(os.path.join(OUT, f"{name}_r.webp"), quality=88, method=6)
    kb = lambda s: os.path.getsize(os.path.join(OUT, f"{name}{s}.webp")) // 1024
    print(f"{name}: colour {kb('')} KB, normal {kb('_n')} KB, roughness {kb('_r')} KB")
