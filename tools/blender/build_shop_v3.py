"""Babajee shop, version 3: the v2 interior (walnut shelving, warm strips under
every shelf, charcoal walls, pale floor, purple rug, the plaque over the
counter) redesigned for a grand hall at the scale of the old magical room
(tools/blender/_prev/shop.blend: about 10 x 15 x 9.6 m). A blockout to render
a 360 panorama from and paint over (Seedream), not a site model.

    blender -b -P tools/blender/build_shop_v3.py -- \
        --blend tools/blender/shop_v3.blend --preview tools/blender/preview_v3 [--pano] [--samples 48]

Plan (metres, Z up): the hall runs x -6..6, y 0..16, z 0..9; the way in is in
the middle of the y = 0 wall. Ground floor: walnut bays on both side walls,
one per category, and island tables round the rug for the small things.
A gallery at 4.4 m wraps the sides and the back, with tall lit glass shelves
above it. Two grand flights rise to the back gallery either side of the
counter; the plaque hangs big above it. A coffered ceiling with a skylight
lantern and pendant clusters. pano_cam: eye height, the middle of the rug.
hot_*: one empty per category (extras.categories = slug, extras.label).
"""

import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

# the v2 kit: setup, materials, bongs, jars, grinders, plants (its lines up to
# the facade), run here so both versions share one look
_src = open(os.path.join(HERE, "build_shop_v2.py"), encoding="utf-8").read()
_src = _src[: _src.index("WY = 1.6  # its face")]
sys.argv = [sys.argv[0], "--"] + argv  # the kit reads its own --args
exec(compile(_src, os.path.join(HERE, "build_shop_v2.py"), "exec"))

from mathutils import Vector  # noqa: E402

PREVIEW = arg("--preview")
BLEND = arg("--blend")
rng = random.Random(7)

# --- the hall -------------------------------------------------------------------------------
X0, X1, Y0, Y1, Z1 = -6.0, 6.0, 0.0, 16.0, 9.0
GZ = 4.4  # the gallery's floor
GD = 1.3  # how far the gallery reaches out from the wall: shallow, so it overhangs nothing on the floor
DOOR_W, DOOR_H = 2.4, 3.6

M2 = dict(
    coffer=mat("v3_coffer", "#2a1a10", 0.7),
    lantern=mat("v3_lantern", "#ffe6b8", 0.4, 0.0, 1.0, 1.4),
    wall_hi=mat("v3_wall_hi", "#33333a", 0.9),
    stone=mat("v3_stone", "#8c867c", 0.6),
    clear=mat("v3_clear_glass", "#ffffff", 0.0),
)
# the balustrade: clear glass, so a render (and Seedream after it) sees the
# shelves straight through it; IOR barely above air keeps them from bending,
# leaving only a faint reflection to say there is glass there
_pc = M2["clear"].node_tree.nodes["Principled BSDF"]
_pc.inputs["Transmission Weight"].default_value = 1.0
_pc.inputs["IOR"].default_value = 1.05
_pc.inputs["Specular IOR Level"].default_value = 0.25

shell = B("hall_shell", "Interior")
shell.box(X0, X1, Y0, Y1, -0.1, 0.0, M["floor"], cuts=8)  # floor
shell.box(X0 - 0.3, X0, Y0, Y1, 0.0, Z1, M["wall_in"])  # left wall
shell.box(X1, X1 + 0.3, Y0, Y1, 0.0, Z1, M["wall_in"])  # right wall
shell.box(X0, X1, Y1, Y1 + 0.3, 0.0, Z1, M["wall_in"])  # back wall
# front wall with the way in
shell.box(X0, -DOOR_W / 2, Y0 - 0.3, Y0, 0.0, Z1, M["wall_in"])
shell.box(DOOR_W / 2, X1, Y0 - 0.3, Y0, 0.0, Z1, M["wall_in"])
shell.box(-DOOR_W / 2, DOOR_W / 2, Y0 - 0.3, Y0, DOOR_H, Z1, M["wall_in"])
shell.box(-DOOR_W / 2, DOOR_W / 2, Y0 - 0.32, Y0 - 0.3, 0.0, DOOR_H, M["door_glass"])
# a walnut frame round the way in
for x in (-DOOR_W / 2 - 0.25, DOOR_W / 2):
    shell.box(x, x + 0.25, Y0, Y0 + 0.12, 0.0, DOOR_H + 0.25, M["walnut"])
shell.box(-DOOR_W / 2 - 0.25, DOOR_W / 2 + 0.25, Y0, Y0 + 0.12, DOOR_H, DOOR_H + 0.25, M["walnut"])
# a dado of walnut panelling round the ground floor, and a cornice at the gallery line
for (xa, xb, ya, yb) in ((X0, X0 + 0.04, Y0, Y1), (X1 - 0.04, X1, Y0, Y1), (X0, X1, Y1 - 0.04, Y1)):
    shell.box(xa, xb, ya, yb, GZ + 3.9, GZ + 4.05, M["walnut_dk"])  # top cornice under the ceiling
shell.build()

# the ceiling: walnut coffers round a big skylight lantern in the middle
ceil = B("hall_ceiling", "Interior")
ceil.box(X0, X1, Y0, Y1, Z1, Z1 + 0.2, M["ceiling"])
LX, LY = (-2.2, 2.2), (5.0, 11.0)  # the lantern's opening
for k in range(7):  # beams across
    y = Y0 + k * (Y1 - Y0) / 6
    ceil.box(X0, X1, y - 0.14, y + 0.14, Z1 - 0.45, Z1, M2["coffer"], bev=0.02)
for k in range(5):  # beams along
    x = X0 + k * (X1 - X0) / 4
    ceil.box(x - 0.14, x + 0.14, Y0, Y1, Z1 - 0.45, Z1, M2["coffer"], bev=0.02)
ceil.build()
lan = B("lantern", "Interior")
lan.box(LX[0], LX[1], LY[0], LY[1], Z1 - 0.02, Z1 + 0.01, M2["lantern"])  # the glowing skylight
for x in (LX[0], 0.0, LX[1]):  # its glazing bars
    lan.box(x - 0.05, x + 0.05, LY[0], LY[1], Z1 - 0.08, Z1 - 0.02, M["brass"])
for y in (LY[0], 7.0, 9.0, LY[1]):
    lan.box(LX[0], LX[1], y - 0.05, y + 0.05, Z1 - 0.08, Z1 - 0.02, M["brass"])
lan.build()

# --- the gallery: sides and back, at GZ, held off the walls with no posts, glass rails ----
# Nothing stands between the floor and the shelves: no posts, a thin deck, and a
# glass balustrade under a slim brass rail, so the shelves above read through it.
gal = B("gallery", "Fixtures")
GAL_FRONT_Y = Y1 - GD
GAL_Y0 = 1.85  # the side decks start where the corner spirals land


def rail(b, p0, p1):
    """A glass balustrade from p0 to p1 (x, y) along the deck's edge."""
    (xa, ya), (xb, yb) = p0, p1
    b.quad((xa, ya, GZ + 0.05), (xb, yb, GZ + 0.05), (xb, yb, GZ + 1.0), (xa, ya, GZ + 1.0), M2["clear"])
    b.tube([(xa, ya, GZ + 1.05), (xb, yb, GZ + 1.05)], 0.03, M["brass"], 10)
    b.tube([(xa, ya, GZ + 0.03), (xb, yb, GZ + 0.03)], 0.015, M["brass"], 6)


for side in (-1, 1):
    wall = X0 if side < 0 else X1
    edge = wall - side * GD
    xa, xb = (wall, edge) if side < 0 else (edge, wall)
    gal.box(xa, xb, GAL_Y0, Y1, GZ - 0.22, GZ, M["walnut"], bev=0.01)  # deck
    gal.box(min(edge, edge - side * 0.05), max(edge, edge - side * 0.05), GAL_Y0, GAL_FRONT_Y, GZ - 0.26, GZ, M["walnut_dk"])  # fascia
    gal.box(min(edge, edge - side * 0.055), max(edge, edge - side * 0.055), GAL_Y0, GAL_FRONT_Y, GZ - 0.2, GZ - 0.186, M["led"])  # a warm line along it
    rail(gal, (edge, GAL_Y0), (edge, GAL_FRONT_Y))
gal.box(X0 + GD, X1 - GD, GAL_FRONT_Y, Y1, GZ - 0.22, GZ, M["walnut"], bev=0.01)  # the back deck
gal.box(X0 + GD, X1 - GD, GAL_FRONT_Y - 0.05, GAL_FRONT_Y, GZ - 0.26, GZ, M["walnut_dk"])
gal.box(X0 + GD, X1 - GD, GAL_FRONT_Y - 0.055, GAL_FRONT_Y - 0.05, GZ - 0.2, GZ - 0.186, M["led"])
rail(gal, (X0 + GD, GAL_FRONT_Y), (X1 - GD, GAL_FRONT_Y))
gal.build()

# --- shelving: walnut, lit strips under every shelf ---------------------------------------
def shelving(name, side, y0, y1, z0, top, depth, shelf_z, fill, slug=None, label=None, slot=0.2):
    """A walnut unit on a side wall (side -1 left, +1 right) from z0 up to top."""
    wall = X0 if side < 0 else X1
    inner = wall - side * depth
    xa, xb = (wall, inner) if side < 0 else (inner, wall)
    b = B(name, "Fixtures")
    if z0 == 0.0:
        b.box(xa, xb, y0, y1, 0.0, 0.08, M["walnut_dk"])
        b.box(xa, xb, y0, y1, 0.08, shelf_z[0] - 0.04, M["walnut"], bev=0.01)  # cupboard
    for yy in (y0, y1 - 0.06):
        b.box(xa, xb, yy, yy + 0.06, z0, top, M["oak"], bev=0.006)
    b.box(xa, xb, y0, y1, top, top + 0.25, M["walnut_dk"])  # crown
    bx0, bx1 = (wall, wall + 0.02) if side < 0 else (wall - 0.02, wall)
    b.box(bx0, bx1, y0, y1, z0, top, M["walnut_dk"])
    for i, z in enumerate(shelf_z):
        b.box(xa, xb, y0 + 0.06, y1 - 0.06, z - 0.035, z, M["walnut_dk"], bev=0.004)
        under = shelf_z[i + 1] - 0.035 if i + 1 < len(shelf_z) else top
        b.box(inner + side * 0.025, inner + side * 0.07, y0 + 0.08, y1 - 0.08, under - 0.014, under, M["led"])
        h_room = under - z - 0.05
        n = max(2, int((y1 - y0 - 0.12) / slot))
        for k in range(n):
            y = y0 + 0.1 + (y1 - y0 - 0.2) * (k + 0.5) / n
            x = wall - side * depth * 0.5
            fill(b, x, y, z, h_room, i)
    b.build()
    if slug:
        hot(slug, ((wall - side * depth) * 1.0, (y0 + y1) / 2, z0 + 1.6), label)
        crown_label(name + "_label", side, (y0 + y1) / 2, top + 0.12, depth, label)
    GLOWS.append(((min(xa, xb), y0, z0, max(xa, xb), y1, top), shelf_z[0], shelf_z))


def crown_label(name, side, y, z, depth, label):
    wall = X0 if side < 0 else X1
    t = B(name, "Fixtures")
    t.text(label.upper(), (wall - side * (depth + 0.005), y, z), 0.13, M["cream"], rot=(math.pi / 2, 0, -side * math.pi / 2), extrude=0.004, fnt=FONT2)
    t.build()


def stock(kind):
    def f(b, x, y, z, room, i):
        r = rng.random()
        if kind == "glass" or (kind == "mix" and i in (1, 2)):
            bong(b, x, y, z, rng, h=min(room, rng.uniform(0.3, 0.6)))
        elif kind == "jars" or i == 0:
            jar(b, x, y, z, 0.06, min(room, 0.16), rng.choice(GLASSES), M["black"])
        elif kind == "packs":
            w = 0.07
            b.box(x - 0.05, x + 0.05, y - w, y + w, z, z + min(room, rng.uniform(0.12, 0.2)), rng.choice(PACKS), bev=0.004)
        else:
            if r < 0.5:
                jar(b, x, y, z, 0.05, min(room, 0.14), rng.choice(TINS), M["black"])
            else:
                b.box(x - 0.05, x + 0.05, y - 0.07, y + 0.07, z, z + min(room, 0.15), rng.choice(PACKS), bev=0.004)
    return f


GROUND_Z = [0.9, 1.6, 2.3, 3.0]  # four tall shelves, so what stands on them reads from the middle of the room
LEFT = [("bong", "Bongs", "glass"), ("bong-accessory", "Bong accessories", "bowls"),
        ("blunt-pre-rolled-cone", "Pre-rolled cones", "cones"), ("blunt-wraps", "Blunt wraps", "wraps"),
        ("rolling-paper", "Rolling papers", "papers"), ("rolling-tray", "Rolling trays", "trays"),
        ("cleaning-accessory", "Cleaning", "cleaning"), ("filter", "Filter tips", "filters")]
RIGHT = [("cigars", "Cigars", "cigars"), ("rolling-tobacco", "Rolling tobacco", "tobacco"), ("lighter-refills", "Lighter refills", "refills"),
         ("roach", "Roaches", "roaches"), ("keychain", "Keychains", "keys"), ("accessory", "Accessories", "accessory")]


# --- plain shop packs at true size (metres). Each fill gets one ~0.2 m slot of a
# shelf: x is the middle of the shelf's depth (the wall runs along y, the room
# is towards x = 0), y the slot's middle, z the shelf's top, room the clear height.
def _upright(b, x, y, z, w, d, h, m):  # a pack standing on the shelf, its face to the room
    b.box(x - d / 2, x + d / 2, y - w / 2, y + w / 2, z, z + h, m, bev=0.003)


def _display(b, x, y, z, n, bw, bh, m_box, m_items):  # an open counter box of booklets
    b.box(x - 0.06, x + 0.06, y - 0.085, y + 0.085, z, z + 0.035, m_box, bev=0.003)
    b.box(x + 0.045, x + 0.06, y - 0.085, y + 0.085, z, z + 0.1, m_box, bev=0.003)  # its raised back
    for k in range(n):
        yy = y - 0.07 + k * (0.14 / max(1, n - 1))
        b.box(x - 0.04, x + 0.04, yy - bw / 2, yy + bw / 2, z + 0.01, z + bh, rng.choice(m_items), bev=0.002)


def bong_var(b, x, y, z, rng, h):
    """One of five bong shapes, so a shelf of them never repeats."""
    gm = rng.choice(GLASSES)
    t = rng.randrange(5)
    if t == 0:  # beaker
        pr = [(0, 0), (0.08, 0), (0.1, 0.015), (0.06, 0.2), (0.032, h * 0.45), (0.03, h * 0.9), (0.038, h), (0, h)]
    elif t == 1:  # straight tube on a foot
        pr = [(0, 0), (0.07, 0), (0.07, 0.015), (0.04, 0.025), (0.038, h * 0.95), (0.044, h), (0, h)]
    elif t == 2:  # round flask
        pr = [(0, 0), (0.05, 0), (0.09, 0.06), (0.095, 0.12), (0.06, 0.19), (0.026, 0.23), (0.024, h * 0.92), (0.032, h), (0, h)]
    elif t == 3:  # double bubble
        pr = [(0, 0), (0.07, 0), (0.08, 0.06), (0.05, 0.14), (0.03, 0.17), (0.06, h * 0.45), (0.06, h * 0.55), (0.028, h * 0.65),
              (0.026, h * 0.94), (0.034, h), (0, h)]
    else:  # percolator tower
        pr = [(0, 0), (0.07, 0), (0.07, 0.015), (0.045, 0.03), (0.045, h * 0.3), (0.052, h * 0.32), (0.045, h * 0.36),
              (0.045, h * 0.62), (0.052, h * 0.64), (0.045, h * 0.68), (0.042, h), (0, h)]
    b.lathe(pr, (x, y, z), gm, seg=14)
    b.tube([(x, y, z + 0.08), (x + 0.045, y, z + 0.12), (x + 0.085, y, z + 0.19)], 0.012, M["glass"], 6)  # the stem
    if rng.random() < 0.5:
        b.lathe([(0.0, 0.0), (0.028, 0.0), (0.034, 0.03), (0, 0.025)], (x + 0.085, y, z + 0.19), gm, seg=10)  # a bowl in it


S = 2.2  # display scale: the stock is drawn larger than life so each category reads from the camera


def packs(kind):
    def f(b, x, y, z, room, i):
        if kind in ("bongs", "glass"):  # tall glass, one per slot
            k = 1.3  # bigger than life, like the rest of the stock
            bong_var(_Scaled(b, x, y, z, k), 0, 0, 0, rng, h=min(room - 0.05, rng.uniform(0.34, 0.66)) / k)
            return
        k = S * rng.uniform(0.82, 1.15)  # no two items quite the same size
        sb = _Scaled(b, x, y, z, k)
        _fill(kind, sb, 0.0, 0.0, 0.0, room / k, rng.randrange(4))
    return f


class _Scaled:
    """Draws into b scaled by S about the slot's base point (x, y, z)."""

    def __init__(self, b, x, y, z, k=None):
        self.b, self.o, self.k = b, (x, y, z), (S if k is None else k)

    def _p(self, p):
        return tuple(self.o[i] + p[i] * self.k for i in range(3))

    def box(self, x0, x1, y0, y1, z0, z1, m, bev=0.0, **kw):
        (a0, b0, c0), (a1, b1, c1) = self._p((x0, y0, z0)), self._p((x1, y1, z1))
        self.b.box(a0, a1, b0, b1, c0, c1, m, bev=bev * self.k, **kw)

    def cyl(self, cx, cy, cz, r1, r2, h, m, seg=24, **kw):
        self.b.cyl(*self._p((cx, cy, cz)), r1 * self.k, r2 * self.k, h * self.k, m, seg=seg, **kw)

    def ball(self, cx, cy, cz, r, m, **kw):
        self.b.ball(*self._p((cx, cy, cz)), r * self.k, m, **kw)

    def tube(self, pts, r, m, seg=8, **kw):
        self.b.tube([self._p(p) for p in pts], r * self.k, m, seg, **kw)

    def lathe(self, profile, at, m, seg=24, **kw):
        self.b.lathe(profile, self._p(at), m, seg=seg, scale=self.k, **kw)


def _fill(kind, b, x, y, z, room, i):
        if kind == "bowls":  # glass bowls on downstems, in two rows
            for dy in (-0.062, 0.0, 0.062):
                r, h = rng.uniform(0.024, 0.034), rng.uniform(0.07, 0.1)
                b.lathe([(r, 0), (r * 0.95, 0.012), (r * 0.65, 0.03), (0.012, 0.038), (0.012, h), (0.0, h)], (x, y + dy, z), rng.choice(GLASSES), seg=12)
        elif kind == "cones":  # cone tubes and windowed boxes
            if i % 2:
                for dy in (-0.05, 0.0, 0.05):
                    b.cyl(x, y + dy, z + 0.065, 0.014, 0.014, 0.13, M["glass"], seg=10)
            else:
                for dy in (-0.045, 0.045):
                    _upright(b, x, y + dy, z, 0.08, 0.03, 0.13, rng.choice(PACKS))
        elif kind == "wraps":  # foil pouches standing in a row
            for dy in (-0.06, 0.0, 0.06):
                _upright(b, x, y + dy, z, 0.055, 0.012, 0.13, rng.choice(PACKS))
        elif kind in ("papers", "roaches"):  # booklets in counter display boxes
            _display(b, x, y, z, 6, 0.018, 0.08 if kind == "papers" else 0.06, M["walnut_dk"], PACKS)
        elif kind == "filters":  # small boxes, stacked two high
            for dy in (-0.05, 0.05):
                for zz in (0.0, 0.045):
                    b.box(x - 0.035, x + 0.035, y + dy - 0.04, y + dy + 0.04, z + zz, z + zz + 0.04, rng.choice(PACKS), bev=0.002)
        elif kind == "trays":  # metal trays leaning on the back panel
            b.box(x - 0.11, x - 0.1, y - 0.09, y + 0.09, z, z + min(room, 0.27), rng.choice(TINS), bev=0.003)
            b.box(x - 0.08, x - 0.07, y - 0.07, y + 0.07, z, z + min(room, 0.2), rng.choice(TINS), bev=0.003)
        elif kind == "cleaning":  # a cup of brushes and a bottle
            b.cyl(x, y - 0.04, z + 0.05, 0.03, 0.03, 0.1, M["black"], seg=12)
            for k in range(4):
                b.tube([(x, y - 0.04, z + 0.05), (x + (k - 1.5) * 0.01, y - 0.04 + (k % 2) * 0.012, z + 0.26)], 0.004, M["steel"], 4)
            b.lathe([(0, 0), (0.03, 0), (0.03, 0.12), (0.012, 0.15), (0.012, 0.17), (0, 0.17)], (x, y + 0.05, z), M["g_amber"], seg=12)
        elif kind == "cigars":  # an open cigar box, lid standing behind
            b.box(x - 0.08, x + 0.08, y - 0.09, y + 0.09, z, z + 0.05, M["walnut"], bev=0.003)
            b.box(x - 0.1, x - 0.085, y - 0.09, y + 0.09, z + 0.05, z + 0.2, M["walnut"], bev=0.003)
            for k in range(6):
                b.tube([(x - 0.06 + k * 0.024, y - 0.08, z + 0.055), (x - 0.06 + k * 0.024, y + 0.08, z + 0.055)], 0.011, M["box_red"], 8)
        elif kind == "tobacco":  # pouches standing
            for dy in (-0.05, 0.05):
                _upright(b, x, y + dy, z, 0.09, 0.03, 0.14, rng.choice(PACKS))
        elif kind == "refills":  # butane cans
            for dy in (-0.05, 0.05):
                b.cyl(x, y + dy, z + 0.09, 0.028, 0.028, 0.18, rng.choice(TINS), seg=14)
                b.cyl(x, y + dy, z + 0.19, 0.012, 0.012, 0.02, M["black"], seg=8)
        elif kind == "keys":  # keychains on hooks under the shelf above
            top = z + min(room, 0.45)
            b.tube([(x, y - 0.09, top), (x, y + 0.09, top)], 0.004, M["brass"], 6)
            for k in range(4):
                yy = y - 0.07 + k * 0.047
                b.tube([(x, yy, top), (x, yy, top - 0.06)], 0.002, M["steel"], 4)
                b.ball(x, yy, top - 0.08, 0.018, rng.choice(PACKS + TINS))
        elif kind == "accessory":  # pocket scales and small cases
            if i % 2:
                b.box(x - 0.06, x + 0.06, y - 0.05, y + 0.05, z, z + 0.022, M["black"], bev=0.004)
                b.box(x - 0.05, x + 0.05, y - 0.04, y + 0.04, z + 0.022, z + 0.026, M["steel"])
            else:
                _upright(b, x, y, z, 0.12, 0.05, 0.08, M["black"])
        else:
            pass


BAY_Y0, BAY_Y1 = 2.1, Y1 - 0.6  # clear of the corner spirals; the back units take the last stretch


def bays(side, cats):
    weight = {"bong": 2.0}  # the bongs get a double bay
    unit = (BAY_Y1 - BAY_Y0) / sum(weight.get(c[0], 1.0) for c in cats)
    y0 = BAY_Y0
    for slug, label, kind in cats:
        w = unit * weight.get(slug, 1.0)
        shelving(f"bay_{slug}", side, y0 + 0.04, y0 + w - 0.04, 0.0, 3.75, 0.5, GROUND_Z, packs(kind), slug, label,
                 slot=0.3 if kind == "glass" else 0.44)
        y0 += w


bays(-1, LEFT)
bays(1, RIGHT)

# upstairs: tall glass display all round the gallery, its lowest shelf high
# enough to clear the deck's edge as seen from the floor
UP_Z = [GZ + 0.6 + 0.72 * k for k in range(4)]
for side in (-1, 1):
    for k in range(4):
        y0 = 2.3 + k * 3.3
        shelving(f"gallery_shelf_{'l' if side < 0 else 'r'}{k}", side, y0, y0 + 3.15, GZ, GZ + 3.5, 0.45, UP_Z, packs("bongs"), slot=0.3)
# and on the back wall upstairs, either side of the plaque
for k, (xa_, xb_) in enumerate(((-4.65, -3.0), (3.0, 4.65))):
    b = B(f"gallery_back_{k}", "Fixtures")
    b.box(xa_, xb_, Y1 - 0.45, Y1, GZ, GZ + 3.5, M["walnut_dk"])
    for z in UP_Z:
        b.box(xa_ + 0.05, xb_ - 0.05, Y1 - 0.47, Y1 - 0.02, z - 0.035, z, M["walnut"], bev=0.004)
        b.box(xa_ + 0.08, xb_ - 0.08, Y1 - 0.5, Y1 - 0.45, z + 0.45, z + 0.465, M["led"])
        for j in range(int((xb_ - xa_ - 0.2) / 0.22)):
            bong(b, xa_ + 0.2 + j * 0.22, Y1 - 0.25, z, rng, h=rng.uniform(0.25, 0.42))
    b.build()

# the back wall under the gallery: tall units behind the counter
for k, x0 in enumerate((-5.6, -3.0, 0.9, 3.5)):
    b = B(f"back_unit_{k}", "Fixtures")
    b.box(x0, x0 + 2.1, Y1 - 0.5, Y1, 0.0, 0.95, M["walnut"], bev=0.01)  # cupboard
    b.box(x0, x0 + 2.1, Y1 - 0.03, Y1, 0.95, GZ - 0.35, M["walnut_dk"])  # back panel
    for xs in (x0, x0 + 2.04):  # open sides, the shelves between them
        b.box(xs, xs + 0.06, Y1 - 0.5, Y1, 0.95, GZ - 0.35, M["oak"], bev=0.006)
    for z in (1.05, 1.95, 2.85):  # three shelves of big, mixed stock
        b.box(x0 + 0.05, x0 + 2.05, Y1 - 0.52, Y1 - 0.47, z - 0.03, z, M["walnut_dk"])
        b.box(x0 + 0.08, x0 + 2.02, Y1 - 0.55, Y1 - 0.5, z + 0.8, z + 0.815, M["led"])
        xx = x0 + 0.2
        while xx < x0 + 1.9:
            r = rng.uniform(0.07, 0.11)
            if rng.random() < 0.7:
                jar(b, xx + r, Y1 - 0.27, z, r, rng.uniform(0.24, 0.42), rng.choice(GLASSES), rng.choice([M["black"], M["brass"]]))
            else:
                b.box(xx, xx + 2 * r, Y1 - 0.4, Y1 - 0.15, z, z + rng.uniform(0.18, 0.32), rng.choice(PACKS), bev=0.006)
            xx += 2 * r + 0.06
    b.build()

# --- the counter and the plaque ------------------------------------------------------------
c = B("counter", "Fixtures")
CY = Y1 - 3.4
c.box(-2.6, 2.6, CY - 0.4, CY + 0.4, 0.0, 1.05, M["walnut"], bev=0.02)
c.box(-2.7, 2.7, CY - 0.5, CY + 0.5, 1.05, 1.12, M["walnut_dk"], bev=0.01)
c.box(-2.6, 2.6, CY - 0.42, CY - 0.4, 0.95, 1.0, M["led"])
c.box(-0.4, 0.0, CY - 0.1, CY + 0.2, 1.12, 1.45, M["screen"])  # the till
c.build()

pl = B("plaque", "Fixtures")
# hung from the ceiling on brass chains in front of the back gallery, so no rail
# crosses it from anywhere on the floor
PW, PH, PZ = 5.2, 1.7, GZ + 2.4
PY = GAL_FRONT_Y - 0.35
pl.box(-PW / 2 - 0.12, PW / 2 + 0.12, PY, PY + 0.08, PZ - PH / 2 - 0.12, PZ + PH / 2 + 0.12, M["brass"], bev=0.01)
pl.box(-PW / 2, PW / 2, PY - 0.03, PY, PZ - PH / 2, PZ + PH / 2, M["plaque"])
pl.text("baBa jEE", (0, PY - 0.04, PZ - 0.35), 1.0, M["cream_lit"], extrude=0.02, fnt=FONT)
for x in (-PW / 2 + 0.3, PW / 2 - 0.3):
    pl.tube([(x, PY + 0.04, PZ + PH / 2 + 0.12), (x, PY + 0.04, Z1 - 0.45)], 0.018, M["brass"], 6)
pl.build()
SPOTS.append(("spot_plaque", (0.0, PY - 4.0, GZ + 3.6), (0.0, PY, PZ), "plaque"))

# --- two spiral stairs in the front corners, by the door, where no shelf is -------------
NS = 22
RISE = GZ / NS
STEP_A = math.radians(31)
SR, CORE = 0.8, 0.09
for side in (-1, 1):
    st = B(f"spiral_{'l' if side < 0 else 'r'}", "Fixtures")
    cx, cy = side * 5.0, 1.0
    st.cyl(cx, cy, GZ / 2 + 0.5, CORE, CORE, GZ + 1.0, M["walnut_dk"], seg=16)  # the newel
    st.ball(cx, cy, GZ + 1.1, 0.11, M["brass"])
    helix = []
    for k in range(NS):
        # the last step points along +y, onto the side deck
        a = math.pi / 2 + side * (NS - 1 - k) * STEP_A
        z = (k + 1) * RISE
        outer = [(cx + SR * math.cos(a + d), cy + SR * math.sin(a + d)) for d in (-STEP_A / 2, 0.0, STEP_A / 2)]
        inner = [(cx + CORE * math.cos(a + d), cy + CORE * math.sin(a + d)) for d in (STEP_A / 2, -STEP_A / 2)]
        st.prism_xy(outer + inner, z - 0.05, z, M["walnut"])
        helix.append((cx + SR * math.cos(a), cy + SR * math.sin(a), z + 0.9))
        if k % 2 == 0:
            st.tube([(cx + SR * math.cos(a), cy + SR * math.sin(a), z), helix[-1]], 0.012, M["brass"], 6)
    st.tube(helix, 0.03, M["brass"], 10)
    st.build()

# --- the islands round the rug: the small things ---------------------------------------
rug = B("rug", "Interior")
rug.box(-3.4, 3.4, 3.2, 9.6, 0.0, 0.015, M["rug"])
rug.box(-3.1, 3.1, 3.5, 9.3, 0.015, 0.02, M["rug_lt"])
rug.build()
# the islands as the painted pano has them, left to right from the camera
ISLANDS = [("pipe", "Pipes", (-1.7, 5.0)), ("storage", "Storage", (1.7, 5.0)),
           ("grinder", "Grinders", (-1.7, 8.0)), ("ashtray", "Ash trays", (1.7, 8.0)), ("lighter", "Lighters", (0.0, 9.9))]
for slug, label, (ix, iy) in ISLANDS:
    t = B(f"island_{slug}", "Fixtures")
    t.box(ix - 0.75, ix + 0.75, iy - 0.5, iy + 0.5, 0.0, 0.85, M["walnut"], bev=0.02)
    t.box(ix - 0.8, ix + 0.8, iy - 0.55, iy + 0.55, 0.85, 0.9, M["walnut_dk"], bev=0.01)
    t.box(ix - 0.75, ix + 0.75, iy - 0.52, iy - 0.5, 0.78, 0.83, M["led"])
    for j in range(4):  # display-scale pieces, four across and two deep
        for row in range(2):
            x = ix - 0.54 + j * 0.36
            y = iy - 0.2 + row * 0.4
            sb = _Scaled(t, x, y, 0.9)
            if slug == "grinder":
                grinder(sb, 0, 0, 0, 0.06, rng.choice(TINS))
            elif slug == "ashtray":
                dish(sb, 0, 0, 0, 0.08, rng.choice(GLASSES + TINS))
            elif slug == "lighter":
                for dx in (-0.03, 0.0, 0.03):
                    sb.box(dx - 0.012, dx + 0.012, -0.018, 0.018, 0, 0.08, rng.choice(PACKS + TINS), bev=0.003)
            elif slug == "pipe":  # a glass spoon pipe lying on its side
                sb.ball(-0.04, 0, 0.026, 0.026, rng.choice(GLASSES))
                sb.tube([(-0.04, 0, 0.026), (0.07, 0, 0.016)], 0.011, rng.choice(GLASSES), 8)
            elif slug == "storage":
                jar(sb, 0, 0, 0, 0.045 + 0.01 * (j % 2), 0.1 + 0.03 * row, M["glass"], M["black"])
    t.build()
    hot(slug, (ix, iy, 1.1), label)
    lb = B(f"island_{slug}_label", "Fixtures")
    lb.text(label.upper(), (ix, iy - 0.56, 0.6), 0.09, M["cream"], extrude=0.003, fnt=FONT2)
    lb.build()

# --- pendant clusters: v2's black shades, scaled up for the hall --------------------------
def pendant_cluster(name, cx, cy, drop, n=7, r=0.9):
    p = B(name, "Fixtures")
    p.ball(cx, cy, Z1 - 0.6, 0.16, M["brass"])
    for k in range(n):
        a = 2 * math.pi * k / n
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        z = drop + 0.4 * math.sin(3 * a)
        p.tube([(cx, cy, Z1 - 0.6), (x, y, z + 0.35)], 0.008, M["black"], 4)
        p.lathe([(0, 0.35), (0.04, 0.35), (0.06, 0.28), (0.26, 0.02), (0.27, 0.0), (0.0, 0.0)], (x, y, z), M["black"], seg=20)
        p.cyl(x, y, z + 0.01, 0.24, 0.24, 0.01, M["shade_in"], seg=20)
        p.ball(x, y, z + 0.06, 0.06, M["bulb"])
        LAMPS.append((f"{name}_{k}", (x, y, z - 0.05), "pendant"))
    p.build()


# one big chandelier under the skylight, high enough to stay above the line
# from the door to the plaque
pendant_cluster("chandelier", 0.0, 6.5, 6.0, n=12, r=1.5)
pendant_cluster("chandelier_inner", 0.0, 6.5, 6.6, n=6, r=0.7)
# the side bays are lit by their own strips; for the preview, soft fill in
# front of them instead of lamps hanging in the way
for side in (-1, 1):
    for y in (3.5, 7.0, 10.5, 14.0):
        LAMPS.append((f"fill_{side}_{y}", (side * 3.2, y, 3.0), "fill"))
        LAMPS.append((f"fill_up_{side}_{y}", (side * 3.6, y, GZ + 2.6), "fill"))

# plants: big ones either side of the door, against the empty front wall
for (px, py, pz, s) in ((-2.3, 0.6, 0.0, 1.2), (2.3, 0.6, 0.0, 1.2)):
    pb = B(f"plant_{px}_{py}", "Fixtures")
    bush(pb, px, py, pot(pb, px, py, pz, 0.35 * s, 0.6 * s, M["pot_glaze"]), 1.1 * s, rng, n=48)
    pb.build()

# --- markers ------------------------------------------------------------------------------
for name, loc, slug, label in HOTSPOTS:
    empty(name, loc, "Hotspots", categories=slug, label=label)


def camera(name, loc, target, fov=70):
    cd = bpy.data.cameras.new(name)
    cd.lens_unit = "FOV"
    cd.angle = math.radians(fov)
    co = bpy.data.objects.new(name, cd)
    co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    shoplib.collection("Cameras").objects.link(co)
    return co


EYE = (0.0, 6.5, 1.6)
pano = camera("pano_cam", EYE, (0.0, 16.0, 1.9))
views = {
    "entry": camera("v_entry", (0.0, 0.8, 1.7), (0.0, 12.0, 4.2), 82),
    "back": camera("v_back", EYE, (0.0, 16.0, 4.0), 90),
    "left": camera("v_left", EYE, (-6.0, 7.0, 3.0), 90),
    "right": camera("v_right", EYE, (6.0, 7.0, 3.0), 90),
    "up": camera("v_up", (0.0, 3.0, 1.5), (0.0, 9.0, 9.0), 90),
    "gallery": camera("v_gallery", (-5.3, 2.6, GZ + 1.7), (2.0, 12.0, 2.0), 80),
}

# --- what the pano camera can see of each display: rays to points spread over
# the shelves; a point counts when the first thing hit is that display itself
def visibility():
    dg = bpy.context.evaluated_depsgraph_get()
    eye = Vector(EYE)
    rows, by = [], {}
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.name.startswith(("bay_", "gallery_shelf", "gallery_back", "back_unit", "island_")) or o.name.endswith("_label"):
            continue
        mn = Vector([min((o.matrix_world @ Vector(c))[i] for c in o.bound_box) for i in range(3)])
        mx = Vector([max((o.matrix_world @ Vector(c))[i] for c in o.bound_box) for i in range(3)])
        seen = n = 0
        for i in range(6):
            for j in range(6):
                u, v = (i + 0.5) / 6, (j + 0.5) / 6
                p = Vector((mn.x + (mx.x - mn.x) * u, mn.y + (mx.y - mn.y) * u, mn.z + 0.15 + (mx.z - mn.z - 0.3) * v))
                # aim at the middle of the display's depth so the ray lands on its stock
                p = Vector(((mn.x + mx.x) / 2, p.y, p.z)) if (mx.y - mn.y) > (mx.x - mn.x) else Vector((p.x, (mn.y + mx.y) / 2, p.z))
                d = p - eye
                start, dn, left = eye.copy(), d.normalized(), d.length + 0.5
                while True:  # glass (the balustrade) is seen through: carry on past it
                    hit, loc, _, idx, ob, _ = scene.ray_cast(dg, start, dn, distance=left)
                    if hit and ob.name == "gallery" and GZ + 0.04 < loc.z < GZ + 1.02:
                        left -= (loc - start).length + 0.01
                        start = loc + dn * 0.01
                        continue
                    break
                n += 1
                if hit and ob == o:
                    seen += 1
                elif hit:
                    by[ob.name] = by.get(ob.name, 0) + 1
        rows.append((o.name, round(100 * seen / n), dict(by)))
        by.clear()
    for name, pct, blk in sorted(rows, key=lambda r: r[1]):
        print(f"VIS {pct:3d}% {name}  blocked by {blk}" if blk else f"VIS {pct:3d}% {name}")


if "--check" in argv:
    visibility()

if globals().get("CLASHES"):
    print("CLASHES", len(CLASHES))

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
    print("SAVED", BLEND)

# --- preview stills -----------------------------------------------------------------------
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(arg("--samples", "48"))
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception as e:  # no GPU: CPU
        print("CPU render", e)
    world = bpy.data.worlds.new("hall")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.03, 0.025, 0.03, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    for name, loc, kind in LAMPS:
        li = bpy.data.lights.new(name, "POINT")
        li.energy = 60 if kind == "pendant" else 40
        li.shadow_soft_size = 0.15
        li.color = (1.0, 0.78, 0.52)
        lo = bpy.data.objects.new(name, li)
        lo.location = loc
        scene.collection.objects.link(lo)
    sky = bpy.data.lights.new("lantern_light", "AREA")
    sky.shape, sky.size, sky.size_y, sky.energy, sky.color = "RECTANGLE", 4.4, 6.0, 900, (1.0, 0.86, 0.66)
    so = bpy.data.objects.new("lantern_light", sky)
    so.location = (0.0, 8.0, Z1 - 0.1)
    scene.collection.objects.link(so)
    for name, loc, aim, kind in SPOTS:
        li = bpy.data.lights.new(name, "SPOT")
        li.energy = 900
        li.spot_size, li.spot_blend = math.radians(30), 0.5
        li.color = (1.0, 0.82, 0.6)
        lo = bpy.data.objects.new(name, li)
        lo.location = loc
        lo.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.6
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    for n in arg("--shots", "entry,back,left,right,up,gallery").split(","):
        scene.camera = views[n]
        scene.render.filepath = os.path.join(os.path.abspath(PREVIEW), f"{n}.png")
        bpy.ops.render.render(write_still=True)
    if "--pano" in argv:
        pano.data.type = "PANO"
        pano.data.panorama_type = "EQUIRECTANGULAR"
        pano.rotation_euler = (math.pi / 2, 0.0, 0.0)  # level, facing +y (the counter)
        scene.camera = pano
        scene.render.resolution_x, scene.render.resolution_y = int(arg("--pano-w", "4096")), int(arg("--pano-w", "4096")) // 2
        scene.render.filepath = os.path.join(os.path.abspath(PREVIEW), "pano.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
