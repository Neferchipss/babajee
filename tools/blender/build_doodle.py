"""Babajee, doodle edition: the lane and the shop, geometry only.

    blender -b -P tools/blender/build_doodle.py -- --out public/models/doodle.glb \
        --blend tools/blender/doodle.blend --preview tools/blender/preview_doodle

Shape language (second pass): tall, crooked, hand-drawn towers. No stacked
rectangles: every storey is skinned through rounded rings, so it swells in the
middle and tapers to the top; storeys differ in width and height, step out over
the lane on a curved ledge, and the whole tower leans and bends a little.
Windows come in several shapes (arched, round, slit, wide); roofs are bold
silhouettes (onion, flared cone, barrel, scalloped flat). Nothing here depicts a
character: the reference art tells the *rendering* (ink line, flat colour, the
illustration painted onto surfaces) and is applied later, as textures.

Clean flat slots are left to paint on (mural_*, sign_main, decal_*, door slot).
Colours are flat stand-ins. Metres; Blender Z-up. The lane runs along +y to the
shop's face at y = 0; the left of the opening view is kept quiet on purpose,
for the page's logo.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shoplib  # noqa: E402
from shoplib import B, arc, empty, mat, panel, wobble  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = os.path.abspath(arg("--out", "public/models/doodle.glb"))
BLEND = arg("--blend")
PREVIEW = arg("--preview")

bpy.ops.wm.read_factory_settings(use_empty=True)
shoplib.scene = scene = bpy.context.scene
PI = math.pi

# --- flat stand-ins for the paint; the generated textures replace them ----------------------------
P = dict(
    pink=mat("wall_pink", "#ec5d9e", 0.9),
    purple=mat("wall_purple", "#7f5bd0", 0.9),
    teal=mat("wall_teal", "#2fbfb0", 0.9),
    orange=mat("wall_orange", "#f28a3a", 0.9),
    yellow=mat("wall_yellow", "#f4cb4a", 0.9),
    cyan=mat("wall_cyan", "#4bb7ea", 0.9),
    lilac=mat("wall_lilac", "#b9a0f2", 0.9),
    mint=mat("wall_mint", "#8fe0c0", 0.9),
    red=mat("wall_red", "#e0453f", 0.9),
)
WALLS = list(P.values())
# the lane speaks quietly: the same hues, greyed and softened. Only the shop gets the full colour.
Q = dict(
    lilac=mat("quiet_lilac", "#b3a6c9", 0.9),
    teal=mat("quiet_teal", "#8fb5b2", 0.9),
    sand=mat("quiet_sand", "#dcc0a6", 0.9),
    mauve=mat("quiet_mauve", "#c29ab2", 0.9),
    slate=mat("quiet_slate", "#9ea8cc", 0.9),
    peach=mat("quiet_peach", "#e2b4a0", 0.9),
)
QUIET = list(Q.values())
QDOOR = mat("quiet_door", "#7c6577", 0.9)  # the lane's doors: dark and soft, so the shop's is the one that glows
QROOF = [mat("quiet_roof_a", "#b8786a", 0.9), mat("quiet_roof_b", "#8f84ad", 0.9)]
TRIM = mat("trim", "#38206a", 0.9)
GLASS = mat("pane", "#1b1f46", 0.4)
SLOT = mat("slot", "#f6efe0", 0.9)
CLOTH = [mat(f"cloth_{i}", c, 0.9) for i, c in enumerate(["#e9a6c3", "#f1dc9a", "#9fd0cb", "#eab992"])]
STONE = mat("cobble", "#9887a8", 0.95)
STONE2 = mat("cobble_b", "#7f7092", 0.95)
KERB = mat("kerb", "#5a4a74", 0.95)
ROOF = mat("roof_tile", "#c8553a", 0.9)
ROOF2 = mat("roof_tile_b", "#7f5bd0", 0.9)
LEAF = mat("leaf", "#3fa860", 0.8)
LEAF2 = mat("leaf_dark", "#237a4a", 0.8)
POT = mat("pot", "#c4623b", 0.9)
GOLD = mat("gold", "#e8b23a", 0.4, 0.4)
WOOD = mat("wood", "#a8683f", 0.9)
METAL = mat("metal", "#4a4458", 0.5, 0.4)
RUB = mat("rubber", "#1b1626", 0.9)
FLAME = mat("flame", "#ffb347", 0.5, 0.0, 1.0, 4.0)
WIRE = mat("wire", "#231a3a", 0.8)
DOG = mat("dog", "#c9884a", 0.9)
INK = mat("ink", "#1a1230", 0.9)


# --- openings --------------------------------------------------------------------------------------------
def outline(kind, w, h, n=10):
    """Closed (x, z) outlines for window and door shapes, centred on x = 0, bottom at z = 0."""
    if kind == "arch":
        r = w / 2
        return [(w / 2, 0.0), (w / 2, h - r)] + [(r * math.cos(i * PI / n), h - r + r * math.sin(i * PI / n)) for i in range(1, n)] + [(-w / 2, h - r), (-w / 2, 0.0)]
    if kind == "round":
        r = max(w, h) / 2
        return [(r * math.cos(i * PI / n), r + r * math.sin(i * PI / n)) for i in range(2 * n)]
    if kind == "slit":
        r = w / 2
        return [(r * math.cos(i * PI / n), h - r + r * math.sin(i * PI / n)) for i in range(n + 1)] + [(r * math.cos(PI + i * PI / n), r + r * math.sin(PI + i * PI / n)) for i in range(n + 1)]
    c = min(w, h) * 0.28  # wide: squarish with rounded corners
    pts = []
    for cx_, cz_, a0 in [(w / 2 - c, h - c, 0), (-w / 2 + c, h - c, 90), (-w / 2 + c, c, 180), (w / 2 - c, c, 270)]:
        for i in range(5):
            a = math.radians(a0 + 90 * i / 4)
            pts.append((cx_ + c * math.cos(a), cz_ + c * math.sin(a)))
    return pts


def window(b, x, z, w, h, y, kind="arch", frame=TRIM, pane=GLASS):
    """A window in one of several shapes: a fat tube for the frame, a dark pane
    to paint, and a rounded sill. (x, z) is the bottom centre; y the wall surface."""
    pts = outline(kind, w, h)
    b.prism_xz([(x + u, z + v) for u, v in pts], y - 0.12, y + 0.02, pane)
    b.tube([(x + u, y - 0.14, z + v) for u, v in pts + [pts[0]]], 0.085, frame, 8)
    b.box(x - w / 2 - 0.2, x + w / 2 + 0.2, y - 0.38, y - 0.02, z - 0.16, z - 0.02, frame, bev=0.07)


def rrect(w, d, r, z, cx=0.0, cy=0.0, n=4):
    """A rounded-rectangle ring (counter-clockwise from above) at height z."""
    r = min(r, w / 2 - 0.01, d / 2 - 0.01)
    pts = []
    for ax, ay, a0 in [(w / 2 - r, d / 2 - r, 0), (-(w / 2 - r), d / 2 - r, 90), (-(w / 2 - r), -(d / 2 - r), 180), (w / 2 - r, -(d / 2 - r), 270)]:
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + ax + r * math.cos(a), cy + ay + r * math.sin(a), z))
    return pts


def plant(b, x, y, z, r, rng, n=9):
    b.cyl(x, y, z + r * 0.4, r * 0.8, r * 0.55, r * 0.8, POT, 14)
    for _ in range(n):
        a = rng.uniform(0, 2 * PI)
        d = rng.uniform(0, r * 1.1)
        b.ball(x + d * math.cos(a), y + d * math.sin(a), z + r * rng.uniform(0.9, 2.0), r * rng.uniform(0.35, 0.55), rng.choice([LEAF, LEAF2]), scale=(1, 1, 0.8), u=8, v=6)


def roof(b, kind, cx, cy, z, w, d, rng, wall, cols=None):
    """The silhouette on top: an onion, a flared cone, a barrel, or a scalloped flat."""
    r = min(w, d) / 2
    cols = cols or [ROOF, ROOF2]
    if kind == "onion":
        b.lathe([(0, 0), (r * 1.08, 0), (r * 1.18, r * 0.35), (r * 0.9, r * 0.95), (r * 0.45, r * 1.5), (r * 0.12, r * 2.1), (0.0, r * 2.9)], (cx, cy, z), rng.choice(cols), 28)
        b.tube([(cx, cy, z + r * 2.8), (cx, cy, z + r * 3.5)], 0.05, GOLD, 6)
        b.ball(cx, cy, z + r * 3.55, 0.14, GOLD, u=10, v=8)
    elif kind == "cone":
        b.lathe([(0, 0), (r * 1.35, 0), (r * 1.1, r * 0.22), (r * 0.7, r * 1.2), (r * 0.32, r * 2.6), (0, r * 4.0)], (cx, cy, z), rng.choice(cols), 24)
    elif kind == "barrel":
        b.cyl(cx, cy, z, r * 1.05, r * 1.05, d * 0.98, rng.choice(cols), 22, rot=(PI / 2, 0, 0))
        b.box(cx - r * 1.05, cx + r * 1.05, cy - d / 2, cy + d / 2, z - r * 1.05, z, wall)
    else:  # scalloped flat, with a water tank, as on every roof here
        b.box(cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z, z + 0.45, wall, bev=0.14, cuts=2)
        nn = max(3, int(w / 0.7))
        for i in range(nn):
            b.ball(cx - w / 2 + (i + 0.5) * w / nn, cy - d / 2 + 0.1, z + 0.5, 0.26, wall, u=8, v=6)
        tx, ty = cx + w * 0.18, cy + d * 0.1
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.cyl(tx + sx * 0.55, ty + sy * 0.55, z + 0.95, 0.06, 0.06, 1.0, METAL, 8)
        b.cyl(tx, ty, z + 1.9, 0.9, 0.9, 1.0, P["cyan"], 20)
        b.cyl(tx, ty, z + 2.6, 0.9, 0.18, 0.4, P["cyan"], 20)


# --- a stack of rounded storeys -------------------------------------------------------------------------
def stack(b, z, w, d, storeys, rng, walls, jet, quiet=False, ground=False, shop=None, bay=True, cx=0.0, accent=None, roofs=None, door=None):
    """Skin storeys one on another from height z. Each swells in the middle and
    tapers to its top, is a little different in width, and sits a bit further
    out over the street than the one below. Returns (top z, centre x, top width)."""
    accent = accent or WALLS
    n = len(storeys)
    Wd = [w]
    for i in range(n):
        Wd.append(Wd[-1] * rng.uniform(0.9, 1.03) * (0.92 if i == n - 1 else 1.0))
    for i, h in enumerate(storeys):
        wi, wj = Wd[i], Wd[i + 1]
        jt = jet * i  # this storey's front has stepped out by jt
        depth = d + jt
        cyc = (d - jt) / 2  # centre y, so the front is at -jt and the back at d
        sh = rng.uniform(-0.2, 0.2)
        mid = max(wi, wj) * (1 + (0.0 if quiet else rng.uniform(0.03, 0.1)))
        b.loft([rrect(wi, depth, 0.9, z, cx, cyc), rrect(mid, depth, 1.0, z + h * 0.5, cx + sh * 0.5, cyc), rrect(wj, depth, 0.9, z + h, cx + sh, cyc)], walls[i % len(walls)])
        b.loft([rrect(wj + 0.45, depth + 0.35, 1.0, z + h - 0.1, cx + sh, cyc - 0.1), rrect(wj + 0.6, depth + 0.5, 1.0, z + h + 0.08, cx + sh, cyc - 0.15)], TRIM)  # curved ledge
        fy = -jt
        xm = cx + sh * 0.5
        if i == 0 and ground:
            b.loft([rrect(wi + 0.3, depth + 0.3, 0.9, z - 0.01, cx, cyc), rrect(wi + 0.3, depth + 0.3, 0.9, z + 0.5, cx, cyc)], KERB)  # a fat plinth
            window(b, xm - wi * 0.2, 0.0, 1.5, 2.7, fy, "arch", TRIM, door or WOOD)  # the door
            if shop:
                aw = wi * 0.5
                b.cyl(xm + wi * 0.16, fy - 0.45, 2.95, 0.75, 0.75, aw, rng.choice(accent), 20, rot=(0, PI / 2, 0))  # a curved canopy
                panel(b, (xm + wi * 0.16 - aw / 2, fy - 0.05, 3.2), (aw, 0, 0), (0, 0, 0.75), 4, 1, SLOT)  # the shop's sign, to paint
        else:
            count = 1 if quiet else max(1, int((wj - 1.0) / 2.2))
            for k in range(count):
                x = xm if count == 1 else xm - (wj - 2.2) * 0.4 + k * ((wj - 2.2) * 0.8 / (count - 1))
                kind = "slit" if quiet else rng.choice(["arch", "arch", "round", "slit", "wide"])
                hh = (rng.uniform(1.3, 1.9) if kind != "round" else rng.uniform(0.9, 1.2)) * (1.25 if quiet else 1.0)
                ww = rng.uniform(0.8, 1.15) if kind != "round" else hh
                window(b, x, z + h * 0.3, ww, hh, fy, kind)
        if bay and not quiet and i == 1 and rng.random() < 0.85:  # a round bay, with its own little roof
            bx = xm + rng.choice((-1, 1)) * wj * 0.24
            b.cyl(bx, fy, z + h * 0.45, 0.95, 0.95, h * 0.62, rng.choice(accent), 20)
            b.cyl(bx, fy, z + h * 0.45 + h * 0.31 + 0.3, 1.08, 0.0, 0.75, (roofs or [ROOF])[0], 20)
        z += h
        cx += sh
    return z, cx, Wd[-1]


def tower(name, loc, rot, w, d, storeys, rng, walls, roof_kind, seed, lean, bend, lean_y=0.012, quiet=False, shop=None, mural=False):
    """One crooked tower, facade facing -y at local y = 0, the body going back +y."""
    b = B(name, "Buildings")
    jet = 0.0 if quiet else rng.choice((0.0, 0.14, 0.22))
    z, cx, wt = stack(b, 0.0, w, d, storeys, rng, walls, jet, quiet, ground=True, shop=shop, accent=QUIET, roofs=QROOF, door=QDOOR)
    roof(b, roof_kind, cx * 0.6, d / 2, z, wt * 0.95, d * 0.9, rng, walls[0], QROOF)
    warp = wobble(0.06, 0.4, seed, lean, lean_y, bend)
    if mural:  # a big clean wall to paint, kept flat
        m = B(f"mural_{name}", "Slots")
        panel(m, (-w * 0.3, -0.02, storeys[0] + 0.5), (w * 0.6, 0, 0), (0, 0, min(6.0, storeys[1] + storeys[0] * 0.4)), 4, 3, SLOT)
        m.build(loc=loc, rot=rot, warp=warp, recalc=False)
    return b.build(loc=loc, rot=rot, warp=warp)


# --- the ground: a lane 8 m wide that opens into a small square before the shop ----------------------------
rng = random.Random(11)
g = B("ground", "Ground")
g.box(-16, 16, -30, 0.0, -0.8, -0.05, STONE2)
for i in range(300):  # chunky cobbles, hand-set
    x = rng.uniform(-7.5, 7.5)
    y = rng.uniform(-29, -0.4)
    if abs(x) > (4.1 if y < -9 else 8.0):
        continue
    sx, sy = rng.uniform(0.55, 1.0), rng.uniform(0.45, 0.85)
    g.box(x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, -0.08, 0.04 + rng.uniform(0, 0.03), rng.choice([STONE, STONE2]), bev=0.1, rot=(0, 0, rng.uniform(-0.3, 0.3)))
for sx in (-1, 1):  # raised kerb stones
    for k in range(20):
        y = -29 + k * 1.05
        g.box(sx * 4.2 - 0.25, sx * 4.2 + 0.25, y, y + 0.95, -0.08, 0.28, KERB, bev=0.12)
g.build(warp=wobble(0.03, 0.5, 2.0))

# --- the towers that line the lane: tall, crooked, all different. The near left ones are quiet. -----------------
rg = random.Random(21)
LEFT = [  # (y, width, storeys, walls, roof, quiet)
    (-9.0, 5.8, [3.6, 3.0, 3.0, 2.8], [Q["teal"], Q["sand"]], "flat", False),
    (-15.0, 6.4, [3.6, 3.5, 3.5, 3.4, 3.2], [Q["lilac"]], "barrel", True),
    (-21.2, 5.8, [3.6, 3.5, 3.5, 3.3], [Q["sand"]], "cone", True),
    (-27.0, 6.0, [3.6, 3.0, 3.0], [Q["slate"], Q["lilac"]], "onion", False),
]
for i, (yc, w, st, wl, rf, qt) in enumerate(LEFT):  # left side: the facade faces +x, so local x runs along +y
    tower(f"lane_l{i}", (-4.0, yc, 0), (0, 0, PI / 2), w, 9.0, st, rg, wl, rf, seed=i * 3.1, lean=rg.uniform(-0.012, 0.012), bend=rg.uniform(-0.25, 0.25), quiet=qt, shop=("kirana" if i == 0 else None), mural=(i == 1))
RIGHT = [
    (-10.0, 6.0, [3.7, 3.0, 3.0, 3.0, 2.8], [Q["peach"], Q["mauve"]], "cone", False),
    (-16.2, 5.4, [3.6, 3.0, 3.0, 2.8], [Q["teal"], Q["sand"]], "flat", False),
    (-22.0, 6.2, [3.7, 3.0, 3.0, 3.0, 3.0], [Q["mauve"], Q["slate"]], "onion", False),
    (-28.0, 5.6, [3.6, 3.0, 3.0], [Q["lilac"], Q["peach"]], "barrel", False),
]
for i, (yc, w, st, wl, rf, qt) in enumerate(RIGHT):
    tower(f"lane_r{i}", (4.0, yc, 0), (0, 0, -PI / 2), w, 9.0, st, rg, wl, rf, seed=i * 4.7 + 1, lean=rg.uniform(-0.012, 0.012), bend=rg.uniform(-0.25, 0.25), shop=("chai" if i == 0 else None))
tower("flank_l", (-9.4, 0, 0), (0, 0, 0), 9.0, 9.0, [3.8, 3.2, 3.2, 3.0], rg, [Q["lilac"], Q["mauve"]], "flat", seed=40, lean=-0.012, bend=0.2, shop="tailor")
tower("flank_r", (9.4, 0, 0), (0, 0, 0), 9.0, 9.0, [3.8, 3.2, 3.0], rg, [Q["teal"], Q["sand"]], "onion", seed=41, lean=0.012, bend=-0.2, shop="tea")

# --- the hero: the Babajee shop, the tallest crooked tower, ending in an onion crown ----------------------------------
rh = random.Random(5)
b = B("shop_front", "Hero")
W2 = 4.9
GH = 4.2
for x0, x1 in [(-W2, -3.8), (-2.2, -1.4), (3.7, W2)]:  # the piers, rounded
    b.box(x0, x1, -0.3, 0.6, 0.0, GH, P["purple"], cuts=3)
b.box(-3.8, -2.2, -0.3, 0.6, 2.7, GH, P["purple"], cuts=3)
b.box(-1.4, 3.7, -0.3, 0.6, 0.0, 0.7, P["purple"], cuts=3)
CXw, HALF, TOPw, SPR = 1.1, 2.6, 3.5, 2.5  # the arched shop window
R_ = (HALF ** 2 + (TOPw - SPR) ** 2) / (2 * (TOPw - SPR))
CZ_ = TOPw - R_
a0, a1 = math.atan2(SPR - CZ_, -HALF), math.atan2(SPR - CZ_, HALF)
archp = arc(CXw, CZ_, R_, a0, a1, 24)
b.prism_xz(archp + [(3.7, GH), (-1.4, GH)], -0.3, 0.6, P["purple"])
b.tube([(x, -0.35, z) for x, z in archp], 0.17, TRIM, 8)
for x in (-1.4, 3.7):
    b.tube([(x, -0.35, 0.7), (x, -0.35, SPR)], 0.17, TRIM, 8)
b.box(-1.7, 4.0, -0.9, -0.1, 0.62, 0.8, TRIM, bev=0.12)
b.prism_xz([(-1.4, 0.7)] + archp + [(3.7, 0.7)], -0.02, 0.02, GLASS)
b.box(-4.4, -2.0, -0.9, 0.2, -0.05, 0.22, KERB, bev=0.12)
# the tower above: five storeys, each different, stepping out and narrowing, crowned by an onion dome
zt, cxt, wt = stack(b, GH, 9.8, 11.0, [3.1, 3.0, 2.9, 2.6, 2.3], rh, [P["pink"], P["teal"], P["orange"], P["yellow"], P["pink"]], 0.4, bay=True, cx=0.0, accent=[P["yellow"], P["cyan"], P["orange"]], roofs=[P["red"]])
b.loft([rrect(wt + 0.9, 11.4, 1.0, zt, cxt, 5.2), rrect(wt + 1.1, 11.6, 1.0, zt + 0.25, cxt, 5.2)], TRIM)
roof(b, "onion", cxt, 5.2, zt + 0.25, wt * 1.1, wt * 1.1, rh, P["pink"], [P["red"]])
b.box(-W2 - 0.2, W2 + 0.2, -0.45, 0.45, GH - 0.1, GH + 0.2, TRIM, bev=0.12)
b.build(warp=wobble(0.06, 0.38, 7.0, 0.01, 0.01, 0.2))

# the door, as an object that can swing: arched top, hinged like the shop's
d = B("door_leaf", "Hero")
d.box(0, 1.4, -0.07, 0.07, 0.0, 2.35, WOOD, bev=0.07, cuts=2)
d.cyl(0.7, 0.0, 2.35, 0.7, 0.7, 0.14, WOOD, 20, rot=(PI / 2, 0, 0))
panel(d, (0.12, -0.1, 0.25), (1.16, 0, 0), (0, 0, 2.2), 2, 3, SLOT)
dob = d.build(loc=(-3.7, 0.0, 0.0), warp=wobble(0.02, 0.8, 4.0))
dob.rotation_euler = (0, 0, math.radians(95))

# paint slots on the hero: the sign over the window, and a band of folk figures under the crown
slots = B("shop_slots", "Slots")
panel(slots, (-1.2, -0.37, 4.35), (4.6, 0, 0), (0, 0, 2.0), 6, 2, SLOT)  # sign_main
slots.build(warp=wobble(0.06, 0.38, 7.0, 0.01, 0.01, 0.2), recalc=False)

# --- props, each with a reason ------------------------------------------------------------------------------------------
rp = random.Random(31)
b = B("rickshaw", "Props")  # parked in the lane
b.box(-1.0, 1.1, -0.7, 0.7, 0.35, 0.95, Q["sand"], bev=0.22, cuts=2)
b.box(-0.6, 0.9, -0.68, 0.68, 0.95, 1.65, Q["sand"], bev=0.18, cuts=2)
b.box(-0.75, 1.05, -0.78, 0.78, 1.65, 1.8, INK, bev=0.12)
b.box(-0.55, 0.85, -0.7, 0.7, 1.0, 1.55, GLASS, bev=0.06)
b.ball(1.3, 0, 0.7, 0.55, Q["sand"], scale=(0.7, 0.9, 0.9), u=12, v=8)
for wx, wy in ((1.45, 0), (-0.7, 0.72), (-0.7, -0.72)):
    b.lathe([(0, -0.09), (0.28, -0.09), (0.32, -0.06), (0.32, 0.06), (0.28, 0.09), (0, 0.09)], (wx, wy, 0.32), RUB, 18, rot=(PI / 2, 0, 0))
b.build(loc=(-2.4, -13.5, 0), rot=(0, 0, 0.5), warp=wobble(0.03, 0.9, 3.0))
b = B("chai_stall", "Props")  # for the people who wait
b.box(-0.9, 0.9, -0.5, 0.5, 0.0, 0.95, Q["peach"], bev=0.14, cuts=2)
b.box(-1.0, 1.0, -0.6, 0.6, 0.95, 1.05, TRIM, bev=0.08)
for sx in (-1, 1):
    b.tube([(sx * 0.95, -0.55, 1.05), (sx * 0.95, -0.55, 2.4)], 0.04, WOOD, 6)
b.cyl(0, 0, 2.38, 1.35, 0.9, 0.16, Q["teal"], 20)
b.lathe([(0, 0), (0.22, 0), (0.26, 0.18), (0.18, 0.34), (0.1, 0.4), (0, 0.4)], (0.3, 0, 1.05), METAL, 14)
b.build(loc=(3.4, -7.4, 0), rot=(0, 0, -PI / 2 + 0.2), warp=wobble(0.03, 0.9, 5.0))
for k, (sx, sy) in enumerate([(2.4, -5.6), (2.0, -8.3), (2.9, -9.2)]):
    s_ = B(f"stool_{k}", "Props")
    s_.cyl(0, 0, 0.35, 0.26, 0.24, 0.1, Q["mauve"], 12)
    for a in (0, 2.1, 4.2):
        s_.tube([(0.14 * math.cos(a), 0.14 * math.sin(a), 0.3), (0.2 * math.cos(a), 0.2 * math.sin(a), 0.0)], 0.03, WOOD, 6)
    s_.build(loc=(sx, sy, 0))
b = B("shrine", "Props")  # a niche in the wall, with a diya, because every lane has one
b.box(-0.5, 0.5, -0.1, 0.55, 1.2, 2.2, Q["mauve"], bev=0.16, cuts=2)
b.cyl(0, 0.0, 2.2, 0.5, 0.5, 0.65, Q["mauve"], 20, rot=(PI / 2, 0, 0))
b.box(-0.4, 0.4, 0.1, 0.5, 1.28, 1.6, INK, bev=0.06)
b.lathe([(0, 0), (0.12, 0), (0.15, 0.04), (0.11, 0.07), (0, 0.05)], (0, 0.3, 1.5), GOLD, 14)
b.ball(0, 0.3, 1.63, 0.035, FLAME, scale=(1, 1, 1.8), u=8, v=6)
b.build(loc=(-4.0, -11.5, 0), rot=(0, 0, PI / 2), warp=wobble(0.03, 0.9, 6.0))
empty("lamp_shrine", (-3.6, -11.5, 1.7), "Lights", kind="shop")
b = B("dog", "Props")  # asleep on the cobbles
b.ball(0, 0, 0.28, 0.4, DOG, scale=(1.5, 0.8, 0.7), u=14, v=10)
b.ball(0.62, 0.05, 0.38, 0.22, DOG, u=12, v=8)
for sg in (-1, 1):
    b.ball(0.58, sg * 0.2, 0.52, 0.1, DOG, scale=(0.6, 0.3, 1.0), u=8, v=6)
b.tube([(-0.55, 0, 0.35), (-0.8, 0.15, 0.2), (-0.95, 0.3, 0.12)], 0.05, DOG, 6)
b.build(loc=(1.4, -11.0, 0), rot=(0, 0, 0.6), warp=wobble(0.02, 1.0, 8.0))
b = B("planters", "Props")  # outside the doors that have them
for k, (px, py) in enumerate([(-3.5, -16.0), (3.5, -13.8), (-3.5, -21.0), (3.5, -19.5), (-3.4, -26.0), (3.4, -25.0), (-3.3, -6.0), (3.3, -2.8)]):
    plant(b, px, py, 0.0, 0.34 + 0.08 * (k % 3), rp, 11)
b.build(warp=wobble(0.03, 0.9, 10.0))
b = B("scooter", "Props")  # leaning on a wall, because someone lives here
b.box(-0.6, 0.6, -0.14, 0.14, 0.45, 0.7, Q["slate"], bev=0.14, cuts=2)
b.box(-0.5, 0.1, -0.16, 0.16, 0.7, 0.8, WOOD, bev=0.06)
b.tube([(0.5, 0, 0.7), (0.55, 0, 1.15), (0.5, -0.4, 1.15), (0.5, 0.4, 1.15)], 0.03, METAL, 6)
for wx in (-0.55, 0.6):
    b.lathe([(0, -0.07), (0.22, -0.07), (0.25, -0.04), (0.25, 0.04), (0.22, 0.07), (0, 0.07)], (wx, 0, 0.25), RUB, 16, rot=(PI / 2, 0, 0))
b.build(loc=(-3.4, -19.0, 0), rot=(0, 0, 0.08), warp=wobble(0.02, 1.0, 12.0))

# --- overhead: wires and bunting, which tie the sides together and lead the eye -----------------------------------------
w_ = B("wires_and_bunting", "Props")
for k, (y, z) in enumerate([(-8.5, 8.2), (-15.0, 9.0), (-22.0, 8.6)]):
    pts = [(-4.0 + 8.0 * t, y + 0.3 * math.sin(t * 5), z - 1.1 * 4 * t * (1 - t)) for t in [i / 24 for i in range(25)]]
    w_.tube(pts, 0.03, WIRE, 5)
    for i in range(2, 23, 3):
        px, py, pz = pts[i]
        w_.prism_xz([(px - 0.2, pz), (px + 0.2, pz), (px, pz - 0.5)], py - 0.01, py + 0.01, CLOTH[(i + k) % len(CLOTH)])
for k, (x, y, z) in enumerate([(-3.0, -12.0, 6.0), (3.1, -18.0, 6.4)]):  # paper lanterns, kept to the sides
    w_.tube([(x, y, z + 2.0), (x, y, z + 0.5)], 0.02, WIRE, 5)
    w_.ball(x, y, z, 0.38, CLOTH[k % len(CLOTH)], scale=(1, 1, 1.25), u=12, v=8)
w_.build(warp=wobble(0.02, 0.8, 14.0))


# --- the walk: down the lane to the door ---------------------------------------------------------------------------------
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


# the opening frame sits a little left of the lane's middle, looking further left, so the shop lands in the right half
camera("cam_00", (-0.6, -23.0, 2.3), (-3.6, 0.0, 7.5))
camera("cam_01", (-0.8, -15.0, 2.0), (-1.8, 0.0, 5.5))
camera("cam_02", (-1.8, -8.5, 1.9), (-2.8, 0.0, 3.5))
camera("cam_03", (-3.0, -4.4, 1.75), (-3.0, 0.0, 2.0))
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

# --- export --------------------------------------------------------------------------------------------------------------------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_cameras=True, export_extras=True, export_apply=True, export_yup=True,
    export_draco_mesh_compression_enable="--nodraco" not in argv, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes")
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))

# --- preview: flat colour with real ink outlines (Freestyle), to judge the shapes in the intended look ---------------------------
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(arg("--samples", "24"))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.95, 0.72, 0.82, 1)
    bg.inputs["Strength"].default_value = 2.2
    scene.world = world
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = 0.2
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(-35))
    scene.collection.objects.link(so)
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 2.6
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(120)
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("ink")
    ls.select_silhouette = ls.select_border = ls.select_crease = ls.select_external_contour = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = (0.04, 0.02, 0.1)
    ls.linestyle.thickness = 2.6
    extra = {
        "landing": camera("pv_landing", (-0.6, -23.0, 2.3), (-3.6, 0.0, 7.5), 58),
        "mid": camera("pv_mid", (-0.8, -13.0, 1.9), (-1.5, 0.0, 6.0), 62),
        "square": camera("pv_square", (-2.0, -7.0, 1.8), (-1.0, 0.0, 6.0), 64),
        "aerial": camera("pv_aerial", (14.0, -26.0, 17.0), (0.0, -8.0, 4.0), 55),
    }
    for n in arg("--shots", "landing,mid,square,aerial").split(","):
        cam = extra[n] if n in extra else bpy.data.objects[n]
        scene.camera = cam
        scene.render.filepath = os.path.join(os.path.abspath(PREVIEW), f"{n}.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
