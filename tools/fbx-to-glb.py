"""
Convert a rigged FBX into the glTF binary the game loads.

    python tools/fbx-to-glb.py <in.fbx> <out.glb> [--height 1.7]

Most character art arrives as FBX — it is what Mixamo, Maya and 3ds Max hand
you — and the browser reads glTF. Blender is the converter, driven here as a
Python module rather than an application so this can run unattended.

Two things it does beyond a straight export:

* **Scale.** An FBX carries its own idea of a unit, and Mixamo's is the
  centimetre, so a character imports a hundred times too big and stands with
  their ankles above the rooftops. `--height` scales the armature so the mesh
  is that many metres from its lowest vertex to its highest, which is a
  measurement rather than a guess about the exporter.

* **Rest pose.** Mixamo ships characters in an A-pose. The game animates from
  the bind pose outward, so whatever pose the file is in becomes "standing" —
  that is the right behaviour, and it is why `BoneBinding` composes onto the
  rest rotation instead of replacing it.
"""

import sys
import bpy
from mathutils import Vector


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        die("usage: fbx-to-glb.py <in.fbx> <out.glb> [--height 1.7]")
    source, target = args[0], args[1]
    height = 0.0
    if "--height" in sys.argv:
        height = float(sys.argv[sys.argv.index("--height") + 1])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # automatic_bone_orientation keeps the bone axes glTF expects; without it
    # Blender guesses per bone and the arms come through twisted.
    bpy.ops.import_scene.fbx(filepath=source, automatic_bone_orientation=True)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not meshes:
        die("no mesh in that file")
    if not armatures:
        die("no armature: this file is not rigged, so the game cannot animate it")

    # Measure what came in, in world space, before touching anything.
    def bounds():
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for mesh in meshes:
            for corner in mesh.bound_box:
                world = mesh.matrix_world @ Vector(corner)
                lo = Vector((min(lo[i], world[i]) for i in range(3)))
                hi = Vector((max(hi[i], world[i]) for i in range(3)))
        return lo, hi

    lo, hi = bounds()
    tall = hi[2] - lo[2]
    print(f"imported: {len(meshes)} mesh(es), {len(armatures)} armature(s), {tall:.3f} units tall")
    print(f"bones: {len(armatures[0].data.bones)}")

    if height > 0 and tall > 0:
        factor = height / tall
        root = armatures[0]
        root.scale = (root.scale[0] * factor, root.scale[1] * factor, root.scale[2] * factor)
        bpy.context.view_layer.update()
        lo, hi = bounds()
        print(f"scaled by {factor:.5f} -> {hi[2] - lo[2]:.3f} m tall")

    # Sit the feet on the floor: a character whose origin is not the ground is
    # a character that floats or sinks, and every scene places them by the feet.
    lo, hi = bounds()
    if abs(lo[2]) > 1e-4:
        for obj in bpy.data.objects:
            if obj.parent is None:
                obj.location[2] -= lo[2]
        bpy.context.view_layer.update()
        print(f"dropped {lo[2]:.3f} m so the feet are on y = 0")

    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        export_skins=True,
        export_animations=False,  # the game drives the skeleton itself
        export_yup=True,
        export_apply=False,  # modifiers baked would break the skinning
    )
    print(f"wrote {target}")


main()
