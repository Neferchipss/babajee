import sys, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGBA"); a = np.array(im)[:,:,3]
mask = ndimage.binary_dilation(a > 24, iterations=10)
lab, n = ndimage.label(mask)
boxes = ndimage.find_objects(lab)
items = []
for i, sl in enumerate(boxes):
    h, w = sl[0].stop-sl[0].start, sl[1].stop-sl[1].start
    if h*w < 40*40: continue
    items.append(sl)
items.sort(key=lambda s: (round(s[0].start/200), s[1].start))
sheet = im.copy(); d = ImageDraw.Draw(sheet)
for k, sl in enumerate(items, 1):
    y0,y1,x0,x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    crop = im.crop((x0,y0,x1,y1))
    m = (lab[y0:y1,x0:x1] == lab[sl][lab[sl]>0][0])
    # keep only this component's pixels
    arr = np.array(crop); 
    comp = lab[y0:y1,x0:x1]; ids = np.unique(comp[comp>0]); 
    main = max(ids, key=lambda j: (comp==j).sum()); arr[:,:,3] = np.where(comp==main, arr[:,:,3], 0)
    Image.fromarray(arr).save(f"{out}/{k:02d}.png")
    d.rectangle((x0,y0,x1,y1), outline=(255,255,255,255), width=3); d.text((x0+8,y0+6), str(k), fill=(255,255,255,255), font_size=48)
bg = Image.new("RGBA", sheet.size, (40,40,48,255)); bg.alpha_composite(sheet); bg.convert("RGB").resize((1360,768)).save(out + "-index.jpg")
print(len(items))
