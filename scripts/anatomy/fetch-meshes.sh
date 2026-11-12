#!/usr/bin/env bash
# Fetch the BodyParts3D meshes the anatomy model is built from.
#
# The anatomy script (assets/anatomy/anatomy.py) reads real anatomical meshes:
# the skin, the cortex, the lungs, the heart and the great vessels. Those come
# from BodyParts3D, the Database Center for Life Science anatomy database.
#
#   BodyParts3D / Anatomography
#   (c) The Database Center for Life Science, licensed CC BY-SA 2.1 Japan.
#   https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
#
# The meshes are ~220 MB, so they are fetched rather than committed. Every file
# is checked against its SHA-256 before the build sees it.
#
# Two releases are used, because neither has everything:
#
#   3.0 (mirrored on GitHub, as binary STL) has the skin, the brain, the lungs,
#        the liver, the kidneys, the airway and most of the vessels.
#   4.0 (the official archive, as OBJ) has the heart chambers and the cardiac
#        veins that the 3.0 mirror does not carry. It is a 136 MB archive, so
#        only the handful of files that are needed are pulled out of it.
#
# Both releases share one coordinate frame, so the two sets sit together in the
# same body without any adjustment.
#
# usage: scripts/anatomy/fetch-meshes.sh [dest]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${1:-$REPO/.asset-cache/bodyparts3d}"
STL_DIR="$DEST/stl"
OBJ_DIR="$DEST/obj"
COMMIT="f0eeb6e843380cfe6b83797cf8c3e1af74de5e61"
BASE="https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/$COMMIT/assets/BodyParts3D_data/stl"
ARCHIVE="https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip"
LIST="$REPO/assets/anatomy/bodyparts3d-files.txt"
OBJ_LIST="$REPO/assets/anatomy/bodyparts3d-obj-files.txt"

if [[ ! -f "$LIST" ]]; then
  echo "missing file list: $LIST" >&2
  exit 1
fi

mkdir -p "$STL_DIR" "$OBJ_DIR"

fetch() {
  local name="$1" base="$2" dir="$3"
  curl -fsSL --retry 3 --retry-delay 2 -o "$dir/$name.part" "$base/$name" &&
    mv "$dir/$name.part" "$dir/$name"
}
export -f fetch

# ---------------------------------------------------------------- 3.0 STL
# A file already present with the right hash is left alone, so an interrupted
# fetch resumes.
todo=()
while read -r name want; do
  [[ -z "$name" ]] && continue
  have=""
  if [[ -f "$STL_DIR/$name" ]]; then
    have="$(shasum -a 256 "$STL_DIR/$name" | cut -d' ' -f1)"
  fi
  if [[ "$have" == "$want" ]]; then
    continue
  fi
  todo+=("$name")
done < "$LIST"

if [[ ${#todo[@]} -gt 0 ]]; then
  echo "fetching ${#todo[@]} meshes into $STL_DIR"
  printf '%s\n' "${todo[@]}" | xargs -P 8 -I{} bash -c 'fetch "$1" "$2" "$3"' _ {} "$BASE" "$STL_DIR"
fi

# ---------------------------------------------------------------- 4.0 OBJ
# The 4.0 meshes are inside one 136 MB archive. It is downloaded once and the
# few files that are needed are taken out of it.
if [[ -f "$OBJ_LIST" ]]; then
  want_obj=()
  while read -r name want; do
    [[ -z "$name" ]] && continue
    have=""
    if [[ -f "$OBJ_DIR/$name" ]]; then
      have="$(shasum -a 256 "$OBJ_DIR/$name" | cut -d' ' -f1)"
    fi
    if [[ "$have" != "$want" ]]; then
      want_obj+=("$name")
    fi
  done < "$OBJ_LIST"

  if [[ ${#want_obj[@]} -gt 0 ]]; then
    echo "fetching ${#want_obj[@]} meshes from the 4.0 archive"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    if [[ ! -f "$tmp/archive.zip" ]]; then
      curl -fsSL --retry 3 --retry-delay 3 -o "$tmp/archive.zip" "$ARCHIVE"
    fi
    for name in "${want_obj[@]}"; do
      unzip -o -j "$tmp/archive.zip" "isa_BP3D_4.0_obj_99/$name" -d "$OBJ_DIR" >/dev/null
    done
  fi
fi

# Verify every file against the manifest. A truncated mesh is a silent failure
# later in Blender, so it is caught here instead.
fail=0
check() {
  local list="$1" dir="$2"
  [[ -f "$list" ]] || return 0
  while read -r name want; do
    [[ -z "$name" ]] && continue
    if [[ ! -f "$dir/$name" ]]; then
      echo "MISSING $name" >&2
      fail=1
      continue
    fi
    got="$(shasum -a 256 "$dir/$name" | cut -d' ' -f1)"
    if [[ "$got" != "$want" ]]; then
      echo "HASH MISMATCH $name" >&2
      fail=1
    fi
  done < "$list"
}
check "$LIST" "$STL_DIR"
check "$OBJ_LIST" "$OBJ_DIR"

if [[ $fail -ne 0 ]]; then
  echo "mesh verification failed" >&2
  exit 1
fi

echo "verified $(wc -l < "$LIST" | tr -d ' ') meshes in $STL_DIR"
