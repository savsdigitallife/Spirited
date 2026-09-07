"""A rigged, textured FBX, built from nothing.

`fbx-to-glb.py` has to carry two things across the conversion that are easy
to lose and easy not to notice losing: the skinning, and the textures. Real
character art cannot be committed to test that — it is somebody's licensed
work and it is tens of megabytes — so a character is built here instead: one
bone, a cube skinned to it, and an image texture wired into base colour.

    python3 tests/fixtures/textured-character.py -- out.fbx
"""
import bpy, sys

out = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)

# An armature with one bone, standing 2 m tall.
arm_data = bpy.data.armatures.new("Armature")
arm = bpy.data.objects.new("Armature", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
bone = arm_data.edit_bones.new("mixamorig:Hips")
# Deliberately off the floor: dropping a model onto y = 0 is part of what
# the converter is for, and a fixture already sitting there would not test it.
bone.head = (0, 0, 0.5)
bone.tail = (0, 0, 2.5)
bpy.ops.object.mode_set(mode="OBJECT")

# A cube skinned to it.
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1.5))
cube = bpy.context.active_object
cube.name = "Body"
group = cube.vertex_groups.new(name="mixamorig:Hips")
group.add(range(len(cube.data.vertices)), 1.0, "REPLACE")
cube.modifiers.new("Armature", "ARMATURE").object = arm
cube.parent = arm
bpy.ops.object.select_all(action="DESELECT")
cube.select_set(True)
bpy.context.view_layer.objects.active = cube
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.uv.smart_project()
bpy.ops.object.mode_set(mode="OBJECT")

# A material with a real image texture in base colour.
image = bpy.data.images.new("SkinMap", width=64, height=64)
image.generated_type = "COLOR_GRID"
# FBX embeds files, not generated images, so it needs to exist on disk.
image.filepath_raw = out.replace(".fbx", "-skin.png")
image.file_format = "PNG"
image.save()
mat = bpy.data.materials.new("SkinMat")
mat.use_nodes = True
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = image
bsdf = mat.node_tree.nodes["Principled BSDF"]
mat.node_tree.links.new(bsdf.inputs["Base Color"], tex.outputs["Color"])
cube.data.materials.append(mat)

bpy.ops.export_scene.fbx(filepath=out, path_mode="COPY", embed_textures=True)
print("fixture:", out)
