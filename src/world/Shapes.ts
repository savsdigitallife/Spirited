/**
 * A small modelling toolkit.
 *
 * Everything in this project is generated rather than downloaded, and the
 * single biggest reason generated geometry reads as "programmer art" is that
 * it is made of boxes. A box has hard 90-degree edges that catch no light,
 * uniform proportions, and no profile — three things no manufactured object
 * has.
 *
 * These are the operations a modeller would actually reach for: revolve a
 * profile, extrude a profile along a path, chamfer a block, corrugate a
 * sheet, run a pipe. One call each, and the result has silhouette and edge
 * highlights that a `CreateBox` never will.
 *
 * Everything here returns a plain `Mesh` positioned at the origin, ready to
 * be merged into a prop.
 */

import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder";
import { ExtrudeShape } from "@babylonjs/core/Meshes/Builders/shapeBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Maps a mesh's vertices onto the ground plane, one texture tile every
 * `metresPerTile`.
 *
 * Box faces are each mapped 0..1, so a patch laid on a road shows the same
 * texture squeezed into two metres that the road shows over eight, and the
 * join is visible from across the street. World-plane UVs make every
 * surface on the ground share one continuous grain, whatever its size.
 */
export function planarUv(mesh: Mesh, metresPerTile: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const world = mesh.computeWorldMatrix(true);
  const uvs = new Float32Array((positions.length / 3) * 2);
  const point = new Vector3();
  for (let i = 0; i < positions.length / 3; i += 1) {
    point.set(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0);
    const at = Vector3.TransformCoordinates(point, world);
    uvs[i * 2] = at.x / metresPerTile;
    uvs[i * 2 + 1] = at.z / metresPerTile;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

/**
 * Paints one colour into a mesh's vertex colours.
 *
 * A way to vary tone across meshes that share a material — a patch of newer
 * tar, a polished wheel track — without a second copy of its textures.
 */
export function tint(mesh: Mesh, colour: Color3): void {
  const count = mesh.getTotalVertices();
  const colours = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    colours[i * 4] = colour.r;
    colours[i * 4 + 1] = colour.g;
    colours[i * 4 + 2] = colour.b;
    colours[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colours);
}

/** A 2D profile in the XY plane, to be revolved or extruded. */
export type Profile = readonly [number, number][];

function toPath(profile: Profile): Vector3[] {
  return profile.map(([x, y]) => new Vector3(x, y, 0));
}

/**
 * Revolves a profile about the Y axis.
 *
 * For anything turned or moulded: bollard caps, lamp housings, bottles,
 * lantern bodies, planters, bin bodies, stool legs.
 */
export function revolve(
  scene: Scene,
  name: string,
  profile: Profile,
  segments = 16,
): Mesh {
  return CreateLathe(
    name,
    { shape: toPath(profile), tessellation: segments, closed: false, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
}

/**
 * Extrudes a closed profile along a path.
 *
 * For anything with a constant cross-section: kerbs, handrails, window
 * mouldings, sign frames, gutters, cable trays, skirting.
 */
export function extrude(
  scene: Scene,
  name: string,
  profile: Profile,
  path: readonly Vector3[],
  options: { cap?: boolean; scale?: number } = {},
): Mesh {
  const shape = toPath(profile);
  // Close the profile so the extrusion is a solid, not an open sheet.
  if (shape.length > 0) shape.push(shape[0]!.clone());
  return ExtrudeShape(
    name,
    {
      shape,
      path: [...path],
      scale: options.scale ?? 1,
      cap: options.cap === false ? Mesh.NO_CAP : Mesh.CAP_ALL,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
}

/** A rounded rectangle, for extruding into a chamfered block. */
export function roundedRect(width: number, depth: number, radius: number, corner = 4): Profile {
  const r = Math.min(radius, width / 2, depth / 2);
  const w = width / 2 - r;
  const d = depth / 2 - r;
  const points: [number, number][] = [];
  const corners: [number, number, number][] = [
    [w, d, 0],
    [-w, d, Math.PI / 2],
    [-w, -d, Math.PI],
    [w, -d, (Math.PI * 3) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= corner; i += 1) {
      const a = start + (i / corner) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return points;
}

/**
 * A block with softened vertical edges.
 *
 * The workhorse. Almost every manufactured object in a street — a vending
 * machine, a utility cabinet, a bin, a kiosk — is a box with a few
 * millimetres of radius on its corners, and that radius is the whole
 * difference between "an object" and "a cube".
 */
export function chamferedBlock(
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  radius = 0.04,
): Mesh {
  const mesh = extrude(
    scene,
    name,
    roundedRect(size.width, size.depth, radius),
    [new Vector3(0, 0, 0), new Vector3(0, size.height, 0)],
  );
  // The extrusion runs profile-in-XY along +Y, which already stands upright.
  mesh.position.y = 0;
  return mesh;
}

/** A pipe or cable following a path. */
export function pipe(
  scene: Scene,
  name: string,
  path: readonly Vector3[],
  radius: number,
  segments = 8,
): Mesh {
  return CreateTube(
    name,
    { path: [...path], radius, tessellation: segments, cap: Mesh.CAP_ALL },
    scene,
  );
}

/**
 * A corrugated sheet: a roller shutter, a fence panel, a container side.
 *
 * Built as an extruded zig-zag rather than as stacked boxes, which is both
 * one mesh instead of twenty and correctly continuous.
 */
export function corrugatedSheet(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  ribs: number,
  depth = 0.03,
): Mesh {
  const profile: [number, number][] = [];
  const step = height / ribs;
  for (let i = 0; i <= ribs; i += 1) {
    const y = i * step;
    profile.push([0, y]);
    profile.push([depth, y + step * 0.35]);
    profile.push([depth, y + step * 0.65]);
    profile.push([0, y + step]);
  }
  // Give it a back face so it is a solid panel.
  for (let i = profile.length - 1; i >= 0; i -= 1) {
    const [x, y] = profile[i]!;
    profile.push([x - 0.012, y]);
  }
  return extrude(scene, name, profile, [
    new Vector3(0, 0, -width / 2),
    new Vector3(0, 0, width / 2),
  ]);
}

/**
 * A run of railing: posts, a top rail and an infill rail.
 *
 * Returns one merged mesh, because a railing is one object and forty
 * separate posts is forty draw calls that behave like one.
 */
export function railingRun(
  scene: Scene,
  name: string,
  length: number,
  height: number,
  spacing: number,
  material: Material,
): Mesh | null {
  const parts: Mesh[] = [];
  const posts = Math.max(2, Math.round(length / spacing));
  for (let i = 0; i <= posts; i += 1) {
    const z = -length / 2 + (i / posts) * length;
    const post = CreateCylinder(`${name}.post${i}`, { diameter: 0.055, height, tessellation: 8 }, scene);
    post.position.set(0, height / 2, z);
    parts.push(post);
  }
  for (const y of [height, height * 0.55]) {
    const rail = CreateCylinder(`${name}.rail${y}`, { diameter: 0.045, height: length, tessellation: 8 }, scene);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(0, y, 0);
    parts.push(rail);
  }
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (merged) {
    merged.name = name;
    merged.material = material;
  }
  return merged;
}

/**
 * A framed panel: a sign face, a poster board, a window casement.
 *
 * A frame with a recessed face, which catches an edge highlight the way a
 * flat quad cannot.
 */
export function framedPanel(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  frame: number,
  faceMaterial: Material,
  frameMaterial: Material,
): Mesh[] {
  const face = CreateBox(`${name}.face`, { width, height, depth: 0.02 }, scene);
  face.material = faceMaterial;
  const parts: Mesh[] = [face];
  const bars: [number, number, number, number][] = [
    [width + frame * 2, frame, 0, height / 2 + frame / 2],
    [width + frame * 2, frame, 0, -height / 2 - frame / 2],
    [frame, height, -width / 2 - frame / 2, 0],
    [frame, height, width / 2 + frame / 2, 0],
  ];
  for (const [w, h, x, y] of bars) {
    const bar = CreateBox(`${name}.frame`, { width: w, height: h, depth: 0.05 }, scene);
    bar.position.set(x, y, -0.01);
    bar.material = frameMaterial;
    parts.push(bar);
  }
  return parts;
}

/**
 * Applies one UV rectangle to every face of a box.
 *
 * Lets several props share one atlas texture instead of one material each,
 * which is the difference between forty draw calls and one.
 */
export function atlasFaces(u0: number, v0: number, u1: number, v1: number): Vector4 {
  return new Vector4(u0, v0, u1, v1);
}
