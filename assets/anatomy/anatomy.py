#!/usr/bin/env python3
"""Transparent human body with brain, lungs, heart, liver and kidneys (Blender / bpy).

usage:
  python3 anatomy.py build
  python3 anatomy.py render <full|torso|head> <w> <h> <samples> <out.png>
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

D = "/tmp/claude-0/-home-claude/42389a8a-2ea9-5eed-b214-27be92e3bd97/scratchpad"
BLEND = D + "/human_anatomy.blend"


def V(x, y, z):
    return Vector((x, y, z))


# ----------------------------------------------------------------- helpers
def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def smooth(ob):
    try:
        ob.data.shade_smooth()
    except Exception:
        for p in ob.data.polygons:
            p.use_smooth = True


def obj_from_bm(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if mat:
        ob.data.materials.append(mat)
    return ob


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    mats = list(old.materials)
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    me.materials.clear()
    for m in mats:
        me.materials.append(m)


def remesh_smooth(ob, voxel, iters, factor):
    m = ob.modifiers.new("Remesh", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = voxel
    m.adaptivity = 0.0
    m.use_smooth_shade = True
    s = ob.modifiers.new("Smooth", "SMOOTH")
    s.factor = factor
    s.iterations = iters
    apply_mods(ob)
    smooth(ob)


def getco(me):
    a = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3).astype(np.float64)


def setco(me, arr):
    me.vertices.foreach_set("co", arr.astype(np.float32).ravel())
    me.update()


def add_sphere(bm, c, r, rot=None, seg=20, rings=12):
    m = Matrix.Translation(Vector(c))
    if rot is not None:
        m = m @ rot.to_4x4()
    m = m @ Matrix.Diagonal((r[0], r[1], r[2], 1.0))
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=m)


def taper(bm, a, b, ra, rb, yd=1.0, seg=18, rings=10):
    a, b = Vector(a), Vector(b)
    n = max(3, int((b - a).length / (0.42 * min(ra, rb))))
    for i in range(n + 1):
        t = i / n
        r = ra + (rb - ra) * t
        add_sphere(bm, a.lerp(b, t), (r, r * yd, r), seg=seg, rings=rings)


def tube(name, pts, radii, mat, res=14, bres=8):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = res
    cu.bevel_depth = 1.0
    cu.bevel_resolution = bres
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for i, (p, r) in enumerate(zip(pts, radii)):
        sp.points[i].co = (p[0], p[1], p[2], 1.0)
        sp.points[i].radius = r
    sp.order_u = 4
    sp.use_endpoint_u = True
    ob = link(bpy.data.objects.new(name, cu))
    ob.data.materials.append(mat)
    return ob


# --------------------------------------------------------------- materials
def mat_basic(name, base, rough=0.4, sss=0.0, coat=0.0, bump=0.0, bump_scale=80.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (base[0], base[1], base[2], 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Subsurface Weight"].default_value = sss
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.25)
    b.inputs["Subsurface Scale"].default_value = 0.012
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.08
    b.inputs["Specular IOR Level"].default_value = spec
    if bump > 0:
        tc = N.new("ShaderNodeTexCoord")
        nz = N.new("ShaderNodeTexNoise")
        bp = N.new("ShaderNodeBump")
        nz.inputs["Scale"].default_value = bump_scale
        nz.inputs["Detail"].default_value = 8.0
        nz.inputs["Roughness"].default_value = 0.6
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.003
        L.new(tc.outputs["Object"], nz.inputs["Vector"])
        L.new(nz.outputs["Fac"], bp.inputs["Height"])
        L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_ghost():
    m = bpy.data.materials.new("GhostSkin")
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    tr = N.new("ShaderNodeBsdfTransparent")
    lw = N.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.3
    ramp = N.new("ShaderNodeValToRGB")
    e0, e1 = ramp.color_ramp.elements
    e0.position, e0.color = 0.10, (0.035, 0.035, 0.035, 1)
    e1.position, e1.color = 0.92, (0.95, 0.95, 0.95, 1)
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.20, 0.70, 1.0, 1)
    em.inputs["Strength"].default_value = 2.2
    gl = N.new("ShaderNodeBsdfGlossy")
    gl.inputs["Color"].default_value = (0.65, 0.88, 1.0, 1)
    gl.inputs["Roughness"].default_value = 0.10
    add = N.new("ShaderNodeAddShader")
    mix = N.new("ShaderNodeMixShader")
    L.new(lw.outputs["Fresnel"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], mix.inputs["Fac"])
    L.new(em.outputs["Emission"], add.inputs[0])
    L.new(gl.outputs["BSDF"], add.inputs[1])
    L.new(tr.outputs["BSDF"], mix.inputs[1])
    L.new(add.outputs["Shader"], mix.inputs[2])
    L.new(mix.outputs["Shader"], out.inputs["Surface"])
    return m


# --------------------------------------------------------------------- body
def arm(bm, s):
    def M(v):
        return Vector((v[0] * s, v[1], v[2]))

    S = V(0.205, 0, 1.43)
    du = V(math.sin(math.radians(22)), 0, -math.cos(math.radians(22)))
    E = S + du * 0.29
    df = V(0.31, -0.12, -0.943).normalized()
    W = E + df * 0.26
    dh = V(0.22, -0.10, -0.97).normalized()
    add_sphere(bm, M(S + V(0.005, 0, -0.012)), (0.064, 0.062, 0.068))
    taper(bm, M(S), M(E), 0.052, 0.040)
    add_sphere(bm, M(E), (0.042, 0.042, 0.042))
    taper(bm, M(E), M(W), 0.041, 0.027)
    # hand
    z = M(dh).normalized()
    xt = Vector((s, 0, 0))
    xt = (xt - z * xt.dot(z)).normalized()
    y = z.cross(xt)
    front = V(0, -1, 0)
    if y.dot(front) < 0:
        y = -y
    rot = Matrix((xt, y, z)).transposed()
    if rot.determinant() < 0:
        rot = Matrix((xt, -y, z)).transposed()
        y = -y
    P = M(W) + z * 0.055
    add_sphere(bm, P, (0.014, 0.040, 0.052), rot=rot)
    curl = -xt
    for o, Ln in zip([0.028, 0.0095, -0.0095, -0.028], [0.074, 0.082, 0.077, 0.062]):
        p0 = P + z * 0.045 + y * o
        r0 = 0.0098
        for k, (fr, ang) in enumerate(zip([0.45, 0.30, 0.25], [8, 28, 48])):
            a = math.radians(ang)
            d = (z * math.cos(a) + curl * math.sin(a)).normalized()
            p1 = p0 + d * Ln * fr
            taper(bm, p0, p1, r0, r0 * 0.88, seg=12, rings=8)
            p0, r0 = p1, r0 * 0.88
    p0 = P + z * (-0.012) + y * (0.032)
    r0 = 0.0125
    for Ln, ang in [(0.040, 15), (0.034, 40)]:
        a = math.radians(ang)
        d = (y * 0.55 + z * 0.75 * math.cos(a) + curl * 0.35 * math.sin(a) + curl * 0.15).normalized()
        p1 = p0 + d * Ln
        taper(bm, p0, p1, r0, r0 * 0.82, seg=12, rings=8)
        p0, r0 = p1, r0 * 0.82


def leg(bm, s):
    def M(x, y, z):
        return V(x * s, y, z)

    add_sphere(bm, M(0.093, 0.0, 0.915), (0.098, 0.095, 0.095))
    taper(bm, M(0.095, 0.0, 0.93), M(0.100, -0.008, 0.505), 0.093, 0.058, yd=1.04)
    add_sphere(bm, M(0.100, -0.030, 0.50), (0.040, 0.034, 0.040))  # knee cap
    taper(bm, M(0.100, -0.008, 0.505), M(0.100, 0.016, 0.092), 0.056, 0.034)
    add_sphere(bm, M(0.100, 0.040, 0.345), (0.056, 0.062, 0.088))  # calf
    # foot
    add_sphere(bm, M(0.103, -0.060, 0.042), (0.040, 0.100, 0.037))
    add_sphere(bm, M(0.100, 0.028, 0.055), (0.038, 0.040, 0.045))
    add_sphere(bm, M(0.106, -0.150, 0.024), (0.040, 0.040, 0.021))
    add_sphere(bm, M(0.100, 0.012, 0.075), (0.040, 0.040, 0.040))  # ankle


def build_body(mat):
    bm = bmesh.new()
    prof = [(0.88, 0.150, 0.100), (0.92, 0.162, 0.106), (0.96, 0.166, 0.108), (1.00, 0.152, 0.101),
            (1.05, 0.139, 0.095), (1.10, 0.143, 0.100), (1.15, 0.153, 0.108), (1.20, 0.164, 0.114),
            (1.25, 0.173, 0.118), (1.30, 0.179, 0.121), (1.35, 0.183, 0.121), (1.40, 0.181, 0.113),
            (1.44, 0.168, 0.100), (1.475, 0.115, 0.080), (1.50, 0.070, 0.060)]
    zs = [p[0] for p in prof]
    xs = [p[1] for p in prof]
    ys = [p[2] for p in prof]
    for z in np.arange(0.88, 1.50, 0.01):
        add_sphere(bm, V(0, 0.002, z), (np.interp(z, zs, xs), np.interp(z, zs, ys), 0.04), seg=28, rings=10)
    for s in (-1, 1):
        add_sphere(bm, V(0.085 * s, 0.040, 0.945), (0.085, 0.085, 0.085))      # glutes
        add_sphere(bm, V(0.095 * s, 0.018, 1.468), (0.070, 0.050, 0.034))      # trapezius
        add_sphere(bm, V(0.080 * s, -0.060, 1.350), (0.075, 0.060, 0.065))     # chest
        arm(bm, s)
        leg(bm, s)
    # neck + head
    taper(bm, V(0, 0.004, 1.47), V(0, -0.004, 1.605), 0.050, 0.046)
    add_sphere(bm, V(0, 0.0, 1.705), (0.080, 0.098, 0.112), seg=40, rings=24)
    add_sphere(bm, V(0, -0.045, 1.618), (0.052, 0.055, 0.042))               # jaw/chin
    add_sphere(bm, V(0, -0.098, 1.678), (0.012, 0.022, 0.026))               # nose
    for s in (-1, 1):
        add_sphere(bm, V(0.046 * s, -0.060, 1.660), (0.032, 0.030, 0.032))  # cheeks
        add_sphere(bm, V(0.082 * s, 0.004, 1.690), (0.010, 0.022, 0.032))   # ears
    ob = obj_from_bm("Body", bm, mat)
    remesh_smooth(ob, 0.005, 8, 0.5)
    ob.visible_shadow = False
    return ob


# ------------------------------------------------------------------- organs
def make_brain(mat):
    out = []
    for s in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=7, radius=1.0)
        c = Vector((s * 0.0352, 0.004, 1.738))
        R = (0.0352, 0.088, 0.066)
        for vt in bm.verts:
            p = vt.co.copy()
            sx = 1 - 0.16 * max(0.0, -p.y)
            sz = 1.0 if p.z >= 0 else 0.72
            pos = Vector((c.x + R[0] * p.x * sx, c.y + R[1] * p.y, c.z + R[2] * p.z * sz))
            t = noise.turbulence(pos * 58.0, 3, True, noise_basis="PERLIN_ORIGINAL",
                                 amplitude_scale=0.55, frequency_scale=2.1)
            g = min(max(t, 0.0), 0.75) ** 0.55
            d = 1.0 + 0.115 * (g - 0.5)
            vt.co = Vector((c.x + R[0] * p.x * sx * d, c.y + R[1] * p.y * d, c.z + R[2] * p.z * sz * d))
        out.append(obj_from_bm("Brain_%s" % ("L" if s > 0 else "R"), bm, mat))
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=7, radius=1.0)
    c = Vector((0, 0.062, 1.690))
    R = (0.046, 0.030, 0.022)
    for vt in bm.verts:
        p = vt.co.copy()
        z = c.z + R[2] * p.z
        d = 1.0 + 0.045 * math.sin(z * 2 * math.pi / 0.0042 + 2.0 * noise.noise(Vector((p.x * 3, p.y * 3, 0.0))))
        vt.co = Vector((c.x + R[0] * p.x * d, c.y + R[1] * p.y * d, c.z + R[2] * p.z * d))
    out.append(obj_from_bm("Cerebellum", bm, mat))
    for ob in out:
        smooth(ob)
    out.append(tube("BrainStem", [V(0, 0.034, 1.700), V(0, 0.032, 1.670), V(0, 0.034, 1.620), V(0, 0.036, 1.575)],
                    [0.013, 0.012, 0.011, 0.010], mat))
    return out


def make_lung(side, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=128, v_segments=96, radius=1.0)
    me = bpy.data.meshes.new("Lung")
    bm.to_mesh(me)
    bm.free()
    P = getco(me)
    u, v, w = P[:, 0], P[:, 1], P[:, 2]
    right = side < 0
    rx, ry, rz = (0.062, 0.074, 0.126) if right else (0.058, 0.070, 0.120)
    t = np.clip((w + 0.15) / 1.15, 0, 1)
    tp = 1 - 0.40 * t ** 1.5
    x, y, z = u * rx * tp, v * ry * tp, w * rz
    med = (u * side < 0)
    x = np.where(med, x * 0.75, x)
    rr2 = np.clip(u * u + v * v, 0, 1)
    z = z + np.where(w < 0, 0.024 * w * w * (1 - rr2), 0.0)

    def groove(dist, depth, width):
        return depth * np.exp(-(dist / width) ** 2)

    g = groove((w - 0.9 * v - 0.05) / 1.345, 0.13, 0.045)
    if right:
        g = g + groove((w - 0.28), 0.11, 0.04) * (v < 0.1)
    sc = 1 - g
    x, y, z = x * sc, y * sc, z * sc
    if not right:
        notch = np.exp(-((w + 0.28) / 0.32) ** 2) * np.clip(-v, 0, 1) ** 0.8 * med
        x = x + side * 0.030 * notch
        y = y + 0.012 * notch
    setco(me, np.stack([x, y, z], axis=1))
    ob = link(bpy.data.objects.new("Lung_%s" % ("R" if right else "L"), me))
    ob.location = V(side * 0.093, 0.012, 1.31)
    ob.data.materials.append(mat)
    smooth(ob)
    return ob


def make_heart(mat):
    bm = bmesh.new()
    parts = [((0.012, 0.004, -0.012), (0.034, 0.030, 0.050)),   # left ventricle
             ((-0.018, -0.014, 0.000), (0.030, 0.026, 0.040)),  # right ventricle
             ((-0.034, 0.002, 0.020), (0.020, 0.020, 0.028)),   # right atrium
             ((0.020, 0.025, 0.028), (0.025, 0.020, 0.020)),    # left atrium
             ((0.034, -0.012, 0.036), (0.012, 0.010, 0.016)),   # auricle
             ((0.016, -0.002, -0.052), (0.014, 0.014, 0.020))]  # apex
    for c, r in parts:
        add_sphere(bm, c, r, seg=28, rings=16)
    ob = obj_from_bm("Heart", bm, mat)
    remesh_smooth(ob, 0.0022, 8, 0.6)
    ob.location = V(0.028, -0.040, 1.285)
    ob.rotation_euler = Euler((math.radians(-15), math.radians(-38), 0), "XYZ")
    bpy.context.view_layer.update()
    return ob


def make_liver(mat):
    bm = bmesh.new()
    add_sphere(bm, V(-0.075, -0.010, 1.140), (0.078, 0.070, 0.055), seg=32, rings=20)
    add_sphere(bm, V(-0.060, 0.020, 1.135), (0.060, 0.045, 0.045), seg=32, rings=20)
    add_sphere(bm, V(0.000, -0.045, 1.155), (0.062, 0.038, 0.026), seg=32, rings=20)
    add_sphere(bm, V(-0.035, -0.030, 1.145), (0.050, 0.045, 0.042), seg=32, rings=20)
    ob = obj_from_bm("Liver", bm, mat)
    remesh_smooth(ob, 0.003, 10, 0.6)
    c = V(-0.050, -0.005, 1.140)
    ob.data.transform(Matrix.Translation(c + V(0.014, 0.004, 0.0)) @ Matrix.Diagonal((0.80, 0.80, 0.90, 1.0)) @ Matrix.Translation(-c))
    return ob


def make_kidney(side, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=64, radius=1.0)
    me = bpy.data.meshes.new("Kidney")
    bm.to_mesh(me)
    bm.free()
    P = getco(me)
    u, v, w = P[:, 0], P[:, 1], P[:, 2]
    rx, ry, rz = 0.029, 0.021, 0.055
    med = -side
    m = np.clip(u * med, 0, 1)
    x = u * rx - med * 0.017 * np.exp(-(w / 0.30) ** 2) * m ** 0.7
    y = v * ry
    z = w * rz
    setco(me, np.stack([x, y, z], axis=1))
    ob = link(bpy.data.objects.new("Kidney_%s" % ("L" if side > 0 else "R"), me))
    zc = 1.088 if side > 0 else 1.066
    ob.location = V(side * 0.056, 0.044, zc)
    ob.rotation_euler = Euler((0, math.radians(-12 * side), math.radians(30 * side)), "XYZ")
    ob.data.materials.append(mat)
    smooth(ob)
    bpy.context.view_layer.update()
    return ob


def build_organs():
    M = {
        "brain": mat_basic("Brain", (0.62, 0.30, 0.30), rough=0.38, sss=0.05, coat=0.45),
        "stem": mat_basic("BrainStem", (0.65, 0.40, 0.36), rough=0.4, sss=0.05, coat=0.3),
        "lung": mat_basic("Lung", (0.70, 0.20, 0.22), rough=0.5, sss=0.05, coat=0.25, bump=0.12, bump_scale=60),
        "heart": mat_basic("Heart", (0.30, 0.012, 0.016), rough=0.28, sss=0.03, coat=0.7, bump=0.10, bump_scale=110),
        "liver": mat_basic("Liver", (0.20, 0.032, 0.018), rough=0.25, sss=0.03, coat=0.8, bump=0.05, bump_scale=40),
        "kidney": mat_basic("Kidney", (0.26, 0.04, 0.032), rough=0.25, sss=0.03, coat=0.8, bump=0.04, bump_scale=40),
        "artery": mat_basic("Artery", (0.55, 0.02, 0.02), rough=0.3, coat=0.6),
        "vein": mat_basic("Vein", (0.04, 0.07, 0.40), rough=0.3, coat=0.6),
        "airway": mat_basic("Airway", (0.86, 0.88, 0.92), rough=0.3, coat=0.5, bump=0.6, bump_scale=25),
    }
    organs = {}
    for ob in make_brain(M["brain"]):
        organs[ob.name] = ob
        if ob.type == "MESH":
            c = Vector((0, 0.004, 1.735))
            T = Matrix.Translation(c + V(0, 0, -0.010)) @ Matrix.Scale(0.80, 4) @ Matrix.Translation(-c)
            ob.data.transform(T)
    organs["Lung_R"] = make_lung(-1, M["lung"])
    organs["Lung_L"] = make_lung(1, M["lung"])
    heart = make_heart(M["heart"])
    organs["Heart"] = heart
    organs["Liver"] = make_liver(M["liver"])
    kr = make_kidney(-1, M["kidney"])
    kl = make_kidney(1, M["kidney"])
    organs["Kidney_R"], organs["Kidney_L"] = kr, kl

    hm = heart.matrix_world
    A0 = hm @ V(0.0, -0.002, 0.042)
    PT0 = hm @ V(0.004, -0.026, 0.040)
    # airway
    tube("Trachea", [V(0, 0.030, 1.505), V(0, 0.030, 1.45), V(0, 0.030, 1.385)], [0.0105] * 3, M["airway"])
    tube("Bronchus_R", [V(0, 0.030, 1.388), V(-0.028, 0.030, 1.365), V(-0.058, 0.026, 1.335)], [0.0078, 0.0070, 0.0060], M["airway"])
    tube("Bronchus_L", [V(0, 0.030, 1.388), V(0.028, 0.030, 1.365), V(0.058, 0.026, 1.335)], [0.0078, 0.0070, 0.0060], M["airway"])
    # aorta + branches
    tube("Aorta", [A0, V(0.000, -0.024, 1.352), V(-0.002, -0.012, 1.398), V(0.020, 0.014, 1.426), V(0.038, 0.052, 1.402),
                   V(0.042, 0.066, 1.350), V(0.034, 0.070, 1.220), V(0.026, 0.068, 1.080), V(0.022, 0.066, 0.970)],
         [0.0125, 0.0125, 0.0120, 0.0115, 0.0110, 0.0105, 0.0095, 0.0085, 0.0080], M["artery"])
    tube("Carotid_L", [V(0.002, -0.010, 1.400), V(0.018, 0.000, 1.440), V(0.025, 0.008, 1.520), V(0.030, 0.012, 1.600),
                       V(0.028, 0.012, 1.660), V(0.024, 0.012, 1.690)], [0.0050] * 6, M["artery"])
    tube("Carotid_R", [V(-0.010, -0.012, 1.395), V(-0.020, 0.002, 1.450), V(-0.026, 0.008, 1.520), V(-0.030, 0.012, 1.600),
                       V(-0.028, 0.012, 1.660), V(-0.024, 0.012, 1.690)], [0.0050] * 6, M["artery"])
    # veins
    tube("VenaCava_Inf", [V(-0.018, -0.004, 1.262), V(-0.026, 0.020, 1.215), V(-0.036, 0.050, 1.150), V(-0.026, 0.064, 1.080),
                          V(-0.012, 0.066, 1.000), V(-0.004, 0.064, 0.950)],
         [0.0125, 0.0125, 0.0120, 0.0115, 0.0105, 0.0100], M["vein"])
    tube("VenaCava_Sup", [V(-0.022, -0.012, 1.335), V(-0.024, -0.010, 1.400), V(-0.026, -0.006, 1.445)], [0.0090] * 3, M["vein"])
    tube("PulmonaryTrunk", [PT0, V(0.012, -0.035, 1.345), V(0.022, -0.024, 1.368)], [0.0115, 0.0112, 0.0105], M["vein"])
    tube("PulmonaryArtery_L", [V(0.022, -0.024, 1.368), V(0.050, -0.008, 1.350), V(0.076, 0.004, 1.320)], [0.0095, 0.0085, 0.0075], M["vein"])
    tube("PulmonaryArtery_R", [V(0.022, -0.024, 1.368), V(-0.010, -0.014, 1.372), V(-0.038, -0.006, 1.350), V(-0.064, 0.002, 1.322)],
         [0.0095, 0.0090, 0.0080, 0.0075], M["vein"])
    # renal vessels
    hl = kl.matrix_world @ V(-0.011, 0, 0.0)
    hr = kr.matrix_world @ V(0.011, 0, 0.0)
    tube("RenalArtery_L", [V(0.026, 0.068, 1.080), hl.lerp(V(0.026, 0.068, 1.080), 0.5), hl + V(0, 0, -0.003)],
         [0.0042] * 3, M["artery"])
    tube("RenalArtery_R", [V(0.022, 0.070, 1.072), V(-0.020, 0.070, 1.064), hr + V(0, 0, -0.003)], [0.0042] * 3, M["artery"])
    tube("RenalVein_L", [hl + V(0, 0, 0.007), V(0.030, 0.056, 1.100), V(0.000, 0.056, 1.098), V(-0.022, 0.056, 1.094)],
         [0.0052] * 4, M["vein"])
    tube("RenalVein_R", [hr + V(0, 0, 0.007), V(-0.036, 0.056, 1.082), V(-0.030, 0.056, 1.078)], [0.0052] * 3, M["vein"])
    return organs


# -------------------------------------------------------------------- scene
def area(name, loc, target, size, energy, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.color = color
    ld.shape = "SQUARE"
    ld.size = size
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = Vector(loc)
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def build_scene():
    sc = bpy.context.scene
    w = bpy.data.worlds.new("World")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.006, 0.010, 0.020, 1)
    bg.inputs[1].default_value = 1.0
    sc.world = w
    # platform
    fm = bpy.data.materials.new("Floor")
    fm.use_nodes = True
    fb = fm.node_tree.nodes["Principled BSDF"]
    fb.inputs["Base Color"].default_value = (0.012, 0.016, 0.024, 1)
    fb.inputs["Roughness"].default_value = 0.18
    fb.inputs["Metallic"].default_value = 0.6
    bpy.ops.mesh.primitive_cylinder_add(radius=1.1, depth=0.04, location=(0, 0, -0.02), vertices=96)
    fl = bpy.context.active_object
    fl.name = "Platform"
    fl.data.materials.append(fm)
    smooth(fl)
    rm = bpy.data.materials.new("Ring")
    rm.use_nodes = True
    N = rm.node_tree.nodes
    N.clear()
    o = N.new("ShaderNodeOutputMaterial")
    e = N.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0.15, 0.65, 1.0, 1)
    e.inputs["Strength"].default_value = 6.0
    rm.node_tree.links.new(e.outputs[0], o.inputs[0])
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.006, major_segments=128, minor_segments=12,
                                     location=(0, 0, 0.003))
    rg = bpy.context.active_object
    rg.name = "Ring"
    rg.data.materials.append(rm)
    rg.visible_shadow = False
    # lights
    area("Key", (-2.4, -3.2, 2.6), (0, 0, 1.2), 2.6, 230, (1.0, 0.95, 0.9))
    area("Fill", (2.8, -3.0, 1.2), (0, 0, 1.2), 3.0, 90, (0.75, 0.85, 1.0))
    area("RimC", (2.6, 2.4, 1.8), (0, 0, 1.2), 2.0, 300, (0.25, 0.7, 1.0))
    area("RimM", (-2.6, 2.4, 1.4), (0, 0, 1.2), 2.0, 220, (0.9, 0.3, 0.7))
    area("Top", (0, -0.5, 3.6), (0, 0, 1.2), 2.0, 60, (1, 1, 1))
    cam = bpy.data.cameras.new("Cam")
    cam.lens = 85
    co = link(bpy.data.objects.new("Camera", cam))
    sc.camera = co
    return sc


def setup_camera(mode):
    co = bpy.context.scene.camera
    if mode == "full":
        co.location = V(0.0, -5.4, 0.92)
        tgt = V(0, 0, 0.92)
    elif mode == "torso":
        co.location = V(0.0, -2.7, 1.40)
        tgt = V(0, 0, 1.40)
    elif mode == "head":
        co.location = V(0.0, -1.5, 1.70)
        tgt = V(0, 0, 1.70)
    else:  # 3/4 view full
        co.location = V(2.4, -4.6, 1.0)
        tgt = V(0, 0, 0.92)
    co.rotation_euler = (tgt - co.location).to_track_quat("-Z", "Y").to_euler()


def setup_render(w, h, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.max_bounces = 6
    cy.transparent_max_bounces = 14
    cy.glossy_bounces = 3
    cy.diffuse_bounces = 3
    cy.sample_clamp_indirect = 8.0
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass


def inside_check(body, organs):
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for name, ob in organs.items():
        if ob.type != "MESH":
            continue
        step = max(1, len(ob.data.vertices) // 600)
        pts = [ob.matrix_world @ ob.data.vertices[i].co for i in range(0, len(ob.data.vertices), step)]
        bad = 0
        d = Vector((0.31, 0.77, 0.55)).normalized()
        for p in pts:
            hits, o = 0, p.copy()
            while True:
                h = bvh.ray_cast(o, d)
                if h[0] is None:
                    break
                hits += 1
                o = h[0] + d * 1e-4
            if hits % 2 == 0:
                bad += 1
        print("  %-12s outside body: %d / %d" % (name, bad, len(pts)))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = build_body(mat_ghost())
    print("body verts", len(body.data.vertices), "dims", tuple(round(x, 3) for x in body.dimensions))
    organs = build_organs()
    build_scene()
    inside_check(body, organs)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print("saved", BLEND)


def render(mode, w, h, samples, out):
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    setup_camera(mode)
    setup_render(w, h, samples)
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("rendered", out)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "build":
        build()
    else:
        render(a[1], int(a[2]), int(a[3]), int(a[4]), a[5])
