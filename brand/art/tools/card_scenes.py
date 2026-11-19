# Category card art, composed as a frame around the card's own parts (name,
# button, cloud with products): a band of flying things above the name, a sky
# piece rising behind the cloud's top-right, a layered scene in the gap
# between the button and the cloud, and a low strip under the button.
# Phone: one 1074x363 image (the card is 3:1). Desktop: 1964x402, split into a
# left layer and a right layer so it holds at any card width.
import sys; sys.path.insert(0, "brand/art/tools")
from scene import render
from PIL import Image
OUT = "src/assets/art/cards"
PHONE = {
 0: [("sun", 990, 150, 190), ("sparkle-2", 900, 30, 22), ("comet", 600, 34, 46, -8), ("sparkle-1", 80, 24, 20), ("sparkle-3", 250, 30, 16), ("planet", 430, 40, 50, -10), ("fish", 470, 190, 88, -22), ("sea-band", 290, 296, 140), ("starfish", 360, 340, 54, 12)],
 1: [("sunflower", 1000, 130, 270, -12), ("moon", 52, 38, 62, -8), ("firefly", 190, 30, 26), ("firefly-2", 330, 46, 22), ("sparkle-4", 460, 24, 16), ("butterfly", 570, 38, 54, 10),
     ("fern-2", 525, 300, 150, 0, True), ("daisy", 420, 262, 190, 6), ("snail", 330, 342, 50), ("fern", 26, 330, 110), ("paisley", 150, 352, 60, 20)],
 2: [("jellyfish", 990, 110, 210), ("sparkle-1", 120, 24, 18), ("manta", 320, 36, 56, -6), ("sparkle-2", 540, 30, 16), ("crystals", 545, 300, 96), ("sea-curl", 450, 268, 170), ("sea-swell", 170, 336, 60), ("nautilus", 360, 334, 62, -8), ("scallop", 520, 346, 40, -10)],
 3: [("eye", 985, 100, 130), ("sparkle-8", 895, 30, 24), ("comet", 120, 34, 50, -10), ("sparkle-5", 250, 24, 16), ("planet-pink", 390, 36, 50, 8), ("sparkle-6", 560, 30, 18),
     ("lotus", 430, 268, 190), ("crystals-2", 340, 330, 84), ("tear", 535, 318, 52), ("fern-2", 36, 336, 96)],
 4: [("palm", 1010, 70, 240, 200, True), ("sparkle-3", 900, 160, 20), ("fish", 210, 36, 58, -20), ("sparkle-1", 400, 26, 16), ("comet", 580, 34, 44, -8), ("sun", 450, 290, 130), ("sea-mound", 450, 316, 96), ("sea-swell", 160, 340, 54, 0, True), ("crab", 540, 330, 56), ("starfish", 370, 344, 50, -10)],
 5: [("daisy", 1000, 120, 220, 12), ("sparkle-5", 100, 26, 16), ("sparkle-2", 300, 30, 18), ("planet-pink", 430, 34, 40, -8), ("hummingbird", 570, 40, 60),
     ("tulip", 410, 250, 200, -6), ("tulip-bud", 330, 320, 92, 8), ("caterpillar", 505, 300, 100, -10), ("swirl", 40, 332, 100, -10)],
 6: [("moon", 990, 110, 190, -8), ("sparkle-1", 90, 24, 16), ("butterfly", 240, 40, 54, -10), ("comet", 560, 34, 44, -12), ("sea-mound", 440, 314, 100, 0, True), ("frog", 450, 252, 70), ("sea-swell", 170, 342, 54), ("crystals-2", 560, 330, 70)],
}
DESK = {
 0: [("sun", 1880, 160, 230), ("sparkle-2", 1770, 40, 26), ("comet", 900, 40, 60, -8), ("sparkle-1", 560, 26, 22), ("sparkle-3", 1040, 70, 18), ("planet", 1000, 120, 100, -10), ("sun", 560, 330, 170), ("fish", 760, 230, 110, -22), ("sea-band", 470, 312, 190), ("starfish", 420, 372, 70, 12), ("crab", 620, 372, 66)],
 1: [("sunflower", 1890, 150, 320, -12), ("moon", 980, 70, 100, -8), ("firefly", 860, 40, 30), ("sparkle-4", 1080, 30, 20), ("butterfly", 700, 210, 90, 10),
     ("fern", 400, 300, 220), ("daisy", 560, 280, 260, 8), ("tulip", 760, 300, 230, -6), ("fern-2", 900, 330, 170, 0, True), ("paisley", 480, 372, 120, 18), ("daisy-small", 680, 360, 150, 10), ("snail", 820, 384, 66), ("fern", 40, 370, 110)],
 2: [("jellyfish", 1880, 120, 250), ("manta", 960, 70, 100, -6), ("sparkle-2", 820, 30, 18), ("sparkle-1", 1080, 40, 20), ("jellyfish", 560, 250, 130, 6), ("crystals", 880, 330, 130), ("sea-curl", 740, 300, 210), ("sea-swell", 300, 358, 90), ("sea-swell", 560, 370, 74, 0, True), ("nautilus", 470, 360, 74, -8), ("scallop", 640, 384, 50, -10)],
 3: [("eye", 1870, 110, 160), ("sparkle-8", 1760, 30, 26), ("comet", 900, 40, 64, -10), ("planet-pink", 1050, 90, 80, 8), ("sparkle-5", 800, 90, 18),
     ("fern-2", 400, 310, 200), ("lotus", 600, 290, 260), ("tulip-bud", 780, 330, 160, -8), ("fern", 900, 340, 160, 0, True), ("firefly", 520, 180, 40), ("firefly-2", 840, 200, 36), ("crystals-2", 480, 372, 120), ("frog", 680, 372, 100), ("tear", 820, 388, 50)],
 4: [("palm", 1900, 80, 300, 200, True), ("fish", 900, 70, 90, -20), ("sparkle-3", 1060, 40, 20), ("comet", 1040, 120, 60, -8), ("sun", 620, 320, 200), ("palm", 890, 290, 240, -26, True), ("sea-band", 560, 316, 180, 0, True), ("starfish", 700, 374, 70, -12), ("crab", 860, 376, 64), ("palm", 30, 340, 170, 30)],
 5: [("daisy", 1880, 130, 260, 12), ("hummingbird", 980, 80, 100), ("planet-pink", 850, 40, 56, -8), ("sparkle-5", 1090, 40, 18),
     ("swirl", 380, 330, 180, -10), ("tulip", 520, 280, 280, -6), ("fern", 720, 310, 230, 0, True), ("daisy-small", 870, 330, 180, 12), ("tulip-bud", 630, 360, 150, 8), ("caterpillar", 780, 370, 130, -10), ("paisley-2", 460, 380, 100, -14), ("swirl", 40, 370, 100, -10)],
 6: [("moon", 1880, 130, 220, -8), ("butterfly", 960, 70, 84, -10), ("comet", 840, 40, 56, -12), ("sparkle-1", 1080, 30, 18), ("sparkle-4", 700, 200, 20), ("sea-mound", 600, 334, 140), ("frog", 600, 272, 92), ("sea-swell", 300, 366, 80, 0, True), ("sea-swell", 860, 362, 92), ("crystals-2", 420, 350, 100), ("tulip-bud", 780, 340, 90, 10)],
}
def below_name(layers, x_max, floor, band):
    # anything in the gap under the name (not the band above it) starts below
    # the name's baseline, so the longest names never touch the art; a piece
    # that is too tall sinks into the bottom edge instead
    out = []
    for L in layers:
        n, x, y, h = L[:4]
        if x < x_max and y > band and y - h / 2 < floor:
            y = floor + h / 2
        out.append((n, x, y, h) + tuple(L[4:]))
    return out
PHONE = {v: below_name(L, 640, 158, 70) for v, L in PHONE.items()}
DESK = {v: below_name(L, 900, 168, 60) for v, L in DESK.items()}
SPLIT = 1100  # desktop: left layer 0..SPLIT anchored left, right layer anchored right
for v in range(7):
    render(PHONE[v], 1074, 363).save(f"{OUT}/card-{v}.webp", quality=86, method=4)
    d = render(DESK[v], 1964, 402)
    d.crop((0, 0, SPLIT, 402)).save(f"{OUT}/card-{v}-m.webp", quality=86, method=4)
    d.crop((SPLIT, 0, 1964, 402)).save(f"{OUT}/card-{v}-r.webp", quality=86, method=4)
print("ok")
