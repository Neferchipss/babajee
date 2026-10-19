# The other side: what the shop is like once you are through the door.
# Run from build_shop.py (it shares that file's names: B, M, lamp, vault_h...).
# Things the site animates are named by prefix:
#   eye_*        an empty with children *_iris (slides to look at you) and *_lid (blinks)
#   eyeball_*    a whole eyeball on a cord; the site turns it to face you
#   float_*      drifts and turns on the spot
#   planet_*     turns slowly
#   smoke_*      empties where incense smoke rises
#   curtain_l/r  parted when you come near
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


# --- the giant face on the back wall ---------------------------------------------------
b = B("baba_face", "Eyes")
b.box(-2.3, 3.5, 10.88, 10.99, 3.95, 7.0, M["baba_skin"], bev=0.05)
b.box(-2.4, 3.6, 10.84, 10.9, 3.88, 3.98, M["gold"], bev=0.012)
for x0 in (-2.4, 3.5):
    b.box(x0, x0 + 0.1, 10.84, 10.9, 3.9, 7.0, M["gold"], bev=0.012)
for ex in (-0.7, 1.9):  # heavy brows and cheeks
    b.tube([(ex + 0.95 * math.cos(a), 10.85, 5.62 + 0.3 * math.sin(a)) for a in [PI * 0.92 - i * (PI * 0.84) / 16 for i in range(17)]], 0.055, M["baba_dk"], 8)
    b.ball(ex, 10.78, 4.35, 0.42, M["baba_skin"], scale=(1.5, 0.3, 0.8))
for ex in (0.32, 0.88):  # the two dots between the eyes
    b.ball(ex, 10.84, 5.45, 0.07, M["baba_dk"], u=10, v=6)
for cx_, cz_, sg in ((0.6, 6.82, 1), (-1.75, 6.55, -1), (2.95, 6.55, 1)):  # forehead swirl and curls
    r_max = 0.17 if cx_ == 0.6 else 0.34
    steps = 40
    b.tube([(cx_ + (0.015 + r_max * i / steps) * math.cos(sg * 3 * PI * i / steps * (1.2 if r_max < 0.2 else 1.0)), 10.84, cz_ + (0.015 + r_max * i / steps) * math.sin(sg * 3 * PI * i / steps)) for i in range(steps + 1)], 0.024, M["baba_hair"], 6)
b.build()
eye("eye_face_l", (-0.7, 10.866, 5.0), (0, -1, 0), 1.7, 0.85, M["iris_g"])
eye("eye_face_r", (1.9, 10.866, 5.0), (0, -1, 0), 1.7, 0.85, M["iris_a"])
eye("eye_face_3", (0.6, 10.866, 6.12), (0, -1, 0), 0.42, 0.95, M["iris_v"])

# --- eyes in the vault, on the floor, and along the walls ----------------------------------
for k, (x, y) in enumerate([(-2.6, 4.6), (2.6, 4.6), (0.0, 6.4), (0.0, 9.2)]):
    z = vault_h(x) - 0.12
    eye(f"eye_vault_{k}", (x, y, z), (-x, 0, VCZ - z), 1.4, 0.7, [M["iris_g"], M["iris_a"], M["iris_m"], M["iris_v"]][k % 4])
eye("eye_floor_l", (-1.9, 5.0, 0.065), (0, 0, 1), 1.1, 0.55, M["iris_m"])
eye("eye_floor_r", (2.9, 5.0, 0.065), (0, 0, 1), 1.1, 0.55, M["iris_v"])
eye("eye_back_r", (4.05, 10.9, 5.2), (0, -1, 0), 0.8, 0.4, M["iris_g"])
# a pair behind the curtain, in the dark
eye("eye_peek_l", (0.28, 13.6, 1.35), (0, -1, 0), 0.34, 0.17, M["iris_m"], ring=False)
eye("eye_peek_r", (0.9, 13.6, 1.35), (0, -1, 0), 0.34, 0.17, M["iris_m"], ring=False)

# tapestries on the right wall, each with an eye
b = B("banners", "Props")
for k, y in enumerate(()):  # none: the portraits own the right wall
    b.box(4.38, 4.5, y - 0.65, y + 0.65, 4.2, 6.9, M["plum"], bev=0.01)
    b.box(4.36, 4.4, y - 0.7, y + 0.7, 4.14, 4.22, M["gold"], bev=0.008)
    b.box(4.36, 4.4, y - 0.7, y + 0.7, 6.86, 6.94, M["gold"], bev=0.008)
    b.tube([(4.36, y + (0.03 + 0.2 * i / 40) * math.cos(3 * PI * i / 40), 4.95 + (0.03 + 0.2 * i / 40) * math.sin(3 * PI * i / 40)) for i in range(41)], 0.014, M["gold"], 6)
    b.tube([(4.36, y - 0.5, 6.7), (4.36, y - 0.5, 6.3)], 0.01, M["gold"], 5)
    b.tube([(4.36, y + 0.5, 6.7), (4.36, y + 0.5, 6.3)], 0.01, M["gold"], 5)
    b.cyl(4.37, y, 4.12, 0.05, 0.02, 0.18, M["gold"], 10)
b.build()
for k, y in enumerate(()):
    eye(f"eye_banner_{k}", (4.36, y, 5.75), (-1, 0, 0), 0.8, 0.4, [M["iris_a"], M["iris_v"], M["iris_g"]][k])

# --- eyeballs on cords, hung through the room -----------------------------------------------
EYEBALLS = [(3.1, 7.0, 3.4, 0.2), (-1.6, 6.4, 4.3, 0.16), (3.0, 3.5, 3.0, 0.14)]
cords = B("eyeball_cords", "Eyes")
for k, (x, y, z, r) in enumerate(EYEBALLS):
    e = B(f"eyeball_{k}", "Eyes")
    e.ball(0, 0, 0, r, M["eye_white"], u=22, v=14)
    iris = [M["iris_g"], M["iris_a"], M["iris_m"]][k % 3]
    e.cyl(0, -r * 0.9, 0, r * 0.5, r * 0.5, 0.03, iris, 26, rot=(PI / 2, 0, 0))
    e.cyl(0, -r * 0.98, 0, r * 0.22, r * 0.22, 0.03, M["eye_ink"], 16, rot=(PI / 2, 0, 0))
    e.ball(r * 0.18, -r * 1.0, r * 0.2, r * 0.06, M["white"], u=8, v=6)
    e.build(loc=(x, y, z))
    cords.tube([(x, y, ceil_at(x, y)), (x, y, z + r * 0.95)], 0.006, M["baba_dk"], 5)
    cords.tube([(x, y + 0.02, z + r * 0.9), (x + 0.03, y, z + r * 0.9 + 0.1), (x, y - 0.02, z + r * 0.9 + 0.2)], 0.014, M["baba_skin"], 5)
cords.build()

# --- things that float --------------------------------------------------------------------------
rg = random.Random(51)
for k, (x, y, z) in enumerate([(-1.9, 6.9, 3.6), (3.3, 4.0, 3.5)]):
    f_ = B(f"float_bong_{k}", "Floaters")
    h_ = 0.4 + 0.1 * (k % 3)
    bong(f_, 0, 0, -h_ / 2, rg, h=h_)
    f_.build(loc=(x, y, z))
for k, (x, y, z, glow) in enumerate([(3.3, 6.0, 4.2, M["glow_v"]), (-2.0, 5.0, 3.9, M["glow_m"])]):
    f_ = B(f"float_orb_{k}", "Floaters")
    f_.ball(0, 0, 0, 0.14, M["glass"], u=20, v=12)
    f_.ball(0, 0, 0, 0.075, glow, u=14, v=8)
    f_.build(loc=(x, y, z))
for k in range(4):  # books that fly about the vault: the site flaps their covers and sends them round
    fb = B(f"flybook_{k}", "Floaters")
    fb.box(-0.012, 0.012, -0.1, 0.1, -0.02, 0.015, BOOKS[k % len(BOOKS)])
    ob = fb.build(loc=(math.cos(k) * 2.5, 6.0 + math.sin(k) * 2.0, 4.5 + 0.2 * k))
    for nm, x0, x1 in (("wl", -0.15, 0.0), ("wr", 0.0, 0.15)):
        w_ = B(f"flybook_{k}_{nm}", "Floaters")
        w_.box(x0, x1, -0.1, 0.1, -0.02, -0.005, BOOKS[k % len(BOOKS)], bev=0.004)
        w_.box(x0, x1, -0.09, 0.09, -0.005, 0.012, M["white"])
        w_.build().parent = ob

# two planets hung beneath the vault
f_ = B("planet_0", "Floaters")
f_.ball(0, 0, 0, 0.9, M["planet"], u=32, v=18)
f_.build(loc=(1.6, 7.0, 8.2))
f_ = B("planet_1", "Floaters")
f_.ball(0, 0, 0, 0.55, M["glow_m"], u=28, v=16)
f_.lathe([(0.8, 0), (1.35, 0), (1.35, 0.02), (0.8, 0.02)], (0, 0, -0.01), M["gold"], 56)
f_.build(loc=(-1.6, 9.4, 8.3), rot=(0.4, 0, 0.25))

# --- a shelf hung upside-down from the vault -------------------------------------------------------
if False:  # parked: the upside-down shelf was static clutter over the room
    b = B("upside_shelf", "Fixtures")
    SY0, SY1, SX0, SX1, SZ = 4.6, 6.0, 1.9, 4.3, 6.2
    b.box(SX0, SX1, SY0, SY1, SZ, SZ + 0.08, M["plum"], bev=0.02)
    b.box(SX0 - 0.03, SX1 + 0.03, SY0 - 0.03, SY1 + 0.03, SZ - 0.02, SZ + 0.02, M["gold"], bev=0.01)
    for x in (SX0 + 0.1, SX1 - 0.1):
        for y in (SY0 + 0.1, SY1 - 0.1):
            b.tube([(x, y, SZ + 0.08), (x, y, ceil_at(x, y))], 0.008, M["gold"], 5)
    for k in range(6):  # bongs and jars standing on the underside
        x = SX0 + 0.3 + k * 0.45
        h_ = 0.34 + 0.08 * (k % 3)
        b.lathe([(0, 0), (0.05, 0), (0.06, 0.02), (0.045, 0.08), (0.03, 0.14), (0.03, h_ * 0.9), (0.036, h_), (0, h_)], (x, SY0 + 0.35, SZ), rg.choice(GLASSES), 18, rot=(PI, 0, 0))
        b.lathe([(0, 0), (0.05, 0), (0.055, 0.08), (0.04, 0.1), (0, 0.1)], (x + 0.1, SY1 - 0.35, SZ), rg.choice([M["glass"], M["g_amber"]]), 16, rot=(PI, 0, 0))
    b.build()

# --- the gallery above the bong wall, a spiral stair, and an old library ----------------------------
b = B("gallery", "Fixtures")
GX0, GX1, GY0, GY1, GZ = -4.5, -3.1, 3.2, 9.3, 4.3  # the deck ends where the stair lands
b.box(GX0, GX1, GY0, GY1, GZ, GZ + 0.12, M["plum"], bev=0.02)
b.box(GX1 - 0.06, GX1 + 0.04, GY0 - 0.04, GY1, GZ - 0.2, GZ + 0.12, M["gold"], bev=0.01)
for y in (5.4, 7.9):
    b.lathe([(0, 0), (0.12, 0), (0.1, 0.2), (0.06, 0.4), (0.06, GZ - 0.3), (0.1, GZ - 0.1), (0.1, GZ), (0, GZ)], (-3.1, y, 0), M["gold"], 20)
rail = [(GY0, GY1)]
for ya, yb in rail:
    b.tube([(GX1, ya, GZ + 1.05), (GX1, yb, GZ + 1.05)], 0.028, M["gold"], 8)
    for i in range(int((yb - ya) / 0.28) + 1):
        y = ya + i * 0.28
        if y <= yb:
            b.tube([(GX1, y, GZ + 0.12), (GX1, y, GZ + 1.05)], 0.012, M["gold"], 6)
    for y in (ya, yb):
        b.tube([(GX1, y, GZ + 0.12), (GX1, y, GZ + 1.15)], 0.03, M["gold"], 8)
# the library on the wall behind
b.box(-4.5, -4.46, GY0, GY1, GZ + 0.12, 7.0, M["plum"])
rb = random.Random(61)
ZONES = [(4.0, 5.05), (7.0, 8.05)]  # stretches left for the books that move
SLOT = 0.075
HERO = []
for si, z in enumerate((4.95, 5.55, 6.15, 6.75)):
    b.box(-4.5, -4.1, GY0, GY1, z, z + 0.035, M["plum2"], bev=0.006)
    for z0_, z1_ in ZONES:
        for i in range(14):
            HERO.append((z0_ + SLOT / 2 + i * SLOT, z + 0.035))
    y = GY0 + 0.1
    while y < GY1 - 0.2:
        zone = next((zz for zz in ZONES if zz[0] - 0.06 <= y < zz[1]), None)
        if zone:
            y = zone[1] + 0.02
            continue
        roll = rb.random()
        if roll < 0.06:  # a glowing jar or a crystal ball between the books
            ball = rb.random() < 0.5
            if ball:
                b.lathe([(0, 0), (0.07, 0), (0.05, 0.03), (0, 0.03)], (-4.3, y, z + 0.035), M["gold"], 14)
                b.ball(-4.3, y, z + 0.035 + 0.12, 0.09, M["glow_t"] if rb.random() < 0.5 else M["glow_m"], u=14, v=8)
            else:
                jar(b, -4.3, y, z + 0.035, 0.05, 0.16, M["glow_v"], M["gold"])
            y += 0.22
        elif roll < 0.1:  # a candle stub
            b.cyl(-4.3, y, z + 0.035 + 0.05, 0.02, 0.02, 0.1, M["white"], 10)
            b.ball(-4.3, y, z + 0.035 + 0.12, 0.016, M["lamp"], scale=(1, 1, 1.6), u=8, v=6)
            y += 0.1
        else:
            w = rb.uniform(0.035, 0.07)
            hb = rb.uniform(0.2, 0.34)
            b.box(-4.42, -4.14, y, y + w, z + 0.035, z + 0.035 + hb, rb.choice(BOOKS), rot=None)
            y += w + 0.004
b.build()
# the books that move: each its own object, 3 in 4 slots filled, the site swaps them about
rh = random.Random(62)
for n, (ys, zb) in enumerate(HERO):
    empty(f"bslot_{n}", (-4.28, ys, zb), "Props", kind="bookslot")
    if rh.random() < 0.75:
        hb = rh.uniform(0.22, 0.34)
        bk = B(f"book_{n}", "Props")
        bk.box(-0.14, 0.14, -0.03, 0.03, -hb / 2, hb / 2, rh.choice(BOOKS))
        bk.box(0.135, 0.15, -0.031, 0.031, -hb / 2 + 0.03, hb / 2 - 0.03, M["gold"])
        ob = bk.build(loc=(-4.28, ys, zb + hb / 2))
        ob["hb"] = hb
        ob["slot"] = n
# the spiral stair
STX, STY, NST, SR, TOP = -3.5, 9.9, 17, 0.78, -PI / 2  # in the corner; the top step meets the end of the deck
b = B("spiral_rail", "Fixtures")
b.lathe([(0, 0), (0.18, 0), (0.1, 0.1), (0.07, 0.5), (0.07, 4.7), (0.1, 4.8), (0, 4.8)], (STX, STY, 0), M["gold"], 20)
post_tops = []
for k in range(NST):
    a = TOP - (NST - 1 - k) * (1.45 * PI / NST)
    zk = 0.22 + k * (GZ - 0.22) / (NST - 1)
    st = B(f"step_{k}", "Fixtures")  # origin on the column, so turning it swings the step round it
    st.box(0.08, SR + 0.02, -0.22, 0.22, -0.035, 0.035, M["plum2"], bev=0.012)
    ob = st.build(loc=(STX, STY, zk))
    ob.rotation_euler = (0, 0, a)
    px, py = STX + SR * math.cos(a), STY + SR * math.sin(a)
    post_tops.append((px, py, zk + 1.0))
    if k % 2 == 0:
        b.tube([(px, py, zk), (px, py, zk + 1.0)], 0.012, M["gold"], 6)
b.tube(post_tops, 0.026, M["gold"], 8)
b.build()

# --- incense, and where its smoke rises --------------------------------------------------------------
b = B("incense", "Props")
for k, (x, y, z) in enumerate([(*on_arc(2.9, 1.17 * PI)[:2], 1.07), (3.95, 3.0, 0.9), (-4.1, 6.7, 0.995), (-2.1, 10.7, 0.995)]):
    b.lathe([(0, 0), (0.05, 0), (0.08, 0.04), (0.09, 0.07), (0.07, 0.07), (0, 0.04)], (x, y, z), M["gold"], 18)
    b.tube([(x, y, z + 0.05), (x + 0.02, y, z + 0.17)], 0.004, M["plum"], 4)
    empty(f"smoke_{k}", (x + 0.02, y, z + 0.18), "Props", kind="smoke")
b.build()

# --- lights: warm and ordinary outside, strange in here -------------------------------------------------
lamp("lamp_mag_counter", (3.0, 9.6, 2.7), "magenta")
lamp("lamp_teal_grind", (-3.2, 8.8, 3.1), "teal")
lamp("lamp_violet_face", (0.6, 9.6, 6.2), "violet")
lamp("lamp_face_key", (0.6, 8.4, 5.2), "window")
lamp("lamp_violet_vault", (0.5, 6.0, 8.0), "violet")
lamp("lamp_teal_floor", (0.5, 5.0, 0.6), "teal")
lamp("lamp_mag_gallery", (-3.7, 6.5, 5.6), "magenta")
