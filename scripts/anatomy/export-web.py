"""Export the anatomy Blender model to a web GLB.

Reads `assets/anatomy/human_anatomy.blend` (the committed source), decimates
the meshes to the web budget, converts the vessel/airway curves to low-poly
tubes, drops the render-scene extras (platform, ring, lights, camera) and
writes `apps/web/public/models/human_anatomy.glb`.

Never saves back over the .blend: the source is opened read-only and the
decimated scene lives only in memory. Run it with Blender's headless Python:

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        assets/anatomy/human_anatomy.blend --python scripts/anatomy/export-web.py

The budget: ~120k triangles, ~2.4 MB. Raise the targets only with a measured
reason (frame time on throttled CPU, first-load bytes), and keep the total
under ~150k tris — the landing scene shares the budget with its particles,
sparkline and the dial.

The brain is the one part that is not decimated hard: the cortex is 38 gyri
and the deep brain 27 nuclei, and the folds between them are the whole point
of the model. It is decimated to a level that keeps the sulci readable at the
size the figure renders at, and no further.
"""
import bpy
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BLEND = os.path.join(REPO, "assets", "anatomy", "human_anatomy.blend")
GLB = os.path.join(REPO, "apps", "web", "public", "models", "human_anatomy.glb")

# Decimate targets (base-triangle budget; collapse+triangulate means the
# reported polygon count is the triangle count). The .blend is already
# decimated to roughly this level, so most of these are no-ops; they are here
# so the web's budget is stated in one place and enforced.
TARGETS = {
    "Body": 14000,
    "Cerebellum": 6000,
    "BrainStem": 4000,
    "Liver": 4000,
    "Lung_L": 5000,
    "Lung_R": 5000,
    "Heart": 6000,
    "Kidney_L": 1500,
    "Kidney_R": 1500,
    "Trachea": 2000,
    "Bronchus_L": 2000,
    "Bronchus_R": 2000,
}

# The brain is 65 named gyri and nuclei. They are decimated individually so a
# small gyrus is not flattened into its large neighbours, and the total is
# kept near the rest of the figure so the model still loads in one go.
BRAIN_PART_TARGET = 400

# Every mesh that is neither an organ nor the shell: the great vessels, the
# heart's coronaries and the great cardiac veins. They are small and numerous,
# so they share one budget rather than getting one each.
VESSEL_TARGET = 1200

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

    # Every other mesh is a vessel or a vessel fragment: the heart's coronaries
    # and cardiac veins, the great vessels and their branches.
    named = set(TARGETS) | set(REMOVE)
    for ob in list(bpy.data.objects):
        if ob.type != "MESH" or ob.name in named:
            continue
        old, new = decimate(ob, VESSEL_TARGET)
        print("decimated %-22s %7d -> %7d (vessel)" % (ob.name, old, new))

    # The brain's named parts are decimated last and to a smaller budget each:
    # a gyrus is small, and decimating it to a share of the whole brain would
    # flatten the sulci that make it read as cortex.
    brain_parts = [ob for ob in bpy.data.objects
                   if ob.type == "MESH" and (ob.name.startswith("Cortex_")
                                            or ob.name.startswith("Deep_"))]
    for ob in brain_parts:
        old, new = decimate(ob, BRAIN_PART_TARGET)
    brain_total = sum(triangles(ob) for ob in brain_parts)
    print("brain parts %d meshes, %d triangles" % (len(brain_parts), brain_total))
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
