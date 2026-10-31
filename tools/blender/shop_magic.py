# More of the shop's mischief, built after shop_world.py (shares its names).
# Things the site animates, by name:
#   float_candle_N      drifts like the other float_*; the material m_flame flickers

M2 = dict(
    flame=mat("flame", "#ffb347", 0.4, 0.0, 1.0, 6.0),
)


# --- candles that float ------------------------------------------------------------------------
rc = random.Random(81)
placed = []
for k in range(10):
    for _ in range(30):
        a, r = rc.uniform(0, 2 * PI), rc.uniform(1.2, 3.6)
        x, y, _ = polar(r, a)
        z = rc.uniform(5.6, min(9.8, dome_z(r) - 1.2))
        off_face = abs((a - FACE_A + PI) % (2 * PI) - PI) > 0.75  # nothing in front of Baba
        if off_face and all((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 > 0.5 for px, py, pz in placed):
            break
    placed.append((x, y, z))
    c = B(f"float_candle_{k}", "Floaters")
    c.cyl(0, 0, 0, 0.024, 0.024, 0.14, M["white"], 12)
    c.lathe([(0, 0), (0.03, 0), (0.026, 0.018), (0, 0.02)], (0, 0, -0.07), M["gold"], 10)  # a dish
    c.tube([(0, 0, 0.07), (0, 0, 0.09)], 0.003, M["black"], 4)
    c.ball(0, 0, 0.115, 0.02, M2["flame"], scale=(1, 1, 1.8), u=8, v=6)
    c.build(loc=(x, y, z))
