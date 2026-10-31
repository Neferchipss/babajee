# The inside of the shop: a round room you stand in the middle of.
# Run from build_shop.py (it shares that file's names: B, M, mat, cabinet, ...).
#
# Plan: a ring of arched alcoves round a centre point (RX, RY), one alcove per
# category, so turning on the spot always lands on one. The door comes in
# through a short passage on the street side; Baba's face is on the wall
# straight across from it, above the bongs, so the walk in ends looking at
# him. Above the alcoves the wall rises to a starry dome where everything
# that floats lives, out of the way of the shelves.
#
# Each alcove is built in the frame the old back-wall fixtures used (wall
# "B": along the wall is x, the wall itself at y = 11.0, the room at -y),
# then turned and moved into place, so cabinet(), shelves() and shelf_row()
# work unchanged.

import json

RX, RY = 0.0, 9.0  # the centre of the room, where the walk ends: far enough back that the ring clears the shop window
R = 5.2  # the inner face of the piers between the alcoves
ND = 0.55  # how deep an alcove is
RB = R + ND  # the back of an alcove
WH = 8.2  # the wall's height; the dome starts there
DR = 4.0  # and rises this much more
PIER = 0.26  # pier width
P_ANG = PIER / R
ARCH_SPRING, ARCH_TOP, NICHE_H = 4.15, 4.8, 5.0
DOOR_SPRING, DOOR_TOP = 3.15, 3.9  # the arch over the way in, a half circle
SHELF_TOP = 3.85  # how high the fixtures in the alcoves rise
LABEL_Z = 1.55  # the height of every category label


def dome_z(r):
    return WH + DR * math.sqrt(max(0.0, 1 - (r / R) ** 2))


def ceil_at(x, y):
    """Where a cord hung at (x, y) is fixed: the dome over the room, the
    passage's ceiling outside it."""
    r = math.hypot(x - RX, y - RY)
    return dome_z(r) - 0.06 if r < R else 3.0


def polar(r, a, z=0.0):
    return (RX + r * math.cos(a), RY + r * math.sin(a), z)


def annulus(b, r0, r1, z0, z1, m, a0=0.0, a1=2 * PI, seg=120):
    """A thick ring (or a piece of one, a0..a1) round the room's centre."""
    full = a1 - a0 >= 2 * PI - 1e-6
    n = seg if full else max(2, int(seg * (a1 - a0) / (2 * PI)) + 2)
    angs = [a0 + (a1 - a0) * i / (n if full else n - 1) for i in range(n)]
    prof = [(r0, z0), (r1, z0), (r1, z1), (r0, z1)]
    rings = [[b.bm.verts.new(polar(r, a, z)) for r, z in prof] for a in angs]
    mi = b.mi(m)

    def face(vs):
        f = b.bm.faces.new(vs)
        f.material_index = mi

    for i in range(n if full else n - 1):
        p, q = rings[i], rings[(i + 1) % n]
        for k in range(4):
            face([p[k], p[(k + 1) % 4], q[(k + 1) % 4], q[k]])
    if not full:
        face(rings[0])
        face(rings[-1][::-1])


# a tighter palette in here than on the street: warm stock, a few cool accents
PAPER[:] = [mat(f"stock_{n}", c, 0.75) for n, c in enumerate(["#b8503e", "#d6a640", "#e7dcc3", "#3f7f68", "#7c4b78"])]
GLASSES[:] = [M["glass"], M["g_amber"], M["g_green"], M["g_purple"]]
METALS[:] = [M["steel"], M["brass"], M["black"], M["g_green"]]
M.update(
    niche_glow=mat("niche_glow", "#5c3326", 0.6, 0.0, 1.0, 0.02),
    niche_back=mat("niche_back", "#2c1631", 0.85),
    glow_strip=mat("glow_strip", "#ffcf96", 0.4, 0.0, 1.0, 1.1),  # the lights in the glass cabinets
    glow_plinth=mat("glow_plinth", "#ffb468", 0.4, 0.0, 1.0, 0.7),  # under the pieces on the tables
    pane=mat("pane", "#dceef4", 0.05, 0.0, 0.05),  # cabinet fronts: barely there
    lacquer=mat("lacquer", "#1c0f1a", 0.3),
    card=mat("card", "#d9cdb4", 0.8),
    foil_a=mat("foil_a", "#b0b6bf", 0.3, 0.8),
    foil_b=mat("foil_b", "#c9a03c", 0.3, 0.8),
    runner=mat("runner", "#5a1424", 0.9),
    void=mat("void", "#000000", 1.0),  # pure black: no lamp can light it, so it never glows over the street
)

# --- the alcoves: which category goes where --------------------------------------------
# Going round from the bongs (under Baba) one way, then the other way. Wider
# alcoves for the categories with more in them.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "lib", "catalog-data.json"), encoding="utf-8") as fh:
    COUNT = {c["slug"]: len(c["products"]) for c in json.load(fh)}
# (slug, label, fixture, what goes on its shelves)
CENTRE = ("bong", "Bongs", "lit_glass", ["bong"])
SIDE_A = [  # from the bongs towards the door's right-hand side
    ("bong-accessory", "Bong accessories", "lit_glass", ["bottle", "jar"]),
    ("pipe", "Pipes", "lit_glass", ["pipe"]),
    ("cleaning-accessory", "Cleaning", "shelves", ["bottle"]),
    ("grinder", "Grinders", "lit_glass", ["grinder"]),
    ("ashtray", "Ashtrays", "plinth", None),
    ("lighter", "Lighters", "case_lighter", ["can"]),
    ("lighter-refills", "Lighter refills", "shelves", ["can"]),
    ("keychain", "Keychains", "peg", None),
    ("storage", "Storage", "shelves", ["jar", "tin", "box"]),
]
SIDE_B = [  # and towards its left
    ("rolling-paper", "Rolling papers", "face_papers", None),
    ("blunt-pre-rolled-cone", "Pre-rolled cones", "face_cones", None),
    ("blunt-wraps", "Blunt wraps", "face_wraps", None),
    ("roach", "Roaches", "face_small", None),
    ("filter", "Filters", "face_small", None),
    ("rolling-tray", "Rolling trays", "rack", None),
    ("rolling-tobacco", "Rolling tobacco", "shelves", ["tin"]),
    ("cigars", "Cigars", "humidor", None),
    ("accessory", "Accessories", "shelves", ["jar", "box", "tin"]),
]


def weight(slug):
    return 1.0 + 0.012 * min(70, COUNT.get(slug, 0))


# the door's gap in the ring: where the passage's two walls meet the piers
VX0, VX1 = -3.75, -2.25  # the passage, x


def ring_angle(x):
    return math.atan2(-math.sqrt(R * R - (x - RX) ** 2), x - RX)


GAP_A, GAP_B = ring_angle(VX0), ring_angle(VX1)  # gap runs GAP_A .. GAP_B (counter-clockwise)
FACE_A = (GAP_A + GAP_B) / 2 + PI  # straight across from the door
k_all = (2 * PI - (GAP_B - GAP_A) - (len(SIDE_A) + len(SIDE_B) + 2) * P_ANG) / sum(weight(s[0]) for s in [CENTRE] + SIDE_A + SIDE_B)
half_c = k_all * weight("bong") / 2

BAYS = [(FACE_A, half_c, CENTRE)]  # (centre angle, half angle, spec)
PIERS = [FACE_A - half_c - P_ANG / 2, FACE_A + half_c + P_ANG / 2]
for side, start, end, sg in ((SIDE_A, FACE_A - half_c - P_ANG, GAP_B + P_ANG, -1), (SIDE_B, FACE_A + half_c + P_ANG, GAP_A + 2 * PI - P_ANG, 1)):
    span = abs(end - start) - (len(side) - 1) * P_ANG
    tot = sum(weight(s[0]) for s in side)
    a = start
    for i, spec in enumerate(side):
        w = span * weight(spec[0]) / tot
        BAYS.append((a + sg * w / 2, w / 2, spec))
        a += sg * w
        PIERS.append(a + sg * P_ANG / 2)
        a += sg * P_ANG
BAY_AT = {}  # slug -> function taking a point in the alcove's frame to the world


def bay_frame(theta, h):
    """The alcove at angle theta (half-angle h): returns (loc, rot) for its
    object and a function mapping a point in its frame to the world."""
    phi = theta - PI / 2
    yb = RB * math.cos(h)
    off = Vector((0.0, yb - 11.0, 0.0))
    rot = Euler((0.0, 0.0, phi))
    loc = Vector((RX, RY, 0.0)) + rot.to_matrix() @ off

    def to_world(p):
        return tuple(loc + rot.to_matrix() @ Vector(p))

    return tuple(loc), (0.0, 0.0, phi), to_world


# --- what the alcoves hold -----------------------------------------------------------------
def uprights(b, s0, s1, depth, z0, top):
    for a in (s0, s1 - 0.05):
        wbox(b, "B", a, a + 0.05, 0, depth, z0, top, M["plum"], 0.006)
    wbox(b, "B", s0 - 0.02, s1 + 0.02, 0, depth + 0.03, top, top + 0.05, M["brass"], 0.01)


def pipe_item(b, x, y, z, gm):
    b.tube([(x - 0.12, y, z + 0.03), (x - 0.04, y, z + 0.025), (x + 0.04, y, z + 0.03), (x + 0.12, y, z + 0.05)], 0.017, gm, 8)
    b.ball(x + 0.14, y, z + 0.07, 0.03, gm, scale=(1, 1, 1.2), u=10, v=6)


def vitrine(b, s0, s1, rng, item):
    """A glass-topped counter standing out of the alcove, things laid inside."""
    d0, d1, h = 0.05, 0.62, 0.95
    wbox(b, "B", s0, s1, d0, d1, 0.0, 0.1, M["black"])
    wbox(b, "B", s0, s1, d0, d1, 0.1, h - 0.12, M["plum"], 0.012)
    wbox(b, "B", s0 - 0.02, s1 + 0.02, d0 - 0.02, d1 + 0.02, h - 0.12, h - 0.08, M["brass"], 0.008)
    wbox(b, "B", s0, s1, d0, d1, h - 0.08, h - 0.07, M["velvet"])
    wbox(b, "B", s0, s1, d0, d1, h, h + 0.012, M["glass_flat"])
    for a in (s0 - 0.02, s1 - 0.01):
        wbox(b, "B", a, a + 0.03, d0 - 0.02, d1 + 0.02, h - 0.08, h + 0.012, M["brass"], 0.005)
    s = s0 + 0.18
    while s < s1 - 0.15:
        y = 11.0 - (d0 + d1) / 2
        if item == "pipe":
            pipe_item(b, s, y + rng.uniform(-0.1, 0.1), h - 0.07, rng.choice(GLASSES))
            s += 0.34
        else:  # lighters standing in a row
            for k in range(3):
                b.box(s - 0.014, s + 0.014, y - 0.15 + k * 0.15 - 0.009, y - 0.15 + k * 0.15 + 0.009, h - 0.07, h - 0.0, rng.choice(PAPER))
            s += 0.07


def fixture(b, kind, rows, s0, s1, rng):
    """Fills one alcove (along the wall s0..s1), from the floor to well over head height. Returns the label's height."""
    w = s1 - s0
    if kind == "bongs":  # tall glass shelves of them, rising up the alcove
        cabinet(b, "B", s0, s1, 0.5, 0.85)
        uprights(b, s0, s1, 0.42, 0.85, SHELF_TOP)
        zs = [1.45, 2.05, 2.65, 3.25]
        for z in zs:
            wbox(b, "B", s0 + 0.05, s1 - 0.05, 0, 0.42, z, z + 0.014, M["glass_flat"])
            wbox(b, "B", s0 + 0.05, s1 - 0.05, 0.4, 0.42, z - 0.012, z + 0.014, M["brass"])
        for z, hh in [(0.895, (0.36, 0.48))] + [(z + 0.014, (0.28, 0.46)) for z in zs]:
            n = max(2, int(w / 0.34))
            for k in range(n):
                bong(b, s0 + (k + 0.5) * w / n, 11.0 - 0.24, z, rng, h=rng.uniform(*hh))
        return 1.7
    if kind == "lit_glass":  # a glass cabinet lit from inside: glass shelves, a light along each
        cabinet(b, "B", s0, s1, 0.5, 0.85)
        d = 0.44
        for a in (s0, s1 - 0.05):  # dark lacquer posts
            wbox(b, "B", a, a + 0.05, 0, d, 0.85, SHELF_TOP, M["lacquer"], 0.006)
        wbox(b, "B", s0 - 0.02, s1 + 0.02, 0, d + 0.03, SHELF_TOP, SHELF_TOP + 0.08, M["lacquer"], 0.01)
        wbox(b, "B", s0 + 0.05, s1 - 0.05, d - 0.06, d - 0.02, SHELF_TOP - 0.03, SHELF_TOP, M["glow_strip"])
        zs = [1.6, 2.35, 3.1]
        for z in zs:
            wbox(b, "B", s0 + 0.05, s1 - 0.05, 0, d, z, z + 0.014, M["glass_flat"])
            wbox(b, "B", s0 + 0.05, s1 - 0.05, d - 0.05, d - 0.02, z - 0.03, z - 0.004, M["glow_strip"])  # lights the shelf below
        what = rows[0]
        for i, z in enumerate([0.885] + [z + 0.014 for z in zs]):
            if what == "bong":
                n = max(2, int(w / 0.42))
                for k in range(n):
                    bong(b, s0 + (k + 0.5) * w / n, 11.0 - 0.24, z, rng, h=rng.uniform(0.38, 0.58) if i == 0 else rng.uniform(0.3, 0.55))
            elif what == "pipe":
                n = max(2, int(w / 0.4))
                for k in range(n):
                    pipe_item(b, s0 + (k + 0.5) * w / n, 11.0 - 0.2, z, rng.choice(GLASSES))
            else:
                shelf_row(b, "B", s0 + 0.12, s1 - 0.12, 0.2, z, rows[i % len(rows)], rng, 0.22)
        # the glass front, in panes between brass glazing bars
        wbox(b, "B", s0 + 0.05, s1 - 0.05, d + 0.005, d + 0.012, 0.9, SHELF_TOP, M["pane"])
        n = max(1, round(w / 0.7))
        for k in range(n + 1):
            a = s0 + 0.05 + k * (w - 0.1) / n
            wbox(b, "B", a - 0.01, a + 0.01, d + 0.005, d + 0.02, 0.9, SHELF_TOP, M["brass"])
        return 1.7
    if kind in ("face_papers", "face_small"):  # open counter boxes of booklets, tilted towards you
        small = kind == "face_small"
        cabinet(b, "B", s0, s1, 0.5, 0.85)
        uprights(b, s0, s1, 0.36, 0.85, SHELF_TOP)
        uw = 0.2 if small else 0.27  # one box's width
        nb = 3 if small else 4
        bh = 0.06 if small else 0.08
        for z, d in ((0.885, 0.3), (1.65, 0.24), (2.4, 0.22), (3.12, 0.2)):
            if z > 0.9:
                wbox(b, "B", s0 + 0.05, s1 - 0.05, 0, 0.36, z - 0.03, z, M["plum2"], 0.006)
            n = max(2, int((w - 0.1) / (uw + 0.06)))
            for k in range(n):
                x = s0 + 0.05 + (k + 0.5) * (w - 0.1) / n
                y = 11.0 - d
                c1, c2 = rng.sample(PAPER, 2)
                b.box(x - uw / 2, x + uw / 2, y - 0.06, y + 0.06, z, z + bh, c1, bev=0.004, rot=(-0.3, 0, 0))  # the box
                b.box(x - uw / 2, x + uw / 2, y + 0.05, y + 0.07, z, z + bh + (0.12 if small else 0.17), c2, bev=0.004, rot=(-0.3, 0, 0))  # its lid, propped up
                m_ = rng.choice([M["card"], M["white"], c2])
                for j in range(nb):  # the booklets standing in it, face on
                    bx = x - uw / 2 + uw * (j + 0.5) / nb
                    b.box(bx - uw / 9, bx + uw / 9, y - 0.03 + j * 0.006, y - 0.02 + j * 0.006, z + 0.02, z + bh + 0.05, m_, rot=(-0.3, 0, 0))
        return 1.5
    if kind == "face_cones":  # cones standing up out of glass jars, and boxed packs face on
        cabinet(b, "B", s0, s1, 0.5, 0.85)
        uprights(b, s0, s1, 0.36, 0.85, SHELF_TOP)
        for z in (0.885, 1.65, 2.4, 3.12):
            if z > 0.9:
                wbox(b, "B", s0 + 0.05, s1 - 0.05, 0, 0.36, z - 0.03, z, M["plum2"], 0.006)
            x = s0 + 0.2
            k = 0
            while x < s1 - 0.18:
                if k % 2 == 0:
                    jar(b, x, 11.0 - 0.2, z, 0.07, 0.13, M["glass"], M["brass"])
                    for j in range(7):  # a bunch of cones poking out of the open jar
                        a = 2 * PI * j / 7
                        b.cyl(x + 0.03 * math.cos(a), 11.0 - 0.2 + 0.03 * math.sin(a), z + 0.17, 0.008, 0.022, 0.2, M["card"], 10,
                              rot=(0.18 * math.sin(a), -0.18 * math.cos(a), 0))
                    x += 0.24
                else:
                    c1 = rng.choice(PAPER)
                    b.box(x - 0.08, x + 0.08, 11.0 - 0.26, 11.0 - 0.18, z, z + 0.2, c1, bev=0.005, rot=(-0.12, 0, 0))
                    b.box(x - 0.06, x + 0.06, 11.0 - 0.27, 11.0 - 0.26, z + 0.06, z + 0.15, M["card"], rot=(-0.12, 0, 0))
                    x += 0.22
                k += 1
        return 1.5
    if kind == "face_wraps":  # foil pouches hung face on from pegs on a board
        cabinet(b, "B", s0, s1, 0.45, 0.9)
        wbox(b, "B", s0 + 0.06, s1 - 0.06, 0, 0.03, 1.05, SHELF_TOP, M["lacquer"], 0.01)
        wbox(b, "B", s0 + 0.04, s1 - 0.04, 0, 0.06, SHELF_TOP, SHELF_TOP + 0.05, M["brass"], 0.01)
        x = s0 + 0.2
        while x < s1 - 0.16:
            z = 3.55
            while z > 1.35:
                b.tube([(x, 10.97, z), (x, 10.86, z + 0.01)], 0.004, M["steel"], 4)
                for j in range(2):  # two hung on each peg, the front one a little lower
                    m_ = rng.choice([M["foil_a"], M["foil_b"]] + PAPER[:3])
                    b.box(x - 0.055, x + 0.055, 10.9 - j * 0.015, 10.91 - j * 0.015, z - 0.19 - j * 0.015, z - 0.02 - j * 0.015, m_, bev=0.003)
                z -= 0.36
            x += 0.2
        return 1.6
    if kind == "glass":  # glass shelves, a few things on each
        cabinet(b, "B", s0, s1, 0.45, 0.9)
        uprights(b, s0, s1, 0.34, 0.9, SHELF_TOP)
        zs = [1.4, 1.9, 2.4, 2.9, 3.4]
        for z in zs:
            wbox(b, "B", s0 + 0.05, s1 - 0.05, 0, 0.34, z, z + 0.014, M["glass_flat"])
        for i, z in enumerate([0.945] + [z + 0.014 for z in zs]):
            shelf_row(b, "B", s0 + 0.1, s1 - 0.1, 0.18, z, rows[i % len(rows)], rng, 0.2)
        return 1.55
    if kind == "shelves":  # plain wooden shelves
        top = SHELF_TOP - 0.15 * rng.random()
        cabinet(b, "B", s0, s1, 0.45, 0.9)
        uprights(b, s0, s1, 0.32, 0.9, top)
        zs = [1.3 + k * (top - 1.65) / 4 for k in range(5)]
        shelves(b, "B", s0 + 0.05, s1 - 0.05, 0.32, zs)
        for i, z in enumerate([0.945] + [z + 0.035 for z in zs]):
            shelf_row(b, "B", s0 + 0.1, s1 - 0.1, 0.16, z, rows[i % len(rows)], rng, 0.22)
        return 1.5
    if kind in ("case_pipe", "case_lighter"):  # a counter case, and a tall run of shelves behind it
        vitrine(b, s0 + 0.05, s1 - 0.05, rng, "pipe" if kind == "case_pipe" else "lighter")
        uprights(b, s0 + 0.03, s1 - 0.03, 0.24, 1.3, SHELF_TOP)
        for z in (1.45, 1.95, 2.45, 2.95, 3.45):
            wbox(b, "B", s0 + 0.08, s1 - 0.08, 0, 0.24, z, z + 0.03, M["plum2"], 0.006)
            shelf_row(b, "B", s0 + 0.14, s1 - 0.14, 0.12, z + 0.03, rows[0], rng, 0.16)
        return 1.25
    if kind == "plinth":  # stepped plinths, ashtrays on each step, and shelves of them above
        for k, (d0, d1, z) in enumerate(((0.0, 0.7, 0.45), (0.0, 0.48, 0.8), (0.0, 0.26, 1.15))):
            wbox(b, "B", s0 + 0.06, s1 - 0.06, d0, d1, 0.0, z, M["plum"] if k % 2 else M["plum2"], 0.012)
            wbox(b, "B", s0 + 0.04, s1 - 0.04, d0, d1 + 0.02, z, z + 0.03, M["brass"], 0.008)
            n = max(2, int(w / 0.3))
            for i in range(n):
                dish(b, s0 + (i + 0.5) * w / n, 11.0 - (d1 - 0.12), z + 0.03, rng.uniform(0.07, 0.1), rng.choice([M["glass"], M["brass"], M["g_amber"], M["black"]]))
        uprights(b, s0 + 0.03, s1 - 0.03, 0.24, 1.18, SHELF_TOP)
        for z in (1.8, 2.4, 3.0):
            wbox(b, "B", s0 + 0.08, s1 - 0.08, 0, 0.24, z, z + 0.03, M["plum2"], 0.006)
            n = max(2, int(w / 0.26))
            for i in range(n):
                dish(b, s0 + (i + 0.5) * w / n, 11.0 - 0.12, z + 0.03, rng.uniform(0.06, 0.09), rng.choice([M["glass"], M["brass"], M["g_amber"], M["black"]]))
        return 1.35
    if kind == "peg":  # a tall pegboard of keychains over a cabinet
        cabinet(b, "B", s0, s1, 0.45, 0.9)
        wbox(b, "B", s0 + 0.08, s1 - 0.08, 0, 0.03, 1.05, SHELF_TOP, M["cedar"], 0.01)
        wbox(b, "B", s0 + 0.04, s1 - 0.04, 0, 0.06, SHELF_TOP, SHELF_TOP + 0.05, M["brass"], 0.01)
        x = s0 + 0.22
        while x < s1 - 0.18:
            for rr in range(int((SHELF_TOP - 1.45) / 0.28) + 1):
                z = 1.3 + rr * 0.28
                b.tube([(x, 10.97, z), (x, 10.87, z)], 0.004, M["steel"], 4)
                b.tube([(x, 10.87, z), (x, 10.87, z - 0.09)], 0.002, M["steel"], 4)
                b.ball(x, 10.87, z - 0.13, 0.035, rng.choice(PAPER), u=10, v=6)
            x += 0.24
        return 1.6
    if kind == "pigeon":  # a tall grid of cubbies, a stack of booklets in each
        cabinet(b, "B", s0, s1, 0.45, 0.9)
        top = SHELF_TOP
        uprights(b, s0, s1, 0.3, 0.9, top)
        nc = max(3, int((w - 0.1) / 0.24))
        cw = (w - 0.1) / nc
        for i in range(1, nc):
            a = s0 + 0.05 + i * cw
            wbox(b, "B", a - 0.012, a + 0.012, 0, 0.3, 0.9, top, M["plum2"], 0.004)
        zs = [0.9 + k * 0.36 for k in range(1, 9) if 0.9 + k * 0.36 < top - 0.1]
        shelves(b, "B", s0 + 0.05, s1 - 0.05, 0.3, zs)
        for z in [0.935] + [z + 0.035 for z in zs]:
            if z > top - 0.2:
                continue
            for i in range(nc):
                a = s0 + 0.05 + i * cw + 0.04
                for k in range(rng.randint(2, 4)):
                    b.box(a + k * 0.035, a + k * 0.035 + 0.026, 10.82, 10.92, z, z + rng.uniform(0.14, 0.24), rng.choice(PAPER), bev=0.003)
        return 1.7
    if kind == "drawers":  # an apothecary chest, shelves of stock rising above it
        h = 1.55
        wbox(b, "B", s0 + 0.04, s1 - 0.04, 0, 0.5, 0.0, h, M["plum"], 0.012)
        nc = max(2, int(w / 0.3))
        for i in range(nc):
            for j in range(5):
                a0 = s0 + 0.07 + i * (w - 0.14) / nc
                a1 = a0 + (w - 0.14) / nc - 0.03
                z0 = 0.12 + j * 0.28
                wbox(b, "B", a0, a1, 0.5, 0.52, z0, z0 + 0.24, M["plum2"], 0.008)
                wbox(b, "B", (a0 + a1) / 2 - 0.035, (a0 + a1) / 2 + 0.035, 0.52, 0.54, z0 + 0.15, z0 + 0.17, M["brass"], 0.003)
        wbox(b, "B", s0 + 0.02, s1 - 0.02, 0, 0.54, h, h + 0.04, M["marble"], 0.008)
        shelf_row(b, "B", s0 + 0.12, s1 - 0.12, 0.2, h + 0.04, rows[0], rng, 0.2)
        uprights(b, s0 + 0.04, s1 - 0.04, 0.26, h + 0.04, SHELF_TOP)
        for z in (2.1, 2.65, 3.2):
            wbox(b, "B", s0 + 0.08, s1 - 0.08, 0, 0.26, z - 0.03, z, M["plum2"], 0.006)
            shelf_row(b, "B", s0 + 0.12, s1 - 0.12, 0.13, z, rows[0], rng, 0.2)
        return 1.85
    if kind == "rack":  # trays leaning back on a tall stepped rack
        cabinet(b, "B", s0, s1, 0.5, 0.75)
        for d, z in ((0.36, 0.8), (0.22, 1.35), (0.1, 1.9), (0.1, 2.45), (0.1, 3.0)):
            wbox(b, "B", s0 + 0.06, s1 - 0.06, d - 0.06, d + 0.06, z - 0.04, z, M["plum2"], 0.006)
            wbox(b, "B", s0 + 0.06, s1 - 0.06, d + 0.05, d + 0.07, z, z + 0.06, M["brass"], 0.004)
            n = max(2, int(w / 0.42))
            for i in range(n):
                x = s0 + (i + 0.5) * w / n
                y = 11.0 - d + 0.08
                b.box(x - 0.16, x + 0.16, y - 0.012, y + 0.012, z + 0.0, z + 0.44, M["black"], bev=0.008, rot=(-0.22, 0, 0))
                b.box(x - 0.145, x + 0.145, y - 0.03, y - 0.01, z + 0.02, z + 0.42, rng.choice(PAPER), rot=(-0.22, 0, 0))
        uprights(b, s0, s1, 0.18, 0.75, SHELF_TOP)
        return 1.45
    if kind == "humidor":  # a tall cedar cabinet behind glass
        cabinet(b, "B", s0, s1, 0.5, 0.85)
        h0, h1, d = 0.85, SHELF_TOP, 0.46
        wbox(b, "B", s0 + 0.04, s1 - 0.04, 0, 0.03, h0, h1, M["cedar"])
        for a in (s0 + 0.04, s1 - 0.08):
            wbox(b, "B", a, a + 0.04, 0, d, h0, h1, M["cedar"], 0.006)
        wbox(b, "B", s0 + 0.04, s1 - 0.04, 0, d, h1 - 0.04, h1, M["cedar"], 0.006)
        wbox(b, "B", s0 + 0.08, s1 - 0.08, 0.03, 0.06, h1 - 0.1, h1 - 0.06, M["lamp"])
        for z in (1.25, 1.75, 2.25, 2.75, 3.25):
            shelves(b, "B", s0 + 0.08, s1 - 0.08, 0.4, [z], M["cedar"])
            x = s0 + 0.14
            while x < s1 - 0.36:
                b.box(x, x + 0.24, 10.66, 10.92, z + 0.035, z + 0.1, M["cedar"], bev=0.008)
                b.box(x, x + 0.24, 10.66, 10.92, z + 0.1, z + 0.108, M["brass"])
                for c in range(7):
                    b.cyl(x + 0.03 + c * 0.03, 10.79, z + 0.118, 0.008, 0.008, 0.2, M["leather"], 8, rot=(PI / 2, 0, 0))
                x += 0.3
        wbox(b, "B", s0 + 0.04, s1 - 0.04, d, d + 0.01, h0, h1, M["glass_flat"])
        return 1.7
    raise ValueError(kind)


# --- the alcoves ---------------------------------------------------------------------------------
ALCOVES = []
for n_, (theta, h, (slug, label, kind, rows)) in enumerate(BAYS):
    loc, rot, to_world = bay_frame(theta, h)
    BAY_AT[slug] = to_world
    hw = RB * math.sin(h)  # half the back wall
    hf = R * math.sin(h) - PIER / 2  # half the opening, between the piers
    yf = 11.0 - ND * math.cos(h)  # the front of the piers, in this frame
    b = B(f"alcove_{slug.replace('-', '_')}", "Fixtures")
    rng = random.Random(100 + n_)
    # the back: a dark wall with a softly lit panel, so what stands in front reads
    b.box(-hw - 0.08, hw + 0.08, 11.0, 11.15, 0.0, NICHE_H, M["niche_back"])
    b.box(-hw + 0.1, hw - 0.1, 10.985, 11.0, 0.95, ARCH_SPRING - 0.05, M["niche_glow"])
    # the arch over the opening
    rise = ARCH_TOP - ARCH_SPRING
    rad = (hf * hf + rise * rise) / (2 * rise)
    cz = ARCH_TOP - rad
    a0, a1 = math.atan2(ARCH_SPRING - cz, -hf), math.atan2(ARCH_SPRING - cz, hf)
    pts = arc(0.0, cz, rad, a0, a1, 18)
    b.prism_xz(pts + [(hf, NICHE_H), (-hf, NICHE_H)], yf, 11.0, M["plum"])
    b.tube([(x, yf - 0.012, z) for x, z in pts], 0.02, M["gold"], 6)
    top = fixture(b, kind, rows, -hw + 0.12, hw - 0.12, rng)
    ob = b.build(loc=loc, rot=rot)
    ob["half"] = h  # the site lights each alcove like a museum case, across this angle either side
    # every label at the same height, so they read as one line round the room
    HOTSPOTS.append((f"hot_{slug.replace('-', '_')}", to_world((0.0, 11.0 - 0.35, LABEL_Z)), slug, label))
    ALCOVES.append((ob, to_world, hw, slug))

# a few candles stood about on each alcove's shelves, unlit until the alcove is
# looked at (shop-sky.ts). Each is dropped from a random point onto whatever
# shelf is below it, so none floats or sinks in; spots with no room are skipped
M.update(wax=mat("wax", "#efe4cf", 0.6), wick=mat("wick", "#2a2220", 0.9))
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
cnd = B("candles", "Fixtures")
for ob, to_world, hw, slug in ALCOVES:
    rc = random.Random("candles" + slug)
    placed = []
    for _ in range(14):
        if len(placed) >= 3:
            break
        x = rc.uniform(-hw + 0.25, hw - 0.25)
        if any(abs(x - p_) < 0.3 for p_ in placed):
            continue
        start = Vector(to_world((x, 11.0 - rc.uniform(0.08, 0.14), rc.uniform(1.0, SHELF_TOP - 0.2))))
        ok, at, nrm, _, hit, _ = bpy.context.scene.ray_cast(dg, start, Vector((0, 0, -1)), distance=1.2)
        if not ok or hit != ob or nrm.z < 0.9:
            continue
        h_ = rc.uniform(0.07, 0.14)
        up_ok, *_ = bpy.context.scene.ray_cast(dg, at + Vector((0, 0, 0.005)), Vector((0, 0, 1)), distance=h_ + 0.2)
        if up_ok:
            continue
        cnd.cyl(at.x, at.y, at.z + h_ / 2, 0.024, 0.024, h_, M["wax"], 12)
        cnd.cyl(at.x, at.y, at.z + h_ + 0.008, 0.003, 0.003, 0.016, M["wick"], 5)
        empty(f"candle_{slug.replace('-', '_')}_{len(placed)}", (at.x, at.y, at.z + h_ + 0.012), "Fixtures", alcove=f"hot_{slug.replace('-', '_')}")
        placed.append(x)
cnd.build()

# the piers between them: a plinth, a shaft, a gilded capital
b = B("ring_piers", "Shell")
for a in PIERS + [GAP_A - P_ANG / 2, GAP_B + P_ANG / 2]:
    for r0, r1, z0, z1, m_, wd in ((R - 0.04, RB + 0.15, 0.0, 0.14, M["black"], PIER + 0.06), (R, RB + 0.15, 0.14, NICHE_H, M["plum2"], PIER),
                                    (R - 0.05, RB + 0.15, ARCH_SPRING - 0.07, ARCH_SPRING, M["gold"], PIER + 0.06)):
        cx_, cy_, _ = polar((r0 + r1) / 2, a)
        b.box(cx_ - (r1 - r0) / 2, cx_ + (r1 - r0) / 2, cy_ - wd / 2, cy_ + wd / 2, z0, z1, m_, bev=0.01, rot=(0, 0, a))
b.build()

# a torch in an iron sconce on the face of each pier. They stand cold; the site
# lights the two either side of whichever alcove the cursor is on (shop-sky.ts)
TORCH_Z = 2.15
b = B("torches", "Fixtures")
for k, a in enumerate(PIERS + [GAP_A - P_ANG / 2, GAP_B + P_ANG / 2]):
    cx_, cy_, _ = polar(R - 0.03, a)
    b.box(cx_ - 0.03, cx_ + 0.03, cy_ - 0.06, cy_ + 0.06, TORCH_Z - 0.42, TORCH_Z - 0.12, M["black"], bev=0.01, rot=(0, 0, a))
    b.tube([polar(R - 0.05, a, TORCH_Z - 0.3), polar(R - 0.2, a, TORCH_Z - 0.26), polar(R - 0.27, a, TORCH_Z - 0.16)], 0.014, M["black"], 6)
    x_, y_, _ = polar(R - 0.27, a)
    b.lathe([(0.012, -0.3), (0.022, -0.3), (0.03, -0.05), (0.055, -0.02), (0.06, 0.0), (0.045, 0.01), (0.0, 0.01)], (x_, y_, TORCH_Z - 0.02), M["brass"], 14)
    empty(f"torch_{k}", (x_, y_, TORCH_Z), "Fixtures")
b.build()

# --- the shell: wall above the alcoves, the door's gap, floor, dome ------------------------------
s = B("rotunda_wall", "Shell")
annulus(s, R, RB + 0.3, NICHE_H, WH, M["indigo"])  # all the way round, over the door too
annulus(s, R - 0.06, R, NICHE_H, NICHE_H + 0.09, M["gold"])
annulus(s, RB + 0.15, RB + 0.3, 0.0, NICHE_H, M["black"], GAP_B, GAP_A + 2 * PI)  # behind the alcoves
s.build()
# the way in gets an arch too, up to the gilded band like the alcoves
loc_, rot_, _ = bay_frame((GAP_A + GAP_B) / 2, (GAP_B - GAP_A) / 2)
h_ = (GAP_B - GAP_A) / 2
hf_ = R * math.sin(h_)
yf_ = 11.0 - ND * math.cos(h_)
s = B("door_arch", "Shell")
pts_ = arc(0.0, DOOR_SPRING, hf_, PI, 0.0, 24)
s.prism_xz([(-hf_ - 0.02, DOOR_SPRING)] + pts_ + [(hf_ + 0.02, DOOR_SPRING), (hf_ + 0.02, NICHE_H), (-hf_ - 0.02, NICHE_H)], yf_, 11.0 + 0.3 * math.cos(h_), M["plum"])
s.tube([(x, yf_ - 0.012, z) for x, z in pts_], 0.02, M["gold"], 6)
s.build(loc=loc_, rot=rot_)

# the passage from the door: plum walls, a low ceiling, the old tiled floor
s = B("passage", "Shell")
y_l = RY - math.sqrt(R * R - (VX0 - RX) ** 2) + 0.12
y_r = RY - math.sqrt(R * R - (VX1 - RX) ** 2) + 0.12
s.box(VX0 - 0.12, VX0, 0.2, y_l, 0.0, DOOR_TOP, M["plum"])
s.box(VX1, VX1 + 0.12, 0.2, y_r, 0.0, DOOR_TOP, M["plum"])
s.prism_xy([(VX0 - 0.12, 0.2), (VX1 + 0.12, 0.2), (VX1 + 0.12, y_r), (VX0 - 0.12, y_l)], DOOR_TOP, DOOR_TOP + 0.1, M["indigo"])
s.prism_xy([(VX0 - 0.12, 0.2), (VX1 + 0.12, 0.2), (VX1 + 0.12, y_r - 0.35), (VX0 - 0.12, y_l - 0.35)], DOOR_TOP + 0.1, WH, M["black"])  # so the flat's windows are not see-through; kept outside the ring
for xx, sg in ((VX0, 1), (VX1, -1)):  # a dado and a gold rail, as before
    s.box(xx, xx + sg * 0.03, 0.3, (y_l if sg > 0 else y_r) - 0.2, 0.14, 1.0, M["plum2"], bev=0.01)
    s.box(xx, xx + sg * 0.06, 0.2, (y_l if sg > 0 else y_r), 1.0, 1.06, M["gold"], bev=0.01)
for i in range(3):
    for j in range(7):
        x0_ = VX0 + i * 0.5
        y0_ = 0.2 + j * 0.5
        if y0_ < max(y_l, y_r):
            s.box(x0_ + 0.004, x0_ + 0.496, y0_ + 0.004, y0_ + 0.496, 0.0, 0.012, M["tile_a"] if (i + j) % 2 else M["tile_b"], bev=0.003)
s.box(-3.5, -2.5, -0.5, 0.0, 0.0, 0.015, M["rubber"], bev=0.004)  # the doormat
s.build()

# the floor: pale polished marble, a band of ivory and taupe tiles round the
# middle, fine brass inlay, and a black and brass compass rose under where you
# stand, its one brass long point aimed at Baba
M.update(
    marble_black=mat("marble_black", "#1a171c", 0.18),
    marble_ivory=mat("marble_ivory", "#e3d8c6", 0.2),
    marble_taupe=mat("marble_taupe", "#b3a590", 0.2),
    marble_table=mat("marble_table", "#e3d8c6", 0.2),
    marble_grey=mat("marble_grey", "#6a646d", 0.2),
)
s = B("rotunda_floor", "Shell")
s.cyl(RX, RY, -0.01, RB + 0.32, RB + 0.32, 0.02, M["marble_ivory"], 96)
s.build()

RC, RT0, RT1 = 1.85, 1.97, 2.7  # the compass's reach, and the band of tiles
b = B("floor_inlay", "Shell")
for r0, r1 in ((RC, RT0), (RT1, RT1 + 0.07), (R - 0.4, R - 0.35)):  # brass rings
    annulus(b, r0, r1, 0.0, 0.006, M["brass"], seg=120)
NT_ = 36
for k in range(0, NT_, 2):  # every other tile taupe; the ivory ones are the floor itself
    a0 = 2 * PI * k / NT_ + FACE_A
    annulus(b, RT0 + 0.02, RT1 - 0.02, 0.0, 0.004, M["marble_taupe"], a0, a0 + 2 * PI / NT_, 6)
# the compass: four long points (the one to Baba in brass) and four short ones between
for k in range(8):
    a = FACE_A + k * PI / 4
    long_ = k % 2 == 0
    L_, W_ = (RC - 0.12, 0.3) if long_ else (1.25, 0.2)
    tip = (RX + L_ * math.cos(a), RY + L_ * math.sin(a))
    sides = [(RX + W_ * math.cos(a + sg * PI / 4), RY + W_ * math.sin(a + sg * PI / 4)) for sg in (-1, 1)]
    dark, light = (M["brass"], M["gold"]) if k == 0 else (M["marble_black"], M["marble_grey"]) if long_ else (M["brass"], M["gold"])
    z0, z1 = (0.004, 0.012) if long_ else (0.004, 0.009)
    b.prism_xy([(RX, RY), sides[0], tip], z0, z1, dark)  # each point in two halves, one lit, one in shade
    b.prism_xy([(RX, RY), tip, sides[1]], z0, z1, light)
b.cyl(RX, RY, 0.013, 0.26, 0.26, 0.006, M["brass"], 40)  # the boss in the middle
b.cyl(RX, RY, 0.017, 0.17, 0.17, 0.004, M["marble_black"], 40)
b.build()

# a runner from the door to Baba, so you always know which way is which; it
# stops at the band of tiles and leaves the compass clear
b = B("runner", "Shell")
ax, ay = math.cos(FACE_A), math.sin(FACE_A)
for r0, r1 in ((-R + 0.05, -(RT1 + 0.1)), (RT1 + 0.1, R - 0.05)):
    for hw_, z1, m_ in ((0.6, 0.022, M["gold"]), (0.55, 0.026, M["runner"])):
        pts = [(RX + ax * r + -ay * s_ * hw_, RY + ay * r + ax * s_ * hw_) for r, s_ in ((r0, -1), (r1, -1), (r1, 1), (r0, 1))]
        b.prism_xy(pts, 0.0, z1, m_)
b.build()

# four display tables, each a piece of the ring standing in front of the
# shelves, their ends cut straight towards the middle of the room, so every
# end of every table points at the one spot where you stand. Spaced evenly
# round the ring, but with the gap at the way in kept a little wider, so the
# path from the door is always open
b = B("tables", "Fixtures")
rt = random.Random(61)
T0, T1, TH = R - 2.35, R - 1.2, 0.86  # inner and outer edge, height of the top
HS = 0.54  # half of each table's sweep round the ring (keeps the gap at the runner wider than it)
DOOR_GAP = 1.6 / T0  # the gap at the way in, measured along the inner edge
GAP = (2 * PI - 8 * HS - DOOR_GAP) / 3  # the other three gaps, all the same


def table_shape(r0, r1, a0, a1, inset):
    """The outline of a table (or a layer of one, set in by `inset`): an
    outer and an inner arc, the ends running along the radius."""
    o0, o1 = a0 + inset / r1, a1 - inset / r1
    c = inset / r0
    outer = [(RX + r1 * math.cos(o0 + (o1 - o0) * k / 40), RY + r1 * math.sin(o0 + (o1 - o0) * k / 40)) for k in range(41)]
    i0, i1 = a0 + c, a1 - c
    inner = [(RX + r0 * math.cos(i1 - (i1 - i0) * k / 30), RY + r0 * math.sin(i1 - (i1 - i0) * k / 30)) for k in range(31)]
    return outer + inner


start = FACE_A + PI + DOOR_GAP / 2  # just past the way in, going round
for k in range(4):
    a0 = start + k * (2 * HS + GAP)
    a1 = a0 + 2 * HS
    b.prism_xy(table_shape(T0 + 0.1, T1 - 0.1, a0, a1, 0.06), 0.0, 0.07, M["black"])  # kick
    b.prism_xy(table_shape(T0 + 0.06, T1 - 0.06, a0, a1, 0.03), 0.07, TH - 0.04, M["plum2"])  # lacquered body
    b.prism_xy(table_shape(T0 + 0.03, T1 - 0.03, a0, a1, 0.015), TH - 0.04, TH - 0.015, M["brass"])
    b.prism_xy(table_shape(T0, T1, a0, a1, 0.0), TH - 0.015, TH + 0.035, M["marble_table"])  # the top: its own, so its veins can be laid larger than the floor's
    # the pieces on show: one big statement bong in the middle and two more either
    # side, each standing on a lit brass plinth so the glass glows from below
    for f_, sc in ((0.22, 1.25), (0.5, 1.9), (0.78, 1.25)):
        x_, y_, _ = polar((T0 + T1) / 2, a0 + (a1 - a0) * f_)
        z_ = TH + 0.035
        b.cyl(x_, y_, z_ + 0.03, 0.12 * sc, 0.12 * sc, 0.06, M["brass"], 32)
        b.cyl(x_, y_, z_ + 0.064, 0.1 * sc, 0.1 * sc, 0.008, M["glow_plinth"], 32)
        h_ = 0.46
        pr = rt.choice([
            [(0, 0), (0.07, 0), (0.095, 0.012), (0.1, 0.06), (0.085, 0.15), (0.05, 0.22), (0.03, 0.28), (0.028, h_ * 0.8), (0.036, h_ * 0.9), (0.036, h_), (0.028, h_), (0, h_)],
            [(0, 0), (0.04, 0), (0.07, 0.03), (0.095, 0.09), (0.09, 0.15), (0.05, 0.2), (0.03, 0.24), (0.028, h_ * 0.88), (0.036, h_ * 0.95), (0.036, h_), (0, h_)],
        ])
        b.lathe(pr, (x_, y_, z_ + 0.068), rt.choice(GLASSES[1:]), seg=28, scale=sc)
        b.tube([(x_, y_, z_ + 0.068 + 0.08 * sc), (x_ - 0.05 * sc, y_, z_ + 0.068 + 0.13 * sc), (x_ - 0.1 * sc, y_, z_ + 0.068 + 0.2 * sc)], 0.012 * sc, M["glass"], 8)
b.build()

# the dome: one sheet, seen from inside only, open at the top. The site paints a
# moving sky on it (shop-sky.ts) and keeps the stars twinkling
RO = 1.0  # the oculus
T_O = math.acos(RO / R)  # where the dome stops, up its curve
Z_O = WH + DR * math.sin(T_O)
NA, NT = 96, 16
# it comes all the way down to the gilded band over the alcoves, so Baba's face
# hangs in the sky: a straight drum first, just in front of the wall, then the curve
rows = [[polar(R - 0.02, 2 * PI * i / NA, z) for i in range(NA + 1)] for z in (NICHE_H + 0.09, (NICHE_H + WH) / 2)]
for j in range(NT + 1):
    t = T_O * j / NT
    rows.append([polar(R * math.cos(t) - 0.02, 2 * PI * i / NA, WH + DR * math.sin(t)) for i in range(NA + 1)])
v = B("dome", "Shell")
v.sheet(rows, M["cosmos"], flip=True)  # rings bottom to top, counter-clockwise: flipped to face in
v.build(recalc=False)
# its outside, a dark mass over the flat's roof as seen from the street
v = B("dome_outer", "Shell")
v.sheet([[polar((RB + 0.3) * math.cos((PI / 2) * j / NT), 2 * PI * i / NA, WH + (DR + 1.3) * math.sin((PI / 2) * j / NT)) for i in range(NA + 1)] for j in range(NT + 1)], M["void"])  # high enough to hide the oculus's light
v.build(recalc=False)
v = B("dome_ribs", "Shell")
for k in range(8):
    a = 2 * PI * k / 8 + PI / 8
    clear = abs((a - FACE_A + PI) % (2 * PI) - PI) > 0.55  # not down across Baba's face
    v.tube(([polar(R - 0.05, a, NICHE_H + 0.09)] if clear else []) + [polar(R * math.cos(t) - 0.05, a, WH + DR * math.sin(t) - 0.05) for t in [T_O * j / 24 for j in range(25)]], 0.025, M["gold"], 6)
v.build()
v = B("stars", "Shell")
rs = random.Random(77)
for _ in range(320):
    a = rs.uniform(0, 2 * PI)
    t = rs.uniform(0.12, T_O - 0.08)
    rr = rs.choice([0.008, 0.01, 0.012, 0.016, 0.022])
    c = Vector(polar(R * math.cos(t) - 0.03, a, WH + DR * math.sin(t) - 0.03))
    e1 = Vector((-math.sin(a), math.cos(a), 0.0))  # round the dome
    e2 = Vector((-math.sin(t) * math.cos(a), -math.sin(t) * math.sin(a), math.cos(t) * DR / R)).normalized()  # up it
    # e1 x e2 points out of the room, so the corners go the other way round to face in
    v.quad(tuple(c - e1 * rr - e2 * rr), tuple(c - e1 * rr + e2 * rr), tuple(c + e1 * rr + e2 * rr), tuple(c + e1 * rr - e2 * rr), rs.choice([M["star"], M["star_b"], M["star_c"]]))
v.build(recalc=False)

# the oculus: a short drum up to a blaze of light, and a rose window of
# coloured glass turning slowly in front of it. It is the room's one light from
# above: the pool where you stand, and the follow-spot the site swings onto
# whichever alcove you look at
M.update(
    oculus=mat("oculus", "#ffe2a8", 0.5, 0.0, 1.0, 2.6),
    rose_amber=mat("rose_amber", "#ff9a1f", 0.4, 0.0, 1.0, 4.0),
    rose_magenta=mat("rose_magenta", "#ff2a9a", 0.4, 0.0, 1.0, 4.0),
    rose_teal=mat("rose_teal", "#14e0c8", 0.4, 0.0, 1.0, 4.0),
    rose_violet=mat("rose_violet", "#7d4dff", 0.4, 0.0, 1.0, 4.0),
)
ROSE = [M["rose_amber"], M["rose_magenta"], M["rose_teal"], M["rose_violet"]]
v = B("oculus_drum", "Shell")
annulus(v, RO, RO + 0.12, Z_O - 0.1, Z_O + 0.9, M["plum2"])
annulus(v, RO - 0.06, RO + 0.02, Z_O - 0.16, Z_O - 0.04, M["gold"])
v.cyl(RX, RY, Z_O + 0.95, RO + 0.12, RO + 0.12, 0.1, M["oculus"], 48)
v.build()
v = B("rose", "Shell")  # origin in the middle, so the site can turn it
ZR = 0.55
for k in range(12):
    a = 2 * PI * k / 12
    rm, w = 0.55, 0.17
    pts = [(0.12 * math.cos(a), 0.12 * math.sin(a)),
           (rm * math.cos(a) + w * math.sin(a), rm * math.sin(a) - w * math.cos(a)),
           (0.93 * math.cos(a), 0.93 * math.sin(a)),
           (rm * math.cos(a) - w * math.sin(a), rm * math.sin(a) + w * math.cos(a))]
    v.prism_xy(pts, ZR - 0.01, ZR + 0.01, ROSE[k % 4])
    v.tube([(x, y, ZR - 0.03) for x, y in pts + pts[:1]], 0.014, M["gold"], 5)
for r in (0.12, 0.96):
    v.tube([(r * math.cos(2 * PI * i / 48), r * math.sin(2 * PI * i / 48), ZR - 0.03) for i in range(49)], 0.02, M["gold"], 6)
v.build(loc=(RX, RY, Z_O))

# the room itself is left dim: each alcove is lit like a museum case by the
# site (shop-sky.ts), and Baba and the dome get their own lamps (shop_world.py)
lamp("lamp_entry", (-3.0, 1.9, 2.45))
