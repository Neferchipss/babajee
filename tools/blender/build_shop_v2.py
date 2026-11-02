"""Babajee shop, version 2: the storefront and interior of the pitch video
(babajee-pitch web/assets/entry.mp4) as a model, built beside the rotunda
(build_shop.py) so neither replaces the other.

    blender -b -P tools/blender/build_shop_v2.py -- \
        --out public/models/shop-v2.glb --blend tools/blender/shop_v2.blend --preview tools/blender/preview_v2

The site loads it with ?scene=v2 (remembered until ?scene=v1).

Direction (from the video): a single-storey neighbourhood shop on a quiet
night street. Slate-grey walls with sage-green swirl murals, a sage awning,
purple signs with cream lettering, warm light from two display windows.
Inside: a narrow, deep room, dark walnut shelving floor to ceiling with warm
strips under every shelf, charcoal walls, a pale floor and a purple rug, the
"baBa jEE" plaque over a counter at the back with category cubbies in front.

Same contract as build_shop.py (Blender Z-up, metres; the facade's face is at
y = 0, the street on -y, the room on +y):
  cam_00 .. cam_05   the scroll path: pavement -> door -> the middle of the room
  door_leaf          origin on its hinge; exported swung open (0 = shut)
  hot_*              one per fixture; extras.categories = slug, extras.label
  lamp_*             where lights go; extras.kind is street | shop | window
  room_v2            the room's floor: the site takes the room's middle from it
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shoplib  # noqa: E402
from shoplib import B, empty, font, mat  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = os.path.abspath(arg("--out", "public/models/shop-v2.glb"))
BLEND = arg("--blend")
PREVIEW = arg("--preview")

bpy.ops.wm.read_factory_settings(use_empty=True)
shoplib.scene = scene = bpy.context.scene
PI = math.pi

# --- materials (m_v2_* are the texture slots, see shop-textures.ts) ------------------------
M = dict(
    pave=mat("v2_pave", "#5e5b56", 0.8),
    pave2=mat("v2_pave_dark", "#4d4a46", 0.8),
    kerb=mat("v2_kerb", "#6d6a64", 0.75),
    road=mat("v2_road", "#1c1d20", 0.4),
    slate=mat("v2_slate", "#4a4e54", 0.9),
    slate_dk=mat("v2_slate_dark", "#383b40", 0.9),
    swirl=mat("v2_swirl", "#8fa48c", 0.85),
    swirl_dk=mat("v2_swirl_dark", "#6e8270", 0.85),
    awning=mat("v2_awning", "#5f7a5e", 0.9),
    awning_lt=mat("v2_awning_light", "#a9bf9f", 0.9),
    frame=mat("v2_frame", "#2a2c30", 0.5, 0.4),
    purple=mat("v2_purple", "#5a2f86", 0.6),
    purple_dk=mat("v2_purple_dark", "#3e1f61", 0.6),
    cream=mat("v2_cream", "#efe4cf", 0.6),
    cream_lit=mat("v2_cream_lit", "#f3e6cc", 0.5, 0.0, 1.0, 0.6),
    sign_green=mat("v2_sign_green", "#2f4a3c", 0.6),
    walnut=mat("v2_walnut", "#4a2d1c", 0.55),
    walnut_dk=mat("v2_walnut_dark", "#2e1c12", 0.6),
    wall_in=mat("v2_wall_in", "#2c2c30", 0.9),
    wall_swirl=mat("v2_wall_swirl", "#3a3b40", 0.9),
    floor=mat("v2_floor", "#b9b2a6", 0.5),
    rug=mat("v2_rug", "#4a3560", 0.95),
    rug_lt=mat("v2_rug_light", "#4e4458", 0.95),
    ceiling=mat("v2_ceiling", "#3a2a1e", 0.8),  # dark boards (shop-textures.ts lays walnut on it)
    led_back=mat("v2_led_back", "#ffa860", 0.4, 0.0, 1.0, 0.9),  # the thin strip along the back of each shelf: seen, but quiet
    shade_in=mat("v2_shade_in", "#ffd9a8", 0.6, 0.0, 1.0, 0.8),  # the inside of a pendant's shade, lit by its bulb
    downlight=mat("v2_downlight", "#ffe2b8", 0.4, 0.0, 1.0, 0.6),  # a soft disc, not a white spot
    led=mat("v2_led", "#ffb26a", 0.4, 0.0, 1.0, 2.4),  # under each shelf's front edge: the pitch's main light
    bulb=mat("v2_bulb", "#ffdcaa", 0.4, 0.0, 1.0, 6.0),
    glow=mat("window_glow", "#ffb35a", 0.5, 0.0, 1.0, 1.6),
    flame=mat("flame", "#ffb347", 0.4, 0.0, 1.0, 5.0),
    wax=mat("v2_wax", "#efe3c8", 0.6),
    black=mat("black", "#0b0b0c", 0.5),
    ink=mat("v2_ink", "#111012", 0.7),
    plaque=mat("v2_plaque", "#050505", 0.95),
    steel=mat("steel", "#2c2e33", 0.4, 0.85),
    brass=mat("brass", "#c0903d", 0.32, 1.0),
    glass=mat("glass", "#cfe8f0", 0.05, 0.0, 0.16),
    glass_flat=mat("glass_flat", "#cfe8f0", 0.05, 0.0, 0.16),
    g_amber=mat("glass_amber", "#d9972a", 0.05, 0.0, 0.5),
    g_green=mat("glass_green", "#2fbf6a", 0.05, 0.0, 0.5),
    g_blue=mat("glass_blue", "#2f7fbf", 0.05, 0.0, 0.5),
    g_purple=mat("glass_purple", "#7b3fbf", 0.05, 0.0, 0.5),
    leaf=mat("leaf", "#3f7a45", 0.55),
    leaf2=mat("leaf_dark", "#2a5634", 0.55),
    leaf3=mat("leaf_light", "#5e9a4e", 0.5),
    stem=mat("stem", "#4d6b36", 0.7),
    pot=mat("v2_pot", "#a0603e", 0.85),  # terracotta (textured on the site)
    pot_glaze=mat("v2_pot_glaze", "#2a2b2e", 0.5),  # charcoal-glazed stoneware, indoors
    soil=mat("v2_soil", "#241a12", 0.95),
    tee_a=mat("v2_tee_a", "#1d1d22", 0.95),
    tee_b=mat("v2_tee_b", "#4a5232", 0.95),
    tee_c=mat("v2_tee_c", "#3b2a4f", 0.95),
    screen=mat("v2_screen", "#1a2a33", 0.3, 0.0, 1.0, 0.4),
    box_red=mat("v2_box_red", "#7a1f2a", 0.6),
    box_blue=mat("v2_box_blue", "#22487a", 0.6),
    backdrop=mat("v2_backdrop", "#3a3d40", 0.9),  # the plain wall the shop stands out from
    oak=mat("v2_oak", "#7a5a3a", 0.55),  # lighter uprights against the dark shelves
    cap=mat("v2_cap", "#8a8780", 0.85),  # the parapet's pale concrete cap
    # pictures laid on by texture coordinates (shop-textures.ts LAID), made with ChatGPT
    decal_good=mat("decal_good", "#efe4cf", 0.8),
    decal_roll=mat("decal_roll", "#efe4cf", 0.8),
    decal_lit=mat("decal_lit", "#efe4cf", 0.8),
    decal_swirl=mat("decal_swirl", "#8fa48c", 0.85),
    decal_logo=mat("decal_logo", "#efe4cf", 0.8),
    door_glass=mat("v2_door_glass", "#2e2a24", 0.15, 0.0, 1.0, 0.45),  # dark glass with the shop's warm light behind it, not a hole
)
LEAVES = [M["leaf"], M["leaf2"], M["leaf3"]]
PACKS = [mat(f"v2_pack_{n}", c, 0.7) for n, c in enumerate(["#8c3a34", "#b08c46", "#4a7a52", "#d2c8b2", "#3e5f84", "#5e4682", "#9a6038"])]
GLASSES = [M["glass"], M["g_amber"], M["g_green"], M["g_blue"], M["g_purple"], M["g_green"], M["g_amber"], M["g_blue"]]
TINS = [M["steel"], M["purple"], M["sign_green"], M["box_red"], M["black"], M["brass"]]
FONT = font("COOPBL.TTF", "BAUHS93.TTF", "impact.ttf")  # the signs: round, chunky, hand-painted
FONT2 = font("arialbd.ttf", "ARLRDBD.TTF")  # (Segoe UI Bold's S fills wrong in Blender: it shows as a colon)  # small print: labels, window lettering

HOTSPOTS = []  # (name, loc, slug, label)
LAMPS = []  # (name, loc, kind)
GLOWS = []  # (box x0 y0 z0 x1 y1 z1, floor, strips): shelf light, see shop-glow.ts
SPOTS = []  # (name, loc, aim, kind): real spotlights, see ShopScene (v2)


def glow(x0, x1, y0, y1, floor, strips, top):
    """One lit shelving unit for the site's shelf light: its box, the height of its
    lowest shelf, and the undersides its warm strips hang from, lowest first."""
    GLOWS.append(((min(x0, x1), min(y0, y1), floor - 0.02, max(x0, x1), max(y0, y1), top), floor, strips))


def lamp(name, loc, kind="shop"):
    LAMPS.append((name, loc, kind))


def hot(slug, loc, label):
    HOTSPOTS.append((f"hot_{slug.replace('-', '_')}", loc, slug, label))


# --- small shapes ---------------------------------------------------------------------------

def decal(name, m, cx, y, cz, w, h, face=-1):
    """A picture flat on a wall facing -y (face=-1) or +y, as its own object: the bake
    leaves it out of the light it renders and gives it the light of the wall behind
    (bake_shop_v2.py), so its see-through parts do not shade the wall."""
    d = B("decal_" + name, "Exterior")
    x0, x1 = (cx - w / 2, cx + w / 2) if face < 0 else (cx + w / 2, cx - w / 2)
    d.sheet([[(x0, y, cz - h / 2), (x1, y, cz - h / 2)], [(x0, y, cz + h / 2), (x1, y, cz + h / 2)]], m, uv=True)
    return d.build()


def bong(b, x, y, z, rng, h=None, gm=None):
    h = h or rng.uniform(0.26, 0.46)
    gm = gm or rng.choice(GLASSES)
    if rng.random() < 0.5:  # beaker
        pr = [(0, 0), (0.07, 0), (0.095, 0.012), (0.1, 0.06), (0.085, 0.15), (0.05, 0.22), (0.03, 0.28), (0.028, h * 0.8), (0.036, h * 0.9), (0.036, h), (0, h)]
    else:  # straight
        pr = [(0, 0), (0.045, 0), (0.055, 0.015), (0.04, 0.06), (0.032, 0.12), (0.03, h * 0.85), (0.037, h * 0.93), (0.037, h), (0, h)]
    b.lathe(pr, (x, y, z), gm, seg=12)
    b.tube([(x, y, z + 0.08), (x + 0.04, y, z + 0.12), (x + 0.08, y, z + 0.19)], 0.011, M["glass"], 6)


def hookah(b, x, y, z, rng):
    gm = rng.choice(GLASSES[1:])
    b.lathe([(0, 0), (0.09, 0), (0.11, 0.06), (0.1, 0.13), (0.05, 0.19), (0, 0.19)], (x, y, z), gm, seg=14)
    b.lathe([(0, 0.19), (0.018, 0.19), (0.014, 0.5), (0.03, 0.52), (0.012, 0.55), (0.012, 0.6), (0, 0.6)], (x, y, z), M["brass"], seg=10)
    b.lathe([(0, 0.6), (0.045, 0.6), (0.05, 0.64), (0, 0.66)], (x, y, z), M["ink"], seg=10)
    b.tube([(x, y, z + 0.4), (x + 0.12, y, z + 0.32), (x + 0.16, y, z + 0.12)], 0.009, M["ink"], 6)


def jar(b, x, y, z, r, h, body, lid):
    b.lathe([(0, 0), (r * 0.9, 0), (r, 0.01), (r, h * 0.82), (r * 0.85, h * 0.86), (0, h * 0.86)], (x, y, z), body, seg=12)
    b.lathe([(0, h * 0.84), (r * 0.9, h * 0.84), (r * 0.9, h * 0.96), (r * 0.7, h), (0, h)], (x, y, z), lid, seg=12)


def grinder(b, x, y, z, r, m):
    h = r * 0.9
    b.lathe([(0, 0), (r, 0), (r, h * 0.35), (r * 1.03, h * 0.37), (r * 1.03, h * 0.66), (r, h * 0.68), (r, h * 0.95), (r * 0.9, h), (0, h)], (x, y, z), m, seg=14)


def dish(b, x, y, z, r, m):
    b.lathe([(0, 0), (r * 0.9, 0), (r, 0.012), (r * 1.02, 0.03), (r * 0.9, 0.034), (r * 0.8, 0.02), (0, 0.016)], (x, y, z), m, 14)


def candle(b, x, y, z, h=0.08, r=0.035):
    b.cyl(x, y, z + h / 2, r, r, h, M["wax"], seg=10)
    b.ball(x, y, z + h + 0.022, 0.011, M["flame"], scale=(1, 1, 2.0), u=6, v=4)


# --- plants: real leaves (curved, folded at the midrib, both sides) on stems, in pots -------
# A leaf is a 9 x 5 sheet: its width follows its shape along it, it folds up either side
# of the midrib and droops under its own weight. `keep(p)` (if given) says where a plant
# may reach: a leaf with any point outside it is not grown, so nothing goes through a shelf.


def leaf(b, base, yaw, pitch, length, width, rng, shape="heart", droop=0.3, fold=0.3, keep=None, m=None):
    base = Vector(base)
    f = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    sd = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
    up = sd.cross(f).normalized()
    twist = rng.uniform(-0.25, 0.25)
    rows = []
    for i in range(9):
        t = i / 8
        if shape == "heart":  # broad near the stem, a pointed tip
            w = width * (math.sin(math.pi * min(1.0, t * 1.25 + 0.05)) ** 0.6) * (1 - 0.55 * t * t)
        elif shape == "sword":  # long, even, a sharp tip
            w = width * (1 - t ** 4) * (0.75 + 0.25 * math.sin(math.pi * t))
        else:  # oval
            w = width * math.sin(math.pi * t) ** 0.8
        w = max(w, 0.0004)
        s2 = (sd * math.cos(twist * t) + up * math.sin(twist * t))
        row = []
        for j in range(5):
            u = j / 4 * 2 - 1
            p = base + f * (length * t) + s2 * (u * w) + up * (fold * w * abs(u)) + Vector((0, 0, -droop * length * t * t))
            if keep and not keep(p):
                return False
            row.append(p)
        rows.append(row)
    m = m or rng.choice(LEAVES)
    b.sheet(rows, m, uv=True)  # the leaf picture laid along it, midrib down the middle (shop-textures.ts)
    b.sheet([[p - up * 0.0015 for p in row] for row in rows], m, flip=True, uv=True)
    return True


def pot(b, x, y, z, r, h, m=None):
    """A planter: tapered, a rolled rim, soil sitting a little below it."""
    m = m or M["pot"]
    b.lathe([(0, 0), (r * 0.7, 0), (r * 0.74, 0.012), (r, h * 0.9), (r * 1.07, h * 0.92), (r * 1.08, h), (r * 0.98, h),
             (r * 0.95, h * 0.9), (r * 0.9, h * 0.86), (0, h * 0.86)], (x, y, z), m, seg=40)
    b.cyl(x, y, z + h * 0.86, r * 0.92, r * 0.92, 0.012, M["soil"], seg=40)
    return z + h * 0.87


def bush(b, x, y, z, size, rng, n=22, keep=None):
    """A leafy pot plant: heart-shaped leaves on arching stems from the soil."""
    grown = tries = 0
    while grown < n and tries < n * 8:
        tries += 1
        yaw = rng.uniform(0, 2 * PI)
        reach = size * rng.uniform(0.25, 0.75)
        rise = size * rng.uniform(0.35, 1.0)
        b0 = Vector((x + rng.uniform(-0.02, 0.02), y + rng.uniform(-0.02, 0.02), z))
        tip = b0 + Vector((math.cos(yaw) * reach, math.sin(yaw) * reach, rise))
        mid = b0.lerp(tip, 0.5) + Vector((0, 0, rise * 0.25))
        ln = size * rng.uniform(0.32, 0.5)
        if keep and not (keep(tip) and keep(mid)):
            continue
        if leaf(b, tip, yaw + rng.uniform(-0.5, 0.5), rng.uniform(-0.35, 0.45), ln, ln * 0.42, rng, "heart", 0.35, 0.3, keep):
            b.tube([tuple(b0), tuple(mid), tuple(tip)], 0.0045, M["stem"], 6)
            grown += 1


def snake_plant(b, x, y, z, h, rng, n=14, keep=None):
    """Upright sword leaves, as a sansevieria: a few lean out, all of them stiff."""
    for k in range(n):
        yaw = 2 * PI * k / n + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(1.15, 1.5)
        b0 = (x + math.cos(yaw) * 0.03, y + math.sin(yaw) * 0.03, z - 0.01)
        leaf(b, b0, yaw, lean, h * rng.uniform(0.55, 1.0), rng.uniform(0.028, 0.04), rng, "sword", 0.04, 0.18, keep)


def trailing(b, pts, rng, n=12, size=0.06, keep=None):
    """A trailing pothos: a stem down a path, small heart leaves either side of it."""
    path = [Vector(p) for p in pts]
    b.tube([tuple(p) for p in path], 0.004, M["stem"], 6)
    for k in range(n):
        t = (k + 0.5) / n
        i = min(len(path) - 2, int(t * (len(path) - 1)))
        f = t * (len(path) - 1) - i
        p = path[i].lerp(path[i + 1], f)
        yaw = rng.uniform(0, 2 * PI)
        ln = size * rng.uniform(0.8, 1.25)
        leaf(b, p, yaw, rng.uniform(-0.9, 0.1), ln, ln * 0.45, rng, "heart", 0.25, 0.3, keep)


def swirl_path(cx, cz, s, rng, turns=1.2):
    """A painted swirl in a wall's own plane (u along the wall, v up): an S that
    curls into a spiral at one end, like the murals in the video."""
    pts = []
    a0 = rng.uniform(0, 2 * PI)
    n = 22
    # the tail: a lazy S
    for i in range(n):
        t = i / (n - 1)
        pts.append((cx - s * 1.6 + s * 1.6 * t, cz + s * 0.45 * math.sin(t * PI * 1.3 + a0)))
    # the curl: a spiral winding inwards
    ex, ez = pts[-1]
    r0 = s * 0.55
    m = 26
    for i in range(1, m):
        t = i / (m - 1)
        a = -PI / 2 + t * turns * 2 * PI
        r = r0 * (1 - 0.8 * t)
        pts.append((ex + r0 * 0.0 + r * math.cos(a) - 0, ez + r0 + r * math.sin(a)))
    return pts


def mural(b, plane, area, n, rng, m, r=0.05, scale=(0.35, 0.7)):
    """Swirls laid on a wall. plane = ('y', y0, facing) or ('x', x0, facing):
    the wall's fixed coordinate and which way its face looks (-1 / +1)."""
    axis, w0, face = plane
    u0, u1, v0, v1 = area
    for _ in range(n):
        s = rng.uniform(*scale)
        cu = rng.uniform(u0 + s * 1.2, u1 - s * 0.6)
        cv = rng.uniform(v0 + s * 0.6, v1 - s * 1.2)
        path = swirl_path(cu, cv, s, rng)
        path = [(u, v) for u, v in path if u0 <= u <= u1 and v0 <= v <= v1]
        if len(path) < 4:
            continue
        rr = [1.7 * r * (0.35 + 0.65 * math.sin(PI * (i + 1) / (len(path) + 1)) ** 0.6) * (s / 0.5) for i in range(len(path))]
        # sunk into the wall so only a sliver shows: a flat band of paint, soft at the edges
        pts = [(u, w0 - face * rr[i] * 0.6, v) if axis == "y" else (w0 - face * rr[i] * 0.6, u, v) for i, (u, v) in enumerate(path)]
        b.tube(pts, rr, m, 7)


def roundel(b, at, r, lines, face="y-", size=0.17, m=None, txt=None):
    """A round purple sign with cream lettering, flat on a wall."""
    x, y, z = at
    if face == "y-":
        b.cyl(x, y - 0.01, z, r * 1.07, r * 1.07, 0.02, M["cream"], seg=32, rot=(PI / 2, 0, 0))
        b.cyl(x, y - 0.03, z, r, r, 0.024, m or M["purple"], seg=32, rot=(PI / 2, 0, 0))
        n = len(lines)
        for i, ln in enumerate(lines):
            b.text(ln, (x, y - 0.05, z + (n - 1) * size * 0.5 - i * size), size, txt or M["cream"], extrude=0.006, fnt=FONT)


# =============================================================================================
# the street
# =============================================================================================
rng = random.Random(11)
b = B("v2_street", "Exterior")
# one slab of pavement: its slabs and joints are the texture (v2_pavement, 1.1 m slabs)
# a shallow pavement, as in the pitch: a strip in front of the shop, the kerb, then the road
b.box(-17.6, 15.4, -2.3, 1.65, -0.3, 0.0, M["pave"])  # back to the backdrop wall
b.box(-18, 16, -2.6, -2.3, -0.3, 0.0, M["kerb"], bev=0.03)
b.box(-18, 16, -14, -2.6, -0.4, -0.16, M["road"])
b.build()

# the wall the shop stands out from: tall, plain and dark, set well back so the shop reads
# as a box of its own; a few loose swirls drift off the shop to the left, as in the pitch
WY = 1.6  # its face
b = B("v2_backwall", "Exterior")
b.box(-18, -3.4, WY, WY + 0.4, 0.0, 11.0, M["backdrop"])
b.box(3.4, 16, WY, WY + 0.4, 0.0, 11.0, M["backdrop"])
b.box(-3.4, 3.4, WY, WY + 0.4, 5.6, 11.0, M["backdrop"])  # above the shop
b.box(-18, -3.4, WY - 0.05, WY, 0.0, 0.3, M["slate_dk"])  # a plinth line along the foot
b.box(3.4, 16, WY - 0.05, WY, 0.0, 0.3, M["slate_dk"])
b.lathe([(0, 0), (0.15, 0), (0.15, 0.02), (0, 0.02)], (-4.6, WY - 0.02, 1.05), M["swirl"], 20, rot=(PI / 2, 0, 0))  # a little smiley
for sx in (-0.05, 0.05):
    b.ball(-4.6 + sx, WY - 0.04, 1.09, 0.015, M["slate_dk"], u=6, v=4)
b.tube([(-4.68, WY - 0.04, 1.01), (-4.6, WY - 0.04, 0.98), (-4.52, WY - 0.04, 1.01)], 0.01, M["slate_dk"], 5)
b.build()
decal("swirl", M["decal_swirl"], -6.4, WY - 0.004, 2.0, 6.4, 3.2)  # loose painted swirls, low and drifting left
decal("lit", M["decal_lit"], -4.75, WY - 0.008, 2.0, 1.45, 1.45)  # KEEP IT LIT, painted on

# =============================================================================================
# the shop front: 6.8 m wide, stepped out from the wall; door just right of centre
# =============================================================================================
FX0, FX1 = -3.4, 3.4
DX0, DX1 = -0.5, 0.6  # the door's opening
LW = (-3.0, -0.8)  # left window
RW = (0.85, 3.05)  # right window
WZ = (0.6, 2.55)  # window sill and head

b = B("v2_facade", "Exterior")
# solid wall above the windows, the piers between them, the plinth below
b.box(FX0, FX1, 0.0, 0.25, 2.75, 5.2, M["slate"])
b.box(FX0, LW[0], 0.0, 0.25, 0.0, 2.75, M["slate"])
b.box(LW[1], DX0, 0.0, 0.25, 0.0, 2.75, M["slate"])
b.box(DX1, RW[0], 0.0, 0.25, 0.0, 2.75, M["slate"])
b.box(RW[1], FX1, 0.0, 0.25, 0.0, 2.75, M["slate"])
b.box(LW[0], LW[1], 0.0, 0.25, 0.0, WZ[0], M["slate"])
b.box(RW[0], RW[1], 0.0, 0.25, 0.0, WZ[0], M["slate"])
b.box(DX0, DX1, 0.0, 0.25, 2.4, 2.75, M["slate"])
# the sides of the bay, back to the wall
for x0, x1 in ((FX0, FX0 + 0.25), (FX1 - 0.25, FX1)):
    b.box(x0, x1, 0.0, WY, 0.0, 5.2, M["slate"])
# cornice, parapet and its pale cap
b.box(FX0 - 0.08, FX1 + 0.08, -0.12, WY, 5.2, 5.36, M["slate_dk"], bev=0.02)
b.box(FX0 - 0.03, FX1 + 0.03, -0.05, WY, 5.36, 5.5, M["slate"], bev=0.015)
b.box(FX0 - 0.22, FX1 + 0.22, -0.4, WY, 5.5, 5.74, M["cap"], bev=0.025)  # a heavy roof slab, overhanging
# a step at the door
b.box(DX0 - 0.15, DX1 + 0.15, -0.35, 0.25, 0.0, 0.12, M["kerb"], bev=0.02)
# (the swirls are painted on: the v2_slate_mural texture)
# (the painted lettering up top is a picture each: see the decals after this)
# a vent, top right
b.box(2.85, 3.2, -0.04, 0.0, 4.75, 5.05, M["frame"], bev=0.01)
for k in range(5):
    b.box(2.88, 3.17, -0.07, -0.03, 4.79 + k * 0.05, 4.81 + k * 0.05, M["slate_dk"])
b.build()
decal("good", M["decal_good"], -2.45, -0.006, 4.25, 1.4, 1.4)
decal("roll", M["decal_roll"], 1.95, -0.006, 4.2, 1.5, 1.5)

# window and door frames, glass, lettering
b = B("v2_shopfront", "Exterior")
for x0, x1 in (LW, RW):
    t = 0.07
    b.box(x0, x1, -0.05, 0.05, WZ[0] - t, WZ[0], M["frame"], bev=0.01)
    b.box(x0, x1, -0.05, 0.05, WZ[1], WZ[1] + t, M["frame"], bev=0.01)
    b.box(x0, x0 + t, -0.05, 0.05, WZ[0], WZ[1], M["frame"], bev=0.01)
    b.box(x1 - t, x1, -0.05, 0.05, WZ[0], WZ[1], M["frame"], bev=0.01)
    b.box(x0 + t, x1 - t, -0.01, 0.01, WZ[0], WZ[1], M["glass_flat"])
for x0, x1 in ((DX0 - 0.06, DX0), (DX1, DX1 + 0.06)):
    b.box(x0, x1, -0.05, 0.05, 0.12, 2.46, M["frame"], bev=0.01)
b.box(DX0 - 0.06, DX1 + 0.06, -0.05, 0.05, 2.4, 2.46, M["frame"], bev=0.01)
# "GOOD TOBACCO ~ GOOD COMPANY" on a dark band across the head of the left window
b.box(LW[0] + 0.07, LW[1] - 0.07, -0.02, 0.0, 2.24, 2.48, M["ink"])
b.text("GOOD TOBACCO ~ GOOD COMPANY", ((LW[0] + LW[1]) / 2, -0.03, 2.36), 0.11, M["cream_lit"], extrude=0.004, fnt=FONT2)
# purple lettering on the right window
for i, w in enumerate(["PAPERS", "FILTERS", "TIPS", "GRINDERS", "TRAYS", "& MORE"]):
    b.text(w, (RW[1] - 0.42, -0.03, 2.3 - i * 0.16), 0.12, M["purple"], extrude=0.004, fnt=FONT)
b.build()

# the window displays: shallow lit boxes behind the glass
rng = random.Random(31)
b = B("v2_windows", "Exterior")
for side, (x0, x1) in (("L", LW), ("R", RW)):
    b.box(x0, x1, 0.25, 0.95, WZ[0] - 0.1, WZ[0], M["walnut"])  # floor of the display
    b.box(x0, x1, 0.9, 0.95, WZ[0], WZ[1], M["walnut_dk"])  # back panel
    b.box(x0, x1, 0.25, 0.95, WZ[1], WZ[1] + 0.05, M["walnut_dk"])  # ceiling
    for xx in (x0, x1 - 0.04):
        b.box(xx, xx + 0.04, 0.25, 0.95, WZ[0], WZ[1], M["walnut_dk"])
    for z in (1.35, 1.95):
        b.box(x0 + 0.04, x1 - 0.04, 0.45, 0.9, z, z + 0.03, M["walnut"], bev=0.004)
        b.box(x0 + 0.04, x1 - 0.04, 0.45, 0.47, z - 0.015, z, M["led"])
    if side == "L":  # boxes of rolling papers up front, candles, more stock behind
        for k, xx in enumerate((-2.75, -2.3, -1.85, -1.4)):
            b.box(xx - 0.19, xx + 0.19, 0.45, 0.7, 1.38, 1.78, PACKS[[0, 5, 0, 2][k]], bev=0.01)
            b.text("Rolling", (xx, 0.445, 1.62), 0.06, M["cream"], extrude=0.003, fnt=FONT)
            b.text("Papers", (xx, 0.445, 1.54), 0.06, M["cream"], extrude=0.003, fnt=FONT)
        for n, xx in enumerate((-2.8, -1.1, -1.55)):
            candle(b, xx, 0.42 if n < 2 else 0.5, WZ[0], 0.1 if n < 2 else 0.07, 0.05)
            lamp(f"lamp_candle_l{n}", (xx, 0.42 if n < 2 else 0.5, WZ[0] + 0.16), "vcandle")
        # a lantern on the floor of the display, and more stock
        lx = -2.15
        b.box(lx - 0.09, lx + 0.09, 0.47, 0.65, WZ[0], WZ[0] + 0.02, M["frame"])
        b.box(lx - 0.09, lx + 0.09, 0.47, 0.65, WZ[0] + 0.24, WZ[0] + 0.27, M["frame"])
        for cx_, cy_ in ((lx - 0.085, 0.475), (lx + 0.085, 0.475), (lx - 0.085, 0.645), (lx + 0.085, 0.645)):
            b.box(cx_ - 0.006, cx_ + 0.006, cy_ - 0.006, cy_ + 0.006, WZ[0], WZ[0] + 0.25, M["frame"])
        b.tube([(lx - 0.04, 0.56, WZ[0] + 0.27), (lx, 0.56, WZ[0] + 0.33), (lx + 0.04, 0.56, WZ[0] + 0.27)], 0.006, M["frame"], 5)
        candle(b, lx, 0.56, WZ[0] + 0.02, 0.08, 0.035)
        lamp("lamp_candle_l3", (lx, 0.56, WZ[0] + 0.15), "vcandle")
        for k, xx in enumerate((-2.55, -1.82, -1.32)):
            b.box(xx - 0.13, xx + 0.13, 0.62, 0.85, WZ[0], WZ[0] + rng.uniform(0.14, 0.22), PACKS[[0, 5, 2][k]], bev=0.01)
        for k in range(10):
            jar(b, -2.88 + k * 0.215, 0.62 + (k % 2) * 0.14, 1.98, 0.04, rng.uniform(0.1, 0.15), rng.choice(GLASSES), rng.choice(TINS))
        lamp("lamp_window_a", (-1.9, 0.55, 2.25), "vwindow")
        glow(x0, x1, 0.25, 0.95, WZ[0], [1.335, 1.935, WZ[1]], WZ[1])
    else:  # glass: bongs on the shelves and the floor, tins and jars
        for k in range(7):
            bong(b, 1.1 + k * 0.29, 0.62 + rng.uniform(-0.05, 0.08), WZ[0], rng, h=rng.uniform(0.45, 0.65))
        for k in range(8):
            bong(b, 1.05 + k * 0.26, 0.7, 1.38, rng, h=rng.uniform(0.25, 0.4))
        for k in range(9):
            jar(b, 1.05 + k * 0.23, 0.7, 1.98, 0.045, 0.14, rng.choice(GLASSES), rng.choice(TINS))
        for n, xx in enumerate((1.05, 2.9)):
            candle(b, xx, 0.42, WZ[0], 0.09, 0.045)
            lamp(f"lamp_candle_r{n}", (xx, 0.42, WZ[0] + 0.15), "vcandle")
        lamp("lamp_window_b", (1.95, 0.55, 2.25), "vwindow")
        glow(x0, x1, 0.25, 0.95, WZ[0], [1.335, 1.935, WZ[1]], WZ[1])
b.build()
# the facade is lit only by its windows and a far street lamp: cool and dim, as in the video
lamp("lamp_street", (-8.0, -7.0, 5.5), "vstreet")

# the awning: sage canvas sloping out over the windows, lighter swirls painted on
b = B("v2_awning", "Exterior")
A = 0.55  # slope, radians
AY, AZ, AL = -0.6, 3.05, 1.35  # the middle of the canvas and its length out
b.box(FX0 - 0.06, FX1 + 0.06, AY - AL / 2, AY + AL / 2, AZ - 0.03, AZ + 0.03, M["awning"], rot=(A, 0, 0))
y_front = AY - AL / 2 * math.cos(A)
z_front = AZ - AL / 2 * math.sin(A)
b.box(FX0 - 0.06, FX1 + 0.06, y_front - 0.04, y_front, z_front - 0.3, z_front + 0.02, M["awning"], bev=0.01)
for sx in (FX0 + 0.08, FX1 - 0.08):  # end caps
    b.box(sx - 0.03, sx + 0.03, y_front, 0.0, z_front - 0.02, z_front + 0.05, M["frame"])
# (its swirls are printed on: the v2_awning texture)
for x in (FX0 + 0.1, FX1 - 0.1):  # the arms back to the wall
    b.tube([(x, y_front + 0.05, z_front + 0.03), (x, -0.02, z_front + 0.65)], 0.015, M["frame"], 6)
b.build()

# the hanging sign at the left corner: a purple board with a curl of smoke, facing the street
b = B("v2_blade", "Exterior")
SX = FX0 - 0.45
b.tube([(FX0, -0.05, 4.95), (SX - 0.4, -0.35, 4.95)], 0.02, M["frame"], 6)
b.tube([(FX0, -0.05, 4.55), (SX - 0.1, -0.35, 4.95)], 0.012, M["frame"], 6)
for xx in (SX - 0.3, SX + 0.3):
    b.tube([(xx, -0.35, 4.95), (xx, -0.35, 4.86)], 0.008, M["frame"], 5)
b.box(SX - 0.44, SX + 0.44, -0.39, -0.31, 3.5, 4.87, M["ink"], bev=0.01)
b.box(SX - 0.39, SX + 0.39, -0.405, -0.3, 3.55, 4.82, M["purple"], bev=0.01)
for k, (ox, amp, ph) in enumerate(((0.0, 0.11, 0.0), (-0.09, 0.07, 1.4), (0.09, 0.06, 2.6))):  # a flame of smoke, three strands
    pts = [(SX + ox * (1 - t) + amp * math.sin(t * 4.6 + ph) * (1 - t * 0.4), -0.42, 3.7 + (0.95 - k * 0.15) * t) for t in [i / 18 for i in range(19)]]
    b.tube(pts, [(0.05 - k * 0.012) * (1 - t * 0.85) for t in [i / 18 for i in range(19)]], M["cream_lit"], 6)
b.build()

# the door: dark metal frame round a big pane, "OPEN" hanging, a purple roundel on the glass
d = B("door_leaf", "Exterior")
W, H = DX1 - DX0, 2.28
for x0, x1, z0, z1 in [(0, 0.07, 0, H), (W - 0.07, W, 0, H), (0, W, 0, 0.12), (0, W, H - 0.07, H)]:
    d.box(x0, x1, -0.03, 0.03, z0, z1, M["frame"], bev=0.008)
d.box(0.07, W - 0.07, -0.008, 0.008, 0.12, H - 0.07, M["door_glass"])
d.tube([(0.1, -0.06, 0.95), (0.1, -0.06, 1.25)], 0.012, M["steel"], 6)
d.tube([(0.24, -0.02, 1.95), (W / 2, -0.02, 2.12), (W - 0.24, -0.02, 1.95)], 0.004, M["ink"], 4)
d.box(0.27, W - 0.27, -0.035, -0.02, 1.7, 1.95, M["sign_green"], bev=0.008)
d.text("OPEN", (W / 2, -0.04, 1.825), 0.13, M["cream"], extrude=0.004, fnt=FONT2)
d.cyl(W / 2, -0.015, 0.75, 0.3, 0.3, 0.012, M["purple"], seg=28, rot=(PI / 2, 0, 0))
for i, ln in enumerate(["ROLL", "RELAX", "REPEAT"]):
    d.text(ln, (W / 2, -0.025, 0.86 - i * 0.11), 0.085, M["cream"], extrude=0.003, fnt=FONT)
door = d.build(loc=(DX0, 0.12, 0.12))
door.rotation_euler = (0, 0, math.radians(100))  # exported open; 0 = shut

# out front: plants either side, an A-board on the pavement, a vine off the corner
rng = random.Random(51)
b = B("v2_frontage", "Exterior")
def street(p):  # in front of the wall, above the pavement
    return p.y < -0.03 and p.z > 0.02


bush(b, -3.0, -0.5, pot(b, -3.0, -0.5, 0.0, 0.2, 0.36, M["pot_glaze"]), 0.6, rng, n=36, keep=street)
snake_plant(b, 3.95, -0.6, pot(b, 3.95, -0.6, 0.0, 0.28, 0.52, M["pot_glaze"]), 1.25, rng, n=24, keep=street)
# a hanging pothos spilling off the top right corner, from a pot on a bracket
hx = FX1 - 0.35
b.box(hx - 0.02, hx + 0.02, -0.25, 0.0, 5.06, 5.1, M["frame"])
top = pot(b, hx, -0.2, 5.1, 0.13, 0.2)
bush(b, hx, -0.2, top, 0.3, rng, n=14, keep=street)
for i in range(9):
    x = hx + rng.uniform(-0.15, 0.15)
    y = -0.2 + rng.uniform(-0.08, 0.05)
    trailing(b, [(x, y, top), (x + rng.uniform(-0.1, 0.1), y - 0.08, top - 0.6), (x + rng.uniform(-0.15, 0.15), y - 0.06, top - rng.uniform(1.6, 2.6))],
             rng, 20, 0.07, keep=street)
# the A-board: two purple panels on a wooden frame, leaning
ax, ay = 2.55, -1.05
fr = B("v2_aboard", "Exterior")
fr.box(-0.44, 0.44, -0.03, 0.03, 0.0, 1.2, M["walnut"], bev=0.012)
fr.box(-0.38, 0.38, -0.045, 0.0, 0.1, 1.13, M["purple"], bev=0.008)
for i, ln in enumerate(["GOOD", "VIBES", "BETTER", "PUFFS"]):
    fr.text(ln, (0.0, -0.05, 0.96 - i * 0.22), 0.19 if i < 2 else 0.16, M["cream"], extrude=0.004, fnt=FONT)
fr.box(-0.44, 0.44, 0.03, 0.09, 0.0, 1.2, M["walnut"], bev=0.012)
ab = fr.build(loc=(ax, ay, 0.0))
ab.rotation_euler = (-0.12, 0, -0.18)
b.build()

# =============================================================================================
# inside: a narrow, deep room behind the door
# =============================================================================================
RX0, RX1 = -2.15, 2.25  # the room's inner walls (the door is at x -0.5..0.6)
RY0, RY1 = 0.95, 7.0  # front wall (behind the displays) to back wall
RZ = 3.1
CX = (RX0 + RX1) / 2

b = B("room_v2", "Interior")  # the floor, by name: the site finds the room's middle from it
b.box(RX0 - 0.2, RX1 + 0.2, 0.25, RY1 + 0.2, -0.06, 0.0, M["floor"])
b.build()

b = B("v2_shell", "Interior")
b.box(RX0 - 0.2, RX0, RY0 - 0.02, RY1 + 0.2, 0.0, RZ, M["wall_in"])  # left (from behind the window displays:
b.box(RX1, RX1 + 0.2, RY0 - 0.02, RY1 + 0.2, 0.0, RZ, M["wall_in"])  # right  from the shopfront they cut through them)
b.box(RX0 - 0.2, RX1 + 0.2, RY1, RY1 + 0.2, 0.0, RZ, M["wall_in"])  # back
b.box(RX0 - 0.2, RX1 + 0.2, 0.25, RY1 + 0.2, RZ, RZ + 0.12, M["ceiling"])  # ceiling
# the front wall from inside, round the door, behind the window displays
b.box(RX0, DX0, RY0 - 0.02, RY0, 0.0, RZ, M["wall_in"])
b.box(DX1, RX1, RY0 - 0.02, RY0, 0.0, RZ, M["wall_in"])
b.box(DX0, DX1, RY0 - 0.02, RY0, 2.4, RZ, M["wall_in"])
# the little vestibule from the door to the room
b.box(DX0 - 0.06, DX0, 0.25, RY0, 0.0, 2.4, M["wall_in"])
b.box(DX1, DX1 + 0.06, 0.25, RY0, 0.0, 2.4, M["wall_in"])
b.box(DX0, DX1, 0.25, RY0, 2.4, 2.46, M["wall_in"])
# the rug in front of the counter
b.box(-1.15, 1.25, 3.9, 5.15, 0.0, 0.012, M["rug"])
b.box(-1.05, 1.15, 4.0, 5.05, 0.012, 0.016, M["rug_lt"])
b.box(-0.95, 1.05, 4.1, 4.95, 0.016, 0.019, M["rug"])
b.build()

# --- fit: nothing on a shelf may pass through a board ---------------------------------------
CLASHES = []


class Fit:
    """The boards of one unit, and a check of each piece of stock against them: the
    vertices a piece added to the builder, as a box, may not cut into any board."""

    def __init__(self, b, name):
        self.b, self.name, self.boards, self.n = b, name, [], 0

    def board(self, x0, x1, y0, y1, z0, z1):
        self.boards.append((min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), z0, z1))

    def start(self):
        # what is there already is marked; the piece's vertices come in unmarked (a layer,
        # not the tag: bmesh operators clear tags)
        bm = self.b.bm
        lay = bm.verts.layers.int.get("fit") or bm.verts.layers.int.new("fit")
        for v in bm.verts:
            v[lay] = 1

    def check(self, what):
        bm = self.b.bm
        lay = bm.verts.layers.int.get("fit")
        vs = [v.co for v in bm.verts if not v[lay]]
        if not vs:
            return
        e = 0.002  # resting on a board is touching it, not cutting into it
        lo = [min(v[k] for v in vs) + e for k in range(3)]
        hi = [max(v[k] for v in vs) - e for k in range(3)]
        for bd in self.boards:
            if all(lo[k] < bd[2 * k + 1] and hi[k] > bd[2 * k] for k in range(3)):
                CLASHES.append(f"{self.name}: {what} ({[round(c, 3) for c in lo + hi]}) cuts into the board at {tuple(round(c, 3) for c in bd)}")
                return


# --- shelving bays along both side walls ----------------------------------------------------
DEPTH = 0.42
SHELF_Z = [0.82, 1.3, 1.78, 2.26]  # above a low cupboard; four, tall, as in the pitch
CROWN = 2.7  # plain walnut above, up to the ceiling (the site's labels name the shelves)


def bay(name, side, y0, y1, slug, label, kind, rng):
    """One walnut unit on a side wall: a cupboard, five lit shelves, a crown with
    the category painted on it. side = -1 (left wall, facing +x) / +1 (right)."""
    wall = RX0 if side < 0 else RX1
    inner = wall - side * DEPTH  # the front edge of the shelves
    xa, xb = (wall, inner) if side < 0 else (inner, wall)
    b = B(name, "Fixtures")
    b.box(xa, xb, y0, y1, 0.0, 0.08, M["walnut_dk"])  # plinth
    b.box(xa, xb, y0, y1, 0.08, 0.78, M["walnut"], bev=0.01)  # cupboard
    # two drawers across the front, each with a steel pull
    for zd0, zd1 in ((0.12, 0.43), (0.47, 0.74)):
        b.box(min(inner, inner - side * 0.015), max(inner, inner - side * 0.015), y0 + 0.06, y1 - 0.06, zd0, zd1, M["walnut_dk"], bev=0.006)
        zm = (zd0 + zd1) / 2
        b.tube([(inner - side * 0.035, (y0 + y1) / 2 - 0.08, zm), (inner - side * 0.035, (y0 + y1) / 2 + 0.08, zm)], 0.007, M["steel"], 6)
        for yy_ in ((y0 + y1) / 2 - 0.08, (y0 + y1) / 2 + 0.08):
            b.tube([(inner - side * 0.035, yy_, zm), (inner - side * 0.012, yy_, zm)], 0.006, M["steel"], 5)
    for yy in (y0, y1 - 0.045):  # uprights, lighter than the shelves, as in the pitch
        b.box(xa, xb, yy, yy + 0.045, 0.0, CROWN, M["oak"], bev=0.006)
    b.box(xa, xb, y0, y1, CROWN, RZ, M["walnut_dk"])  # crown up to the ceiling
    # the back: a darker panel
    bx0, bx1 = (wall, wall + 0.02) if side < 0 else (wall - 0.02, wall)
    b.box(bx0, bx1, y0, y1, 0.78, CROWN, M["walnut_dk"])
    back = wall - side * 0.02  # the face of the back panel
    fit = Fit(b, name)
    fit.board(bx0, bx1, y0, y1, 0.78, CROWN)
    fit.board(xa, xb, y0, y1, CROWN, RZ)
    for yy in (y0, y1 - 0.045):
        fit.board(xa, xb, yy, yy + 0.045, 0.0, CROWN)
    for i, z in enumerate(SHELF_Z):
        fit.board(xa, xb, y0 + 0.045, y1 - 0.045, z - 0.03, z)
        under_ = SHELF_Z[i + 1] - 0.03 if i + 1 < len(SHELF_Z) else CROWN
        fit.board(inner, inner + side * 0.02, y0 + 0.045, y1 - 0.045, under_ - 0.05, under_)
    for i, z in enumerate(SHELF_Z):
        b.box(xa, xb, y0 + 0.045, y1 - 0.045, z - 0.03, z, M["walnut_dk"], bev=0.004)
        # a bright warm strip under the front of the shelf above, just behind a shallow lip:
        # the pitch's main light, a glowing line along every shelf
        under = SHELF_Z[i + 1] - 0.03 if i + 1 < len(SHELF_Z) else CROWN
        b.box(inner + side * 0.022, inner + side * 0.06, y0 + 0.06, y1 - 0.06, under - 0.012, under, M["led"])
        b.box(inner, inner + side * 0.02, y0 + 0.045, y1 - 0.045, under - 0.035, under, M["walnut_dk"], bev=0.004)
        # and a thin one along the back, where the shelf above meets the panel: the glow you see
        b.box(min(back, back - side * 0.014), max(back, back - side * 0.014), y0 + 0.06, y1 - 0.06, under - 0.014, under, M["led_back"])

    # what is on the shelves: each piece no taller than the space under the shelf above
    def room(si):
        return (SHELF_Z[si + 1] - 0.03 if si + 1 < len(SHELF_Z) else CROWN) - SHELF_Z[si] - 0.04

    n_per = max(2, int((y1 - y0 - 0.1) / 0.17))
    rows = (wall - side * DEPTH * 0.3, wall - side * DEPTH * 0.72)  # back and front, two deep
    plant_at = (rng.choice((1, 2)), 1) if rng.random() < 0.55 else None  # a small pot among the stock
    for si, z in enumerate(SHELF_Z):
        ys = [y0 + 0.1 + (y1 - y0 - 0.2) * (k + 0.5) / n_per for k in range(n_per)]
        cx = wall - side * DEPTH * 0.5
        # as in the pitch: glass at eye level whatever the bay holds, dark storage jars up top
        role = "glass" if si in (1, 2) or kind == "glass" else (kind if si == 0 else "top")
        for k, yy in enumerate(ys):
            fit.start()
            if plant_at == (si, k):
                top_ = pot(b, cx, yy, z, 0.06, 0.09, M["pot"])
                lim = (SHELF_Z[si + 1] - 0.08) if si + 1 < len(SHELF_Z) else CROWN - 0.08
                fit.check(f"pot on shelf {si}")
                bush(b, cx, yy, top_, 0.15, rng, n=7,
                     keep=lambda p, lim=lim: p.z < lim and y0 + 0.06 < p.y < y1 - 0.06 and side * (p.x - wall) < -0.03)
                continue
            if role == "glass":
                if k % 2 == 0:  # every other place: a beaker is 20 cm across
                    bong(b, cx, yy, z, rng, h=min(rng.uniform(0.28, 0.4), room(si) - 0.02))
                else:  # small jars and bottles between them, front and back
                    jar(b, rows[1], yy, z, 0.034, min(rng.uniform(0.09, 0.14), room(si)), rng.choice(GLASSES), rng.choice(TINS))
                    h = min(rng.uniform(0.14, 0.22), room(si))
                    b.lathe([(0, 0), (0.03, 0), (0.03, h * 0.7), (0.012, h * 0.85), (0.012, h), (0, h)], (rows[0], yy, z), rng.choice([M["g_amber"], M["g_green"], M["glass"]]), seg=10)
            elif role == "top":
                jar(b, rows[0], yy, z, 0.05, min(rng.uniform(0.16, 0.24), room(si)), M["ink"], rng.choice([M["steel"], M["black"]]))
                if k % 2:
                    jar(b, rows[1], yy, z, 0.035, min(0.11, room(si)), rng.choice(GLASSES), M["steel"])
            elif kind == "hookah":
                if k % 2 == 0:
                    hookah(b, cx, yy, z, rng) if si in (0, 2) else jar(b, cx, yy, z, 0.05, 0.16, rng.choice(GLASSES), M["steel"])
            elif kind == "jars":
                for rx in rows:
                    jar(b, rx, yy, z, rng.uniform(0.045, 0.055), min(rng.uniform(0.13, 0.22), room(si)), rng.choice([M["ink"], M["g_amber"], M["steel"], M["g_green"]]), rng.choice(TINS))
            elif kind == "packs":
                for rx in rows:
                    b.box(rx - 0.045, rx + 0.045, yy - 0.06, yy + 0.06, z, z + min(rng.uniform(0.12, 0.2), room(si)), rng.choice(PACKS), bev=0.006)
            elif kind == "tins":
                for rx in rows:
                    for lv in range(2 if room(si) > 0.24 else 1):  # stacked two high
                        b.cyl(rx, yy, z + 0.05 + lv * 0.105, 0.045, 0.045, 0.1, rng.choice(TINS), seg=14)
            elif kind == "bottles":
                for rx in rows:
                    h = min(rng.uniform(0.14, 0.24), room(si))
                    b.lathe([(0, 0), (0.032, 0), (0.032, h * 0.7), (0.013, h * 0.85), (0.013, h), (0, h)], (rx, yy, z), rng.choice([M["g_amber"], M["g_green"], M["ink"], M["cream"]]), seg=10)
            elif kind == "lighters":
                for j in range(3):
                    b.box(cx - 0.12 + j * 0.08, cx - 0.1 + j * 0.08, yy - 0.025, yy + 0.025, z, z + 0.075, rng.choice(PACKS), bev=0.004)
            elif kind == "keys":
                if si in (1, 2, 3):
                    b.tube([(wall - side * 0.02, yy, z + 0.3), (wall - side * 0.18, yy, z + 0.3)], 0.006, M["steel"], 5)
                    b.ball(wall - side * 0.17, yy, z + 0.22, 0.03, rng.choice(PACKS), scale=(1, 0.4, 1), u=8, v=6)
            elif kind == "boxes":  # cigar boxes and trays, stacked flat
                hz = z
                for lv in range(rng.choice((1, 2, 3))):
                    hh = rng.uniform(0.05, 0.08)
                    if hz + hh - z > room(si):
                        break
                    b.box(cx - 0.1, cx + 0.1, yy - 0.065, yy + 0.065, hz, hz + hh, rng.choice([M["walnut_dk"], M["box_red"], M["ink"], M["purple_dk"], M["walnut"]]), bev=0.005)
                    hz += hh
            fit.check(f"{kind} on shelf {si}, place {k}")
    if rng.random() < 0.6:  # a pothos in a little pot on the top shelf, trailing down the front
        yy = rng.uniform(y0 + 0.2, y1 - 0.2)
        px = inner + side * 0.1
        top_ = pot(b, px, yy, SHELF_Z[-1], 0.07, 0.11)

        def keep(p, y0=y0, y1=y1):
            ahead = side * (inner - p.x) > 0.025  # out in the aisle, in front of the shelves
            on_top = side * (p.x - inner) >= 0 and SHELF_Z[-1] + 0.005 < p.z < CROWN - 0.06 and y0 + 0.05 < p.y < y1 - 0.05
            return ahead or on_top

        bush(b, px, yy, top_, 0.16, rng, n=8, keep=keep)
        out = inner - side * 0.07
        for k in range(3):
            y2 = yy + rng.uniform(-0.08, 0.08)
            trailing(b, [(px, y2, top_ + 0.02), (out, y2, SHELF_Z[-1] + 0.06), (out - side * 0.02, y2 + rng.uniform(-0.1, 0.1), SHELF_Z[-1] - rng.uniform(0.5, 1.0))],
                     rng, 16, 0.062, keep=keep)
    b.build()
    hot(slug, (inner - side * 0.05, (y0 + y1) / 2, 1.75), label)
    glow(wall, inner + side * -0.02, y0, y1, SHELF_Z[0], [z - 0.03 for z in SHELF_Z[1:]] + [CROWN], CROWN)


LEFT = [  # door to back, along the left wall
    ("rolling-tray", "Rolling trays", "boxes"),
    ("blunt-wraps", "Blunt wraps", "packs"),
    ("blunt-pre-rolled-cone", "Pre-rolled cones", "packs"),
    ("pipe", "Pipes", "glass"),
    ("bong-accessory", "Bong accessories", "jars"),
]
RIGHT = [
    ("keychain", "Keychains", "keys"),
    ("cigars", "Cigars", "boxes"),
    ("rolling-tobacco", "Rolling tobacco", "tins"),
    ("lighter-refills", "Lighter refills", "bottles"),
    ("roach", "Roaches", "packs"),
]
BY0, BY1 = 1.05, 5.45  # clear of the counter's cubbies (they stand from y 5.53)
step = (BY1 - BY0) / 5
for side, row in ((-1, LEFT), (1, RIGHT)):
    for i, (slug, label, kind) in enumerate(row):
        bay(f"bay_{slug.replace('-', '_')}", side, BY0 + i * step, BY0 + (i + 1) * step, slug, label, kind, random.Random(slug))

# --- the back wall: four tall units round the plaque -----------------------------------------
HEAD = {"accessory": "MERCH & LIFESTYLE", "bong": "GLASS", "storage": "STORAGE", "cleaning-accessory": "CLEANING"}
BACK = [  # x0, x1, slug, label, kind
    (-2.1, -1.42, "accessory", "Accessories", "merch"),
    (-1.38, -0.98, "bong", "Bongs", "glass"),
    (1.08, 1.52, "storage", "Storage", "jars"),
    (1.56, 2.2, "cleaning-accessory", "Cleaning", "bottles"),
]
for x0, x1, slug, label, kind in BACK:
    rng = random.Random("back" + slug)
    b = B(f"bay_{slug.replace('-', '_')}", "Fixtures")
    y1 = RY1
    y0 = RY1 - DEPTH
    b.box(x0, x1, y0, y1, 0.0, 0.08, M["walnut_dk"])
    b.box(x0, x1, y0, y1, 0.08, 0.6, M["walnut"], bev=0.01)
    for xx in (x0, x1 - 0.045):
        b.box(xx, xx + 0.045, y0, y1, 0.0, CROWN, M["oak"], bev=0.006)
    b.box(x0, x1, y1 - 0.02, y1, 0.6, CROWN, M["walnut_dk"])
    # the name on a black board along the top, as in the pitch
    b.box(x0 + 0.01, x1 - 0.01, y0 - 0.015, y0, CROWN + 0.005, CROWN + 0.2, M["ink"], bev=0.004)
    b.text(HEAD[slug], ((x0 + x1) / 2, y0 - 0.02, CROWN + 0.1), 0.08 if len(HEAD[slug]) < 10 else 0.052, M["cream"], extrude=0.003, fnt=FONT2)
    b.box(x0, x1, y0, y1, CROWN, CROWN + 0.08, M["walnut"], bev=0.006)
    zs = [0.6, 1.1, 1.6, 2.1] if kind != "merch" else [0.6, 2.1]
    for i, z in enumerate(zs):
        b.box(x0 + 0.045, x1 - 0.045, y0, y1, z - 0.03, z, M["walnut_dk"], bev=0.004)
        under = zs[i + 1] - 0.03 if i + 1 < len(zs) else CROWN
        b.box(x0 + 0.06, x1 - 0.06, y0 + 0.022, y0 + 0.06, under - 0.012, under, M["led"])
        b.box(x0 + 0.045, x1 - 0.045, y0, y0 + 0.02, under - 0.035, under, M["walnut_dk"], bev=0.004)
        b.box(x0 + 0.06, x1 - 0.06, y1 - 0.034, y1 - 0.02, under - 0.014, under, M["led_back"])
    cy = y1 - DEPTH * 0.5
    fit = Fit(b, f"bay_{slug}")
    fit.board(x0, x1, y1 - 0.02, y1, 0.6, CROWN)
    for xx in (x0, x1 - 0.045):
        fit.board(xx, xx + 0.045, y0, y1, 0.0, CROWN)
    for i, z in enumerate(zs):
        fit.board(x0 + 0.045, x1 - 0.045, y0, y1, z - 0.03, z)
        under_ = zs[i + 1] - 0.03 if i + 1 < len(zs) else CROWN
        fit.board(x0 + 0.045, x1 - 0.045, y0, y0 + 0.02, under_ - 0.05, under_)
    fit.board(x0, x1, y0, y1, CROWN, CROWN + 0.08)
    n = max(1, int((x1 - x0 - 0.1) / (0.22 if kind == "glass" else 0.16)))  # (a narrow unit holds one beaker a shelf)
    xs = [x0 + 0.08 + (x1 - x0 - 0.16) * (k + 0.5) / n for k in range(n)]
    ry = (y1 - DEPTH * 0.3, y1 - DEPTH * 0.7)  # back and front rows
    for zi, z in enumerate(zs):
        space = (zs[zi + 1] - 0.03 if zi + 1 < len(zs) else CROWN) - z - 0.04
        for k, xx in enumerate(xs):
            fit.start()
            if kind == "glass":
                bong(b, xx, cy, z, rng, h=min(rng.uniform(0.25, 0.4), space - 0.02))
            elif kind == "jars":
                for yy in ry:
                    jar(b, xx, yy, z, 0.05, min(rng.uniform(0.16, 0.26), space), rng.choice([M["ink"], M["steel"], M["g_amber"]]), rng.choice(TINS))
            elif kind == "bottles":
                if zi == len(zs) - 1:
                    continue  # the top is for the hanging brushes
                for yy in ry:
                    h = min(rng.uniform(0.15, 0.26), space)
                    b.lathe([(0, 0), (0.032, 0), (0.032, h * 0.7), (0.013, h * 0.85), (0.013, h), (0, h)], (xx, yy, z), rng.choice([M["cream"], M["g_amber"], M["ink"], M["sign_green"]]), seg=10)
            elif kind == "merch":
                if z == 0.6:  # folded tees at the bottom
                    for lv in range(3):
                        b.box(xx - 0.07, xx + 0.07, cy - 0.12, cy + 0.12, z + lv * 0.045, z + lv * 0.045 + 0.04, rng.choice([M["tee_a"], M["tee_b"], M["tee_c"]]), bev=0.015)
                else:  # caps along the top
                    cm = rng.choice([M["tee_a"], M["tee_b"], M["tee_c"], M["purple_dk"]])
                    b.lathe([(0, 0), (0.07, 0), (0.068, 0.03), (0.05, 0.065), (0.0, 0.075)], (xx, cy, z), cm, seg=16)
                    b.box(xx - 0.05, xx + 0.05, cy - 0.15, cy - 0.06, z, z + 0.008, cm)
            fit.check(f"{kind} on shelf {zi}, place {k}")
        if kind == "glass":
            for k in range(len(xs) - 1):
                fit.start()
                jar(b, (xs[k] + xs[k + 1]) / 2, y0 + 0.06, z, 0.03, min(0.11, space), rng.choice(GLASSES), M["steel"])
                fit.check(f"jar on shelf {zi}")
    if kind == "bottles":  # brushes and picks hanging from a rail under the crown
        b.tube([(x0 + 0.05, cy, CROWN - 0.05), (x1 - 0.05, cy, CROWN - 0.05)], 0.008, M["steel"], 6)
        for k in range(6):
            xx = x0 + 0.1 + k * (x1 - x0 - 0.2) / 5
            ln = rng.uniform(0.22, 0.34)
            b.tube([(xx, cy, CROWN - 0.05), (xx, cy, CROWN - 0.05 - ln)], 0.007, rng.choice([M["walnut"], M["ink"], M["brass"]]), 6)
            b.cyl(xx, cy, CROWN - 0.05 - ln - 0.04, 0.013, 0.013, 0.08, rng.choice([M["cream"], M["wax"]]), seg=8)
    if kind == "merch":  # tees on hangers off a rail
        b.tube([(x0 + 0.05, cy, 1.95), (x1 - 0.05, cy, 1.95)], 0.012, M["steel"], 6)
        for k in range(5):
            xx = x0 + 0.12 + k * (x1 - x0 - 0.24) / 4
            b.box(xx - 0.03, xx + 0.03, cy - 0.2, cy + 0.2, 1.15, 1.9, rng.choice([M["tee_a"], M["tee_b"], M["tee_c"]]), bev=0.02)
    b.build()
    hot(slug, ((x0 + x1) / 2, y0 - 0.05, 1.8), label)
    glow(x0, x1, y0 - 0.02, y1, zs[0], [z - 0.03 for z in zs[1:]] + [CROWN], CROWN)

# the plaque: "baBa jEE" in white on a black, dripping board, small framed sayings either side
b = B("v2_plaque", "Interior")
PX, PZ = (-0.65 + 0.75) / 2, 2.25
PZ = 2.2
b.box(PX - 0.62, PX + 0.62, RY1 - 0.05, RY1, PZ - 0.48, PZ + 0.55, M["plaque"], bev=0.02)
rd = random.Random(71)
for k in range(9):  # drips off the bottom edge
    x = PX - 0.55 + k * 0.1375 + rd.uniform(-0.025, 0.025)
    ln = rd.uniform(0.06, 0.22)
    b.tube([(x, RY1 - 0.03, PZ - 0.46), (x, RY1 - 0.03, PZ - 0.48 - ln)], [0.035, 0.03], M["plaque"], 8)
    b.ball(x, RY1 - 0.03, PZ - 0.48 - ln, 0.035, M["plaque"], u=8, v=6)
# (the lettering is a hand-drawn picture: see the decal after this)
# the framed sayings: one left of the plaque, two stacked on its right
for fx, fz, lines in ((PX - 0.825, 2.4, ["ROLL IT", "LIGHT IT", "LOVE IT"]), (PX + 0.825, 2.5, ["KEEP", "IT", "CHILL"]),
                      (PX + 0.825, 1.98, ["SMOKE MORE", "WORRY", "LESS"])):
    b.box(fx - 0.17, fx + 0.17, RY1 - 0.03, RY1, fz - 0.23, fz + 0.23, M["walnut_dk"], bev=0.008)
    b.box(fx - 0.145, fx + 0.145, RY1 - 0.035, RY1 - 0.03, fz - 0.205, fz + 0.205, M["cream"])
    for i, ln in enumerate(lines):
        b.text(ln, (fx, RY1 - 0.037, fz + 0.11 - i * 0.11), 0.068 if len(ln) < 9 else 0.05, M["ink"], extrude=0.002, fnt=FONT)
b.build()
decal("logo", M["decal_logo"], PX, RY1 - 0.056, PZ + 0.04, 1.12, 0.93)

# the counter at the back, the cubbies in front of it, the till and two boxes on top
CY0, CY1 = 5.95, 6.45  # its front and back
b = B("v2_counter", "Fixtures")
b.box(-1.95, 2.05, CY0, CY1, 0.0, 0.98, M["walnut_dk"], bev=0.01)
b.box(-2.0, 2.1, CY0 - 0.05, CY1 + 0.02, 0.98, 1.04, M["walnut"], bev=0.012)
b.box(-0.58, 0.68, CY0 - 0.01, CY0, 0.1, 0.9, M["ink"])  # its plain dark middle, between the cubbies
# the till: a cash drawer, a stand, an angled screen facing the customer, a receipt printer
b.box(-0.32, 0.12, CY0 + 0.1, CY0 + 0.42, 1.04, 1.13, M["ink"], bev=0.012)
b.box(-0.3, 0.1, CY0 + 0.095, CY0 + 0.1, 1.06, 1.11, M["steel"])  # the drawer's front
b.cyl(-0.1, CY0 + 0.3, 1.2, 0.02, 0.02, 0.14, M["steel"], seg=10)
b.box(-0.24, 0.04, CY0 + 0.26, CY0 + 0.3, 1.24, 1.44, M["ink"], bev=0.008, rot=(-0.25, 0, 0))
b.box(-0.225, 0.025, CY0 + 0.255, CY0 + 0.26, 1.255, 1.425, M["screen"], rot=(-0.25, 0, 0))
b.box(0.14, 0.3, CY0 + 0.2, CY0 + 0.36, 1.04, 1.13, M["ink"], bev=0.01)  # printer
b.box(0.17, 0.27, CY0 + 0.24, CY0 + 0.25, 1.13, 1.16, M["cream"])  # its receipt
# a card machine on its dock: keypad, a small lit screen
b.box(-1.42, -1.18, CY0 + 0.14, CY0 + 0.34, 1.04, 1.07, M["ink"], bev=0.008)
b.box(-1.38, -1.22, CY0 + 0.16, CY0 + 0.24, 1.07, 1.2, M["ink"], bev=0.008, rot=(-0.5, 0, 0))
b.box(-1.36, -1.24, CY0 + 0.155, CY0 + 0.16, 1.15, 1.19, M["screen"], rot=(-0.5, 0, 0))
for r_ in range(3):
    for c in range(3):
        b.box(-1.35 + c * 0.04, -1.32 + c * 0.04, CY0 + 0.15, CY0 + 0.155, 1.08 + r_ * 0.02, 1.095 + r_ * 0.02, M["steel"], rot=(-0.5, 0, 0))
# two tall Babajee boxes, as in the video (plain for now: no product art yet)
for x, m in ((0.62, M["box_red"]), (0.92, M["box_blue"])):
    b.box(x - 0.12, x + 0.12, CY0 + 0.1, CY0 + 0.22, 1.04, 1.5, m, bev=0.01)
    b.text("baBa", (x, CY0 + 0.095, 1.38), 0.06, M["cream"], extrude=0.003, fnt=FONT)
    b.text("jEE", (x, CY0 + 0.095, 1.31), 0.06, M["cream"], extrude=0.003, fnt=FONT)
bush(b, -1.72, CY0 + 0.25, pot(b, -1.72, CY0 + 0.25, 1.04, 0.09, 0.13, M["walnut"]), 0.28, random.Random(73), n=14,
     keep=lambda p: p.z > 1.06 and p.y < RY1 - DEPTH - 0.02 and p.x > RX0 + 0.03)
b.build()

CUBBY = [  # x0, x1, z0, z1, slug, label, fill
    (-1.95, -1.27, 0.0, 0.95, "rolling-paper", "Rolling papers", "papers"),
    (-1.27, -0.6, 0.0, 0.95, "filter", "Filter tips", "papers"),
    (0.7, 1.37, 0.0, 0.95, "grinder", "Grinders", "grinders"),
    (1.37, 2.05, 0.48, 0.95, "lighter", "Lighters", "lighters"),
    (1.37, 2.05, 0.0, 0.46, "ashtray", "Ash trays", "trays"),
]
for x0, x1, z0, z1, slug, label, fill in CUBBY:
    rng = random.Random("cubby" + slug)
    b = B(f"cubby_{slug.replace('-', '_')}", "Fixtures")
    y0, y1 = CY0 - 0.42, CY0
    b.box(x0, x1, y0, y1, z0, z0 + 0.04, M["walnut"], bev=0.006)
    for xx in (x0, x1 - 0.035):
        b.box(xx, xx + 0.035, y0, y1, z0, z1, M["walnut"], bev=0.006)
    b.box(x0, x1, y1 - 0.02, y1, z0, z1, M["walnut_dk"])
    if z1 > 0.9:
        b.box(x0, x1, y0, y1, z1 - 0.03, z1, M["walnut"], bev=0.006)
    # its name on a black board across the top, as in the pitch
    b.box(x0 + 0.005, x1 - 0.005, y0 - 0.014, y0, z1 - 0.115, z1 - 0.01, M["ink"], bev=0.004)
    b.text(label.upper(), ((x0 + x1) / 2, y0 - 0.018, z1 - 0.062), 0.06 if len(label) < 12 else 0.05, M["cream"], extrude=0.002, fnt=FONT2)
    # stock, in tiers stepping up and back like a market stall, each tier a tilted tray of packs
    if fill == "papers":
        for t in range(3):
            ty, tz = y0 + 0.06 + t * 0.12, z0 + 0.06 + t * 0.2
            b.box(x0 + 0.035, x1 - 0.035, ty - 0.06, ty + 0.07, z0 + 0.04, tz, M["walnut_dk"])  # the step under the tray
            b.box(x0 + 0.035, x1 - 0.035, ty - 0.065, ty - 0.055, tz, tz + 0.05, M["walnut"])  # its front lip
            for c in range(5):
                xx = x0 + 0.09 + c * (x1 - x0 - 0.18) / 4
                for d_ in range(4):  # packs leaning back, one behind another
                    yy = ty - 0.04 + d_ * 0.026
                    b.box(xx - 0.05, xx + 0.05, yy - 0.009, yy + 0.009, tz, tz + 0.075, rng.choice(PACKS), bev=0.003, rot=(-0.35, 0, 0))
    elif fill == "grinders":
        b.box(x0 + 0.035, x1 - 0.035, y0, y1, 0.44, 0.47, M["walnut"], bev=0.004)
        for zz in (z0 + 0.04, 0.47):
            b.box(x0 + 0.035, x1 - 0.035, y0 + 0.2, y1 - 0.02, zz, zz + 0.1, M["walnut_dk"])  # a step for the back row
            for c in range(4):
                for r_ in range(2):
                    grinder(b, x0 + 0.11 + c * 0.15, y0 + 0.1 + r_ * 0.17, zz + r_ * 0.1, 0.048, rng.choice(TINS))
    elif fill == "lighters":
        for r_ in range(3):
            if r_:
                b.box(x0 + 0.035, x1 - 0.035, y0 + 0.04 + r_ * 0.11, y1 - 0.02, z0 + 0.04, z0 + 0.04 + r_ * 0.07, M["walnut_dk"])
            for c in range(11):
                xx = x0 + 0.06 + c * 0.054
                yy = y0 + 0.08 + r_ * 0.11
                b.box(xx - 0.018, xx + 0.018, yy - 0.011, yy + 0.011, z0 + 0.04 + r_ * 0.07, z0 + 0.16 + r_ * 0.07, rng.choice(PACKS + [M["steel"]]), bev=0.004)
    elif fill == "trays":
        for c in range(3):
            for lv in range(2):  # stacked two high
                dish(b, x0 + 0.13 + c * 0.2, y0 + 0.17, z0 + 0.05 + lv * 0.034, 0.075, rng.choice([M["ink"], M["steel"], M["cream"]]))
    b.build()
    hot(slug, ((x0 + x1) / 2, y0 - 0.05, (z0 + z1) / 2 + 0.1), label)

# pendant lamps over the counter, and one more in the aisle
b = B("v2_pendants", "Interior")
for x, y in ((-0.38, 6.15), (0.05, 6.15), (0.48, 6.15), (CX, 2.7)):  # (none hangs between you and the counter)  # three over the plaque, as in the pitch
    # over the counter they hang higher: from the aisle, lower shades sit across the plaque
    hz = 3.04 if y > 6 else 2.5  # over the counter, up out of the plaque's way
    b.tube([(x, y, RZ), (x, y, hz + 0.15)], 0.006, M["ink"], 4)
    # a black dome, wide and low, its inside lit warm
    b.lathe([(0.0, 0.0), (0.04, 0.0), (0.09, 0.03), (0.15, 0.1), (0.18, 0.2), (0.185, 0.21), (0.0, 0.21)], (x, y, hz), M["ink"], 32, rot=(PI, 0, 0))
    b.lathe([(0.0, 0.004), (0.038, 0.004), (0.087, 0.033), (0.146, 0.102), (0.175, 0.2), (0.0, 0.2)], (x, y, hz - 0.006), M["shade_in"], 32, rot=(PI, 0, 0))
    b.ball(x, y, hz, 0.04, M["bulb"], u=10, v=6)
    SPOTS.append((f"spot_{len(SPOTS)}", (x, y, hz - 0.05), (x, y, 0.0), "pendant"))  # straight down: a pool on the counter or the floor
b.build()
# fill light down the aisle, low on the shelves
for i, (y, s) in enumerate(((1.8, -1), (3.4, 1), (5.0, -1))):
    lamp(f"lamp_aisle_{i}", (CX + s * 1.2, y, 1.6), "fill")

# floor plants at the feet of the shelves, as in the video
rng = random.Random(81)
b = B("v2_plants_in", "Interior")
for px, py, side in ((RX0 + DEPTH + 0.3, 2.55, -1), (RX1 - DEPTH - 0.3, 3.6, 1)):
    shelf = RX0 + DEPTH if side < 0 else RX1 - DEPTH
    bush(b, px, py, pot(b, px, py, 0.0, 0.17, 0.32, M["pot_glaze"]), 0.6, rng, n=30,
         keep=lambda p, shelf=shelf, side=side: side * (shelf - p.x) > 0.04 and p.z < 2.0)
b.build()

# the ceiling: three beams across, between the pendants, and six downlights washing the shelves
# the ceiling is plain, as in the pitch: these spots light the shelves with no fitting to see
for side in (-1, 1):
    x = CX + side * 1.05
    for y in (1.75, 3.15, 4.8):
        SPOTS.append((f"spot_{len(SPOTS)}", (x, y, RZ - 0.05), (x + side * 0.55, y, 0.9), "downlight"))  # light only: no fitting shows
for x in (-1.6, 1.7):  # and two over the counter, washing the back units
    SPOTS.append((f"spot_{len(SPOTS)}", (x, 6.3, RZ - 0.05), (x, RY1, 1.4), "downlight"))

# a spot from the ceiling onto the plaque, so the logo stands out of the dark wall
SPOTS.append(("spot_plaque", (PX, RY1 - 1.3, RZ - 0.05), (PX, RY1, PZ), "plaque"))

# --- hotspot and lamp empties ---------------------------------------------------------------
for name, loc, slug, label in HOTSPOTS:
    empty(name, loc, "Hotspots", categories=slug, label=label)
for name, loc, kind in LAMPS:
    empty(name, loc, "Lights", kind=kind)
for k, (box, floor, strips) in enumerate(GLOWS):
    empty(f"glow_{k}", ((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2), "Lights", box=list(box), floor=floor, strips=list(strips))
for name, loc, aim, kind in SPOTS:
    empty(name, loc, "Lights", aim=list(aim), kind=kind)
print("HOTSPOTS", len(HOTSPOTS), "LAMPS", len(LAMPS), "GLOWS", len(GLOWS), "SPOTS", len(SPOTS))
if CLASHES:
    print("FIT FAILED:", len(CLASHES), "pieces cut into shelves")
    for c in CLASHES:
        print("  " + c)
    sys.exit(1)
print("FIT OK: nothing on a shelf cuts into a board")


# --- the scroll path: as the video, the pavement -> the door -> the plaque -------------------
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


DOOR_X = (DX0 + DX1) / 2
# the landing, as the pitch: square on, the shop's full height filling most of the frame (the
# site shifts the view sideways on a wide screen so the shop sits right, and backs off on a
# tall one so it fits across)
camera("cam_00", (-2.6, -6.6, 1.35), (0.0, 0.0, 2.55))  # chest height, a little left, looking up: the pitch's view
camera("cam_01", (-1.2, -4.8, 1.5), (0.1, 0.0, 2.05))
camera("cam_02", (DOOR_X - 0.1, -3.0, 1.7), (DOOR_X, 0.0, 1.8))  # square on, the awning above
camera("cam_03", (DOOR_X, -0.7, 1.6), (DOOR_X, 4.0, 1.6))  # on the step
camera("cam_04", (DOOR_X, 1.35, 1.6), (CX, RY1, 1.65))
camera("cam_05", (CX, 2.6, 1.55), (CX, RY1, 1.72))  # back down the aisle, the whole back wall and counter ahead
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

# --- export ---------------------------------------------------------------------------------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_cameras=True, export_extras=True, export_apply=True, export_yup=True,
    export_draco_mesh_compression_enable="--nodraco" not in argv, export_draco_mesh_compression_level=10,
    export_draco_position_quantization=14, export_draco_normal_quantization=8, export_draco_texcoord_quantization=10,
)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes")
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))

# --- preview stills (not part of the export) ------------------------------------------------
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(arg("--samples", "48"))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = bpy.data.worlds.new("night")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.04, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, loc, kind in LAMPS:
        li = bpy.data.lights.new(name, "POINT")
        li.energy = {"street": 700, "window": 220, "fill": 35}[kind]
        li.shadow_soft_size = 0.2
        li.color = (1.0, 0.8, 0.55)
        lo = bpy.data.objects.new(name, li)
        lo.location = loc
        scene.collection.objects.link(lo)
    for name, loc, aim, kind in SPOTS:
        li = bpy.data.lights.new(name, "SPOT")
        li.energy = {"pendant": 120, "plaque": 90}[kind]
        li.spot_size, li.spot_blend = math.radians(70), 0.6
        li.color = (1.0, 0.8, 0.55)
        lo = bpy.data.objects.new(name, li)
        lo.location = loc
        lo.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)
    which = arg("--shots", "cam_00,cam_02,cam_03,cam_05").split(",")
    extra = {
        "back": camera("pv_back", (CX, 3.35, 1.6), (CX, 0.0, 1.6)),
        "left": camera("pv_left", (CX, 3.35, 1.6), (RX0, 3.35, 1.6)),
        "aerial": camera("pv_aerial", (CX + 0.01, 3.0, 12.0), (CX, 3.0, 0.0), 80),
    }
    for n in which:
        cam = extra[n] if n in extra else bpy.data.objects[n]
        scene.camera = cam
        scene.render.filepath = os.path.join(os.path.abspath(PREVIEW), f"{n}.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
