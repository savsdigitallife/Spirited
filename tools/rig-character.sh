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
# It needs a CUDA GPU, Python 3.11 with PyTorch, flash_attn, and a route to
# Hugging Face for its checkpoint. The preflight below checks all four and
# says which is missing and why, because UniRig itself fails deep inside
# Lightning with an error that names none of them.
#
# The stages have never been executed end to end — the sandbox this was
# written in has no GPU and no route to Hugging Face — so they wrap commands
# taken from UniRig's README. The preflight, by contrast, has been run: it is
# what proved those two facts.
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

# ---------------------------------------------------------------- preflight
#
# UniRig fails deep inside PyTorch Lightning when any of these is missing,
# with an error that names none of them. Each check below was read off the
# UniRig source, and cites the line that proves it.
#
# They are all run before any is reported, so somebody setting up a fresh
# machine sees the whole list once instead of discovering it an item per run.

PY="${PYTHON:-python3}"
PROBLEMS=()

if ! $PY -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('torch') else 1)" 2>/dev/null; then
  PROBLEMS+=("PyTorch is not importable by \"$PY\".
    $PY -m pip install torch
    (or point this script elsewhere: PYTHON=/path/to/venv/bin/python $0 ...)")
else
  # configs/task/quick_inference_skeleton_articulationxl_ar_256.yaml pins
  # 'accelerator: gpu' and 'precision: bf16-mixed'. There is no CPU path.
  if ! $PY -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
    PROBLEMS+=("No CUDA GPU is visible, and UniRig's inference task pins
    'accelerator: gpu' and 'precision: bf16-mixed', so there is no CPU
    fallback. This has to run on a GPU machine.")
  fi
fi

# src/model/unirig_skin.py imports flash_attn at module scope, so stage 2
# cannot even start without it. It publishes no wheels and compiles against
# your CUDA toolkit.
if ! $PY -c "import flash_attn" 2>/dev/null; then
  PROBLEMS+=("flash_attn is not installed. UniRig imports it at module scope in
    src/model/unirig_skin.py, so skinning cannot start without it.
    $PY -m pip install flash_attn --no-build-isolation
    It ships as source only; see github.com/Dao-AILab/flash-attention.")
fi

# The checkpoint is fetched with hf_hub_download(repo_id='VAST-AI/UniRig')
# in src/inference/download.py. Weights already in the cache are fine offline.
HF_CACHE="${HF_HOME:-$HOME/.cache/huggingface}/hub/models--VAST-AI--UniRig"
if [[ ! -d "$HF_CACHE" ]] && ! curl -sfI --max-time 20 https://huggingface.co/VAST-AI/UniRig >/dev/null 2>&1; then
  PROBLEMS+=("huggingface.co is unreachable and no checkpoint is cached at
    $HF_CACHE
    UniRig downloads its weights on first run (src/inference/download.py,
    repo_id='VAST-AI/UniRig'). Give this machine network access, or fetch
    them elsewhere and copy that directory across.")
fi

if [[ ${#PROBLEMS[@]} -gt 0 ]]; then
  printf '\n\033[31mCannot rig here — %d thing(s) missing:\033[0m\n' "${#PROBLEMS[@]}" >&2
  for problem in "${PROBLEMS[@]}"; do printf '\n  - %s\n' "$problem" >&2; done
  printf '\nUniRig'"'"'s own README covers the install. docs/CHARACTER-PIPELINE.md\ncovers what the game needs of the result.\n\n' >&2
  exit 1
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
