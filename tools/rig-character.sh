#!/usr/bin/env bash
#
# Rig a character mesh with UniRig and drop it where the game will find it.
#
#   tools/rig-character.sh <mesh> <name> [--unirig <dir>] [--seed N] [--keep]
#
#   tools/rig-character.sh ~/art/aiko.glb aiko
#     -> public/assets/characters/aiko.glb, rigged and skinned
#
# UniRig predicts a skeleton and skinning weights for a mesh that has neither.
# It does not model anything: the mesh is yours to supply. Three stages, all
# from the upstream README —
#
#   1. generate_skeleton.sh   predicts a skeleton            -> .fbx
#   2. generate_skin.sh       predicts per-vertex weights    -> .fbx
#   3. merge.sh               puts them back on your mesh    -> .glb
#
# It needs a CUDA GPU, Python 3.11 with PyTorch, and it downloads its
# checkpoint from Hugging Face on first run. None of that is available in the
# sandbox this script was written in, so it has never been executed end to
# end — it wraps documented commands and checks its ground carefully, but the
# first person to run it should expect to debug UniRig's own install.
#
# What the game needs of the result is in docs/CHARACTER-PIPELINE.md; the
# short version is that the bones have to be nameable, and
# src/player/rig/BoneNames.ts is the list of names it understands.

set -euo pipefail

die() { printf '\n%s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

MESH=""
NAME=""
UNIRIG="${UNIRIG_HOME:-$HOME/UniRig}"
SEED=12345
KEEP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unirig) UNIRIG="$2"; shift 2 ;;
    --seed) SEED="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *)
      if [[ -z "$MESH" ]]; then MESH="$1"
      elif [[ -z "$NAME" ]]; then NAME="$1"
      else die "unexpected argument: $1"; fi
      shift ;;
  esac
done

[[ -n "$MESH" && -n "$NAME" ]] || die "usage: tools/rig-character.sh <mesh> <name> [--unirig <dir>]"
[[ -f "$MESH" ]] || die "no such mesh: $MESH"
[[ "$NAME" =~ ^[a-z0-9_]+$ ]] || die "name must be lowercase letters, digits and underscores: $NAME"

# The game loads characters/<name>.glb, so the extension is not negotiable.
case "${MESH##*.}" in
  obj|fbx|FBX|glb|gltf|vrm|dae) ;;
  *) die "UniRig reads .obj .fbx .glb .gltf .vrm .dae; got .${MESH##*.}" ;;
esac

[[ -d "$UNIRIG" ]] || die "UniRig is not at $UNIRIG.
Clone it and point this script at it:
  git clone https://github.com/VAST-AI-Research/UniRig \$HOME/UniRig
  tools/rig-character.sh $MESH $NAME --unirig \$HOME/UniRig
Its install (PyTorch, spconv, flash_attn) is in that repository's README."

[[ -f "$UNIRIG/launch/inference/generate_skeleton.sh" ]] \
  || die "$UNIRIG does not look like UniRig: launch/inference/generate_skeleton.sh is missing."

python3 - <<'PY' || die "UniRig needs PyTorch. Install it in the environment you are running this from."
import importlib.util, sys
sys.exit(0 if importlib.util.find_spec("torch") else 1)
PY

if ! python3 -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
  printf '\n\033[33mNo CUDA device visible. UniRig will be very slow or will fail outright.\033[0m\n' >&2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/assets/characters"
WORK="$(mktemp -d)"
trap '[[ $KEEP -eq 1 ]] || rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

ABS_MESH="$(cd "$(dirname "$MESH")" && pwd)/$(basename "$MESH")"

step "1/3  predicting a skeleton   ($(basename "$ABS_MESH"))"
( cd "$UNIRIG" && bash launch/inference/generate_skeleton.sh \
    --input "$ABS_MESH" --output "$WORK/skeleton.fbx" --seed "$SEED" )
[[ -f "$WORK/skeleton.fbx" ]] || die "stage 1 produced no skeleton."

step "2/3  predicting skinning weights"
# Upstream is explicit that skinning degrades badly on a poor skeleton. If the
# result is wrong, look at skeleton.fbx before blaming the weights.
( cd "$UNIRIG" && bash launch/inference/generate_skin.sh \
    --input "$WORK/skeleton.fbx" --output "$WORK/skin.fbx" )
[[ -f "$WORK/skin.fbx" ]] || die "stage 2 produced no skinning."

step "3/3  merging onto the original mesh"
# The skin, never the bare skeleton: merging skeleton.fbx gives a rigged model
# with no weights, which loads and then does not deform.
( cd "$UNIRIG" && bash launch/inference/merge.sh \
    --source "$WORK/skin.fbx" --target "$ABS_MESH" --output "$OUT/$NAME.glb" )
[[ -f "$OUT/$NAME.glb" ]] || die "stage 3 produced no rigged model."

step "checking the bones against what the game drives"
node --experimental-strip-types "$ROOT/tools/check-rig.mjs" "$OUT/$NAME.glb"

printf '\n\033[32mRigged:\033[0m %s\n' "$OUT/$NAME.glb"
printf 'The game picks it up on the next load; nothing else needs changing.\n'
[[ $KEEP -eq 1 ]] && printf 'Intermediates kept in %s\n' "$WORK"
exit 0
