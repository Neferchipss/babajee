"""Builds the Babajee night-street shop (street, storefront, interior) as a
model-only GLB.

    blender -b -P tools/blender/build_shop.py -- \
        --out public/models/shop.glb --blend tools/blender/shop.blend --preview tools/blender/preview

Direction: a reggae smoke shop at night. Black facade, one big neon sign in
the logo's red / yellow / green, warm amber spilling from an arched display
window; inside, dark walnut, brass, lit glass cases and a long curved counter.
The plan is deliberately lopsided: the door is on the left, the window on the
right. Inside is a round room (shop_rotunda.py): one arched alcove per
category all the way round, Baba's face across from the door, a dome above.

Plain geometry with role-named materials (m_walnut, m_brass, m_neon_red, ...);
no textures. Units are metres. The facade is 9.8 m wide (x, -4.9..4.9) at y = 0
with the street on the -y side, and the room's centre is at (0, 9.0); Blender is Z-up, the glTF
export turns that into Y-up.

What the site reads from the file (plain nodes):
  cam_00 .. cam_05   the scroll path: far pavement -> door -> into the room
  door_leaf          origin on its hinge; exported swung open (rotation z, 0 = shut)
  hot_*              one per fixture; extras.categories = category slugs, extras.label
  lamp_*             where lights go; extras.kind is street | shop | window
"""

import math
import os
import random
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shoplib  # noqa: E402
from shoplib import B, arc, empty, font, mat  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = os.path.abspath(arg("--out", "public/models/shop.glb"))
BLEND = arg("--blend")
PREVIEW = arg("--preview")

bpy.ops.wm.read_factory_settings(use_empty=True)
shoplib.scene = scene = bpy.context.scene
PI = math.pi

# --- materials (flat colour for now; the names are the texture slots) ---------------
M = dict(
    asphalt=mat("asphalt", "#15171b", 0.22),
    pave=mat("pavement", "#3b3c40", 0.7),
    kerb=mat("kerb", "#5a5b60", 0.7),
    paint=mat("road_paint", "#b9b6a8", 0.6),
    brick=mat("brick", "#2b1b1d", 0.9),
    brick2=mat("brick_dark", "#1f1b24", 0.9),
    stucco=mat("stucco", "#39332e", 0.9),
    facade=mat("facade_black", "#111314", 0.45),
    trim=mat("trim_green", "#0d4a36", 0.4),
    tile=mat("tile_green", "#1b6a4c", 0.15),
    brass=mat("brass", "#c0903d", 0.32, 1.0),
    steel=mat("steel", "#25272b", 0.45, 0.85),
    walnut=mat("walnut", "#46281a", 0.5),
    walnut2=mat("walnut_light", "#6d4426", 0.5),
    plaster=mat("plaster", "#3b312b", 0.9),
    floor=mat("floor_wood", "#5a3920", 0.45),
    tile_a=mat("floor_tile_dark", "#191a1c", 0.2),
    tile_b=mat("floor_tile_light", "#c9b99c", 0.2),
    marble=mat("marble", "#dcd6cc", 0.18),
    leather=mat("leather", "#5b2d1d", 0.6),
    rug=mat("rug", "#6b1f1f", 0.95),
    rug2=mat("rug_trim", "#d1a43a", 0.95),
    white=mat("white", "#ece8dc", 0.6),
    black=mat("black", "#0b0b0c", 0.5),
    rubber=mat("rubber", "#111112", 0.8),
    glass=mat("glass", "#cfe8f0", 0.05, 0.0, 0.16),
    glass_flat=mat("glass_flat", "#cfe8f0", 0.05, 0.0, 0.16),  # panes and shelves: the site keeps them simply see-through
    g_amber=mat("glass_amber", "#d9972a", 0.05, 0.0, 0.5),
    g_green=mat("glass_green", "#2fbf6a", 0.05, 0.0, 0.5),
    g_blue=mat("glass_blue", "#2f7fbf", 0.05, 0.0, 0.5),
    g_purple=mat("glass_purple", "#7b3fbf", 0.05, 0.0, 0.5),
    g_red=mat("glass_red", "#c8323a", 0.05, 0.0, 0.5),
    neon_r=mat("neon_red", "#ff2a2a", 0.3, 0.0, 1.0, 5.0),
    neon_y=mat("neon_yellow", "#ffd400", 0.3, 0.0, 1.0, 5.0),
    neon_g=mat("neon_green", "#19e65a", 0.3, 0.0, 1.0, 5.0),
    lamp=mat("lamp_warm", "#ffd9a0", 0.4, 0.0, 1.0, 3.5),
    glow=mat("window_glow", "#ffb35a", 0.5, 0.0, 1.0, 2.0),
    bulb=mat("string_bulb", "#ffd9a0", 0.4, 0.0, 1.0, 1.6),
    win_dim=mat("window_dim", "#ffb35a", 0.5, 0.0, 1.0, 0.3),
    street_lamp=mat("street_lamp", "#ffcf8a", 0.4, 0.0, 1.0, 2.5),
    leaf=mat("leaf", "#2f7a3a", 0.6),
    leaf2=mat("leaf_dark", "#1d4f2a", 0.6),
    pot=mat("terracotta", "#a9502f", 0.7),
    fabric_r=mat("fabric_red", "#8c1d1d", 0.9),
    fabric_g=mat("fabric_green", "#14573a", 0.9),
    fabric_y=mat("fabric_yellow", "#c9a227", 0.9),
    velvet=mat("velvet", "#2a0f2e", 0.95),
    cedar=mat("cedar", "#9a5b34", 0.6),
    graf_a=mat("graffiti_red", "#7a2a28", 0.9),
    graf_b=mat("graffiti_blue", "#1f4c73", 0.9),
    graf_c=mat("graffiti_gold", "#8a6f1c", 0.9),
)
M.update(
    indigo=mat("indigo", "#2a1a52", 0.85),
    plum=mat("plum", "#3b1b36", 0.5),
    plum2=mat("plum_light", "#63304f", 0.5),
    floor_dark=mat("floor_dark", "#1d1230", 0.22),
    cosmos=mat("cosmos", "#0f0828", 0.9, 0.0, 1.0, 0.35, cull=True),
    star=mat("star", "#fff1cf", 0.5, 0.0, 1.0, 6.0, cull=True),
    star_b=mat("star_b", "#fff1cf", 0.5, 0.0, 1.0, 6.0, cull=True),
    star_c=mat("star_c", "#fff1cf", 0.5, 0.0, 1.0, 6.0, cull=True),
    glow_v=mat("glow_violet", "#8a5cff", 0.4, 0.0, 1.0, 3.0),
    glow_m=mat("glow_magenta", "#ff3fa4", 0.4, 0.0, 1.0, 3.0),
    glow_t=mat("glow_teal", "#25e0d0", 0.4, 0.0, 1.0, 3.0),
    mandala=mat("mandala_glow", "#9a5cff", 0.4, 0.0, 1.0, 2.5),
    planet=mat("planet", "#e8a24a", 0.6, 0.0, 1.0, 0.5),
    eye_white=mat("eye_white", "#f5efe4", 0.35, 0.0, 1.0, 0.45),
    eye_ink=mat("eye_ink", "#07060a", 0.5),
    iris_g=mat("iris_green", "#32d17a", 0.3, 0.0, 1.0, 1.4),
    iris_a=mat("iris_amber", "#ffb02e", 0.3, 0.0, 1.0, 1.4),
    iris_m=mat("iris_magenta", "#ff4fa8", 0.3, 0.0, 1.0, 1.6),
    iris_v=mat("iris_violet", "#8a6cff", 0.3, 0.0, 1.0, 1.6),
    baba_skin=mat("baba_skin", "#b3626a", 0.6),
    baba_dk=mat("baba_maroon", "#5e2132", 0.6),
    baba_hair=mat("baba_hair", "#3d1626", 0.7),
    gold=mat("gold", "#e0a93d", 0.28, 1.0),
)
PAPER = [mat(f"pack_{n}", c, 0.7) for n, c in enumerate(["#d94a3a", "#e3b82e", "#2f9f5f", "#e8e1cf", "#2c6fb5", "#8a4fb8", "#e07f2f"])]
GLASSES = [M["glass"], M["g_amber"], M["g_green"], M["g_blue"], M["g_purple"], M["g_red"]]
METALS = [M["steel"], M["g_green"], M["brass"], M["fabric_r"], M["black"], M["g_blue"]]
LOGO = [M["neon_r"], M["neon_y"], M["neon_g"]]
FONT = font("COOPBL.TTF", "BAUHS93.TTF", "impact.ttf")
FONT2 = font("segoeuib.ttf", "ARLRDBD.TTF")

HOTSPOTS = []  # (name, loc, categories, label)
LAMPS = []  # (name, loc, kind)


def lamp(name, loc, kind="shop"):
    LAMPS.append((name, loc, kind))


# --- shapes ------------------------------------------------------------------------------

def bong(b, x, y, z, rng, h=None, gm=None):
    """A glass bong, spun from one of a few profiles, with its downstem and bowl."""
    h = h or rng.uniform(0.28, 0.5)
    gm = gm or rng.choice(GLASSES)
    kind = rng.choice(["beaker", "straight", "bubbler", "round"])
    if kind == "beaker":
        pr = [(0, 0), (0.07, 0), (0.095, 0.012), (0.1, 0.06), (0.085, 0.15), (0.05, 0.22), (0.03, 0.28), (0.028, h * 0.8), (0.036, h * 0.9), (0.036, h), (0.028, h), (0, h)]
    elif kind == "straight":
        pr = [(0, 0), (0.045, 0), (0.055, 0.015), (0.04, 0.06), (0.032, 0.12), (0.03, h * 0.85), (0.037, h * 0.93), (0.037, h), (0.03, h), (0, h)]
    elif kind == "bubbler":
        pr = [(0, 0), (0.05, 0), (0.06, 0.02), (0.075, 0.07), (0.07, 0.11), (0.04, 0.15), (0.03, 0.19), (0.03, h * 0.85), (0.036, h), (0.028, h), (0, h)]
    else:
        pr = [(0, 0), (0.04, 0), (0.07, 0.03), (0.095, 0.09), (0.09, 0.15), (0.05, 0.2), (0.03, 0.24), (0.028, h * 0.88), (0.036, h * 0.95), (0.036, h), (0, h)]
    b.lathe(pr, (x, y, z), gm, seg=12)  # small on a shelf: a dozen sides reads as round
    b.tube([(x, y - 0.035, z + 0.08), (x, y - 0.075, z + 0.12), (x, y - 0.115, z + 0.2)], 0.012, M["glass"], 8)
    b.lathe([(0, 0), (0.016, 0), (0.026, 0.02), (0.03, 0.03), (0.026, 0.03), (0, 0.022)], (x, y - 0.12, z + 0.2), gm, seg=8)


def jar(b, x, y, z, r, h, body, lid):
    b.lathe([(0, 0), (r * 0.9, 0), (r, 0.01), (r, h * 0.82), (r * 0.85, h * 0.86), (0, h * 0.86)], (x, y, z), body, seg=12)
    b.lathe([(0, h * 0.84), (r * 0.9, h * 0.84), (r * 0.9, h * 0.96), (r * 0.7, h), (0, h)], (x, y, z), lid, seg=12)


def grinder(b, x, y, z, r, m):
    h = r * 0.9
    b.lathe([(0, 0), (r, 0), (r, h * 0.35), (r * 1.03, h * 0.37), (r * 1.03, h * 0.66), (r, h * 0.68), (r, h * 0.95), (r * 0.9, h), (0, h)], (x, y, z), m, seg=16)


def dish(b, x, y, z, r, m, seg=14):
    b.lathe([(0, 0), (r * 0.9, 0), (r, 0.012), (r * 1.02, 0.03), (r * 0.9, 0.034), (r * 0.8, 0.02), (0, 0.016)], (x, y, z), m, seg)


def leaf_cluster(b, cx, cy, cz, r, n, rng):
    for _ in range(n):
        a = rng.uniform(0, 2 * PI)
        d = rng.uniform(0.0, r)
        zz = cz + rng.uniform(-r * 0.6, r * 0.8)
        ls = rng.uniform(0.09, 0.16)
        b.ball(cx + d * math.cos(a), cy + d * math.sin(a), zz, ls, rng.choice([M["leaf"], M["leaf2"]]),
               scale=(0.55, 1.0, 0.07), rot=(rng.uniform(-0.8, 0.8), rng.uniform(-0.5, 0.5), a), u=8, v=5)


# --- the street -------------------------------------------------------------------------------
rng = random.Random(7)
b = B("street", "Exterior")
for i in range(-20, 20):
    for j in range(3):
        y0 = -3.6 + j * 1.133
        b.box(i + 0.01, i + 0.99, y0 + 0.01, y0 + 1.12, -0.5, 0.0, M["pave"], bev=0.012)
b.box(-20, 20, -3.95, -3.6, -0.5, 0.03, M["kerb"], bev=0.03)
b.box(-20, 20, -13.0, -3.95, -1.0, -0.12, M["asphalt"])
b.box(-20, 20, -13.35, -13.0, -0.5, 0.03, M["kerb"], bev=0.03)
b.box(-20, 20, -16.5, -13.35, -0.5, 0.0, M["pave"])
for i in range(-7, 8):
    b.box(i * 3 - 0.7, i * 3 + 0.7, -8.55, -8.4, -0.12, -0.115, M["paint"])
for x in (-2.0, 5.5):
    b.cyl(x, -6.3, -0.11, 0.36, 0.36, 0.02, M["steel"], 28)
    b.cyl(x, -6.3, -0.095, 0.3, 0.3, 0.01, M["rubber"], 28)
b.build()
for k, x in enumerate((-2.0, 5.5)):  # steam from the drains
    empty(f"steam_{k}", (x, -6.3, -0.05), "Props", kind="steam")


def block(b, x0, x1, y0, y1, h, wall, floors, rng, lit=0.15, cols=5, gap=1.4, ground=True):
    """A building front with a grid of windows facing -y."""
    b.box(x0, x1, y0, y1, 0, h, wall)
    fh = (h - 0.6) / floors
    w = (x1 - x0) / cols
    for fl in range(1 if ground else 0, floors):
        z0 = 0.5 + fl * fh + 0.5
        for c in range(cols):
            wx0 = x0 + c * w + (w - gap) / 2
            wx1 = wx0 + gap
            b.box(wx0 - 0.08, wx1 + 0.08, y0 - 0.1, y0 + 0.02, z0 - 0.08, z0 + 1.38, M["black"], bev=0.01)
            b.box(wx0, wx1, y0 - 0.12, y0 - 0.06, z0, z0 + 1.3, M["win_dim"] if rng.random() < lit else M["black"])
            b.box(wx0 - 0.12, wx1 + 0.12, y0 - 0.2, y0, z0 - 0.14, z0 - 0.06, M["kerb"], bev=0.01)
    b.box(x0 - 0.05, x1 + 0.05, y0 - 0.3, y0 + 0.1, h - 0.25, h + 0.1, M["kerb"], bev=0.02)


# a tall brick building on the left, with a fire escape and a shuttered shop
b = B("neighbour_left", "Exterior")
block(b, -24, -4.9, -0.2, 0.6, 12.5, M["brick"], 4, random.Random(3), 0.04, 6, 1.3)
for k in range(30):
    b.box(-14.5, -6.0, -0.32, -0.2, 0.1 * k, 0.1 * k + 0.085, M["steel"])
for fl in range(1, 4):
    z = 0.5 + fl * 3.48 + 0.4
    b.box(-9.5, -7.4, -1.5, -0.2, z, z + 0.05, M["steel"])
    for xx in (-9.5, -7.4):
        b.tube([(xx, -1.5, z), (xx, -1.5, z + 1.0)], 0.015, M["steel"], 5)
    b.tube([(-9.5, -1.5, z + 1.0), (-7.4, -1.5, z + 1.0)], 0.015, M["steel"], 5)
    if fl < 3:
        for s in range(10):
            b.box(-8.7, -8.3, -1.5 + s * 0.12, -1.35 + s * 0.12, z + 0.05 + s * 0.3, z + 0.1 + s * 0.3, M["steel"])
b.build()

# a lit tea shop under stucco on the right
b = B("neighbour_right", "Exterior")
block(b, 4.9, 24, -0.2, 0.6, 10.5, M["stucco"], 3, random.Random(5), 0.0, 5, 1.4)
b.box(5.4, 10.4, -0.1, 0.05, 0.4, 2.9, M["black"], bev=0.02)
b.box(5.55, 10.25, -0.12, -0.08, 0.55, 2.75, M["win_dim"])
for k in range(10):
    m = M["fabric_g"] if k % 2 == 0 else M["kerb"]
    b.box(5.3 + k * 0.54, 5.3 + (k + 1) * 0.54, -1.1, -0.15, 2.98, 3.02, m, rot=(0.22, 0, 0))
    b.box(5.3 + k * 0.54, 5.3 + (k + 1) * 0.54, -1.28, -1.22, 2.66, 2.92, m)
for tx, ty in [(6.6, -1.9), (8.6, -2.1)]:
    b.cyl(tx, ty, 0.72, 0.32, 0.32, 0.04, M["steel"], 24)
    b.tube([(tx, ty, 0.0), (tx, ty, 0.7)], 0.025, M["steel"], 6)
    for dx in (0.55, -0.55):
        b.cyl(tx + dx, ty, 0.22, 0.16, 0.16, 0.44, M["fabric_y"], 16)
b.build()

# across the street: mostly dark, a few lit windows
b = B("opposite", "Exterior")
r4 = random.Random(11)
for x0, x1, h in [(-26, -10, 15), (-10, 2, 11), (2, 12, 17), (12, 26, 12)]:
    block(b, x0, x1, -17.0, -26, h, M["brick2"], max(2, int(h // 3.2)), r4, 0.1, int((x1 - x0) / 2.6), 1.2, ground=False)
b.build()

# a zebra crossing aimed at the door: its stripes, the kerb and the lamp posts all run to the shop
b = B("crossing", "Exterior")
for i in range(8):
    x = -4.6 + i * 0.52
    b.box(x, x + 0.3, -12.7, -4.2, -0.119, -0.113, M["paint"])
for i in range(8):  # the same stripes across the near pavement, worn
    x = -4.6 + i * 0.52
    b.box(x, x + 0.3, -3.95, -3.6, 0.0, 0.006, M["paint"])
b.build()
# light from the shop spilling onto the pavement and the wet road in front of it
POOL = mat("pool", "#ffb05a", 0.6, 0.0, 0.14, 0.4)
POOL_B = mat("pool_b", "#ffb05a", 0.6, 0.0, 0.07, 0.3)
POOL_C = mat("pool_c", "#ffb05a", 0.6, 0.0, 0.035, 0.25)
RED_R = mat("reflect_red", "#ff3030", 0.6, 0.0, 0.06, 0.3)
GRN_R = mat("reflect_green", "#25ff7a", 0.6, 0.0, 0.06, 0.3)
b = B("light_pools", "Exterior")
b.prism_xy([(-1.5, -0.2), (3.7, -0.2), (5.6, -3.5), (-3.4, -3.5)], 0.006, 0.008, POOL)
b.prism_xy([(-3.7, -0.3), (-2.3, -0.3), (-1.6, -2.6), (-4.4, -2.6)], 0.006, 0.008, POOL_B)
for (ya, yb, m) in [(-3.95, -6.6, POOL), (-6.6, -9.4, POOL_B), (-9.4, -12.6, POOL_C)]:
    b.prism_xy([(-1.3, ya), (3.5, ya), (3.3, yb), (-1.1, yb)], -0.118, -0.116, m)
b.prism_xy([(-1.0, -3.95), (-0.5, -3.95), (-0.45, -8.2), (-0.95, -8.2)], -0.117, -0.115, RED_R)
b.prism_xy([(2.6, -3.95), (3.1, -3.95), (3.05, -8.2), (2.55, -8.2)], -0.117, -0.115, GRN_R)
b.build()
# a row of dim lamp posts either side, to carry the eye down the street
b = B("lamp_row", "Exterior")
for x in (-14.4, -20.0, 13.8, 20.0):
    b.lathe([(0, 0), (0.15, 0), (0.1, 0.25), (0.055, 0.5), (0.045, 4.6), (0, 4.6)], (x, -3.2, 0), M["steel"], 14)
    b.tube([(x, -3.2, 4.55), (x, -3.2, 5.0), (x + 0.3, -2.8, 5.3)], 0.035, M["steel"], 6)
    b.ball(x + 0.3, -2.8, 5.22, 0.1, M["street_lamp"], u=10, v=6)
b.build()

# --- street furniture -----------------------------------------------------------------------------
b = B("street_furniture", "Exterior")
for x, s in [(-6.4, 1), (6.6, -1)]:
    b.lathe([(0, 0), (0.16, 0), (0.12, 0.25), (0.06, 0.5), (0.05, 4.6), (0, 4.6)], (x, -3.2, 0), M["steel"], 16)
    b.tube([(x, -3.2, 4.55), (x, -3.2, 5.0), (x + s * 0.2, -2.8, 5.3), (x + s * 0.55, -2.4, 5.35)], 0.04, M["steel"], 8)
    b.lathe([(0.04, 0), (0.22, 0.02), (0.2, 0.12), (0.06, 0.18), (0, 0.18)], (x + s * 0.55, -2.4, 5.2), M["steel"], 16)
    b.ball(x + s * 0.55, -2.4, 5.17, 0.12, M["street_lamp"])
    lamp("lamp_street_%s" % ("l" if s > 0 else "r"), (x + s * 0.55, -2.4, 5.1), "street")
sx, sy = 2.6, -2.2  # a scooter, parked
for wx in (-0.55, 0.55):
    b.lathe([(0.0, -0.05), (0.17, -0.05), (0.22, -0.03), (0.25, 0.0), (0.22, 0.03), (0.17, 0.05), (0.0, 0.05)], (sx + wx, sy, 0.25), M["rubber"], 24, rot=(PI / 2, 0, 0))
b.box(sx - 0.6, sx + 0.4, sy - 0.13, sy + 0.13, 0.28, 0.62, M["fabric_r"], bev=0.06)
b.box(sx - 0.2, sx + 0.5, sy - 0.14, sy + 0.14, 0.62, 0.7, M["leather"], bev=0.04)
b.box(sx + 0.45, sx + 0.62, sy - 0.1, sy + 0.1, 0.3, 1.05, M["fabric_r"], bev=0.04)
b.tube([(sx + 0.55, sy - 0.3, 1.0), (sx + 0.55, sy + 0.3, 1.0)], 0.014, M["steel"], 6)
b.ball(sx + 0.6, sy, 0.95, 0.07, M["lamp"])
for sg in (-1, 1):  # a chalkboard A-frame
    b.box(-2.45, -1.35, -1.3 + sg * 0.28 - 0.012, -1.3 + sg * 0.28 + 0.012, 0.0, 0.9, M["walnut"], rot=(sg * 0.12, 0, 0))
b.text("OPEN LATE", (-1.9, -1.585, 0.58), 0.12, M["white"], rot=(PI / 2 - 0.12, 0, 0), extrude=0.004, fnt=FONT2, bevel=0)
b.text("till 2am", (-1.9, -1.59, 0.4), 0.09, M["fabric_y"], rot=(PI / 2 - 0.12, 0, 0), extrude=0.004, fnt=FONT2, bevel=0)
b.box(4.3, 5.5, -1.7, -0.7, 0, 0.5, M["trim"], bev=0.03)  # a street tree in a planter
b.tube([(4.9, -1.2, 0.5), (4.95, -1.2, 1.4), (4.85, -1.15, 2.4)], 0.07, M["walnut"], 8)
leaf_cluster(b, 4.9, -1.2, 2.5, 0.9, 60, random.Random(2))
for x in (-3.9, -1.0, 1.0):
    b.lathe([(0, 0), (0.07, 0), (0.07, 0.7), (0.05, 0.78), (0, 0.8)], (x, -3.5, 0), M["steel"], 14)
b.cyl(5.9, -3.3, 0.45, 0.24, 0.24, 0.9, M["steel"], 18)
b.build()

b = B("string_lights", "Exterior")  # across the street, facade to far side
for (xa, za, xb, zb) in [(-4.9, 5.5, -3.0, 5.9), (4.9, 5.0, 3.0, 5.8)]:
    pts = [(xa + (xb - xa) * t, -0.5 - 16.4 * t, za + (zb - za) * t - 4.0 * t * (1 - t)) for t in [i / 40 for i in range(41)]]
    b.tube(pts, 0.008, M["black"], 4, caps=False)
    for i in range(4, 40, 5):
        b.ball(pts[i][0], pts[i][1], pts[i][2] - 0.09, 0.045, M["bulb"], u=8, v=6)
b.build()

# --- the storefront -----------------------------------------------------------------------------------
f = B("facade", "Exterior")
BLK = M["facade"]
for x0, x1 in [(-4.9, -3.7), (-2.3, -1.5), (3.7, 4.9)]:
    f.box(x0, x1, -0.2, 0.2, 0, 4.5, BLK)
f.box(-3.7, -2.3, -0.2, 0.2, 2.6, 4.5, BLK)
f.box(-1.5, 3.7, -0.2, 0.2, 0, 0.55, BLK)
for i in range(13):  # tiled riser under the window
    f.box(-1.5 + i * 0.4 + 0.01, -1.5 + (i + 1) * 0.4 - 0.01, -0.27, -0.2, 0.02, 0.53, M["tile"], bev=0.012)
CX, HALF, TOP, SPRING = 1.1, 2.6, 3.4, 2.5  # the arched display window, a shallow arch over 5.2 m
RISE = TOP - SPRING
RAD = (HALF ** 2 + RISE ** 2) / (2 * RISE)
CZ = TOP - RAD
a0, a1 = math.atan2(SPRING - CZ, -HALF), math.atan2(SPRING - CZ, HALF)
archpts = arc(CX, CZ, RAD, a0, a1, 28)
f.prism_xz(archpts + [(3.7, 4.5), (-1.5, 4.5)], -0.2, 0.2, BLK)
f.prism_xz([(-1.5, 0.55)] + archpts + [(3.7, 0.55)], -0.015, 0.015, M["glass_flat"])
f.tube([(x, -0.24, z) for x, z in archpts], 0.065, M["brass"], 8)
for x in (-1.5, 3.7):
    f.tube([(x, -0.24, 0.55), (x, -0.24, SPRING)], 0.065, M["brass"], 8)
f.box(-1.62, 3.82, -0.5, -0.1, 0.5, 0.58, M["brass"], bev=0.02)
for x in (-0.2, 1.1, 2.4):
    f.tube([(x, -0.06, 0.58), (x, -0.06, CZ + math.sqrt(RAD ** 2 - (x - CX) ** 2))], 0.025, M["steel"], 6)
f.tube([(-1.5 + i * 0.26, -0.06, 2.05) for i in range(21)], 0.02, M["steel"], 6)
r5 = random.Random(21)  # the window display: a stepped plinth of bongs
f.box(-1.4, 3.6, 0.22, 1.25, 0.0, 0.62, M["walnut"], bev=0.02)
f.box(-1.4, 3.6, 0.6, 1.25, 0.62, 0.9, M["walnut"], bev=0.02)
f.box(-1.4, 3.6, 0.9, 1.25, 0.9, 1.2, M["walnut"], bev=0.02)
for i in range(7):
    bong(f, -1.1 + i * 0.7, 0.45, 0.62, r5, h=0.36 + r5.random() * 0.15)
for i in range(6):
    bong(f, -0.9 + i * 0.75, 0.78, 0.9, r5, h=0.4 + r5.random() * 0.25)
for i in range(5):
    jar(f, -0.5 + i * 0.85, 1.08, 1.2, 0.1, 0.22, M["glass"], M["brass"])
f.box(-1.4, 3.6, 1.2, 1.25, 1.2, 3.3, M["black"])
f.text("OPEN", (3.0, 0.1, 2.75), 0.28, M["neon_g"], extrude=0.03, fnt=FONT, bevel=0.004)
lamp("lamp_window_a", (0.4, 0.7, 2.2), "window")
lamp("lamp_window_b", (2.5, 0.7, 2.2), "window")
f.build()

f = B("facade_upper", "Exterior")  # the flat above: dark, one window lit
f.box(-4.9, 4.9, -0.2, 0.2, 4.5, 5.0, BLK)
for x0, x1 in [(-4.9, -3.8), (-2.6, -1.2), (0.0, 1.6), (3.4, 4.9)]:
    f.box(x0, x1, -0.2, 0.2, 5.0, 6.5, BLK)
f.box(-4.9, 4.9, -0.2, 0.2, 6.5, 7.0, BLK)
for i, (x0, x1) in enumerate([(-3.8, -2.6), (-1.2, 0.0), (1.6, 3.4)]):
    f.box(x0, x1, 0.2, 0.3, 5.0, 6.5, M["glow"] if i == 1 else M["black"])
    f.box(x0 - 0.06, x1 + 0.06, -0.26, -0.18, 4.94, 5.0, M["brass"], bev=0.015)
    for xx in (x0 - 0.06, x1):
        f.box(xx, xx + 0.06, -0.26, -0.18, 5.0, 6.5, M["trim"], bev=0.012)
    f.box(x0, x1, -0.14, -0.1, 5.0, 6.5, M["glass_flat"])
    f.box((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02, -0.15, -0.09, 5.0, 6.5, M["steel"])
    f.box(x0 - 0.1, x1 + 0.1, -0.5, -0.2, 4.7, 5.0, M["walnut"], bev=0.02)
    leaf_cluster(f, (x0 + x1) / 2, -0.36, 5.05, (x1 - x0) / 2, 18, random.Random(i + 40))
lamp("lamp_flat", (-0.6, 0.7, 5.7), "window")
f.box(-5.0, 5.0, -0.5, 0.2, 7.0, 7.22, M["kerb"], bev=0.025)
for i in range(46):
    f.box(-4.8 + i * 0.21, -4.8 + i * 0.21 + 0.12, -0.42, -0.2, 6.78, 7.0, M["kerb"], bev=0.01)
f.box(-4.9, 4.9, -0.2, 0.2, 7.22, 7.7, BLK)
f.box(-5.0, 5.0, -0.3, 0.3, 7.7, 7.82, M["kerb"], bev=0.02)
f.build()

f = B("sign", "Exterior")  # black board, brass frame, neon letters in the logo colours
f.box(-1.45, 3.65, -0.42, -0.2, 3.72, 4.46, M["black"], bev=0.015)
f.box(-1.5, 3.7, -0.45, -0.38, 3.68, 3.74, M["brass"], bev=0.01)
f.box(-1.5, 3.7, -0.45, -0.38, 4.44, 4.5, M["brass"], bev=0.01)
# the landing page's own logo is the only wordmark; the shop's sign is two plain words
# round a flame (the eyes belong to the inside)
def flame_pts(w, h, n=28):
    out = []
    for i in range(n):
        t = 2 * PI * i / n
        out.append(((w / 2) * math.sin(t) * math.sin(t / 2) ** 1.2, (h / 2) * math.cos(t)))
    return out


def neon_flame(f, plane, c, w, h, tube=0.02):
    """A flame in neon tube (outline, and a smaller one inside), in the XZ plane
    at y = c[1] (facing -y) or the YZ plane at x = c[0]."""
    def P(u, v):
        return (c[0] + u, c[1], c[2] + v) if plane == "xz" else (c[0], c[1] + u, c[2] + v)

    pts = flame_pts(w, h)
    f.tube([P(u, v) for u, v in pts + [pts[0]]], tube, M["neon_y"], 8)
    inner = [(u * 0.45, v * 0.45 - h * 0.17) for u, v in pts]
    f.tube([P(u, v) for u, v in inner + [inner[0]]], tube * 0.8, M["neon_r"], 8)


neon_flame(f, "xz", (CX, -0.46, 4.09), 0.46, 0.64)
f.text("SMOKE", (CX - 1.75, -0.46, 4.09), 0.34, M["neon_r"], extrude=0.04, fnt=FONT, bevel=0.004, spacing=1.05)
f.text("SHOP", (CX + 1.7, -0.46, 4.09), 0.34, M["neon_g"], extrude=0.04, fnt=FONT, bevel=0.004, spacing=1.05)
f.tube([(-4.9, -0.2, 3.5), (-4.9, -0.95, 3.5)], 0.03, M["brass"], 6)  # a blade sign on the left pier
f.tube([(-4.9, -0.45, 3.45), (-4.9, -0.95, 3.3)], 0.014, M["brass"], 6)
f.box(-4.96, -4.84, -1.6, -0.6, 2.55, 3.3, M["black"], bev=0.03)
f.box(-4.99, -4.81, -1.64, -0.56, 2.52, 2.58, M["brass"], bev=0.01)
for x in (-5.0, -4.8):
    neon_flame(f, "yz", (x, -1.1, 2.92), 0.4, 0.58, 0.015)
f.build()

f = B("door_surround", "Exterior")  # the door's reveal, step and lantern
for x0, x1, z0, z1 in [(-3.82, -3.7, 0, 2.72), (-2.3, -2.18, 0, 2.72), (-3.82, -2.18, 2.6, 2.72)]:
    f.box(x0, x1, -0.34, -0.2, z0, z1, M["trim"], bev=0.015)
f.box(-3.95, -2.05, -1.0, -0.2, 0.0, 0.14, M["kerb"], bev=0.03)
f.box(-3.75, -2.25, -0.3, -0.2, 0.0, 0.1, M["brass"], bev=0.01)
f.lathe([(0, 0), (0.05, 0), (0.05, 0.05), (0.09, 0.09), (0.12, 0.3), (0.1, 0.34), (0, 0.34)], (-2.0, -0.55, 2.55), M["brass"], 12)
f.ball(-2.0, -0.55, 2.7, 0.08, M["lamp"])
f.tube([(-2.0, -0.2, 2.8), (-2.0, -0.55, 2.8), (-2.0, -0.55, 2.6)], 0.012, M["brass"], 6)
lamp("lamp_door", (-2.0, -0.75, 2.7), "window")
lamp("lamp_hero_l", (-3.8, -2.4, 3.2), "window")
lamp("lamp_hero_r", (3.9, -2.4, 3.2), "window")
f.build()

d = B("door_leaf", "Exterior")  # origin on the hinge so the site can swing it
W, H = 1.4, 2.6
for x0, x1, z0, z1 in [(0, 0.14, 0, H), (W - 0.14, W, 0, H), (0, W, 0, 0.18), (0, W, H - 0.14, H), (0, W, 1.0, 1.1)]:
    d.box(x0, x1, -0.04, 0.04, z0, z1, M["walnut"], bev=0.012)
for k in range(2):
    d.box(0.2 + k * 0.5, 0.66 + k * 0.5, -0.03, 0.05, 0.28, 0.92, M["walnut2"], bev=0.015)
d.box(0.14, W - 0.14, -0.012, 0.012, 1.1, H - 0.14, M["glass_flat"])
for x in (0.4, 0.7, 1.0):
    d.box(x, x + 0.025, -0.02, 0.02, 1.1, H - 0.14, M["brass"])
for z in (1.55, 2.0):
    d.box(0.14, W - 0.14, -0.02, 0.02, z, z + 0.025, M["brass"])
d.box(0.14, W - 0.14, -0.05, 0.05, 0.0, 0.3, M["brass"], bev=0.01)
for y in (-0.1, 0.1):
    d.tube([(W - 0.2, y, 0.95), (W - 0.2, y, 1.5)], 0.016, M["brass"], 8)
door = d.build(loc=(-3.7, 0.0, 0.0))
door.rotation_euler = (0, 0, math.radians(95))  # exported ajar so nothing blocks the camera; 0 = shut

# --- fixtures: shared pieces --------------------------------------------------------------------------------
def at(wall, s, d):
    return {"L": (-4.5 + d, s), "R": (4.5 - d, s), "B": (s, 11.0 - d)}[wall]


def wbox(b, wall, a0, a1, d0, d1, z0, z1, m, bev=0.0):
    """A box in a wall's own frame: along the wall a0..a1, out from it d0..d1."""
    if wall == "L":
        b.box(-4.5 + d0, -4.5 + d1, a0, a1, z0, z1, m, bev=bev)
    elif wall == "R":
        b.box(4.5 - d1, 4.5 - d0, a0, a1, z0, z1, m, bev=bev)
    else:
        b.box(a0, a1, 11.0 - d1, 11.0 - d0, z0, z1, m, bev=bev)


def shelf_row(b, wall, s0, s1, d, z, kind, rng, hmax=0.3):
    """Stand-ins in a row along a shelf: papers, cones, boxes, jars, grinders..."""
    s = s0 + 0.08
    while s < s1 - 0.1:
        x, y = at(wall, s, d)
        if kind == "booklet":
            for k in range(rng.randint(3, 6)):
                bx, by = at(wall, s + k * 0.016, d)
                b.box(bx - 0.03, bx + 0.03, by - 0.008, by + 0.008, z, z + 0.075, rng.choice(PAPER)) if wall != "B" else b.box(bx - 0.008, bx + 0.008, by - 0.03, by + 0.03, z, z + 0.075, rng.choice(PAPER))
            s += 0.12
        elif kind == "cone":
            b.cyl(x, y, z + 0.1, 0.022, 0.01, 0.2, rng.choice(PAPER), 10)
            s += 0.06
        elif kind == "box":
            w = rng.uniform(0.07, 0.13)
            h = rng.uniform(0.07, hmax)
            x2, y2 = at(wall, s + w, d)
            b.box(min(x, x2) - 0.04, max(x, x2) + 0.04, min(y, y2) - 0.04, max(y, y2) + 0.04, z, z + h, rng.choice(PAPER), bev=0.004)
            s += w + 0.02
        elif kind == "jar":
            r = rng.uniform(0.035, 0.055)
            jar(b, x, y, z, r, rng.uniform(0.09, 0.16), rng.choice([M["glass"], M["g_amber"], M["black"]]), rng.choice([M["brass"], M["black"]]))
            s += 2 * r + 0.025
        elif kind == "grinder":
            grinder(b, x, y, z, rng.uniform(0.04, 0.055), rng.choice(METALS))
            s += 0.13
        elif kind == "bottle":
            r = rng.uniform(0.025, 0.035)
            h = rng.uniform(0.16, 0.24)
            b.lathe([(0, 0), (r, 0), (r, h * 0.6), (r * 0.5, h * 0.75), (r * 0.4, h * 0.9), (r * 0.5, h), (0, h)], (x, y, z), rng.choice([M["g_blue"], M["g_green"], M["white"], M["g_amber"]]), 12)
            s += 2 * r + 0.02
        elif kind == "tin":
            r = rng.uniform(0.04, 0.06)
            b.lathe([(0, 0), (r, 0), (r, 0.05), (r * 1.04, 0.055), (r * 1.04, 0.065), (0, 0.065)], (x, y, z), rng.choice([M["brass"], M["fabric_r"], M["fabric_g"], M["fabric_y"], M["black"]]), 12)
            s += 2 * r + 0.02
        elif kind == "can":
            b.cyl(x, y, z + 0.075, 0.025, 0.025, 0.15, rng.choice([M["fabric_r"], M["black"], M["fabric_y"]]), 12)
            s += 0.065
        elif kind == "keychain":
            b.tube([(x, y, z + 0.2), (x, y, z + 0.1)], 0.003, M["steel"], 4)
            b.ball(x, y, z + 0.07, 0.03, rng.choice(PAPER), u=10, v=6)
            s += 0.08


def shelves(b, wall, s0, s1, depth, zs, m=None):
    for z in zs:
        wbox(b, wall, s0, s1, 0, depth, z, z + 0.035, m or M["plum2"], 0.006)


def cabinet(b, wall, s0, s1, depth=0.55, h=0.95):
    """A low walnut cabinet with panelled doors, brass pulls and a marble top."""
    wbox(b, wall, s0, s1, 0, depth - 0.04, 0.0, 0.1, M["black"])
    wbox(b, wall, s0, s1, 0, depth, 0.1, h, M["plum"], 0.01)
    n = max(1, round((s1 - s0) / 0.6))
    w = (s1 - s0) / n
    for i in range(n):
        a = s0 + i * w
        wbox(b, wall, a + 0.02, a + w - 0.02, depth, depth + 0.025, 0.16, h - 0.07, M["plum2"], 0.012)
        hx = a + w - 0.1 if i % 2 == 0 else a + 0.1
        wbox(b, wall, hx - 0.01, hx + 0.01, depth + 0.02, depth + 0.07, 0.55, 0.8, M["brass"], 0.004)
    wbox(b, wall, s0 - 0.02, s1 + 0.02, 0, depth + 0.05, h, h + 0.045, M["marble"], 0.01)


def hot(name, wall, s, d, z, cats, label):
    x, y = at(wall, s, d)
    HOTSPOTS.append((name, (x, y, z), cats, label))


# --- the room: a rotunda of alcoves under a dome (shop_rotunda.py) ---------------------------------------------
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shop_rotunda.py"), encoding="utf-8").read(), "shop_rotunda.py", "exec"))

exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shop_world.py"), encoding="utf-8").read(), "shop_world.py", "exec"))  # Baba's face, eyes, floaters, incense
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shop_magic.py"), encoding="utf-8").read(), "shop_magic.py", "exec"))  # candles that float
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shop_street.py"), encoding="utf-8").read(), "shop_street.py", "exec"))  # cars and people

# --- hotspot and lamp empties --------------------------------------------------------------------------------------------------------------------------------------------------------------
for name, loc, cats, label in HOTSPOTS:
    empty(name, loc, "Hotspots", categories=cats, label=label)
for name, loc, kind in LAMPS:
    empty(name, loc, "Lights", kind=kind)


# --- the scroll path -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
def camera(name, loc, target, fov=60):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "VERTICAL"
    cd.angle = math.radians(fov)
    cd.clip_start, cd.clip_end = 0.05, 300
    ob = bpy.data.objects.new(name, cd)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    shoplib.collection("Cameras").objects.link(ob)
    return ob


camera("cam_00", (-3.6, -13.8, 1.9), (0.0, 0.0, 3.0), 55)
camera("cam_01", (-4.0, -8.6, 1.9), (-3.0, 0.0, 2.4))
camera("cam_02", (-3.5, -4.4, 1.75), (-3.0, 0.0, 1.9))
camera("cam_03", (-3.0, -0.9, 1.7), (-2.5, 6.0, 2.1))
camera("cam_04", (-2.95, 2.1, 1.65), polar(R, FACE_A, 1.75))
camera("cam_05", (RX, RY, 1.65), polar(R, FACE_A, 1.65))  # level, at eye height: the middle of the room, looking at Baba
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

# --- export ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_cameras=True, export_extras=True, export_apply=True, export_yup=True,
    export_draco_mesh_compression_enable="--nodraco" not in argv, export_draco_mesh_compression_level=10,
    export_draco_position_quantization=14, export_draco_normal_quantization=8, export_draco_texcoord_quantization=10,
)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes")
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))

# --- preview stills (not part of the export) -----------------------------------------------------------------------------------------------------------------------------------------------------
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(arg("--samples", "48"))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = bpy.data.worlds.new("night")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.02, 0.045, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    sun = bpy.data.lights.new("moon", "SUN")
    sun.energy = 0.25
    sun.color = (0.6, 0.7, 1.0)
    so = bpy.data.objects.new("moon", sun)
    so.rotation_euler = (math.radians(55), 0, math.radians(-30))
    scene.collection.objects.link(so)
    for name, loc, kind in LAMPS:
        li = bpy.data.lights.new(name, "POINT")
        li.energy = {"street": 900, "window": 250, "shop": 180, "magenta": 260, "teal": 260, "violet": 420}[kind]
        li.shadow_soft_size = 0.15
        li.color = {"magenta": (1.0, 0.25, 0.6), "teal": (0.15, 0.9, 0.85), "violet": (0.55, 0.35, 1.0)}.get(kind, (1.0, 0.8, 0.55))
        lo = bpy.data.objects.new(name, li)
        lo.location = loc
        scene.collection.objects.link(lo)
    which = arg("--shots", "cam_00,cam_03,cam_04,cam_05,back,left,right,aerial").split(",")
    extra = {
        "back": camera("pv_back", (RX, RY, 1.65), polar(R, FACE_A + PI, 1.6)),
        "left": camera("pv_left", (RX, RY, 1.65), polar(R, FACE_A + PI / 2, 1.6)),
        "right": camera("pv_right", (RX, RY, 1.65), polar(R, FACE_A - PI / 2, 1.6)),
        "aerial": camera("pv_aerial", (RX + 0.01, RY, 11.0), (RX, RY, 0.0), 80),
        "side": camera("pv_side", (-10, -8, 3.4), (-1.5, 0, 2.4), 55),
        "landing": camera("pv_landing", (-3.6, -13.8, 1.9), (0.0, 0.0, 3.0), 55),
        "dome": camera("pv_dome", (RX, RY, 1.65), polar(R * 0.6, FACE_A, 9.8), 70),
    }
    for n in which:
        cam = extra[n] if n in extra else bpy.data.objects[n]
        scene.camera = cam
        scene.render.filepath = os.path.join(os.path.abspath(PREVIEW), f"{n}.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
