"""Builds the Babajee night-street shop (street, storefront, interior) as a
model-only GLB.

    blender -b -P tools/blender/build_shop.py -- \
        --out public/models/shop.glb --blend tools/blender/shop.blend --preview tools/blender/preview

Direction: a reggae smoke shop at night. Black facade, one big neon sign in
the logo's red / yellow / green, warm amber spilling from an arched display
window; inside, dark walnut, brass, lit glass cases and a long curved counter.
The plan is deliberately lopsided: the door is on the left, the window on the
right, and the camera turns into the room instead of walking down its middle.

Plain geometry with role-named materials (m_walnut, m_brass, m_neon_red, ...);
no textures. Units are metres. The shop is 9 m wide (x, -4.5..4.5) and 11 m
deep (y, 0.2..11) with the street on the -y side; Blender is Z-up, the glTF
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
from mathutils import Vector

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
    planet=mat("planet", "#ffd98a", 0.6, 0.0, 1.0, 2.2),
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
    b.lathe(pr, (x, y, z), gm, seg=18)
    b.tube([(x, y - 0.035, z + 0.08), (x, y - 0.075, z + 0.12), (x, y - 0.115, z + 0.2)], 0.012, M["glass"], 8)
    b.lathe([(0, 0), (0.016, 0), (0.026, 0.02), (0.03, 0.03), (0.026, 0.03), (0, 0.022)], (x, y - 0.12, z + 0.2), gm, seg=12)


def jar(b, x, y, z, r, h, body, lid):
    b.lathe([(0, 0), (r * 0.9, 0), (r, 0.01), (r, h * 0.82), (r * 0.85, h * 0.86), (0, h * 0.86)], (x, y, z), body, seg=20)
    b.lathe([(0, h * 0.84), (r * 0.9, h * 0.84), (r * 0.9, h * 0.96), (r * 0.7, h), (0, h)], (x, y, z), lid, seg=20)


def grinder(b, x, y, z, r, m):
    h = r * 0.9
    b.lathe([(0, 0), (r, 0), (r, h * 0.35), (r * 1.03, h * 0.37), (r * 1.03, h * 0.66), (r, h * 0.68), (r, h * 0.95), (r * 0.9, h), (0, h)], (x, y, z), m, seg=28)


def dish(b, x, y, z, r, m, seg=22):
    b.lathe([(0, 0), (r * 0.9, 0), (r, 0.012), (r * 1.02, 0.03), (r * 0.9, 0.034), (r * 0.8, 0.02), (0, 0.016)], (x, y, z), m, seg)


def leaf_cluster(b, cx, cy, cz, r, n, rng):
    for _ in range(n):
        a = rng.uniform(0, 2 * PI)
        d = rng.uniform(0.0, r)
        zz = cz + rng.uniform(-r * 0.6, r * 0.8)
        ls = rng.uniform(0.09, 0.16)
        b.ball(cx + d * math.cos(a), cy + d * math.sin(a), zz, ls, rng.choice([M["leaf"], M["leaf2"]]),
               scale=(0.55, 1.0, 0.07), rot=(rng.uniform(-0.8, 0.8), rng.uniform(-0.5, 0.5), a), u=8, v=5)


def plant(b, x, y, z, s, rng, tall=True):
    pot = M["pot"] if rng.random() < 0.6 else M["black"]
    b.lathe([(0, 0), (0.11 * s, 0), (0.17 * s, 0.34 * s), (0.185 * s, 0.36 * s), (0.17 * s, 0.35 * s), (0.16 * s, 0.31 * s), (0, 0.31 * s)], (x, y, z), pot, seg=20)
    if tall:
        b.tube([(x, y, z + 0.3 * s), (x + 0.05 * s, y, z + 0.9 * s), (x - 0.03 * s, y + 0.03 * s, z + 1.5 * s), (x + 0.04 * s, y, z + 2.0 * s)], 0.02 * s, M["walnut"], 6)
        for t in range(10):
            leaf_cluster(b, x, y, z + (0.7 + t * 0.13) * s, 0.32 * s, 5, rng)
    else:
        leaf_cluster(b, x, y, z + 0.5 * s, 0.25 * s, 22, rng)


def hanging_plant(b, x, y, ztop, rng):
    b.tube([(x, y, ceil_at(x, y)), (x, y, ztop)], 0.004, M["brass"], 4)
    for k in range(3):
        a = k * 2.1
        b.tube([(x + 0.1 * math.cos(a), y + 0.1 * math.sin(a), ztop), (x, y, ztop - 0.45)], 0.004, M["brass"], 4)
    b.lathe([(0, 0), (0.1, 0.02), (0.15, 0.16), (0.15, 0.18), (0.13, 0.17), (0, 0.15)], (x, y, ztop - 0.65), M["pot"], 18)
    for k in range(5):
        a = k * 1.3
        pts = [(x + 0.08 * math.cos(a), y + 0.08 * math.sin(a), ztop - 0.6)]
        for t in range(1, 8):
            pts.append((pts[0][0] + 0.05 * t * math.cos(a), pts[0][1] + 0.05 * t * math.sin(a), ztop - 0.6 - 0.12 * t - rng.uniform(0, 0.04)))
        b.tube(pts, 0.005, M["leaf2"], 4)
        for p in pts[2:]:
            b.ball(p[0], p[1], p[2], 0.045, M["leaf"], scale=(0.7, 1, 0.12), rot=(0, 0, rng.uniform(0, 6)), u=8, v=5)


# the room: a low entry (ceiling 4 m) up to y = 2.8, then a tall barrel vault
# whose underside is vault_h(x) (7 m at the walls, 9.6 m on the centre line)
VR, APEX, SOF = 5.194, 9.6, 2.8
VCZ = APEX - VR


def vault_h(x):
    return VCZ + math.sqrt(max(0.0, VR * VR - x * x))


def ceil_at(x, y):
    """Where a cord hung at (x, y) is fixed: the entry ceiling or the vault."""
    return 4.0 if y < SOF else vault_h(max(-4.5, min(4.5, x))) - 0.08


def pendant(b, x, y, zlow, name=None):
    b.tube([(x, y, ceil_at(x, y)), (x, y, zlow + 0.26)], 0.005, M["black"], 4)
    b.lathe([(0.03, 0), (0.28, 0.02), (0.25, 0.12), (0.06, 0.26), (0.02, 0.28), (0, 0.28)], (x, y, zlow), M["brass"], 22)
    b.ball(x, y, zlow + 0.02, 0.06, M["lamp"], u=12, v=8)
    if name:
        lamp(name, (x, y, zlow - 0.1))


def sign_board(b, cx, cy, ztop, text, theta, w, h=0.4, size=0.19, ceil=None):
    """A brass-edged board on two cords from the ceiling, with text on both
    faces. theta turns it; 0 faces -y, +90 deg faces +x."""
    ceil = ceil_at(cx, cy) if ceil is None else ceil
    zc = ztop - h / 2
    nrm = Vector((math.sin(theta), -math.cos(theta), 0))
    tan = Vector((math.cos(theta), math.sin(theta), 0))
    for sg in (-1, 1):
        if ceil > ztop + 0.01:  # a board set flush to the wall has no cords
            b.tube([(cx + tan.x * (w / 2 - 0.12) * sg, cy + tan.y * (w / 2 - 0.12) * sg, ztop), (cx + tan.x * (w / 2 - 0.12) * sg, cy + tan.y * (w / 2 - 0.12) * sg, ceil)], 0.005, M["steel"], 4)
    b.box(cx - w / 2 - 0.03, cx + w / 2 + 0.03, cy - 0.04, cy + 0.04, zc - h / 2 - 0.03, zc + h / 2 + 0.03, M["brass"], bev=0.01, rot=(0, 0, theta))
    b.box(cx - w / 2, cx + w / 2, cy - 0.045, cy + 0.045, zc - h / 2, zc + h / 2, M["black"], bev=0.008, rot=(0, 0, theta))
    for sg, th in ((1, theta), (-1, theta + PI)):
        n = nrm * sg
        b.text(text, (cx + n.x * 0.054, cy + n.y * 0.054, zc), size, M["neon_y"], rot=(PI / 2, 0, th), extrude=0.012, fnt=FONT2, bevel=0.0)


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
block(b, -24, -4.9, -0.2, 14, 12.5, M["brick"], 4, random.Random(3), 0.04, 6, 1.3)
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
block(b, 4.9, 24, -0.2, 14, 10.5, M["stucco"], 3, random.Random(5), 0.0, 5, 1.4)
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
f.prism_xz([(-1.5, 0.55)] + archpts + [(3.7, 0.55)], -0.015, 0.015, M["glass"])
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
    f.box(x0, x1, -0.14, -0.1, 5.0, 6.5, M["glass"])
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
d.box(0.14, W - 0.14, -0.012, 0.012, 1.1, H - 0.14, M["glass"])
for x in (0.4, 0.7, 1.0):
    d.box(x, x + 0.025, -0.02, 0.02, 1.1, H - 0.14, M["brass"])
for z in (1.55, 2.0):
    d.box(0.14, W - 0.14, -0.02, 0.02, z, z + 0.025, M["brass"])
d.box(0.14, W - 0.14, -0.05, 0.05, 0.0, 0.3, M["brass"], bev=0.01)
for y in (-0.1, 0.1):
    d.tube([(W - 0.2, y, 0.95), (W - 0.2, y, 1.5)], 0.016, M["brass"], 8)
door = d.build(loc=(-3.7, 0.0, 0.0))
door.rotation_euler = (0, 0, math.radians(95))  # exported ajar so nothing blocks the camera; 0 = shut

# --- the shell --------------------------------------------------------------------------------------------
s = B("shell", "Shell")
s.box(-4.9, -4.5, 0.2, 11.4, 0, 7.0, M["indigo"])
s.box(4.5, 4.9, 0.2, 11.4, 0, 7.0, M["indigo"])
s.box(-4.5, 0.0, 11.0, 11.4, 0, 7.0, M["indigo"])  # back wall, with an arched doorway
s.box(1.2, 4.5, 11.0, 11.4, 0, 7.0, M["indigo"])
s.prism_xz(arc(0.6, 2.1, 0.6, PI, 0, 14) + [(1.2, 7.0), (0.0, 7.0)], 11.0, 11.4, M["indigo"])
VAULT = [(-4.5 + 9.0 * i / 32, vault_h(-4.5 + 9.0 * i / 32)) for i in range(33)]
s.prism_xz(VAULT, 11.0, 11.4, M["indigo"])  # the back wall's gable, up to the vault
s.box(-4.5, 4.5, 0.2, SOF, 4.0, 4.25, M["indigo"])  # the low ceiling over the entry
s.box(-4.5, 4.5, 0.2, SOF, 4.25, 7.0, M["black"])  # solid above it, so the flat's windows are not see-through
s.box(-5.0, 5.0, -0.3, SOF, 7.0, 7.3, M["kerb"])
for k in range(54):
    y0 = 0.2 + k * (10.8 / 54)
    s.box(-4.5, 4.5, y0 + 0.003, y0 + 10.8 / 54 - 0.003, -0.02, 0.0, M["floor_dark"])
for i in range(6):  # tiled entry: the last of the ordinary world
    for j in range(5):
        s.box(-4.5 + i * 0.5 + 0.004, -4.5 + (i + 1) * 0.5 - 0.004, 0.2 + j * 0.5 + 0.004, 0.2 + (j + 1) * 0.5 - 0.004, 0.0, 0.012, M["tile_a"] if (i + j) % 2 else M["tile_b"], bev=0.003)
for xx, sg in ((-4.5, 1), (4.5, -1)):  # panelled dado and a gold picture rail
    for k in range(20):
        y0 = 0.4 + k * 0.52
        s.box(xx, xx + sg * 0.03, y0, y0 + 0.46, 0.14, 1.0, M["plum"], bev=0.01)
    s.box(xx, xx + sg * 0.06, 0.2, 11.0, 0.0, 0.14, M["plum"], bev=0.01)
    s.box(xx, xx + sg * 0.06, 0.2, 11.0, 1.0, 1.06, M["gold"], bev=0.01)
s.box(-4.5, 4.5, 10.94, 11.0, 0.0, 0.14, M["plum"], bev=0.01)
s.box(-0.4, 1.6, 11.4, 14.5, -0.03, 0.0, M["plum"])  # the room behind the arch
s.box(-0.4, 1.6, 11.4, 14.5, 3.0, 3.1, M["black"])
s.box(-0.5, -0.4, 11.4, 14.5, 0, 3.1, M["black"])
s.box(1.6, 1.7, 11.4, 14.5, 0, 3.1, M["black"])
s.box(-0.4, 1.6, 14.5, 14.6, 0, 3.1, M["black"])
s.box(-0.3, 1.5, 13.9, 14.0, 0.2, 2.9, M["glow_v"])  # a violet light back there
s.box(-3.5, -2.5, -0.5, 0.0, 0.0, 0.015, M["rubber"], bev=0.004)
s.build()

# the vault: a single-sided sheet (seen from inside only), ribs, and a soffit where the entry opens up
v = B("vault", "Shell")
rows = [[(x, y, z) for x, z in VAULT] for y in [SOF + (11.0 - SOF) * i / 8 for i in range(9)]]
v.sheet(rows, M["cosmos"], flip=True)
v.face_xz([(-4.5, 4.0), (4.5, 4.0)] + VAULT[::-1], SOF, M["cosmos"], toward=1)
v.build(recalc=False)
v = B("vault_ribs", "Shell")
for y in (5.8, 8.0, 10.2):  # none nearer than 5 m: the front ones would show over the roofline from the street
    v.prism_xz([(x, z) for x, z in VAULT] + [(x, z - 0.3) for x, z in VAULT[::-1]], y - 0.12, y + 0.12, M["plum2"])
    v.tube([(x, y, z - 0.31) for x, z in VAULT], 0.022, M["gold"], 6, caps=False)
v.build()
# stars on the vault
v = B("stars", "Shell")
rs = random.Random(77)
for _ in range(420):
    x, y = rs.uniform(-4.3, 4.3), rs.uniform(SOF + 0.2, 10.9)
    z = vault_h(x) - 0.03
    r = rs.choice([0.012, 0.015, 0.02, 0.03, 0.05])
    v.sheet([[(x - r, y - r, z), (x + r, y - r, z)], [(x - r, y + r, z), (x + r, y + r, z)]], rs.choice([M["star"], M["star_b"], M["star_c"]]), flip=False)
v.build(recalc=False)

# a round mandala laid in the floor under the table
b = B("mandala", "Shell")
MX, MY = 0.5, 5.0
b.cyl(MX, MY, 0.012, 3.9, 3.9, 0.024, M["floor_dark"], 64)
for r in (1.35, 2.1, 2.95, 3.7):
    b.tube([(MX + r * math.cos(2 * PI * i / 72), MY + r * math.sin(2 * PI * i / 72), 0.03) for i in range(73)], 0.022, M["gold"], 6)
for r in (1.6, 3.3):
    b.tube([(MX + r * math.cos(2 * PI * i / 72), MY + r * math.sin(2 * PI * i / 72), 0.028) for i in range(73)], 0.014, M["mandala"], 6)
for k in range(12):  # radial lines and petal points
    a = 2 * PI * k / 12
    b.tube([(MX + 1.4 * math.cos(a), MY + 1.4 * math.sin(a), 0.028), (MX + 3.65 * math.cos(a), MY + 3.65 * math.sin(a), 0.028)], 0.012, M["mandala"], 6)
    for r0, r1 in ((2.15, 2.9), (3.0, 3.65)):
        w = 0.14
        rm = (r0 + r1) / 2
        pts = [
            (MX + r0 * math.cos(a), MY + r0 * math.sin(a)),
            (MX + rm * math.cos(a) + w * math.sin(a), MY + rm * math.sin(a) - w * math.cos(a)),
            (MX + r1 * math.cos(a), MY + r1 * math.sin(a)),
            (MX + rm * math.cos(a) - w * math.sin(a), MY + rm * math.sin(a) + w * math.cos(a)),
        ]
        b.prism_xy(pts, 0.024, 0.034, M["mandala"] if k % 2 else M["gold"])
b.build()

# the curtain in the back doorway, in two halves the site can part
cu = B("curtain_rod", "Shell")
cu.tube([(-0.05, 10.9, 2.3), (1.25, 10.9, 2.3)], 0.014, M["gold"], 8)
cu.build()
for nm, span in (("curtain_l", range(0, 6)), ("curtain_r", range(6, 12))):
    cu = B(nm, "Shell")
    for i in span:
        cu.cyl(0.06 + i * 0.1, 10.88, 1.15, 0.062, 0.062, 2.3, M["fabric_r"] if i % 2 else M["velvet"], 12)
    cu.build()
n = B("neon_doorway", "Shell")  # a neon arch round the back doorway
pts = [(-0.07, 10.97, 0.0)] + [(0.6 + 0.67 * math.cos(a), 10.97, 2.1 + 0.67 * math.sin(a)) for a in [PI - i * PI / 20 for i in range(21)]] + [(1.27, 10.97, 0.0)]
n.tube(pts, 0.016, M["glow_v"], 8)
n.build()


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
            b.lathe([(0, 0), (r, 0), (r, 0.05), (r * 1.04, 0.055), (r * 1.04, 0.065), (0, 0.065)], (x, y, z), rng.choice([M["brass"], M["fabric_r"], M["fabric_g"], M["fabric_y"], M["black"]]), 18)
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


# --- the bong wall (left) -----------------------------------------------------------------------------------
b = B("bong_wall", "Fixtures")
rng = random.Random(31)
Y0, Y1 = 1.0, 7.0
cabinet(b, "L", Y0, Y1, 0.6, 0.95)
b.box(-4.5, -4.44, Y0, Y1, 0.95, 3.45, M["black"])
b.box(-4.44, -4.4, Y0 + 0.05, Y1 - 0.05, 1.05, 3.3, M["glow_v"])
for k in range(int((Y1 - Y0) / 0.12) + 1):
    y = Y0 + 0.06 + k * 0.12
    b.box(-4.4, -4.36, y, y + 0.05, 1.0, 3.35, M["plum"], bev=0.004)
for yy in [Y0 + i * 1.5 for i in range(5)]:
    b.box(-4.5, -3.94, yy - 0.04, yy + 0.04, 0.95, 3.45, M["plum"], bev=0.01)
b.box(-4.5, -3.9, Y0 - 0.06, Y1 + 0.06, 3.45, 3.62, M["plum"], bev=0.012)
b.box(-4.5, -3.84, Y0 - 0.1, Y1 + 0.1, 3.62, 3.72, M["brass"], bev=0.012)
for z in [1.45, 1.95, 2.45, 2.95]:
    b.box(-4.5, -3.96, Y0, Y1, z, z + 0.014, M["glass"])
    b.box(-3.985, -3.96, Y0, Y1, z - 0.012, z + 0.014, M["brass"])
    for k in range(int((Y1 - Y0) / 0.31)):
        y = Y0 + 0.18 + k * 0.31 + rng.uniform(-0.03, 0.03)
        if y < Y1 - 0.12:
            bong(b, -4.18, y, z + 0.014, rng, h=rng.uniform(0.26, 0.42))
for k, y in enumerate([1.6, 3.2, 4.9, 6.4]):
    bong(b, -4.15, y, 1.0, rng, h=0.38 + 0.1 * (k % 2))
sign_board(b, -3.9, 4.0, 3.95, "BONGS", PI / 2, 1.5, ceil=4.3)
b.build()
hot("hot_bongs", "L", 4.0, 0.3, 2.2, "bong,bong-accessory", "Bongs")
lamp("lamp_bongs_a", (-3.7, 2.4, 3.3))
lamp("lamp_bongs_b", (-3.7, 5.6, 3.3))

# --- the pipe case (freestanding) ------------------------------------------------------------------------------------
b = B("case_pipes", "Fixtures")
rng = random.Random(32)
X0, X1, YA, YB = 3.5, 4.4, 0.9, 3.2  # against the right wall by the door, out of the aisle
b.box(X0, X1, YA, YB, 0.08, 0.82, M["plum"], bev=0.015)
b.box(X0 - 0.03, X1 + 0.03, YA - 0.03, YB + 0.03, 0.0, 0.1, M["black"], bev=0.01)
b.box(X0 - 0.02, X1 + 0.02, YA - 0.02, YB + 0.02, 0.82, 0.86, M["brass"], bev=0.01)
b.box(X0, X1, YA, YB, 0.86, 0.9, M["velvet"])
for yy in (YA, YB - 0.03):
    b.box(X0 - 0.02, X1 + 0.02, yy, yy + 0.03, 0.86, 1.2, M["brass"], bev=0.006)
for xx in (X0 - 0.02, X1 - 0.01):
    b.box(xx, xx + 0.03, YA, YB, 0.86, 1.2, M["brass"], bev=0.006)
b.box(X0, X1, YA, YB, 1.18, 1.2, M["glass"])
for k in range(11):
    y = YA + 0.15 + k * 0.2
    x = (X0 + X1) / 2 + rng.uniform(-0.15, 0.15)
    gm = rng.choice(GLASSES)
    b.tube([(x - 0.12, y, 0.93), (x - 0.04, y, 0.925), (x + 0.04, y + rng.uniform(-0.02, 0.02), 0.93), (x + 0.12, y, 0.95)], 0.017, gm, 8)
    b.ball(x + 0.14, y, 0.97, 0.03, gm, scale=(1, 1, 1.2), u=10, v=6)
sign_board(b, 4.4, 2.05, 3.0, "PIPES", -PI / 2, 1.1, ceil=3.0)
b.build()
hot("hot_pipes", "R", 2.05, 0.5, 1.05, "pipe,roach", "Pipes")
lamp("lamp_pipes", (3.9, 2.05, 2.4))

# --- the round table (rolling trays) -----------------------------------------------------------------------------------------
b = B("table_trays", "Fixtures")
rng = random.Random(33)
TX, TY = 0.5, 5.0
b.lathe([(0, 0), (0.45, 0), (0.45, 0.03), (0.2, 0.08), (0.13, 0.15), (0.12, 0.78), (0.3, 0.84), (1.0, 0.86), (1.03, 0.88), (1.03, 0.92), (1.0, 0.94), (0, 0.94)], (TX, TY, 0), M["plum"], 56)
b.lathe([(0.9, 0.935), (1.0, 0.935), (1.0, 0.945), (0.9, 0.945)], (TX, TY, 0), M["brass"], 56)
for k in range(7):
    a = k * 2 * PI / 7 + 0.2
    cx, cy = TX + 0.62 * math.cos(a), TY + 0.62 * math.sin(a)
    rot = (0, 0, a + PI / 2)
    b.box(cx - 0.2, cx + 0.2, cy - 0.14, cy + 0.14, 0.945, 0.96, M["black"], bev=0.01, rot=rot)
    b.box(cx - 0.18, cx + 0.18, cy - 0.12, cy + 0.12, 0.96, 0.97, rng.choice(PAPER), rot=rot)
    ar = a + PI / 2
    lx_, ly_ = (math.cos(ar), math.sin(ar)), (-math.sin(ar), math.cos(ar))
    for sg in (-1, 1):  # raised rims, long sides then short
        px, py = cx + sg * 0.135 * ly_[0], cy + sg * 0.135 * ly_[1]
        b.box(px - 0.2, px + 0.2, py - 0.008, py + 0.008, 0.945, 0.99, M["black"], bev=0.003, rot=rot)
        px, py = cx + sg * 0.195 * lx_[0], cy + sg * 0.195 * lx_[1]
        b.box(px - 0.008, px + 0.008, py - 0.14, py + 0.14, 0.945, 0.99, M["black"], bev=0.003, rot=rot)
b.lathe([(0, 0), (0.18, 0), (0.18, 0.02), (0.05, 0.05), (0.03, 0.55), (0.12, 0.58), (0, 0.6)], (TX, TY, 0.94), M["brass"], 24)
for k in range(5):
    a = k * 2 * PI / 5 + 0.3
    px, py = TX + 0.22 * math.cos(a), TY + 0.22 * math.sin(a)
    b.box(px - 0.12, px + 0.12, py - 0.008, py + 0.008, 1.02, 1.3, rng.choice(PAPER), bev=0.003, rot=(0, 0, a + PI / 2))
b.build()
HOTSPOTS.append(("hot_trays", (TX, TY, 1.25), "rolling-tray", "Trays"))

b = B("chandelier", "Lights")
rng = random.Random(34)
CH = 1.6  # hung high: nothing at eye level between the door and the face
b.tube([(TX, TY, ceil_at(TX, TY)), (TX, TY, 3.55 + CH)], 0.012, M["gold"], 6)
b.lathe([(0, 0), (0.22, 0.0), (0.24, 0.07), (0.1, 0.16), (0, 0.16)], (TX, TY, 3.45 + CH), M["gold"], 24)
for k in range(9):
    a = k * 2 * PI / 9
    r = 0.18 + 0.22 * (k % 3)
    zz = 2.65 + CH + 0.25 * (k % 3) + rng.uniform(-0.08, 0.08)
    px, py = TX + r * math.cos(a), TY + r * math.sin(a)
    b.tube([(TX, TY, 3.5 + CH), (px, py, zz + 0.2)], 0.006, M["gold"], 5)
    b.ball(px, py, zz, 0.12, M["lamp"], u=18, v=12)
    b.lathe([(0.0, 0), (0.035, 0), (0.04, 0.05), (0, 0.05)], (px, py, zz + 0.1), M["brass"], 10)
lamp("lamp_chandelier", (TX, TY, 2.9))
b.build()

# --- the papers bay (back wall, left) with a library ladder -----------------------------------------------------------------------------
b = B("papers_bay", "Fixtures")
rng = random.Random(35)
S0, S1 = -2.6, -1.5  # the back-left corner belongs to the spiral stair
cabinet(b, "B", S0, S1, 0.55, 0.95)
b.box(S0, S1, 10.95, 11.0, 0.95, 3.7, M["black"])
for xx in [S0 + i * 0.75 for i in range(int((S1 - S0) / 0.75) + 1)]:
    b.box(xx - 0.03, xx + 0.03, 10.68, 11.0, 0.95, 3.7, M["plum"], bev=0.008)
zs = [1.3 + i * 0.36 for i in range(7)]
shelves(b, "B", S0, S1, 0.32, zs)
b.box(S0, S1, 10.64, 11.0, 3.7, 3.78, M["brass"], bev=0.01)
kinds = ["booklet", "booklet", "cone", "box", "booklet", "box", "cone", "booklet"]
for i, z in enumerate([0.995] + [z + 0.035 for z in zs]):
    shelf_row(b, "B", S0, S1, 0.17, z, kinds[i % len(kinds)], rng, 0.2)
b.tube([(S0 + 0.05, 10.55, 3.2), (S1 - 0.05, 10.55, 3.2)], 0.015, M["brass"], 8)
sign_board(b, -2.05, 10.6, 3.95, "PAPERS", 0.0, 1.2)
b.build()
lad = B("ladder", "Fixtures")  # on its own, so the site can slide it along the rail
for sx in (-0.2, 0.2):
    lad.tube([(sx, 10.45, 0.0), (sx, 10.8, 3.3)], 0.022, M["plum"], 8)
for k in range(12):
    t = 0.1 + k * 0.075
    lad.tube([(-0.2, 10.45 + 0.35 * t, t * 3.2), (0.2, 10.45 + 0.35 * t, t * 3.2)], 0.014, M["plum2"], 6)
lad.build(loc=(-2.05, 0, 0))
hot("hot_papers", "B", -2.05, 0.4, 2.8, "rolling-paper,blunt-wraps,blunt-pre-rolled-cone", "Papers & wraps")
lamp("lamp_papers", (-2.05, 10.2, 3.4))

# --- the humidor (back wall, by the door) ------------------------------------------------------------------------------------------------
b = B("humidor", "Fixtures")
rng = random.Random(36)
H0, H1 = -1.4, -0.15
cabinet(b, "B", H0, H1, 0.55, 0.95)
b.box(H0, H1, 10.96, 11.0, 0.95, 3.1, M["cedar"])  # back
for xx in (H0, H1 - 0.04):
    b.box(xx, xx + 0.04, 10.5, 11.0, 0.95, 3.1, M["cedar"], bev=0.006)  # sides
b.box(H0, H1, 10.5, 11.0, 3.06, 3.1, M["cedar"], bev=0.006)  # top
b.box(H0 + 0.04, H1 - 0.04, 10.9, 10.96, 3.0, 3.06, M["lamp"])  # light along the top
zs = [1.3, 1.85, 2.4, 2.94]
shelves(b, "B", H0 + 0.06, H1 - 0.06, 0.42, zs, M["cedar"])
for z in zs:
    x = H0 + 0.14
    while x < H1 - 0.2:
        b.box(x, x + 0.24, 10.64, 10.9, z + 0.035, z + 0.1, M["cedar"], bev=0.008)
        b.box(x, x + 0.24, 10.64, 10.9, z + 0.1, z + 0.108, M["brass"])
        for c in range(7):
            b.cyl(x + 0.03 + c * 0.03, 10.77, z + 0.118, 0.008, 0.008, 0.2, M["leather"], 8, rot=(PI / 2, 0, 0))
        x += 0.3
shelf_row(b, "B", H0, H1, 0.2, 0.995, "tin", rng)
b.box(H0, H1, 10.44, 10.5, 0.95, 3.1, M["glass"])
b.box(H0 - 0.03, H1 + 0.03, 10.4, 11.0, 3.1, 3.2, M["brass"], bev=0.01)
b.build()
hot("hot_tobacco", "B", -0.8, 0.4, 1.9, "rolling-tobacco,cigars", "Tobacco & cigars")

# --- grinders & ashtrays (left, back) --------------------------------------------------------------------------------------------------------------
b = B("shelves_grinders", "Fixtures")
rng = random.Random(37)
G0, G1 = 7.4, 9.0  # ends where the stair begins
cabinet(b, "L", G0, G1, 0.5, 0.95)
b.box(-4.5, -4.46, G0, G1, 0.95, 3.5, M["black"])
b.box(-4.46, -4.42, G0 + 0.05, G1 - 0.05, 1.2, 3.3, M["glow_t"])
for xx in [G0 + i * 0.7 for i in range(int((G1 - G0) / 0.7) + 1)]:
    b.box(-4.5, -4.12, xx - 0.025, xx + 0.025, 0.95, 3.5, M["plum"], bev=0.008)
zs = [1.3, 1.75, 2.2, 2.65, 3.1]
for i, z in enumerate(zs):
    b.box(-4.5, -4.12, G0, G1, z, z + 0.03, M["glass"])
    if i < 3:
        for k in range(int((G1 - G0) / 0.14)):
            y = G0 + 0.12 + k * 0.14
            if y < G1 - 0.1:
                grinder(b, -4.3, y, z + 0.03, rng.uniform(0.04, 0.055), rng.choice(METALS))
    else:
        for k in range(int((G1 - G0) / 0.27)):
            dish(b, -4.3, G0 + 0.16 + k * 0.27, z + 0.03, rng.uniform(0.07, 0.1), rng.choice([M["glass"], M["brass"], M["tile"], M["fabric_r"]]))
b.box(-4.5, -4.1, G0 - 0.04, G1 + 0.04, 3.5, 3.62, M["brass"], bev=0.01)
sign_board(b, -3.9, 8.2, 3.95, "GRINDERS", PI / 2, 1.5, ceil=4.3)
b.build()
hot("hot_grinders", "L", 8.2, 0.4, 1.5, "grinder,ashtray", "Grinders & ashtrays")
lamp("lamp_grinders", (-3.9, 8.2, 3.3))

# --- the counter (back right, a quarter circle) --------------------------------------------------------------------------------------------------------
b = B("counter", "Fixtures")
rng = random.Random(38)
CXc, CYc = 4.5, 11.0
Rin, Rout = 2.5, 3.2
N = 44
a_lo, a_hi = PI, 1.5 * PI


def on_arc(r, a, z=0.0):
    return (CXc + r * math.cos(a), CYc + r * math.sin(a), z)


for k in range(N):  # slatted front, each slat turned to the radius
    a = a_lo + (a_hi - a_lo) * (k + 0.5) / N
    w = (Rout * (a_hi - a_lo) / N) * 0.9
    px, py, _ = on_arc(Rout - 0.04, a)
    b.box(px - 0.03, px + 0.03, py - w / 2, py + w / 2, 0.12, 1.02, M["plum"] if k % 2 else M["plum2"], bev=0.008, rot=(0, 0, a))
b.tube([on_arc(Rout - 0.1, a_lo + (a_hi - a_lo) * i / 40, 0.06) for i in range(41)], 0.05, M["black"], 8)
outer = [on_arc(Rout + 0.08, a_lo + (a_hi - a_lo) * i / 30)[:2] for i in range(31)]
inner = [on_arc(Rin - 0.05, a_hi - (a_hi - a_lo) * i / 30)[:2] for i in range(31)]
b.prism_xy(outer + inner, 1.02, 1.07, M["marble"])
b.tube([on_arc(Rout + 0.08, a_lo + (a_hi - a_lo) * i / 40, 1.045) for i in range(41)], 0.014, M["brass"], 6)
b.tube([on_arc(Rout + 0.16, a_lo + (a_hi - a_lo) * i / 40, 0.18) for i in range(41)], 0.022, M["brass"], 8)
for i in range(5):
    a = a_lo + (a_hi - a_lo) * (i + 0.5) / 5
    b.tube([on_arc(Rout - 0.04, a, 0.18), on_arc(Rout + 0.16, a, 0.18)], 0.014, M["brass"], 6)
inner_wall = [on_arc(Rin, a_lo + (a_hi - a_lo) * i / 30)[:2] for i in range(31)] + [on_arc(Rin - 0.05, a_hi - (a_hi - a_lo) * i / 30)[:2] for i in range(31)]
b.prism_xy(inner_wall, 0.0, 1.02, M["black"])
# the till, a card reader, a tip jar, a lighter case and a keychain spinner on top
a = 1.25 * PI
px, py, _ = on_arc(2.85, a)
b.box(px - 0.2, px + 0.2, py - 0.17, py + 0.17, 1.07, 1.14, M["steel"], bev=0.01, rot=(0, 0, a))
b.box(px - 0.01, px + 0.01, py - 0.14, py + 0.14, 1.14, 1.34, M["black"], bev=0.004, rot=(0, 0, a))
px, py, _ = on_arc(3.05, 1.12 * PI)
b.box(px - 0.04, px + 0.04, py - 0.06, py + 0.06, 1.07, 1.12, M["black"], bev=0.008, rot=(0, 0, 1.12 * PI))
px, py, _ = on_arc(2.85, 1.34 * PI)
jar(b, px, py, 1.07, 0.09, 0.2, M["glass"], M["brass"])
a = 1.43 * PI
px, py, _ = on_arc(2.85, a)
b.box(px - 0.3, px + 0.3, py - 0.2, py + 0.2, 1.07, 1.12, M["black"], bev=0.01, rot=(0, 0, a))
b.box(px - 0.3, px + 0.3, py - 0.2, py + 0.2, 1.12, 1.14, M["glass"], rot=(0, 0, a))
for i in range(14):
    lx_, ly_ = (i % 7 - 3) * 0.075, (i // 7 - 0.5) * 0.1
    b.box(px + lx_ * math.cos(a) - ly_ * math.sin(a) - 0.011, px + lx_ * math.cos(a) - ly_ * math.sin(a) + 0.011,
          py + lx_ * math.sin(a) + ly_ * math.cos(a) - 0.007, py + lx_ * math.sin(a) + ly_ * math.cos(a) + 0.007, 1.12, 1.19, rng.choice(PAPER), rot=(0, 0, a))
px, py, _ = on_arc(2.85, 1.12 * PI + 0.0)
px, py, _ = on_arc(2.95, 1.2 * PI)
b.tube([(px, py, 1.07), (px, py, 1.55)], 0.012, M["steel"], 6)
for lvl in range(3):
    for k in range(6):
        aa = k * PI / 3
        b.tube([(px + 0.1 * math.cos(aa), py + 0.1 * math.sin(aa), 1.2 + lvl * 0.14), (px + 0.1 * math.cos(aa), py + 0.1 * math.sin(aa), 1.1 + lvl * 0.14)], 0.003, M["steel"], 4)
        b.ball(px + 0.1 * math.cos(aa), py + 0.1 * math.sin(aa), 1.06 + lvl * 0.14, 0.025, rng.choice(PAPER), u=8, v=6)
# the back bar behind the counter: shelves of lighter refills and a pegboard of keychains
for wall, s0, s1 in (("R", 8.2, 10.9), ("B", 1.9, 4.4)):
    wbox(b, wall, s0, s1, 0, 0.02, 0.95, 3.4, M["plum"])
    for z in (1.35, 1.8, 2.25):
        shelves(b, wall, s0, s1, 0.28, [z])
    for i, z in enumerate((1.385, 1.835, 2.285)):
        shelf_row(b, wall, s0, s1, 0.14, z, ["can", "jar", "can"][i], rng)
    cabinet(b, wall, s0, s1, 0.5, 0.95)
wbox(b, "B", 1.9, 4.4, 0.02, 0.06, 2.55, 3.4, M["plum2"], 0.01)
for k in range(9):
    for rr in range(3):
        xk = 2.0 + k * 0.27
        b.tube([(xk, 10.94, 2.7 + rr * 0.22), (xk, 10.84, 2.7 + rr * 0.22)], 0.004, M["steel"], 4)
        b.tube([(xk, 10.84, 2.7 + rr * 0.22), (xk, 10.84, 2.6 + rr * 0.22)], 0.002, M["steel"], 4)
        b.ball(xk, 10.84, 2.56 + rr * 0.22, 0.03, rng.choice(PAPER), u=8, v=6)
b.build()
cx_, cy_, _ = on_arc(2.85, 1.3 * PI)
hot_c = (cx_, cy_, 1.35)
HOTSPOTS.append(("hot_counter", hot_c, "lighter,lighter-refills,keychain", "Lighters & keychains"))
for i, a in enumerate((1.1 * PI, 1.25 * PI, 1.4 * PI)):
    b2 = B("pendants_counter_%d" % i, "Lights")
    px, py, _ = on_arc(2.8, a)
    pendant(b2, px, py, 2.45, "lamp_counter_%d" % i)
    b2.build()

# --- the right wall units ----------------------------------------------------------------------------------------------------------------------------------
b = B("cubbies_storage", "Fixtures")
rng = random.Random(39)
R0, R1 = 3.3, 5.5
cabinet(b, "R", R0, R1, 0.5, 0.95)
wbox(b, "R", R0, R1, 0, 0.02, 0.95, 3.5, M["black"])
for i in range(5):
    wbox(b, "R", R0 + i * 0.55 - 0.012, R0 + i * 0.55 + 0.012, 0, 0.36, 0.95, 3.45, M["plum"], 0.005)
zs = [1.35, 1.8, 2.25, 2.7, 3.15]
shelves(b, "R", R0, R1, 0.36, zs)
for i, z in enumerate([0.995] + [z + 0.035 for z in zs]):
    shelf_row(b, "R", R0, R1, 0.18, z, ["tin", "jar", "box", "tin", "jar", "box"][i % 6], rng, 0.2)
wbox(b, "R", R0 - 0.04, R1 + 0.04, 0, 0.42, 3.45, 3.57, M["brass"], 0.01)
sign_board(b, 4.4, 4.4, 4.05, "STORAGE", -PI / 2, 1.3, ceil=4.05)
b.build()
hot("hot_storage", "R", 4.4, 0.4, 2.2, "storage,accessory", "Storage & accessories")
lamp("lamp_storage", (4.0, 4.4, 3.3))

b = B("shelves_filters", "Fixtures")
rng = random.Random(40)
F0, F1 = 5.7, 7.4
cabinet(b, "R", F0, F1, 0.5, 0.95)
wbox(b, "R", F0, F1, 0, 0.02, 0.95, 3.2, M["black"])
zs = [1.35, 1.85, 2.35, 2.85]
shelves(b, "R", F0, F1, 0.3, zs)
for i, z in enumerate([0.995] + [z + 0.035 for z in zs]):
    shelf_row(b, "R", F0, F1, 0.15, z, ["bottle", "box", "bottle", "cone", "box"][i], rng, 0.18)
wbox(b, "R", F0 - 0.03, F1 + 0.03, 0, 0.36, 3.2, 3.3, M["brass"], 0.01)
sign_board(b, 4.4, 6.5, 4.0, "FILTERS", -PI / 2, 1.2, ceil=4.0)
b.build()
hot("hot_filters", "R", 6.5, 0.4, 2.2, "filter,cleaning-accessory", "Filters & cleaning")

# --- the entry, frames, fan, plants and lamps ------------------------------------------------------------------------------------------------------------------
b = B("entry_props", "Props")
rng = random.Random(41)
b.lathe([(0, 0), (0.12, 0), (0.13, 0.55), (0.1, 0.56), (0, 0.5)], (-4.15, 0.55, 0), M["steel"], 18)  # umbrella stand
for k in range(3):
    b.tube([(-4.15 + 0.03 * k, 0.55, 0.5), (-4.1 + 0.03 * k, 0.55 + 0.02 * k, 0.95)], 0.012, M["plum"], 6)
plant(b, -4.1, 0.9, 0.0, 1.3, rng)
plant(b, 0.0, 10.55, 0.0, 1.1, rng, False)
b.build()

b = B("pendants_misc", "Lights")
lamp("lamp_entry", (-3.0, 1.9, 2.45))
lamp("lamp_front", (3.3, 3.2, 2.5))
b.build()

exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shop_world.py"), encoding="utf-8").read(), "shop_world.py", "exec"))  # eyes, floaters, gallery, banners
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shop_magic.py"), encoding="utf-8").read(), "shop_magic.py", "exec"))  # portraits, candles, rolling joints, chalkboard
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
camera("cam_03", (-3.0, -0.9, 1.7), (-2.0, 6.0, 2.2))
camera("cam_04", (-1.7, 1.7, 1.65), (0.4, 7.0, 3.1))
camera("cam_05", (0.4, 3.1, 1.65), (0.6, 11.0, 3.9))
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

# --- export ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_cameras=True, export_extras=True, export_apply=True, export_yup=True,
    export_draco_mesh_compression_enable="--nodraco" not in argv, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
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
    which = arg("--shots", "cam_00,cam_02,cam_03,cam_04,cam_05,back,aerial,side").split(",")
    extra = {
        "back": camera("pv_back", (3.4, 1.4, 1.7), (-1.5, 8.0, 1.7)),
        "aerial": camera("pv_aerial", (9, 3.0, 11.0), (-0.5, 5.5, 0.0), 60),
        "side": camera("pv_side", (-10, -8, 3.4), (-1.5, 0, 2.4), 55),
        "counter": camera("pv_counter", (-0.5, 5.8, 1.7), (3.4, 9.2, 1.2), 62),
        "bongs": camera("pv_bongs", (-1.0, 4.0, 1.7), (-4.4, 4.0, 2.0), 60),
        "vault": camera("pv_vault", (0.5, 3.4, 1.7), (0.5, 7.5, 8.0), 70),
        "gallery": camera("pv_gallery", (3.0, 3.6, 1.7), (-4.0, 8.0, 5.0), 65),
        "landing": camera("pv_landing", (-3.6, -13.8, 1.9), (0.0, 0.0, 3.0), 55),
        "portrait": camera("pv_portrait", (2.2, 4.4, 1.9), (4.4, 3.55, 5.0), 55),
        "rolls": camera("pv_rolls", (1.6, 8.4, 1.9), (3.1, 9.9, 1.1), 55),
        "face": camera("pv_face", (0.6, 5.2, 1.7), (0.6, 11.0, 4.6), 60),
    }
    for n in which:
        cam = extra[n] if n in extra else bpy.data.objects[n]
        scene.camera = cam
        scene.render.filepath = os.path.join(os.path.abspath(PREVIEW), f"{n}.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
