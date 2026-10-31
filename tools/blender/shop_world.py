# The other side: what the shop is like once you are through the door.
# Run from build_shop.py after shop_rotunda.py (shares their names: B, M, lamp, R, FACE_A...).
# Things the site animates are named by prefix:
#   eye_*        an empty with children *_iris (slides to look at you) and *_lid (blinks)
#   eyeball_*    a whole eyeball on a cord; the site turns it to face you
#   float_*      drifts and turns on the spot
#   planet_*     turns slowly
#   smoke_*      empties where incense smoke rises
#   mandala_glow (material) pulses

BOOKS = [mat(f"book_{n}", c, 0.6) for n, c in enumerate(["#7a2338", "#2e3f7a", "#7a5c1e", "#1f5a4a", "#4a2a6a", "#8a4a2a"])]


# --- eyes ------------------------------------------------------------------------------
def almond_pts(w, h, n=22, p=0.85, drop=0.8):
    top = [((w / 2) * math.cos(PI * i / n), (h / 2) * math.sin(PI * i / n) ** (2 * p)) for i in range(n + 1)]
    bot = [((w / 2) * math.cos(PI * i / n), -(h / 2) * drop * math.sin(PI * i / n) ** (2 * p)) for i in range(n, -1, -1)]
    return top + bot[1:-1]


def orient(d):
    d = Vector(d).normalized()
    return d.to_track_quat("-Y", "Z" if abs(d.z) < 0.95 else "X").to_euler()


def eye(name, loc, d, w, h, iris, ring=True, parent=None):
    """One of Baba's eyes: an almond of white with a heavy ink outline, an iris
    that the site slides about, and a skin-coloured lid it can close. d is the
    way the eye faces. Exported with the lid open."""
    emp = empty(name, loc, "Eyes", kind="eye")
    if parent is not None:  # placed in the parent's own frame, looking out of it
        emp.parent = parent
    else:
        emp.rotation_euler = orient(d)
    pts = almond_pts(w, h)
    t = 0.018 + 0.05 * min(h, w)
    b = B(name + "_white", "Eyes")
    b.prism_xz(pts, 0.0, 0.05, M["eye_white"])
    b.tube([(x, -0.01, z) for x, z in pts + [pts[0]]], t, M["eye_ink"], 8, caps=False)
    if ring:
        b.tube([(x * 1.16, 0.0, z * 1.3) for x, z in pts + [pts[0]]], t * 0.55, M["gold"], 6, caps=False)
    top = pts[: 23]
    b.tube([(x * 1.05, -0.012, z + 0.3 * h) for x, z in top], t * 0.7, M["eye_ink"], 6, caps=False)  # the brow fold
    ob = b.build()
    ob.parent = emp

    ir = min(h * 0.3, w * 0.3)
    b = B(name + "_iris", "Eyes")
    b.cyl(0, -0.03, 0, ir, ir, 0.02, iris, 28, rot=(PI / 2, 0, 0))
    b.cyl(0, -0.045, 0, ir * 0.42, ir * 0.42, 0.02, M["eye_ink"], 20, rot=(PI / 2, 0, 0))
    b.ball(ir * 0.3, -0.06, ir * 0.32, ir * 0.13, M["white"], u=10, v=6)
    ob = b.build()
    ob.parent = emp
    ob["reach_x"] = max(0.0, w * 0.5 * 0.5)
    ob["reach_z"] = max(0.0, h * 0.1)

    b = B(name + "_lid", "Eyes")  # origin on the top edge, so squashing it opens and shuts the eye
    lid = [(x * 1.06, z * 1.1 - h / 2) for x, z in pts]
    b.prism_xz(lid, -0.1, -0.07, M["baba_skin"])
    b.tube([(x, -0.105, z) for x, z in lid + [lid[0]]], t * 0.7, M["eye_ink"], 6, caps=False)
    ob = b.build(loc=(0, 0, h / 2))
    ob.scale = (1, 1, 0.02)
    ob.parent = emp
    return emp


# --- Baba's face, on the wall across from the door ---------------------------------------
# Drawn flat (x across, z up, the wall at y = 0 and the room at -y), then bent
# onto the round wall so it sits flush with it.
def on_wall(x, y, z):
    a = FACE_A - x / R  # +x is to the right as you face him
    return polar(R + y, a, z)  # -y comes out of the wall, into the room


def bend(co):
    return Vector(on_wall(co.x, co.y, co.z))


FZ = 6.3  # the middle of the face, in the band over the alcoves
FW, FT = 2.0, 7.55  # half its width, its top
b = B("baba_face", "Eyes")
b.box(-FW, FW, -0.11, 0.0, NICHE_H + 0.17, FT, M["baba_skin"], bev=0.05, cuts=12)
b.box(-FW - 0.1, FW + 0.1, -0.15, -0.09, NICHE_H + 0.1, NICHE_H + 0.2, M["gold"], bev=0.012, cuts=12)
b.box(-FW - 0.1, FW + 0.1, -0.15, -0.09, FT, FT + 0.1, M["gold"], bev=0.012, cuts=12)
for x0 in (-FW - 0.1, FW):
    b.box(x0, x0 + 0.1, -0.15, -0.09, NICHE_H + 0.12, FT + 0.08, M["gold"], bev=0.012)
for ex in (-0.85, 0.85):  # heavy brows and cheeks
    b.tube([(ex + 0.63 * math.cos(a), -0.14, FZ + 0.42 + 0.2 * math.sin(a)) for a in [PI * 0.92 - i * (PI * 0.84) / 16 for i in range(17)]], 0.04, M["baba_dk"], 8)
    b.ball(ex, -0.18, FZ - 0.45, 0.28, M["baba_skin"], scale=(1.5, 0.3, 0.8))
for ex in (-0.19, 0.19):  # the two dots between the eyes
    b.ball(ex, -0.15, FZ + 0.3, 0.05, M["baba_dk"], u=10, v=6)
for cx_, sg in ((-1.55, -1), (1.55, 1)):  # curls at the temples
    steps = 40
    b.tube([(cx_ + (0.015 + 0.22 * i / steps) * math.cos(sg * 3 * PI * i / steps), -0.15, FZ + 0.85 + (0.015 + 0.22 * i / steps) * math.sin(sg * 3 * PI * i / steps)) for i in range(steps + 1)], 0.02, M["baba_hair"], 6)
b.build(warp=bend)


def wall_eye(name, x, z, w, h, iris):
    p = on_wall(x, -0.126, z)
    a = FACE_A - x / R
    eye(name, p, (-math.cos(a), -math.sin(a), 0), w, h, iris)


wall_eye("eye_face_l", -0.85, FZ, 1.15, 0.58, M["iris_g"])
wall_eye("eye_face_r", 0.85, FZ, 1.15, 0.58, M["iris_a"])
wall_eye("eye_face_3", 0.0, FZ + 0.72, 0.29, 0.64, M["iris_v"])

# --- eyes in the dome, looking down at you ---------------------------------------------------
for k, da in enumerate((1.25, -1.25, 2.4, -2.4)):
    a = FACE_A + da
    t = 0.85
    p = polar(R * math.cos(t) - 0.12, a, WH + DR * math.sin(t) - 0.12)
    eye(f"eye_dome_{k}", p, (RX - p[0], RY - p[1], 1.65 - p[2]), 1.2, 0.6, [M["iris_g"], M["iris_a"], M["iris_m"], M["iris_v"]][k])

# --- eyeballs on cords, hung over the room, above head height -----------------------------------
EYEBALLS = [(FACE_A + 0.9, 2.7, 6.0, 0.24), (FACE_A - 1.6, 2.3, 6.5, 0.2), (FACE_A + 2.6, 2.9, 5.7, 0.18)]
cords = B("eyeball_cords", "Eyes")
for k, (a, r, z, rr) in enumerate(EYEBALLS):
    x, y, _ = polar(r, a)
    e = B(f"eyeball_{k}", "Eyes")
    e.ball(0, 0, 0, rr, M["eye_white"], u=22, v=14)
    iris = [M["iris_g"], M["iris_a"], M["iris_m"]][k % 3]
    e.cyl(0, -rr * 0.9, 0, rr * 0.5, rr * 0.5, 0.03, iris, 26, rot=(PI / 2, 0, 0))
    e.cyl(0, -rr * 0.98, 0, rr * 0.22, rr * 0.22, 0.03, M["eye_ink"], 16, rot=(PI / 2, 0, 0))
    e.ball(rr * 0.18, -rr * 1.0, rr * 0.2, rr * 0.06, M["white"], u=8, v=6)
    e.build(loc=(x, y, z))
    cords.tube([(x, y, ceil_at(x, y)), (x, y, z + rr * 0.95)], 0.006, M["baba_dk"], 5)
    cords.tube([(x, y + 0.02, z + rr * 0.9), (x + 0.03, y, z + rr * 0.9 + 0.1), (x, y - 0.02, z + rr * 0.9 + 0.2)], 0.014, M["baba_skin"], 5)
cords.build()

# --- things that float, all of them up in the dome -----------------------------------------------
rg = random.Random(51)
for k, (a, r, z) in enumerate([(FACE_A + 1.9, 2.8, 6.6), (FACE_A - 2.2, 2.6, 7.0)]):
    f_ = B(f"float_bong_{k}", "Floaters")
    h_ = 0.4 + 0.1 * (k % 3)
    bong(f_, 0, 0, -h_ / 2, rg, h=h_)
    f_.build(loc=polar(r, a, z))
for k, (a, r, z, glow) in enumerate([(FACE_A - 0.9, 3.0, 7.4, M["glow_v"]), (FACE_A + 3.0, 2.2, 6.7, M["glow_m"])]):
    f_ = B(f"float_orb_{k}", "Floaters")
    f_.ball(0, 0, 0, 0.14, M["glass"], u=20, v=12)
    f_.ball(0, 0, 0, 0.075, glow, u=14, v=8)
    f_.build(loc=polar(r, a, z))
for k in range(4):  # books that fly round the dome: the site flaps their covers and sends them round
    fb = B(f"flybook_{k}", "Floaters")
    fb.box(-0.012, 0.012, -0.1, 0.1, -0.02, 0.015, BOOKS[k % len(BOOKS)])
    ob = fb.build(loc=polar(2.5, k * 1.6, 6.3 + 0.25 * k))
    for nm, x0, x1 in (("wl", -0.15, 0.0), ("wr", 0.0, 0.15)):
        w_ = B(f"flybook_{k}_{nm}", "Floaters")
        w_.box(x0, x1, -0.1, 0.1, -0.02, -0.005, BOOKS[k % len(BOOKS)], bev=0.004)
        w_.box(x0, x1, -0.09, 0.09, -0.005, 0.012, M["white"])
        w_.build().parent = ob

# two planets high in the dome, off to either side of the face
f_ = B("planet_0", "Floaters")
f_.ball(0, 0, 0, 0.8, M["planet"], u=32, v=18)
f_.build(loc=polar(3.0, FACE_A + 2.0, 9.4))
f_ = B("planet_1", "Floaters")
f_.ball(0, 0, 0, 0.5, M["glow_m"], u=28, v=16)
f_.lathe([(0.75, 0), (1.25, 0), (1.25, 0.02), (0.75, 0.02)], (0, 0, -0.01), M["gold"], 56)
f_.build(loc=polar(2.9, FACE_A - 2.3, 9.7), rot=(0.4, 0, 0.25))

# --- incense on three of the alcoves, and where its smoke rises ------------------------------------
b = B("incense", "Props")
for k, (slug, s_, d_, z) in enumerate((("cigars", 0.35, 0.3, 0.945), ("storage", -0.35, 0.3, 0.945), ("ashtray", 0.0, 0.1, 1.18))):
    x, y, z = BAY_AT[slug]((s_, 11.0 - d_, z))
    b.lathe([(0, 0), (0.05, 0), (0.08, 0.04), (0.09, 0.07), (0.07, 0.07), (0, 0.04)], (x, y, z), M["gold"], 18)
    b.tube([(x, y, z + 0.05), (x + 0.02, y, z + 0.17)], 0.004, M["plum"], 4)
    empty(f"smoke_{k}", (x + 0.02, y, z + 0.18), "Props", kind="smoke")
b.build()

# --- lights: warm and ordinary outside, strange in here -------------------------------------------------
lamp("lamp_face_key", polar(2.2, FACE_A, 5.9), "window")
lamp("lamp_violet_face", polar(R - 1.0, FACE_A, 7.8), "violet")
lamp("lamp_violet_dome", (RX, RY, 7.2), "violet")
lamp("lamp_warm_floor", (RX, RY, 0.6), "shop")  # warm: a coloured wash here tints the glossy wood and marble
lamp("lamp_mag_left", polar(3.4, FACE_A + 1.9, 4.6), "magenta")
lamp("lamp_teal_right", polar(3.4, FACE_A - 1.9, 4.6), "teal")
