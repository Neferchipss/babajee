# The street's traffic and passers-by, built after the rest (shares build_shop.py's
# names). The site moves them: each car_N / ped_N carries extras
#   lane_y   which line of the road or pavement it follows (Blender y)
#   dir      +1 towards +x, -1 towards -x (the model is already turned that way)
#   speed    metres a second
#   stand    1 for someone who stays where they are
# A pedestrian's legs are the children ped_N_ll / ped_N_lr (origin on the hip).

CAR_MATS = [mat("car_teal", "#1d3946", 0.35, 0.6), mat("car_wine", "#44202b", 0.35, 0.6), mat("car_slate", "#2a2c33", 0.35, 0.6)]
GLASS_DARK = mat("glass_dark", "#0a1017", 0.08, 0.2)
HEAD = mat("headlight", "#fff2cf", 0.3, 0.0, 1.0, 5.0)
TAIL = mat("taillight", "#ff2020", 0.3, 0.0, 1.0, 3.5)
SKINS = [mat("ped_skin_a", "#d9a07a", 0.7), mat("ped_skin_b", "#8d5a3a", 0.7), mat("ped_skin_c", "#f0cfb4", 0.7)]
COATS = [mat("coat_yellow", "#b8902a", 0.8), mat("coat_dark", "#23232c", 0.8), mat("coat_olive", "#4a5232", 0.8), mat("coat_rust", "#7a3a24", 0.8), mat("coat_blue", "#243a63", 0.8)]


def car(k, x, lane_y, direction, speed, body):
    b = B(f"car_{k}", "Traffic")
    b.box(-2.1, 2.1, -0.9, 0.9, 0.3, 0.86, CAR_MATS[body], bev=0.2)
    b.box(-1.25, 1.0, -0.8, 0.8, 0.86, 1.4, CAR_MATS[body], bev=0.18)
    b.box(-1.15, 0.9, -0.82, 0.82, 0.92, 1.32, GLASS_DARK, bev=0.05)
    b.box(-2.1, 2.1, -0.92, 0.92, 0.2, 0.34, M["black"], bev=0.04)
    for sy in (-1, 1):
        b.box(2.07, 2.13, sy * 0.45 - 0.17, sy * 0.45 + 0.17, 0.55, 0.68, HEAD, bev=0.02)
        b.box(-2.13, -2.07, sy * 0.5 - 0.2, sy * 0.5 + 0.2, 0.58, 0.7, TAIL, bev=0.02)
        for wx in (-1.3, 1.35):
            b.lathe([(0, -0.11), (0.3, -0.11), (0.33, -0.08), (0.33, 0.08), (0.3, 0.11), (0, 0.11)], (wx, sy * 0.78, 0.33), M["rubber"], 20, rot=(PI / 2, 0, 0))
    ob = b.build(loc=(x, lane_y, 0.0))
    if direction < 0:
        ob.rotation_euler = (0, 0, PI)
    ob["lane_y"], ob["dir"], ob["speed"] = lane_y, direction, speed


def ped(k, x, lane_y, direction, speed, coat, skin, stand=0, umbrella=False, pack=False, face=None):
    rp = random.Random(300 + k)
    b = B(f"ped_{k}", "Traffic")
    b.lathe([(0, 0), (0.2, 0), (0.24, 0.25), (0.25, 0.5), (0.2, 0.6), (0.07, 0.66), (0, 0.66)], (0, 0, 0.82), COATS[coat], 16)
    b.ball(0, 0, 1.58, 0.105, SKINS[skin], u=14, v=10)
    b.ball(-0.02, 0, 1.62, 0.108, M["black"] if rp.random() < 0.6 else COATS[1], scale=(1, 1, 0.7), u=12, v=8)  # hair or a hat
    for sy in (-1, 1):
        b.tube([(0, sy * 0.25, 1.38), (0.04, sy * 0.3, 1.1), (0.08, sy * 0.28, 0.9)], 0.035, COATS[coat], 8)
    if pack:
        b.box(-0.3, -0.12, -0.15, 0.15, 1.0, 1.4, COATS[2], bev=0.04)
    if umbrella:
        b.tube([(0.08, -0.28, 0.9), (0.08, -0.28, 2.0)], 0.012, M["steel"], 6)
        b.lathe([(0.0, 0), (0.55, -0.18), (0.6, -0.2), (0.0, 0.04)], (0.08, -0.28, 2.0), M["black"], 16)
    ob = b.build(loc=(x, lane_y, 0.0))
    if face is not None:
        ob.rotation_euler = (0, 0, face)
    elif direction < 0:
        ob.rotation_euler = (0, 0, PI)
    ob["lane_y"], ob["dir"], ob["speed"], ob["stand"] = lane_y, direction, speed, stand
    for sy, nm in ((-1, "ll"), (1, "lr")):
        lg = B(f"ped_{k}_{nm}", "Traffic")
        lg.tube([(0, 0, 0), (0, 0, -0.78)], 0.065, M["black"] if coat != 0 else COATS[1], 8)
        lg.box(-0.04, 0.2, -0.07, 0.07, -0.86, -0.78, M["black"], bev=0.03)
        lo = lg.build(loc=(0, sy * 0.09, 0.82))
        lo.parent = ob


car(0, 16.0, -5.6, -1, 4.2, 0)
car(1, -16.0, -10.8, 1, 5.0, 1)
car(2, 30.0, -5.6, -1, 3.4, 2)
ped(0, -6.0, -3.0, 1, 1.25, 0, 0, pack=True)
ped(1, 9.0, -2.85, -1, 1.0, 1, 1, umbrella=True)
ped(2, -2.0, -14.7, 1, 1.35, 3, 2)
ped(3, 6.0, -15.3, -1, 1.1, 4, 0, pack=True)
ped(4, 1.5, -0.95, 0, 0.0, 2, 1, stand=1, face=PI / 2)  # someone at the window, looking in
