"""Bake the second model's lighting (build_shop_v2.py) into its vertices.

Cycles renders the shop's light for real (the dusk sky, the street lamp, the strips
under the shelves, the pendants, the light bouncing off walnut and plaster) and
stores what lands on every surface in a colour per face corner. The site adds it to
the light the textures get (shop-bake.ts) instead of lighting the scene live.

A colour per corner rather than a lightmap image: the shop is thousands of small
round things (bottles, jars, leaves) that would each want an island of a map. Big
flat surfaces are cut into a grid first, so a pool of light or a shadow has corners
to land on.

    blender -b tools/blender/shop_v2.blend -P tools/blender/bake_shop_v2.py -- \\
        --out public/models/shop-v2-lit.glb [--samples 512]

The colour is stored as (light / scale) ^ (1/2.2) in 8 bits (COLOR_0); the scale is on
the model's `lightmaps` empty (extras.scale).
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = os.path.abspath(arg("--out", "public/models/shop-v2-lit.glb"))
SAMPLES = int(arg("--samples", "512"))
scene = bpy.context.scene

# --- Cycles on the GPU if there is one ------------------------------------------------------
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            print("BAKE DEVICE", kind)
            break
    except TypeError:
        continue
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.sample_clamp_indirect = 8.0  # no fireflies from the bright strips

# --- the light, as in the pitch video -------------------------------------------------------
world = bpy.data.worlds.new("dusk")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.36, 0.41, 0.47, 1)  # an overcast blue-grey dusk
bg.inputs["Strength"].default_value = float(arg("--sky", "1.0"))
scene.world = world


def light(name, kind, loc, energy, color, size=0.1, aim=None, cone=70):
    li = bpy.data.lights.new(name + "_bake", kind)
    li.energy = energy
    li.color = color
    li.shadow_soft_size = size
    if kind == "SPOT":
        li.spot_size, li.spot_blend = math.radians(cone), 0.6
    ob = bpy.data.objects.new(name + "_bake", li)
    ob.location = loc
    if aim is not None:
        ob.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(ob)


WARM = (1.0, 0.78, 0.52)
for ob in list(scene.objects):
    if ob.name.startswith("lamp_"):
        k = ob.get("kind", "shop")
        energy, size = {"vstreet": (2600, 0.6), "vwindow": (320, 0.15), "vcandle": (7, 0.02), "fill": (90, 0.3)}.get(k, (40, 0.2))
        light(ob.name, "POINT", ob.matrix_world.translation, energy, WARM if k != "vstreet" else (1.0, 0.85, 0.66), size)
    elif ob.name.startswith("spot_"):
        # energy (W), cone (degrees), lamp size (m) for each kind of spot
        energy, cone, size = {"plaque": (260, 40, 0.05), "downlight": (200, 70, 0.05)}.get(ob.get("kind"), (560, 75, 0.05))
        light(ob.name, "SPOT", ob.matrix_world.translation, energy, WARM, size, tuple(ob["aim"]), cone)

# the room's light bouncing off its ceiling and walls, more than a few bounces find
fill = bpy.data.lights.new("ceiling_bake", "AREA")
fill.shape, fill.size, fill.size_y = "RECTANGLE", 4.0, 5.6
fill.energy = float(arg("--fill", "200"))  # the room's soft bounce: the pitch's shadows never go black
fill.color = (1.0, 0.86, 0.68)
fo = bpy.data.objects.new("ceiling_bake", fill)
fo.location = (0.05, 4.0, 3.0)  # just under the ceiling, facing down
scene.collection.objects.link(fo)

# the street's haze: a broad soft light high on the left, washing down the backdrop wall
# and the facade, as the glow in the pitch's top-left corner
haze = bpy.data.lights.new("haze_bake", "AREA")
haze.shape, haze.size, haze.size_y = "RECTANGLE", 8.0, 4.0
haze.energy = float(arg("--haze", "4200"))
haze.color = (0.86, 0.88, 0.8)
ho = bpy.data.objects.new("haze_bake", haze)
ho.location = (-9.0, -3.0, 10.0)
ho.rotation_euler = (Vector((-5.0, 1.6, 4.0)) - Vector(ho.location)).to_track_quat("-Z", "Y").to_euler()  # mostly onto the wall
scene.collection.objects.link(ho)

# the strips and the bulbs light the shop for real now
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    p = m.node_tree.nodes.get("Principled BSDF")
    if p is None:
        continue
    # emission strengths for the bake: what lights the shop, not how bright it looks on the site
    strength = {"v2_led": float(arg("--led", "240")), "v2_led_back": float(arg("--led-back", "40")), "v2_bulb": 30.0,
                "v2_shade_in": 3.0, "v2_downlight": 20.0}.get(m.name)
    if strength is not None:
        p.inputs["Emission Strength"].default_value = strength
    # glass lets the light through (the site draws it see-through, unbaked)
    if m.name.startswith("glass"):
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        nt.links.new(tr.outputs[0], out.inputs["Surface"])

# --- which surfaces: everything solid that stays put ----------------------------------------
bpy.ops.object.select_all(action="DESELECT")
fonts = [o for o in scene.objects if o.type == "FONT" and not o.hide_render]
for o in fonts:
    o.select_set(True)
if fonts:
    bpy.context.view_layer.objects.active = fonts[0]
    bpy.ops.object.convert(target="MESH")
bpy.ops.object.select_all(action="DESELECT")

SKIP = ("_none_",)  # the door too: it is baked shut, which still reads right as it swings
meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render and not o.name.startswith(SKIP)
          and not (o.parent and o.parent.name.startswith(SKIP))]
# pictures on walls (lettering, box art): left out of the render, so their see-through
# parts do not shade the wall; they take the wall's light after (see below)
decals = [o for o in meshes if o.name.startswith("decal_")]
meshes = [o for o in meshes if o not in decals]
for o in decals:
    o.hide_render = True
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.select_all(action="DESELECT")

# Faces nobody sees (the street's underside, the backs of walls, the room's outside) are
# not cut up
ROOM = (-2.15 - 0.04, 2.25 + 0.04, 0.9, 7.0 + 0.04, -0.02, 3.1 + 0.04)  # build_shop_v2.py RX0 RX1 RY0 RY1 0 RZ


def seen(c, n):
    if n.z < -0.5 and c.z < 0.1:
        return False  # resting on the ground
    x0, x1, y0, y1, z0, z1 = ROOM
    if c.y > 0.6:  # the room's side of the shopfront, and the backdrop wall's face behind the shop
        return (x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1) or (n.y < -0.5 and c.y < 1.7 and c.z < 8.0)
    return not (n.y > 0.5 and c.y > 0.3)  # facing away from the street, behind the shopfront


def grid(o):
    """Cut the big seen faces of o so no edge on them is longer than a cell."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    mw = o.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    for _ in range(3):
        cuts = {}
        for f in bm.faces:
            c = mw @ f.calc_center_median()
            if not seen(c, (nm @ f.normal).normalized()):
                continue
            room = ROOM[0] <= c.x <= ROOM[1] and c.y > 0.6
            cell = 0.12 if room else 0.3  # finer in the room, where the pools are
            for e in f.edges:
                n = math.ceil((mw @ e.verts[0].co - mw @ e.verts[1].co).length / cell) - 1
                if n > 0:
                    cuts[e] = max(cuts.get(e, 0), min(n, 60))
        if not cuts:
            break
        by_n = {}
        for e, n in cuts.items():
            by_n.setdefault(n, []).append(e)
        for n, edges in by_n.items():
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()


before = sum(len(o.data.vertices) for o in meshes)
for o in meshes:
    grid(o)
print("GRID verts", before, "->", sum(len(o.data.vertices) for o in meshes), flush=True)

# --- bake into a colour per face corner -----------------------------------------------------
for o in meshes:
    for a in list(o.data.color_attributes):
        o.data.color_attributes.remove(a)
    ca = o.data.color_attributes.new("bake", "FLOAT_COLOR", "CORNER")
    o.data.color_attributes.active_color = ca
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
print("BAKING", len(meshes), "objects,", SAMPLES, "samples", flush=True)
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, target="VERTEX_COLORS")

# --- store it in 8 bits ---------------------------------------------------------------------
vals = []
for o in meshes:
    a = o.data.color_attributes["bake"]
    px = np.empty(len(a.data) * 4, np.float32)
    a.data.foreach_get("color", px)
    vals.append(px.reshape(-1, 4)[:, :3])
vals_by_name = {o.name: px for o, px in zip(meshes, vals)}
allv = np.concatenate(vals)
scale = float(np.percentile(allv.max(axis=1), 99.8)) or 1.0
print("BAKE scale", scale, "median", float(np.median(allv.max(axis=1))))
for o, px in zip(meshes, vals):
    enc = np.clip(px / scale, 0, 1) ** (1 / 2.2)
    me = o.data
    me.color_attributes.remove(me.color_attributes["bake"])
    ca = me.color_attributes.new("bake", "BYTE_COLOR", "CORNER")
    rgba = np.concatenate([enc, np.ones((len(enc), 1), np.float32)], axis=1)
    # a byte colour reads and writes as sRGB-ish in Blender: write through the raw values
    ca.data.foreach_set("color_srgb", rgba.ravel())
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index

# --- the decals: each corner takes the light of the surface right behind it ---------------
dg = bpy.context.evaluated_depsgraph_get()
for o in decals:
    o.hide_set(True)
dg.update()
for o in decals:
    me = o.data
    mw = o.matrix_world
    nm = (mw.to_3x3().inverted().transposed())
    cols = []
    for poly in me.polygons:
        n = (nm @ poly.normal).normalized()
        for li in poly.loop_indices:
            p = mw @ me.vertices[me.loops[li].vertex_index].co
            hit, loc, _n, fi, ob, _m = scene.ray_cast(dg, p + n * 0.02, -n, distance=0.2)
            c = (0.0, 0.0, 0.0)
            if hit and ob.name in vals_by_name:
                pv = ob.data.polygons[fi]
                px = vals_by_name[ob.name]
                c = tuple(float(v) for v in px[list(pv.loop_indices)].mean(axis=0))
            cols.append(c)
    enc = np.clip(np.array(cols, np.float32) / scale, 0, 1) ** (1 / 2.2)
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new("bake", "BYTE_COLOR", "CORNER")
    ca.data.foreach_set("color_srgb", np.concatenate([enc, np.ones((len(enc), 1), np.float32)], axis=1).ravel())
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
for o in decals:  # only now: a decal in front of another must see the wall, not the other decal
    o.hide_set(False)
    o.hide_render = False
print("DECALS lit", len(decals))
meshes += decals

# --- the model, with the colours and the scale ----------------------------------------------
for ob in [o for o in scene.objects if o.name.endswith("_bake")]:
    bpy.data.objects.remove(ob)
# texture coordinates only where a picture is laid on by them (the leaves); everything
# else is textured by position
for o in meshes:
    if not any(ms.material and ms.material.name.startswith(("m_leaf", "m_decal")) for ms in o.material_slots):
        for uvl in list(o.data.uv_layers):
            o.data.uv_layers.remove(uvl)
holder = bpy.data.objects.new("lightmaps", None)
holder["scale"] = scale
scene.collection.objects.link(holder)
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_cameras=True, export_extras=True, export_apply=True, export_yup=True,
    export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_texcoords=True,  # only the leaves keep theirs
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
    export_draco_position_quantization=14, export_draco_normal_quantization=8, export_draco_texcoord_quantization=10,
    export_draco_color_quantization=12,
)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes")
