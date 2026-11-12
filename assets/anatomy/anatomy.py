#!/usr/bin/env python3
"""Transparent human body with real anatomical meshes (Blender / bpy).

v3 of the anatomy script. v1 built the body from primitives and v2 built a
procedural brain; this one uses the real thing throughout: the skin, the
cerebral cortex, the deep brain, the brainstem, the lungs, the heart and the
great vessels come from BodyParts3D, the Database Center for Life Science
anatomy database.

  BodyParts3D / Anatomography
  (c) The Database Center for Life Science, licensed CC BY-SA 2.1 Japan.
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

The meshes are 216 MB and are not committed. Fetch them first:

    scripts/anatomy/fetch-meshes.sh

Then:

    blender -b --python assets/anatomy/anatomy.py -- build
    blender -b --python assets/anatomy/anatomy.py -- render full 1400 2400 128 out.png

The skin is a glass shell — transparent in the middle, glowing at the
silhouette — so the organs read through it, the way the reference renders do.
Object names are the contract the web export reads, so the brain parts are
grouped into Brain_L / Brain_R / Cerebellum / BrainStem, the lungs into
Lung_L / Lung_R, and the vessels keep their anatomical names.
"""
import bpy
import bmesh
import math
import os
import sys

import numpy as np
from mathutils import Vector, Matrix, Euler

# ------------------------------------------------------------------ paths
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ANATOMY_DIR = os.path.join(REPO, "assets", "anatomy")
BLEND = os.path.join(ANATOMY_DIR, "human_anatomy.blend")
MESH_DIR = os.path.join(REPO, ".asset-cache", "bodyparts3d", "stl")
OBJ_DIR = os.path.join(REPO, ".asset-cache", "bodyparts3d", "obj")

# The meshes are authored in millimetres, Z-up, with the body's front at -Y
# and the model's left at +X. That is already Blender's convention, so the
# only change is scale: millimetres to metres, and a shift that puts the feet
# near z = 0 and centres the body on the origin.
SHIFT = Vector((0.0, 0.1195, 0.0))
SCALE = 0.001


def V(x, y, z):
    return Vector((x, y, z))


# ----------------------------------------------------------------- helpers
def link(ob):
    if ob.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(ob)
    for c in list(ob.users_collection):
        if c != bpy.context.scene.collection:
            c.objects.unlink(ob)
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
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
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


def getco(me):
    a = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3).astype(np.float64)


def setco(me, arr):
    me.vertices.foreach_set("co", arr.astype(np.float32).ravel())
    me.update()


def weld(me, dist=1e-6):
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(me)
    bm.free()
    me.update()


def decimate(ob, target):
    """Collapses an object down to a triangle budget.

    The source meshes are far denser than the model needs. Decimating here,
    once, keeps the committed .blend a reasonable size, and it keeps the
    renders and the web working from the same geometry.
    """
    current = len(ob.data.polygons)
    if current <= target:
        return current, current
    mod = ob.modifiers.new("Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / current
    mod.use_collapse_triangulate = True
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
    smooth(ob)
    return current, len(ob.data.polygons)


# ------------------------------------------------------------------ import
def load_stl(fma, name, mat, decimate=None, smooth_iter=0, merge=True):
    """Imports one anatomical mesh, scaled to metres and reoriented.

    The meshes are watertight-ish but with duplicate vertices at every shared
    edge, so they are welded first: the duplicate vertices are what makes a
    decimated organ look like shattered glass.
    """
    f = os.path.join(MESH_DIR, fma + ".stl")
    if not os.path.exists(f):
        print("  missing", fma, name)
        return None
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=f)
    imported = [o for o in bpy.data.objects if o not in before]
    if not imported:
        print("  empty", fma, name)
        return None
    ob = imported[0]
    return _finish_part(ob, name, mat, decimate, smooth_iter, merge)


def load_obj(fma, name, mat, decimate=None, smooth_iter=0, merge=True):
    """Imports one anatomical mesh from the 4.0 release.

    A few parts — the heart chambers, the great cardiac vein — are only in the
    4.0 release, which ships OBJ rather than STL. Both releases share one
    coordinate frame, so the two sets sit together in the same body.
    """
    f = os.path.join(OBJ_DIR, fma + ".obj")
    if not os.path.exists(f):
        print("  missing", fma, name)
        return None
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=f)
    imported = [o for o in bpy.data.objects if o not in before]
    if not imported:
        print("  empty", fma, name)
        return None
    ob = imported[0]
    return _finish_part(ob, name, mat, decimate, smooth_iter, merge)


def _finish_part(ob, name, mat, decimate, smooth_iter, merge):
    ob.name = name
    me = ob.data
    co = getco(me)
    # Millimetres to metres. The orientation is already Blender's.
    co = co * SCALE + np.array([SHIFT.x, SHIFT.y, SHIFT.z], dtype=np.float64)
    setco(me, co)
    if merge:
        weld(me)
    me.materials.clear()
    me.materials.append(mat)
    mods = []
    if decimate:
        m = ob.modifiers.new("Dec", "DECIMATE")
        m.ratio = decimate
        mods.append(m)
    if smooth_iter:
        m = ob.modifiers.new("Sm", "SMOOTH")
        m.factor = 0.6
        m.iterations = smooth_iter
        mods.append(m)
    if mods:
        apply_mods(ob)
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    smooth(ob)
    link(ob)
    return ob


# --------------------------------------------------------------- materials
def principled(name, base, rough=0.4, sss=0.0, sss_scale=0.01, sss_radius=(1.0, 0.3, 0.2),
               coat=0.0, coat_rough=0.08, bump=0.0, bump_scale=120.0, bump_detail=10.0,
               metallic=0.0, spec=0.5, veins=None, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (base[0], base[1], base[2], 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Subsurface Weight"].default_value = sss
    b.inputs["Subsurface Radius"].default_value = sss_radius
    b.inputs["Subsurface Scale"].default_value = sss_scale
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Metallic"].default_value = metallic
    tc = N.new("ShaderNodeTexCoord")
    if bump > 0:
        nz = N.new("ShaderNodeTexNoise")
        bp = N.new("ShaderNodeBump")
        nz.inputs["Scale"].default_value = bump_scale
        nz.inputs["Detail"].default_value = bump_detail
        nz.inputs["Roughness"].default_value = 0.65
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.002
        L.new(tc.outputs["Object"], nz.inputs["Vector"])
        L.new(nz.outputs["Fac"], bp.inputs["Height"])
        L.new(bp.outputs["Normal"], b.inputs["Normal"])
    if veins:
        # Large-scale colour mottling: the marbled look of a real organ.
        nz2 = N.new("ShaderNodeTexNoise")
        nz2.inputs["Scale"].default_value = veins["scale"]
        nz2.inputs["Detail"].default_value = 6.0
        nz2.inputs["Distortion"].default_value = 0.6
        L.new(tc.outputs["Object"], nz2.inputs["Vector"])
        ramp = N.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = veins.get("lo", 0.35)
        ramp.color_ramp.elements[1].position = veins.get("hi", 0.65)
        ramp.color_ramp.elements[0].color = (*veins["a"], 1)
        ramp.color_ramp.elements[1].color = (*veins["b"], 1)
        L.new(nz2.outputs["Fac"], ramp.inputs["Fac"])
        L.new(ramp.outputs["Color"], b.inputs["Base Color"])
    if alpha < 1.0:
        out = N["Material Output"]
        tr = N.new("ShaderNodeBsdfTransparent")
        mx = N.new("ShaderNodeMixShader")
        mx.inputs["Fac"].default_value = alpha
        L.new(tr.outputs["BSDF"], mx.inputs[1])
        L.new(b.outputs["BSDF"], mx.inputs[2])
        L.new(mx.outputs["Shader"], out.inputs["Surface"])
    return m


def mat_ghost():
    """Glass-like skin: clear in the middle, a thin glowing rim on the edges.

    The back faces are fully transparent, so the shell does not double up the
    Fresnel term and the silhouette stays a single bright edge.
    """
    m = bpy.data.materials.new("GhostSkin")
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    tr = N.new("ShaderNodeBsdfTransparent")
    lw = N.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.25
    ramp = N.new("ShaderNodeValToRGB")
    e0, e1 = ramp.color_ramp.elements
    e0.position, e0.color = 0.30, (0, 0, 0, 1)
    e1.position, e1.color = 0.80, (1, 1, 1, 1)
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.20, 0.68, 1.0, 1)
    em.inputs["Strength"].default_value = 1.4
    gl = N.new("ShaderNodeBsdfGlossy")
    gl.inputs["Color"].default_value = (0.7, 0.9, 1.0, 1)
    gl.inputs["Roughness"].default_value = 0.15
    add = N.new("ShaderNodeAddShader")
    mix = N.new("ShaderNodeMixShader")
    geo = N.new("ShaderNodeNewGeometry")
    mix2 = N.new("ShaderNodeMixShader")
    L.new(lw.outputs["Fresnel"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], mix.inputs["Fac"])
    L.new(em.outputs["Emission"], add.inputs[0])
    L.new(gl.outputs["BSDF"], add.inputs[1])
    L.new(tr.outputs["BSDF"], mix.inputs[1])
    L.new(add.outputs["Shader"], mix.inputs[2])
    L.new(geo.outputs["Backfacing"], mix2.inputs["Fac"])
    L.new(mix.outputs["Shader"], mix2.inputs[1])
    L.new(tr.outputs["BSDF"], mix2.inputs[2])
    L.new(mix2.outputs["Shader"], out.inputs["Surface"])
    return m


def materials():
    M = {}
    M["skin"] = mat_ghost()
    M["brain"] = principled("Brain", (0.66, 0.40, 0.38), rough=0.36, sss=0.10, coat=0.55,
                             coat_rough=0.12, bump=0.35, bump_scale=260.0, bump_detail=12.0,
                             veins=dict(scale=70, a=(0.52, 0.24, 0.24), b=(0.78, 0.55, 0.50)))
    M["cerebellum"] = principled("Cerebellum", (0.60, 0.34, 0.32), rough=0.4, sss=0.08, coat=0.4,
                                 bump=0.5, bump_scale=420.0, bump_detail=4.0)
    M["whitematter"] = principled("WhiteMatter", (0.78, 0.60, 0.55), rough=0.4, sss=0.08, coat=0.3,
                                  bump=0.2, bump_scale=200.0)
    M["stem"] = principled("BrainStem", (0.72, 0.52, 0.48), rough=0.38, sss=0.08, coat=0.4,
                           bump=0.2, bump_scale=160.0)
    M["lung"] = principled("Lung", (0.70, 0.28, 0.30), rough=0.5, sss=0.05, coat=0.12, coat_rough=0.25,
                           bump=0.18, bump_scale=140.0, bump_detail=10.0, alpha=0.38,
                           veins=dict(scale=26, a=(0.50, 0.15, 0.18), b=(0.78, 0.40, 0.40)))
    M["heart"] = principled("Heart", (0.55, 0.04, 0.045), rough=0.32, sss=0.06, coat=0.6, coat_rough=0.12,
                             bump=0.14, bump_scale=160.0,
                             veins=dict(scale=18, a=(0.40, 0.02, 0.025), b=(0.75, 0.10, 0.08)))
    M["liver"] = principled("Liver", (0.26, 0.05, 0.03), rough=0.26, sss=0.05, coat=0.85, coat_rough=0.07,
                             bump=0.06, bump_scale=60.0,
                             veins=dict(scale=12, a=(0.18, 0.03, 0.02), b=(0.34, 0.075, 0.04)))
    M["kidney"] = principled("Kidney", (0.34, 0.06, 0.045), rough=0.24, sss=0.05, coat=0.85, coat_rough=0.07,
                              bump=0.05, bump_scale=60.0)
    M["artery"] = principled("Artery", (0.62, 0.02, 0.02), rough=0.3, coat=0.6)
    M["vein"] = principled("Vein", (0.06, 0.09, 0.42), rough=0.3, coat=0.6)
    M["airway"] = principled("Airway", (0.80, 0.78, 0.76), rough=0.28, coat=0.5, bump=0.5, bump_scale=300.0)
    M["bone"] = principled("Bone", (0.75, 0.70, 0.60), rough=0.4)
    return M


# ------------------------------------------------------------- parts lists
# The cortex is split into 38 gyri meshes; the deep brain into 27. They are
# grouped afterwards by which side of the midline they sit on.
BRAIN_CORTEX = ("BP49 BP50 BP51 FMA72653 FMA72654 FMA72655 FMA72656 FMA72661 FMA72662 FMA72665 FMA72666 "
                 "FMA72667 FMA72668 FMA72669 FMA72670 FMA72685 FMA72686 FMA72687 FMA72688 FMA72689 FMA72690 "
                 "FMA72701 FMA72702 FMA72705 FMA72706 FMA72717 FMA72718 FMA72800 FMA72801 FMA72804 FMA72805 "
                 "FMA72975 FMA72976 FMA72977 FMA72978").split()
BRAIN_DEEP = ("FMA61822 FMA258714 FMA258716 FMA72713 FMA72714 FMA86464 FMA72826 FMA72827 FMA72828 FMA72829 "
              "FMA72830 FMA72831 FMA72832 FMA72833 FMA61844 FMA72924 FMA72925 FMA61970 FMA62394 "
              "FMA73422 FMA73423 FMA73434 FMA73435 FMA72908 FMA72909 FMA274027 FMA274029").split()
BRAIN_STEM = [("FMA67943", "Pons"), ("FMA62004", "Medulla"), ("FMA61993nsn", "Midbrain"),
              ("FMA62008nsn", "Hypothalamus"), ("FMA67944", "Cerebellum")]
LUNGS = [("FMA7333", "Lung_R_Upper"), ("FMA7383", "Lung_R_Middle"), ("FMA7337", "Lung_R_Lower"),
         ("FMA7370", "Lung_L_Upper"), ("FMA7371", "Lung_L_Lower")]
HEART = [("FMA7274", "Heart_Wall", "heart"),
         ("FMA4685", "Coronary_L_stem", "artery"), ("FMA3802", "Coronary_R_trunk", "artery"),
         ("FMA3895", "Coronary_Circumflex", "artery"), ("FMA3840nsn", "Coronary_PostIV", "artery"),
         ("FMA3862nsn", "Coronary_AntIV", "artery"), ("FMA3818", "Coronary_Marginal", "artery"),
         ("FMA4707", "Cardiac_GreatVein", "vein"), ("FMA4713", "Cardiac_MiddleVein", "vein")]
VESSELS = [("FMA3736", "Aorta_Ascending", "artery"), ("FMA3768", "Aorta_Arch", "artery"),
           ("FMA3784", "Aorta_Descending", "artery"),
           ("FMA3932nsn", "Brachiocephalic", "artery"), ("FMA3941", "Carotid_R", "artery"),
           ("FMA4058", "Carotid_L", "artery"), ("FMA3953", "Subclavian_R", "artery"),
           ("FMA4694", "Subclavian_L", "artery"), ("FMA66326", "PulmonaryArtery", "vein"),
           ("FMA66643", "PulmonaryVein", "artery"), ("FMA4720", "VenaCava_Sup", "vein"),
           ("FMA10951", "VenaCava_Inf", "vein"), ("FMA14752", "RenalArtery_R", "artery"),
           ("FMA14753", "RenalArtery_L", "artery"), ("FMA14335", "RenalVein_R", "vein"),
           ("FMA14336", "RenalVein_L", "vein"), ("FMA14765", "CommonIliac_Art_R", "artery"),
           ("FMA14766", "CommonIliac_Art_L", "artery"), ("FMA21387", "CommonIliac_Vein_R", "vein"),
           ("FMA21388", "CommonIliac_Vein_L", "vein"), ("FMA4751", "BrachioVein_R", "vein"),
           ("FMA4761", "BrachioVein_L", "vein"), ("FMA4754", "JugularVein_R", "vein"),
           ("FMA4762", "JugularVein_L", "vein")]

# The heart chambers are only in the 4.0 release, which ships OBJ rather than
# STL. The file ids are the release's own.
HEART_40 = [("FJ2438", "Heart_LeftAtrium", "heart"),
             ("FJ2439", "Heart_RightAtrium", "heart")]

# The triangle budget of the committed .blend. The source meshes are 2.8M
# triangles, which would be a 65 MB file; these keep it under 15 MB while
# leaving the sulci and the vessel branches readable.
#
# The brain's named parts are budgeted per part rather than as a whole, so a
# small gyrus is not flattened to pay for a large one.
BUILD_TARGETS = {
    "Body": 130000,
    "Cerebellum": 12000,
    "BrainStem": 12000,
    "Heart": 30000,
    "Liver": 6000,
    "Lung_L": 12000,
    "Lung_R": 12000,
    "Kidney_L": 3000,
    "Kidney_R": 3000,
    "Trachea": 4000,
    "Bronchus_L": 8000,
    "Bronchus_R": 8000,
}
BUILD_BRAIN_PART_TARGET = 3000
BUILD_VESSEL_TARGET = 2500


def load_parts_list():
    """The FMA id to English name table that ships beside this script.

    It is the authority on which side a mesh is: a gyrus is called "right
    superior frontal gyrus" or "left superior frontal gyrus", and guessing
    from the geometry gets the midline structures wrong.
    """
    path = os.path.join(ANATOMY_DIR, "parts_list_e.txt")
    names = {}
    if not os.path.exists(path):
        return names
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.startswith('"id"'):
                continue
            fields = line.split("\t")
            if len(fields) < 2:
                continue
            names[fields[0]] = fields[1]
    return names


def side_from_name(name):
    """Which side of the midline a part belongs to, from its name.

    Returns 1 for the left, -1 for the right and 0 for a midline structure
    such as the corpus callosum, which is carried by both hemispheres.
    """
    low = name.lower()
    left = "left" in low
    right = "right" in low
    if left and not right:
        return 1
    if right and not left:
        return -1
    return 0


# ------------------------------------------------------------- the anatomy
def build_scene_objects():
    """Builds every organ. Returns the objects keyed by their web contract name."""
    M = materials()
    names = load_parts_list()
    parts = {}

    # The skin is 1.58M triangles. It is a glass shell, so it is decimated
    # hard — but not so hard that the shell breaks into shards: the fresnel
    # rim runs along the triangle edges, so the density of the mesh is what
    # draws the body's fine network of veins.
    skin = load_stl("FMA7163", "Body", M["skin"], decimate=0.14)
    parts["Body"] = skin
    print("skin faces", len(skin.data.polygons))

    for fma in BRAIN_CORTEX:
        parts["Cortex_" + fma] = load_stl(fma, "Cortex_" + fma, M["brain"], smooth_iter=2)
    for fma in BRAIN_DEEP:
        parts["Deep_" + fma] = load_stl(fma, "Deep_" + fma, M["whitematter"], smooth_iter=2)
    for fma, nm in BRAIN_STEM:
        parts[nm] = load_stl(fma, nm, M["cerebellum" if nm == "Cerebellum" else "stem"], smooth_iter=3)
    for fma, nm in LUNGS:
        parts[nm] = load_stl(fma, nm, M["lung"], smooth_iter=8)
    for fma, nm, mk in HEART:
        parts[nm] = load_stl(fma, nm, M[mk], smooth_iter=5)
    for fma, nm, mk in HEART_40:
        parts[nm] = load_obj(fma, nm, M[mk], smooth_iter=5)
    parts["Liver"] = load_stl("FMA7197", "Liver", M["liver"], smooth_iter=8)
    parts["Kidney_R"] = load_stl("FMA7204", "Kidney_R", M["kidney"], smooth_iter=8)
    parts["Kidney_L"] = load_stl("FMA7205", "Kidney_L", M["kidney"], smooth_iter=8)
    parts["Trachea"] = load_stl("FMA7394", "Trachea", M["airway"], smooth_iter=4)
    parts["Bronchi"] = load_stl("FMA7409", "Bronchi", M["airway"], smooth_iter=3)
    for fma, nm, mk in VESSELS:
        parts[nm] = load_stl(fma, nm, M[mk], smooth_iter=4)

    parts = {k: v for k, v in parts.items() if v is not None}
    parts["__names__"] = names
    return parts


def group_brain(parts, names):
    """Renames the brain parts so the web can identify what it hit.

    The cortex arrives as 38 named gyri and the deep brain as 27 named
    nuclei, and that naming is the whole point: a click on the model should
    say which gyrus it landed on, not which side of a blob it hit. The parts
    are kept as separate meshes and their names are rewritten to carry the
    side, so "FMA72653" becomes "Cortex_FMA72653_R".

    A midline structure — the corpus callosum, the septum pellucidum — has
    neither side, and is marked "_M".
    """
    renamed = {}
    for key, ob in list(parts.items()):
        if not (key.startswith("Cortex_") or key.startswith("Deep_")):
            continue
        fma = key.split("_", 1)[1]
        side = side_from_name(names.get(fma, ""))
        suffix = "L" if side > 0 else "R" if side < 0 else "M"
        new_name = "%s_%s_%s" % (key.split("_", 1)[0], fma, suffix)
        ob.name = new_name
        ob.data.name = new_name
        renamed[new_name] = ob
        del parts[key]

    # The brainstem is one structure for the web: pons, medulla, midbrain and
    # hypothalamus all read as the brainstem.
    stem = [k for k in ("Pons", "Medulla", "Midbrain", "Hypothalamus") if k in parts]
    if stem:
        bm = bmesh.new()
        for k in stem:
            bm.from_mesh(parts[k].data)
        me = bpy.data.meshes.new("BrainStem")
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("BrainStem", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(parts[stem[0]].data.materials[0])
        smooth(ob)
        renamed["BrainStem"] = ob
        for k in stem:
            obj = parts[k]
            me = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if me.users == 0:
                bpy.data.meshes.remove(me)
    return renamed


def group_lungs(parts):
    """Joins the lung lobes into one mesh per side."""
    joined = {}
    for side, keys in (("Lung_R", ["Lung_R_Upper", "Lung_R_Middle", "Lung_R_Lower"]),
                       ("Lung_L", ["Lung_L_Upper", "Lung_L_Lower"])):
        keys = [k for k in keys if k in parts]
        if not keys:
            continue
        bm = bmesh.new()
        for k in keys:
            bm.from_mesh(parts[k].data)
        me = bpy.data.meshes.new(side)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(side, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(parts[keys[0]].data.materials[0])
        smooth(ob)
        joined[side] = ob
        for k in keys:
            obj = parts[k]
            me = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if me.users == 0:
                bpy.data.meshes.remove(me)
    return joined


def group_heart(parts):
    """Joins the heart chambers and myocardium into one Heart mesh.

    The coronaries and cardiac veins stay separate: the web tints them as
    vessels, and they read as the surface detail on the heart.
    """
    chambers = ["Heart_Wall", "Heart_RightAtrium", "Heart_LeftAtrium",
                "Heart_RightVentricle", "Heart_LeftVentricle", "Heart_Myocardium"]
    keys = [k for k in chambers if k in parts]
    if not keys:
        return {}
    bm = bmesh.new()
    for k in keys:
        bm.from_mesh(parts[k].data)
    me = bpy.data.meshes.new("Heart")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Heart", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(parts[keys[0]].data.materials[0])
    smooth(ob)
    for k in keys:
        obj = parts[k]
        me = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return {"Heart": ob}


# --------------------------------------------------------------- the scene
def area(name, loc, target, size, energy, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.color, ld.shape, ld.size = energy, color, "SQUARE", size
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
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

    fm = bpy.data.materials.new("Floor")
    fm.use_nodes = True
    fb = fm.node_tree.nodes["Principled BSDF"]
    fb.inputs["Base Color"].default_value = (0.012, 0.016, 0.024, 1)
    fb.inputs["Roughness"].default_value = 0.18
    fb.inputs["Metallic"].default_value = 0.6
    bpy.ops.mesh.primitive_cylinder_add(radius=1.1, depth=0.04, location=(0, 0, -0.035), vertices=96)
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
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.006, major_segments=128,
                                     minor_segments=12, location=(0, 0, -0.012))
    rg = bpy.context.active_object
    rg.name = "Ring"
    rg.data.materials.append(rm)
    rg.visible_shadow = False

    area("Key", (-2.4, -3.2, 2.6), (0, 0, 1.2), 2.6, 230, (1.0, 0.95, 0.9))
    area("Fill", (2.8, -3.0, 1.2), (0, 0, 1.2), 3.0, 90, (0.75, 0.85, 1.0))
    area("RimC", (2.6, 2.4, 1.8), (0, 0, 1.2), 2.0, 300, (0.25, 0.7, 1.0))
    area("RimM", (-2.6, 2.4, 1.4), (0, 0, 1.2), 2.0, 220, (0.9, 0.3, 0.7))
    area("Top", (0, -0.5, 3.6), (0, 0, 1.2), 2.0, 60, (1, 1, 1))

    cam = bpy.data.cameras.new("Cam")
    cam.lens = 85
    co = bpy.data.objects.new("Camera", cam)
    bpy.context.scene.collection.objects.link(co)
    sc.camera = co
    return sc


def setup_camera(mode):
    co = bpy.context.scene.camera
    # The framing follows the reference renders: the full shot puts the figure
    # against the dark backdrop with the platform just under the feet, and the
    # torso shot fills the frame with the organs.
    shots = {"full": (V(0, -4.2, 0.92), V(0, 0, 0.92), 85),
             "torso": (V(0, -1.9, 1.30), V(0, 0, 1.30), 85),
             "head": (V(0, -1.05, 1.60), V(0, 0, 1.60), 85),
             "three": (V(2.0, -3.6, 0.98), V(0, 0, 0.92), 85)}
    loc, tgt, lens = shots.get(mode, shots["full"])
    co.data.lens = lens
    co.location = loc
    co.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()


def enable_gpu():
    """Cycles on Metal when the machine has a GPU, CPU otherwise."""
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs is None:
        return "CPU"
    cp = prefs.preferences
    for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            cp.compute_device_type = backend
        except TypeError:
            continue
        try:
            cp.get_devices()
        except Exception:
            continue
        gpu = [d for d in cp.devices if d.type == backend]
        if gpu:
            for d in cp.devices:
                d.use = d.type == backend
            return backend
    cp.compute_device_type = "NONE"
    return "CPU"


def setup_render(w, h, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    backend = enable_gpu()
    cy.device = "GPU" if backend != "CPU" else "CPU"
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.max_bounces = 6
    cy.transparent_max_bounces = 12
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
    print("cycles device: %s (%s)" % (cy.device, backend))


def build():
    if not os.path.isdir(MESH_DIR):
        print("meshes not found at", MESH_DIR)
        print("run scripts/anatomy/fetch-meshes.sh first")
        return 1
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = build_scene_objects()
    names = parts.pop("__names__", {})

    body = parts.get("Body")
    if body is not None:
        print("body dims (m)", tuple(round(x, 3) for x in body.dimensions))

    joined = {}
    joined.update(group_brain(parts, names))
    joined.update(group_lungs(parts))
    joined.update(group_heart(parts))

    # Anything left over keeps its own name: the vessels, the airway, the
    # liver and the kidneys are already in the contract.
    grouped = set()
    for keys in (["Cerebellum", "Pons", "Medulla", "Midbrain", "Hypothalamus"],
                 ["Lung_R_Upper", "Lung_R_Middle", "Lung_R_Lower", "Lung_L_Upper", "Lung_L_Lower"],
                 ["Heart_Wall", "Heart_RightAtrium", "Heart_LeftAtrium", "Heart_RightVentricle",
                  "Heart_LeftVentricle", "Heart_Myocardium"]):
        grouped.update(keys)
    for key, ob in parts.items():
        if key == "Body" or key in joined:
            continue
        if key in grouped:
            continue
        joined[key] = ob

    # The airway contract wants two bronchi, and the database gives one
    # bronchial tree. It is split by side so the web can tint each.
    bronchi = joined.get("Bronchi")
    if bronchi is not None:
        split_bronchi(bronchi, joined)

    build_scene()

    # The source meshes are 2.8M triangles, which is a 65 MB .blend. The
    # model is decimated here, once, to the level the renders and the web both
    # work at: enough that the sulci and the vessel branches still read, and
    # small enough that the file can live in git.
    for name, ob in sorted(joined.items()):
        if ob.type != "MESH":
            continue
        if name.startswith("Cortex_") or name.startswith("Deep_"):
            decimate(ob, BUILD_BRAIN_PART_TARGET)
            continue
        target = BUILD_TARGETS.get(name)
        if target is None:
            # A vessel: small, numerous, and all of them the same size on
            # screen.
            decimate(ob, BUILD_VESSEL_TARGET)
            continue
        decimate(ob, target)

    for name, ob in sorted(joined.items()):
        if ob.type != "MESH":
            continue
        print("  %-22s faces %8d  dims %s" % (name, len(ob.data.polygons),
                                               tuple(round(x, 3) for x in ob.dimensions)))

    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print("saved", BLEND)
    return 0


def split_bronchi(bronchi, joined):
    """Splits the bronchial tree into a left and a right bronchus.

    The web tints each side separately, so the tree is cut at the midline.
    The halves are cut by deleting the vertices on the other side and then
    removing the faces that lose all their corners; the loose vertices are
    swept up afterwards so the exported mesh has no stray points.
    """
    me = bronchi.data
    co = getco(me)
    sides = {"Bronchus_L": co[:, 0] > 0, "Bronchus_R": co[:, 0] <= 0}
    for name, mask in sides.items():
        sel = set(np.nonzero(mask)[0].tolist())
        if not sel:
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        # A face belongs to this side if any of its corners does: the cut
        # faces are kept whole, and the ones that lose every corner go.
        drop_faces = [f for f in bm.faces if not any(v.index in sel for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop_faces, context="FACES")
        # Now the vertices on the other side have no faces left.
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        out = bpy.data.meshes.new(name)
        bm.to_mesh(out)
        bm.free()
        ob = bpy.data.objects.new(name, out)
        bpy.context.scene.collection.objects.link(ob)
        out.materials.append(me.materials[0])
        smooth(ob)
        joined[name] = ob

    # The whole tree is now the two halves: the original would render on top
    # of them and double the geometry.
    del joined["Bronchi"]
    obj = bronchi
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def render(mode, w, h, samples, out):
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    setup_camera(mode)
    setup_render(w, h, samples)
    path = os.path.abspath(out)
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def main(argv):
    # Blender passes everything after "--" through argv; a plain
    # "python3 anatomy.py build" style call is also accepted.
    args = argv[1:]
    if "--" in args:
        args = args[args.index("--") + 1:]
    if not args:
        print(__doc__)
        return 1
    if args[0] == "build":
        return build()
    render(args[1], int(args[2]), int(args[3]), int(args[4]), args[5])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
