# The anatomy model

The figure on the landing page is a real human anatomy model: the skin, the
cerebral cortex, the deep brain, the brainstem, the lungs, the heart and the
great vessels are actual anatomical meshes, not primitives.

## Where the meshes come from

**BodyParts3D / Anatomography** — (c) The Database Center for Life Science,
licensed **CC BY-SA 2.1 Japan**.
<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>

The meshes are ~220 MB, so they are not committed to this repository. They are
fetched by a script, from a pinned commit, and checked against a manifest:

```sh
scripts/anatomy/fetch-meshes.sh
```

The script is idempotent: a file already present with the right hash is left
alone, so an interrupted fetch resumes. Two manifests carry the name and the
SHA-256 of every mesh — `bodyparts3d-files.txt` for the STL set and
`bodyparts3d-obj-files.txt` for the OBJ set.

**Two releases are used, because neither has everything.** The 3.0 release
(mirrored on GitHub as binary STL) has the skin, the brain, the lungs, the
liver, the kidneys, the airway and most of the vessels. The 4.0 release (the
official archive, as OBJ) has the heart chambers that the 3.0 mirror does not
carry. Both releases share one coordinate frame, so the two sets sit together
in the same body without any adjustment.

`assets/anatomy/parts_list_e.txt` is the database's own table of part ids and
names. It is the authority on what each mesh is and which side of the midline
it belongs to — the brain's gyri are named "right superior frontal gyrus" and
"left superior frontal gyrus", and the web reads that naming to say what the
pointer is over.

## Building the model

```sh
# 1. fetch the meshes (once)
scripts/anatomy/fetch-meshes.sh

# 2. build the .blend
/Applications/Blender.app/Contents/MacOS/Blender -b \
    --python assets/anatomy/anatomy.py -- build

# 3. render
/Applications/Blender.app/Contents/MacOS/Blender -b \
    --python assets/anatomy/anatomy.py -- render full 1400 2400 128 out.png
```

`build` writes `assets/anatomy/human_anatomy.blend`, which is the committed
source of truth for the model. `render` opens it and renders one of four
shots: `full`, `torso`, `head`, `three`.

Blender is not on `PATH` on a stock macOS install; the path above is the
application bundle's.

## Exporting for the web

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --background \
    assets/anatomy/human_anatomy.blend --python scripts/anatomy/export-web.py
```

This writes `apps/web/public/models/human_anatomy.glb`, decimating the meshes
to the web's triangle budget and dropping the render-scene extras. The budget
is ~115k triangles, ~2.1 MB.

## Node names are the contract

The web finds the parts of the model by name. `scripts/anatomy/export-web.py`
and `apps/web/components/landing/figure-scene.ts` have to agree:

| Name | What it is |
| --- | --- |
| `Body` | The skin, as a glass shell |
| `Cortex_<FMA>_<L\|R\|M>` | One gyrus of the cerebral cortex |
| `Deep_<FMA>_<L\|R\|M>` | One nucleus of the deep brain |
| `Cerebellum`, `BrainStem` | The cerebellum and the brainstem |
| `Heart`, `Liver`, `Lung_L`, `Lung_R`, `Kidney_L`, `Kidney_R` | The organs |
| `Trachea`, `Bronchus_L`, `Bronchus_R` | The airway |
| `Aorta_*`, `Carotid_*`, `Coronary_*`, `*_Vein` | The vessels |

The suffix on a brain part is the side it is on: `L`, `R`, or `M` for a
midline structure such as the corpus callosum. The web uses it to say which
hemisphere the pointer is over.

## Licence

The model is derived from BodyParts3D and is therefore covered by that
database's CC BY-SA 2.1 Japan licence, which requires attribution and
share-alike for the derived geometry. The attribution is:

> BodyParts3D, (c) The Database Center for Life Science licensed under
> CC Attribution-Share Alike 2.1 Japan.

The application code in this repository is unaffected; the licence covers the
meshes and the derived model files.
