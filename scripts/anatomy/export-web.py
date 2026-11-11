"""Export the anatomy Blender model to a web GLB.

Reads `assets/anatomy/human_anatomy.blend` (the committed source), decimates
the meshes to the web budget, converts the vessel/airway curves to low-poly
tubes, drops the render-scene extras (platform, ring, lights, camera) and
writes `apps/web/public/models/human_anatomy.glb`.

Never saves back over the .blend: the source is opened read-only and the
decimated scene lives only in memory. Run it with Blender's headless Python:

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        assets/anatomy/human_anatomy.blend --python scripts/anatomy/export-web.py

The budget: ~98k triangles, ~1.7 MB. Raise the targets only with a measured
reason (frame time on throttled CPU, first-load bytes), and keep the total
under ~120k tris — the landing scene shares the budget with its particles,
sparkline and the dial.
"""
import bpy
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BLEND = os.path.join(REPO, "assets", "anatomy", "human_anatomy.blend")
GLB = os.path.join(REPO, "apps", "web", "public", "models", "human_anatomy.glb")

# Decimate targets (base-triangle budget; collapse+triangulate means the
# reported polygon count is the triangle count).
TARGETS = {
    "Body": 12000,
    "Brain_L": 10000,
    "Brain_R": 10000,
    "Cerebellum": 6000,
    "Liver": 4000,
    "Lung_L": 5000,
    "Lung_R": 5000,
    "Heart": 2500,
    "Kidney_L": 1500,
    "Kidney_R": 1500,
}

REMOVE = ("Platform", "Ring")

CURVE_RESOLUTION_U = 6
CURVE_BEVEL_RESOLUTION = 3


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def decimate(obj, target):
    current = len(obj.data.polygons)
    if current <= target:
        return current, current
    mod = obj.modifiers.new("DecimateWeb", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / current
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    mats = list(old.materials)
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    return current, triangles(obj)


def main():
    print("SOURCE", BLEND)
    bpy.ops.wm.open_mainfile(filepath=BLEND)

    before = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            before += triangles(ob)
    print("total_triangles_before", before)

    for name, target in TARGETS.items():
        ob = bpy.data.objects.get(name)
        if ob is None:
            print("MISSING_OBJECT", name)
            continue
        old, new = decimate(ob, target)
        print("decimated %-12s %9d -> %9d" % (name, old, new))

    for ob in list(bpy.data.objects):
        if ob.type != "CURVE":
            continue
        ob.data.resolution_u = CURVE_RESOLUTION_U
        ob.data.bevel_resolution = CURVE_BEVEL_RESOLUTION
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.convert(target="MESH")
        print("converted %-16s %9d tris" % (ob.name, triangles(ob)))

    for name in REMOVE:
        ob = bpy.data.objects.get(name)
        if ob is not None:
            bpy.data.objects.remove(ob, do_unlink=True)
            print("removed", name)

    after = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            after += triangles(ob)
    print("total_triangles_after", after)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        export_texcoords=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    print("bytes", os.path.getsize(GLB))
    print("wrote", GLB)


if __name__ == "__main__":
    main()
