"""
Clean the client's logo PNG (brand/logo-source.png) into web assets:
  src/assets/logo.png  full lockup (wordmark + "the smoke shop" + TM), used whole
  src/assets/logo-outlined.png  same lockup with a dark outline, for light backgrounds
  src/app/icon.png     favicon (the red "ba")

The source has ragged edges and speckle, so each letter is flattened to its
exact brand colour and the alpha is smoothed. Replace brand/logo-source.png
with the client's vector/master file when they have one and re-run.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "brand" / "logo-source.png"

RED = (253, 22, 24)
YELLOW = (253, 238, 3)
GREEN = (4, 203, 98)


def colour_for(x0, x1, y0, y1):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if cy > 520 and cx < 1300:  # tagline
        return GREEN
    if cx < 750:
        return RED
    if cx < 1400 and cy < 500:
        return YELLOW
    return GREEN


def render(keep_ids, lab, colours, pad=8):
    keep = np.isin(lab, keep_ids)
    smooth = ndi.gaussian_filter(keep.astype(float), 1.1) > 0.5
    alpha = np.clip(ndi.gaussian_filter(smooth.astype(float), 0.7) * 1.15, 0, 1)

    # Colour every output pixel from its nearest kept source pixel.
    _, (iy, ix) = ndi.distance_transform_edt(~keep, return_indices=True)
    nearest = lab[iy, ix]
    rgb = np.zeros(lab.shape + (3,), np.uint8)
    for i, c in colours.items():
        rgb[nearest == i] = c

    out = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    ys, xs = np.where(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = out[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad]
    return Image.fromarray(out, "RGBA")


def outline(img, radius=6, ink=(23, 19, 15)):
    """Dark outline behind the letters so the yellow stays visible on cream."""
    from scipy import ndimage as ndi

    pad = radius * 2
    a = np.array(img)
    canvas = np.zeros((a.shape[0] + pad * 2, a.shape[1] + pad * 2, 4), np.uint8)
    canvas[pad:-pad, pad:-pad] = a
    alpha = canvas[..., 3]
    yy, xx = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    disk = (xx * xx + yy * yy) <= radius * radius
    grown = ndi.maximum_filter(alpha, footprint=disk)
    grown = ndi.gaussian_filter(grown.astype(float), 0.8)
    back = np.zeros_like(canvas)
    back[..., :3] = ink
    back[..., 3] = np.clip(grown * 1.4, 0, 255).astype(np.uint8)
    base = Image.fromarray(back, "RGBA")
    base.alpha_composite(Image.fromarray(canvas, "RGBA"))
    return base


def main():
    src = np.array(Image.open(SOURCE).convert("RGBA"))
    lab, n = ndi.label(src[..., 3] >= 128)
    boxes = ndi.find_objects(lab)

    colours, info = {}, {}
    for i, sl in enumerate(boxes, start=1):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        colours[i] = colour_for(x0, x1, y0, y1)
        info[i] = (x0, x1, y0, y1)

    everything = list(colours)
    red_ids = [i for i in everything if colours[i] == RED]

    def save(img, path, width):
        h = round(img.height * width / img.width)
        img.resize((width, h), Image.LANCZOS).save(path, optimize=True)

    full = render(everything, lab, colours)
    save(full, ROOT / "src/assets/logo.png", 1600)
    save(outline(full), ROOT / "src/assets/logo-outlined.png", 1600)

    ba = render(red_ids, lab, colours, pad=0)
    side = max(ba.size)
    tile = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    tile.paste(ba, ((side - ba.width) // 2, (side - ba.height) // 2))
    tile.resize((256, 256), Image.LANCZOS).save(ROOT / "src/app/icon.png", optimize=True)
    print("red", red_ids)


if __name__ == "__main__":
    main()
