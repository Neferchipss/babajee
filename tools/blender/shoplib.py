"""Modelling helpers for build_shop.py: a mesh builder with bevelled boxes,
lathe-turned shapes, tubes, arch prisms and extruded text, plus the materials.

Everything lands in plain meshes with role-named materials and UVs where the
primitive has them (prisms and text carry none: unwrap them before texturing).
"""

import math
import os

import bmesh
import bpy
from mathutils import Euler, Vector, noise

scene = bpy.context.scene
COLLECTIONS = {}


def collection(name):
    if name not in COLLECTIONS:
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
        COLLECTIONS[name] = c
    return COLLECTIONS[name]


# --- materials ------------------------------------------------------------------

def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_):
    return tuple(_lin(int(hex_[i : i + 2], 16) / 255) for i in (1, 3, 5))


MATS = {}


def mat(name, hex_, rough=0.8, metal=0.0, alpha=1.0, emit=0.0, cull=False):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new("m_" + name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    c = rgb(hex_)
    p.inputs["Base Color"].default_value = (*c, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*c, 1)
    m.roughness = rough
    m.metallic = metal
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            m.blend_method = "BLEND"
    if emit:
        p.inputs["Emission Color"].default_value = (*c, 1)
        p.inputs["Emission Strength"].default_value = emit
    if cull:
        m.use_backface_culling = True  # seen from inside only: invisible from the street
    MATS[name] = m
    return m


# --- fonts ----------------------------------------------------------------------

def font(*names):
    for n in names:
        path = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", n)
        if os.path.exists(path):
            return bpy.data.fonts.load(path)
    return None


# --- the builder ----------------------------------------------------------------

def arc(cx, cz, r, a0, a1, n):
    """Points on a circle in the XZ plane, angles in radians from +x."""
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


class B:
    """One mesh object made of many primitives, each with its own material."""

    def __init__(self, name, coll="Fixtures"):
        self.name = name
        self.coll = collection(coll)
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _put(self, verts, m, center=(0, 0, 0), rot=None):
        if rot:
            bmesh.ops.rotate(self.bm, cent=(0, 0, 0), matrix=Euler(rot).to_matrix(), verts=verts)
        bmesh.ops.translate(self.bm, vec=center, verts=verts)
        i = self.mi(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i

    # -- primitives
    def box(self, x0, x1, y0, y1, z0, z1, m, bev=0.0, rot=None, cuts=0):
        dims = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
        if cuts:
            # cut up in a scratch mesh (so only this box is touched), then copied in
            t = bmesh.new()
            tuv = t.loops.layers.uv.new("UVMap")
            r0 = bmesh.ops.create_cube(t, size=1.0, calc_uvs=True)
            bmesh.ops.scale(t, vec=dims, verts=r0["verts"])
            bmesh.ops.subdivide_edges(t, edges=list(t.edges), cuts=cuts, use_grid_fill=True)
            rm = Euler(rot).to_matrix() if rot else None
            c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
            mp = {}
            for v in t.verts:
                p = v.co.copy()
                if rm:
                    p = rm @ p
                mp[v] = self.bm.verts.new(p + c)
            mi = self.mi(m)
            for f in t.faces:
                nf = self.bm.faces.new([mp[v] for v in f.verts])
                nf.material_index = mi
                for ln, lo in zip(nf.loops, f.loops):
                    ln[self.uv].uv = lo[tuv].uv
            t.free()
            return
        r = bmesh.ops.create_cube(self.bm, size=1.0, calc_uvs=True)
        verts = r["verts"]
        bmesh.ops.scale(self.bm, vec=dims, verts=verts)
        if bev > 0:
            f0 = {f for v in verts for f in v.link_faces}
            edges = list({e for v in verts for e in v.link_edges})
            w = min(bev, 0.45 * min(dims))
            rb = bmesh.ops.bevel(self.bm, geom=edges, offset=w, segments=2, profile=0.65, affect="EDGES")
            faces = [f for f in f0 if f.is_valid] + list(rb["faces"])
            verts = list({v for f in faces for v in f.verts})
        self._put(verts, m, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), rot)

    def cyl(self, cx, cy, cz, r1, r2, h, m, seg=24, rot=None):
        """cz is the centre; r1 is the bottom radius, r2 the top."""
        r = bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h, calc_uvs=True
        )
        self._put(r["verts"], m, (cx, cy, cz), rot)

    def ball(self, cx, cy, cz, r, m, scale=(1, 1, 1), rot=None, u=16, v=10):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r, calc_uvs=True)
        bmesh.ops.scale(self.bm, vec=scale, verts=res["verts"])
        self._put(res["verts"], m, (cx, cy, cz), rot)

    def lathe(self, profile, at, m, seg=24, rot=None, scale=1.0):
        """Spin a (radius, height) profile, bottom to top, about the vertical axis."""
        R = Euler(rot).to_matrix() if rot else None
        rings = []
        for r, z in profile:
            r, z = r * scale, z * scale
            if r < 1e-6:
                p = Vector((0, 0, z))
                p = (R @ p if R else p) + Vector(at)
                rings.append([self.bm.verts.new(p)] * 1)
                continue
            ring = []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                p = Vector((r * math.cos(a), r * math.sin(a), z))
                p = (R @ p if R else p) + Vector(at)
                ring.append(self.bm.verts.new(p))
            rings.append(ring)
        i_mat = self.mi(m)
        n = len(rings)

        def face(vs, uvs):
            try:
                f = self.bm.faces.new(vs)
            except ValueError:
                return
            f.material_index = i_mat
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv

        for k in range(n - 1):
            a, b = rings[k], rings[k + 1]
            v0, v1 = k / max(1, n - 1), (k + 1) / max(1, n - 1)
            for i in range(seg):
                j = (i + 1) % seg
                u0, u1 = i / seg, (i + 1) / seg
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    face([a[0], b[j], b[i]], [(u0, v0), (u1, v1), (u0, v1)])
                elif len(b) == 1:
                    face([a[i], a[j], b[0]], [(u0, v0), (u1, v0), (u0, v1)])
                else:
                    face([a[i], a[j], b[j], b[i]], [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
        # flat caps where the profile starts or ends away from the axis
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            if len(ring) > 2:
                face(ring[::-1] if flip else ring, [(0.5 + 0.5 * math.cos(2 * math.pi * i / seg), 0.5 + 0.5 * math.sin(2 * math.pi * i / seg)) for i in range(seg)][:: -1 if flip else 1])

    def tube(self, pts, r, m, seg=8, caps=True):
        """A round bar swept along a path of 3D points. Always closed at the
        ends (the site draws one side of every face, so open tubes would vanish)."""
        caps = True
        pts = [Vector(p) for p in pts]
        n = len(pts)
        rs = r if isinstance(r, (list, tuple)) else [r] * n
        tangents = []
        for i in range(n):
            a = pts[max(0, i - 1)]
            b = pts[min(n - 1, i + 1)]
            tangents.append((b - a).normalized())
        ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
        nrm = tangents[0].cross(ref).normalized()
        rings = []
        for i in range(n):
            t = tangents[i]
            nrm = (nrm - t * nrm.dot(t)).normalized()
            bn = t.cross(nrm)
            ring = []
            for k in range(seg):
                a = 2 * math.pi * k / seg
                ring.append(self.bm.verts.new(pts[i] + (nrm * math.cos(a) + bn * math.sin(a)) * rs[i]))
            rings.append(ring)
        i_mat = self.mi(m)
        for i in range(n - 1):
            for k in range(seg):
                j = (k + 1) % seg
                try:
                    f = self.bm.faces.new([rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]])
                    f.material_index = i_mat
                except ValueError:
                    pass
        if caps:
            for ring, flip in ((rings[0], True), (rings[-1], False)):
                try:
                    f = self.bm.faces.new(ring[::-1] if flip else ring)
                    f.material_index = i_mat
                except ValueError:
                    pass

    def loft(self, rings, m, caps=True, closed=True):
        """Skin a form through rings of 3D points (every ring the same length,
        in the same order): a tapering, bulging tower, an onion dome, a bay."""
        vr = [[self.bm.verts.new(p) for p in ring] for ring in rings]
        mi = self.mi(m)
        n = len(rings[0])
        top = n if closed else n - 1
        for i in range(len(vr) - 1):
            for j in range(top):
                k = (j + 1) % n
                try:
                    f = self.bm.faces.new([vr[i][j], vr[i][k], vr[i + 1][k], vr[i + 1][j]])
                    f.material_index = mi
                    for loop, uv in zip(f.loops, [(j / n, i / (len(vr) - 1)), ((j + 1) / n, i / (len(vr) - 1)), ((j + 1) / n, (i + 1) / (len(vr) - 1)), (j / n, (i + 1) / (len(vr) - 1))]):
                        loop[self.uv].uv = uv
                except ValueError:
                    pass
        if caps and closed:
            for ring, flip in ((vr[0], True), (vr[-1], False)):
                try:
                    f = self.bm.faces.new(ring[::-1] if flip else ring)
                    f.material_index = mi
                except ValueError:
                    pass

    def prism_xz(self, pts, y0, y1, m):
        """A flat shape given in (x, z), thickened from y0 to y1."""
        vs = [self.bm.verts.new((x, y0, z)) for x, z in pts]
        f = self.bm.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(self.bm, geom=[f])
        nv = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, vec=(0, y1 - y0, 0), verts=nv)
        i = self.mi(m)
        for fc in {fc for v in nv + vs for fc in v.link_faces}:
            fc.material_index = i

    def face_xz(self, pts, y, m, toward=1):
        """One flat face from (x, z) points at depth y, facing +y (toward=1)
        or -y. Single-sided: put it where only one side is ever seen."""
        vs = [self.bm.verts.new((x, y, z)) for x, z in pts]
        if toward > 0:
            vs.reverse()
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(m)

    def quad(self, p00, p10, p11, p01, m):
        """One quad with UVs 0..1 (p00 -> p10 along u, p00 -> p01 along v). The
        face looks along (p10 - p00) x (p01 - p00)."""
        vs = [self.bm.verts.new(p) for p in (p00, p10, p11, p01)]
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(m)
        for loop, uv in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[self.uv].uv = uv

    def sheet(self, rows, m, flip=False):
        """A grid of quads through rows of 3D points (each row the same
        length); the face normal follows row-direction x column-direction,
        reversed when flip is set."""
        vr = [[self.bm.verts.new(p) for p in row] for row in rows]
        i_mat = self.mi(m)
        for r in range(len(vr) - 1):
            for c in range(len(vr[r]) - 1):
                q = [vr[r][c], vr[r][c + 1], vr[r + 1][c + 1], vr[r + 1][c]]
                try:
                    f = self.bm.faces.new(q[::-1] if flip else q)
                    f.material_index = i_mat
                except ValueError:
                    pass

    def prism_xy(self, pts, z0, z1, m):
        """A flat shape given in (x, y), thickened from z0 to z1."""
        vs = [self.bm.verts.new((x, y, z0)) for x, y in pts]
        f = self.bm.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(self.bm, geom=[f])
        nv = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, vec=(0, 0, z1 - z0), verts=nv)
        i = self.mi(m)
        for fc in {fc for v in nv + vs for fc in v.link_faces}:
            fc.material_index = i

    def text(self, txt, at, size, m, rot=(math.pi / 2, 0, 0), extrude=0.02, fnt=None, align="CENTER", colors=None, bevel=0.003, spacing=1.0):
        """Extruded text. Standing upright facing -y by default. `colors` is a
        list of materials, one per character, to colour letters separately."""
        cu = bpy.data.curves.new("txt", "FONT")
        cu.body = txt
        cu.size = size
        cu.extrude = extrude
        cu.bevel_depth = bevel
        cu.bevel_resolution = 0
        cu.resolution_u = 2
        cu.align_x = align
        cu.align_y = "CENTER"
        cu.space_character = spacing
        if fnt:
            cu.font = fnt
        used = [m]
        if colors:
            used = list(dict.fromkeys(colors))
        for um in used:
            cu.materials.append(um)
        if colors:
            ch = [c for c in txt]
            for i, c in enumerate(ch):
                cu.body_format[i].material_index = used.index(colors[i % len(colors)])
        ob = bpy.data.objects.new("txt", cu)
        scene.collection.objects.link(ob)
        ob.location = at
        ob.rotation_euler = rot
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        eo = ob.evaluated_get(dg)
        me = eo.to_mesh()
        old_v = set(self.bm.verts)
        old_f = set(self.bm.faces)
        self.bm.from_mesh(me)
        # bmesh reuses freed slots, so "the last N" is not "the new ones"
        nv = [v for v in self.bm.verts if v not in old_v]
        nf = [f for f in self.bm.faces if f not in old_f]
        bmesh.ops.transform(self.bm, matrix=ob.matrix_world, verts=nv)
        for f in nf:
            f.material_index = self.mi(used[min(f.material_index, len(used) - 1)])
        eo.to_mesh_clear()
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)

    # -- finishing
    def build(self, loc=(0, 0, 0), rot=None, recalc=True, warp=None):
        bm = self.bm
        if warp:
            for v in bm.verts:
                v.co = warp(v.co.copy())
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # smooth shading, with hard edges wherever the surface turns sharply
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.62:
                e.smooth = False
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        ob.location = loc
        if rot:
            ob.rotation_euler = rot
        self.coll.objects.link(ob)
        return ob


def empty(name, loc, coll="Hotspots", **extras):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = 0.15
    e.location = loc
    for k, v in extras.items():
        e[k] = v
    collection(coll).objects.link(e)
    return e


def wobble(amp=0.08, freq=0.45, seed=0.0, lean=0.0, lean_y=0.0, bend=0.0):
    """A hand-drawn warp for a whole building: smooth noise on every point, the
    whole thing leaning sideways with height (lean) and its front tipping
    forward over the street (lean_y). Give it to B.build(warp=...); points
    that are shared move together, so nothing tears."""
    off = Vector((seed, seed * 1.7, seed * 0.6))

    def f(co):
        n = Vector((noise.noise(co * freq + off), noise.noise(co * freq + off + Vector((9.1, 0, 3.3))), noise.noise(co * freq + off + Vector((4.4, 8.8, 0)))))
        co = co + n * amp
        z = max(0.0, co.z)
        co.x += lean * z + bend * z * z / 30.0
        co.y -= lean_y * z * z / 8.0
        return co

    return f


def panel(b, origin, u, v, nu, nv, m):
    """A flat grid of quads with UVs 0..1: a slot for painted art (a mural, a
    sign, a door). Faces along u x v. Build it in the same frame, and with the
    same warp, as the wall it sits on, so it bends with it."""
    o, u, v = Vector(origin), Vector(u), Vector(v)
    vs = [[b.bm.verts.new(o + u * (i / nu) + v * (j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    mi = b.mi(m)
    for j in range(nv):
        for i in range(nu):
            f = b.bm.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]])
            f.material_index = mi
            for loop, uv in zip(f.loops, [(i / nu, j / nv), ((i + 1) / nu, j / nv), ((i + 1) / nu, (j + 1) / nv), (i / nu, (j + 1) / nv)]):
                loop[b.uv].uv = uv
