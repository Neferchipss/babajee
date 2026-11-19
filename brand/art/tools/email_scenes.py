import sys; sys.path.insert(0, "brand/art/tools")
from scene import render, sea
O = "brand/email"
W, H = 1120, 240
beach = (  # one painted sea (sea-*) under a rising sun, a palm on the right
    [("planet", 300, 56, 64, -12), ("sparkle-1", 90, 30, 22), ("sparkle-2", 470, 26, 18), ("sparkle-3", 820, 46, 18), ("sparkle-1", 700, 22, 16), ("comet", 930, 40, 54, -10)]
    + [("sun", 520, 158, 150), ("fish", 760, 96, 86, -18)]
    + [("sea-swell", 250, 214, 54), ("sea-swell", 870, 216, 50, 0, True), ("sea-band", 560, 178, 124)]
    + [("palm", 1070, 120, 210, -28, True), ("starfish", 200, 214, 52, 12), ("crab", 860, 210, 50), ("scallop", 1010, 222, 42, -10)]
)
garden = (
    [("moon", 150, 60, 86, -8), ("sparkle-4", 260, 30, 22), ("sparkle-5", 560, 24, 20), ("sparkle-6", 900, 34, 22), ("eye", 400, 50, 46), ("planet-pink", 760, 44, 50, 10)]
    + [("sunflower", 980, 150, 300, -8), ("daisy", 300, 175, 220, 6), ("lotus", 640, 180, 190), ("tulip", 820, 190, 170, 6), ("daisy-small", 470, 200, 140, -6)]
    + [("butterfly", 560, 70, 66, 12), ("hummingbird", 1080, 80, 80), ("firefly", 720, 96, 36), ("firefly-2", 190, 130, 30)]
    + [("fern", 60, 190, 190), ("fern-2", 1090, 210, 120, 0, True), ("paisley", 170, 215, 110, 18), ("snail", 380, 222, 66), ("frog", 740, 214, 84), ("caterpillar", 905, 200, 90, -8), ("crystals-2", 560, 222, 74)]
)
render(beach, W, H).save(f"{O}/band-beach.png", optimize=True)
render(garden, W, H).save(f"{O}/band-garden.png", optimize=True)
S = 240
ART = {
 "received":  [("daisy", 132, 104, 160, 8), ("sparkle-4", 30, 36, 28), ("crystals-2", 70, 182, 100), ("firefly", 200, 40, 40)],
 "confirmed": [("sunflower", 136, 120, 210, -6), ("butterfly", 64, 70, 80, -14), ("sparkle-1", 210, 30, 28)],
 "shipped":   [("sparkle-2", 40, 40, 26), ("sea-mound", 120, 196, 74), ("manta", 130, 80, 110, -12), ("sparkle-3", 210, 140, 22)],
 "delivered": [("sun", 120, 120, 150), ("starfish", 104, 172, 120, 10), ("scallop", 200, 200, 70, -8), ("sparkle-1", 40, 50, 28)],
 "return":    [("sea-curl", 150, 160, 130), ("nautilus", 96, 160, 100, -8), ("sea-swell", 110, 206, 46), ("sparkle-5", 40, 40, 24), ("sparkle-2", 208, 50, 24)],
 "refund":    [("planet", 150, 140, 130, -10), ("comet", 100, 76, 110, -14), ("sparkle-3", 210, 40, 24), ("sparkle-1", 40, 200, 26)],
 "cancelled": [("moon", 128, 104, 190, -6), ("lantern", 196, 172, 110, 0, True), ("firefly-3", 50, 60, 40), ("sparkle-6", 40, 190, 26)],
 "new-order": [("lotus", 120, 168, 150), ("eye", 120, 70, 110), ("sparkle-8", 30, 40, 28), ("sparkle-7", 214, 46, 24), ("firefly", 210, 150, 36)],
}
for k, L in ART.items():
    render(L, S, S).save(f"{O}/art-{k}.png", optimize=True)
print("ok")
