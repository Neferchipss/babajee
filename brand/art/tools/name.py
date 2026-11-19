import os
from PIL import Image
B="jellyfish manta fish planet wave - palm crystals sun scallop nautilus starfish crab pebble-eye comet sparkle-1 sparkle-2 sparkle-3".split()
G="sunflower daisy lotus daisy-small tulip-bud tulip butterfly moon eye planet-pink - snail caterpillar lantern firefly hummingbird bee swirl firefly-2 fern paisley firefly-3 paisley-2 eye-2 tear crystals-2 fern-2 tear-2 frog sparkle-4 sparkle-5 sparkle-6 sparkle-7 sparkle-8".split()
out="../../../src/assets/art"; os.makedirs(out, exist_ok=True)
for folder, names in (("beach",B),("garden",G)):
    for i,n in enumerate(names,1):
        if n=="-": continue
        im=Image.open(f"{folder}/{i:02d}.png"); bb=im.getbbox(); im=im.crop(bb)
        im.thumbnail((640,640), Image.LANCZOS)
        im.save(f"{out}/{n}.webp", quality=88, method=6)
print(len(os.listdir(out)), sum(os.path.getsize(f"{out}/{f}") for f in os.listdir(out))//1024, "KB")
