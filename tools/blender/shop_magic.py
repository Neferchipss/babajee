# More of the shop's mischief, built after shop_world.py (shares its names).
# Things the site animates, by name:
#   portrait_N          empty; children _bust, _mouth, and eye_portrait_N_l / _r. Its
#                       extras: categories, label. The site makes them talk.
#   float_candle_N      drifts like the other float_*; the material m_flame flickers
#   roll_N              empty holding roll_N_sheet / _herb / _joint / _ember: rolls itself
#   lflame_N            small flames that take turns on the lighters
#   grind_top           spins on its own now and then
#   chalk_board         the site writes on its texture
#   book_N, bslot_N     books that swap places (see shop_world.py), step_N, ladder, flybook_N

M2 = dict(
    flame=mat("flame", "#ffb347", 0.4, 0.0, 1.0, 6.0),
    flame_t=mat("flame_t", "#4af0e0", 0.4, 0.0, 1.0, 6.0),
    ember=mat("ember", "#ff5a1f", 0.4, 0.0, 1.0, 7.0),
    herb=mat("herb", "#4d7a2e", 0.9),
    mouth=mat("mouth", "#3a0b14", 0.7),
    canvas=mat("canvas", "#1a1030", 0.9),
    chalk=mat("chalkboard", "#16231d", 0.95),
    paper=mat("paper_white", "#f1ecdd", 0.8),
    cloak_a=mat("cloak_violet", "#4a2a7a", 0.8),
    cloak_b=mat("cloak_teal", "#1f6a6a", 0.8),
    cloak_c=mat("cloak_maroon", "#7a2338", 0.8),
    cloak_d=mat("cloak_ochre", "#8a6a1f", 0.8),
    hair_w=mat("hair_white", "#e8e4dc", 0.8),
    hair_g=mat("hair_grey", "#8c8c94", 0.8),
    hair_b=mat("hair_black", "#1b1420", 0.8),
    skin_a=mat("skin_warm", "#d9a07a", 0.7),
    skin_b=mat("skin_deep", "#a8683f", 0.7),
    skin_c=mat("skin_pale", "#e8c4a8", 0.7),
)


# --- portraits that talk -------------------------------------------------------------------
def portrait(k, loc, d, kind, cats, label, w=1.1, h=1.5):
    """A framed character. Everything but the frame lives in the portrait's own
    frame (it looks out along -Y), so the whole thing can be moved as one."""
    pe = empty(f"portrait_{k}", loc, "Portraits", kind="portrait", categories=cats, label=label)
    pe.rotation_euler = orient(d)
    fr = B(f"portrait_{k}_frame", "Portraits")
    fr.box(-w / 2, w / 2, -0.01, 0.02, -h / 2, h / 2, M2["canvas"])
    for x0, x1, z0, z1 in [(-w / 2 - 0.08, -w / 2, -h / 2 - 0.08, h / 2 + 0.08), (w / 2, w / 2 + 0.08, -h / 2 - 0.08, h / 2 + 0.08),
                           (-w / 2 - 0.08, w / 2 + 0.08, h / 2, h / 2 + 0.08), (-w / 2 - 0.08, w / 2 + 0.08, -h / 2 - 0.08, -h / 2)]:
        fr.box(x0, x1, -0.07, 0.02, z0, z1, M["gold"], bev=0.015)
    ob = fr.build()
    ob.parent = pe
    bust = B(f"portrait_{k}_bust", "Portraits")
    cloak = {"wizard": M2["cloak_a"], "lady": M2["cloak_c"], "gent": M2["cloak_b"], "elder": M2["cloak_d"]}[kind]
    skin = {"wizard": M2["skin_c"], "lady": M2["skin_b"], "gent": M2["skin_a"], "elder": M2["skin_b"]}[kind]
    bust.ball(0, -0.08, -h / 2 - 0.06, w * 0.5, cloak, scale=(1.0, 0.45, 0.95), u=22, v=12)  # shoulders
    bust.cyl(0, -0.1, -0.2, 0.07, 0.07, 0.22, skin, 14)  # neck
    bust.ball(0, -0.12, 0.05, 0.19, skin, scale=(0.9, 0.95, 1.1), u=22, v=14)  # head
    bust.ball(0, -0.3, -0.01, 0.03, skin, scale=(0.9, 0.9, 1.2), u=10, v=6)  # nose
    if kind == "wizard":
        bust.cyl(0, -0.1, 0.43, 0.26, 0.02, 0.55, M2["cloak_a"], 22)  # pointed hat
        bust.cyl(0, -0.1, 0.16, 0.34, 0.34, 0.03, M2["cloak_a"], 26)
        bust.lathe([(0, 0), (0.15, 0), (0.12, -0.2), (0.07, -0.42), (0, -0.55)], (0, -0.2, -0.0), M2["hair_w"], 18)  # beard
        bust.tube([(-0.14, -0.28, 0.0), (0, -0.31, -0.03), (0.14, -0.28, 0.0)], 0.03, M2["hair_w"], 8)
    elif kind == "lady":
        bust.ball(0, -0.08, 0.17, 0.22, M2["cloak_d"], scale=(1.0, 0.9, 0.7), u=18, v=10)  # headscarf
        bust.ball(0.17, -0.1, 0.03, 0.07, M2["cloak_d"], u=10, v=6)
        bust.tube([(-0.2, -0.2, 0.02), (-0.24, -0.15, -0.2), (-0.2, -0.1, -0.35)], 0.04, M2["hair_b"], 8)
        bust.tube([(0.2, -0.2, 0.02), (0.24, -0.15, -0.2), (0.2, -0.1, -0.35)], 0.04, M2["hair_b"], 8)
    elif kind == "gent":
        bust.cyl(0, -0.1, 0.36, 0.17, 0.17, 0.3, M2["hair_b"], 22)  # top hat
        bust.cyl(0, -0.1, 0.22, 0.28, 0.28, 0.025, M2["hair_b"], 26)
        bust.cyl(0, -0.1, 0.26, 0.175, 0.175, 0.05, M["gold"], 22)
        bust.tube([(-0.12, -0.29, -0.06), (-0.04, -0.31, -0.045), (0.04, -0.31, -0.045), (0.12, -0.29, -0.06)], 0.022, M2["hair_b"], 8)  # moustache
        bust.tube([(0.07 + 0.045 * math.cos(a), -0.3, 0.1 + 0.045 * math.sin(a)) for a in [i * 2 * PI / 14 for i in range(15)]], 0.006, M["gold"], 5)  # a monocle
    else:  # elder
        bust.ball(0, -0.05, 0.27, 0.07, M2["hair_g"], u=10, v=6)  # a bun
        bust.ball(0, -0.1, 0.17, 0.2, M2["hair_g"], scale=(1.0, 0.8, 0.55), u=18, v=10)
        for sx in (-0.075, 0.075):
            bust.tube([(sx + 0.045 * math.cos(a), -0.3, 0.07 + 0.045 * math.sin(a)) for a in [i * 2 * PI / 14 for i in range(15)]], 0.006, M["gold"], 5)
        bust.tube([(-0.03, -0.3, 0.07), (0.03, -0.3, 0.07)], 0.006, M["gold"], 5)
    bob = bust.build()
    bob.parent = pe
    mouth = B(f"portrait_{k}_mouth", "Portraits")
    mouth.ball(0, 0, 0, 0.04, M2["mouth"], scale=(1.5, 0.35, 0.5), u=12, v=8)
    mo = mouth.build(loc=(0, -0.285, -0.06))
    mo.parent = pe
    for sg, nm in ((-1, "l"), (1, "r")):
        eye(f"eye_portrait_{k}_{nm}", (sg * 0.075, -0.292, 0.09), (0, -1, 0), 0.105, 0.058, M["iris_a"] if kind in ("lady", "elder") else M["iris_g"], ring=False, parent=pe)
    return pe


portrait(0, (4.44, 3.55, 5.4), (-1, 0, 0), "wizard", "rolling-paper,blunt-wraps", "The Old Roller")
portrait(1, (4.44, 6.7, 5.4), (-1, 0, 0), "lady", "grinder,ashtray", "Madam Grind")
portrait(2, (-3.5, 10.94, 5.8), (0, -1, 0), "gent", "bong,bong-accessory", "Sir Bubbleton")
portrait(3, (4.44, 9.9, 5.4), (-1, 0, 0), "elder", "rolling-tobacco,cigars,lighter", "Grandmother Baba")

# --- candles that float ------------------------------------------------------------------------
rc = random.Random(81)
placed = []
for k in range(16):
    for _ in range(30):
        x, y = rc.uniform(-3.4, 3.4), rc.uniform(3.6, 10.2)
        z = rc.uniform(4.4, min(7.3, vault_h(x) - 1.2))
        if all((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 > 0.5 for px, py, pz in placed) and not (-1.6 < x < 2.8 and 5.5 < y < 10.4):
            break
    placed.append((x, y, z))
    c = B(f"float_candle_{k}", "Floaters")
    c.cyl(0, 0, 0, 0.024, 0.024, 0.14, M["white"], 12)
    c.lathe([(0, 0), (0.03, 0), (0.026, 0.018), (0, 0.02)], (0, 0, -0.07), M["gold"], 10)  # a dish
    c.tube([(0, 0, 0.07), (0, 0, 0.09)], 0.003, M["black"], 4)
    c.ball(0, 0, 0.115, 0.02, M2["flame"], scale=(1, 1, 1.8), u=8, v=6)
    c.build(loc=(x, y, z))

# --- papers that roll themselves, lighters that take turns, a grinder that spins ---------------
for k, (r_, a) in enumerate([(2.85, 1.075 * PI), (2.95, 1.375 * PI), (2.85, 1.485 * PI)]):
    px, py, _ = on_arc(r_, a)
    re_ = empty(f"roll_{k}", (px, py, 1.075), "Props", kind="roll")
    re_.rotation_euler = (0, 0, a + PI / 2)
    parts = {
        "sheet": lambda b_: b_.box(-0.08, 0.08, -0.045, 0.045, -0.001, 0.002, M2["paper"]),
        "herb": lambda b_: b_.box(-0.07, 0.07, -0.006, 0.006, 0.001, 0.007, M2["herb"]),
        "joint": lambda b_: b_.cyl(0, 0, 0.0115, 0.0115, 0.0115, 0.16, M2["paper"], 12, rot=(0, PI / 2, 0)),
        "ember": lambda b_: b_.ball(0, 0, 0, 0.012, M2["ember"], u=8, v=6),
    }
    for nm, fn in parts.items():
        b_ = B(f"roll_{k}_{nm}", "Props")
        fn(b_)
        o_ = b_.build(loc=(0.085, 0, 0.0115) if nm == "ember" else (0, 0, 0))
        o_.parent = re_
for n_, i in enumerate((1, 3, 5, 8, 10, 12)):  # a flame over some of the lighters in the case
    a = 1.43 * PI
    px, py, _ = on_arc(2.85, a)
    lx_, ly_ = (i % 7 - 3) * 0.075, (i // 7 - 0.5) * 0.1
    b_ = B(f"lflame_{n_}", "Props")
    b_.ball(0, 0, 0, 0.014, M2["flame_t"] if n_ % 2 else M2["flame"], scale=(0.7, 0.7, 1.8), u=8, v=6)
    b_.build(loc=(px + lx_ * math.cos(a) - ly_ * math.sin(a), py + lx_ * math.sin(a) + ly_ * math.cos(a), 1.215))
gx, gy, _ = on_arc(2.9, 1.04 * PI)
b_ = B("grinder_base", "Props")
b_.lathe([(0, 0), (0.06, 0), (0.06, 0.035), (0, 0.035)], (gx, gy, 1.07), M["brass"], 24)
b_.build()
b_ = B("grind_top", "Props")
b_.lathe([(0, 0), (0.062, 0), (0.062, 0.03), (0.055, 0.036), (0.012, 0.036), (0.012, 0.05), (0.02, 0.055), (0, 0.055)], (0, 0, 0), M["gold"], 24)
b_.box(0.0, 0.05, -0.006, 0.006, 0.036, 0.046, M["gold"], bev=0.002)  # the handle
b_.build(loc=(gx, gy, 1.105))

# --- a chalkboard that writes itself -------------------------------------------------------------
b = B("chalkboard_frame", "Props")
for x0, x1, y0, y1, z0, z1 in [(4.38, 4.46, 0.85, 3.15, 1.28, 1.36), (4.38, 4.46, 0.85, 3.15, 3.14, 3.22), (4.38, 4.46, 0.85, 0.93, 1.28, 3.22), (4.38, 4.46, 3.07, 3.15, 1.28, 3.22)]:
    b.box(x0, x1, y0, y1, z0, z1, M["gold"], bev=0.012)
b.build()
b = B("chalk_board", "Props")
b.quad((4.425, 3.07, 1.36), (4.425, 0.93, 1.36), (4.425, 0.93, 3.14), (4.425, 3.07, 3.14), M2["chalk"])
b.build(recalc=False)
