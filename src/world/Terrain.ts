/**
 * Heightfield terrain.
 *
 * The height function is plain maths, not mesh data, so gameplay can ask
 * for the ground height at any point without raycasting, and the mesh can
 * be rebuilt at a different resolution for a distant LOD ring without the
 * two disagreeing.
 *
 * The rim rises toward the edges. That is deliberate: a flat plane ends in
 * a visible cliff at the horizon, and the first thing a player notices is
 * the drop-off. Hills close the silhouette instead.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { fbm, ridge } from "./Noise";

export interface TerrainOptions {
  /** Side length in metres. */
  size: number;
  /** Quads per side. */
  subdivisions: number;
  seed: number;
}

export class Terrain {
  readonly mesh: Mesh;
  readonly size: number;
  private readonly seed: number;

  constructor(scene: Scene, options: TerrainOptions) {
    this.size = options.size;
    this.seed = options.seed;

    const mesh = CreateGround(
      "nagori.terrain",
      {
        width: options.size,
        height: options.size,
        subdivisions: options.subdivisions,
        updatable: true,
      },
      scene,
    );

    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] ?? 0;
        const z = positions[i + 2] ?? 0;
        positions[i + 1] = this.heightAt(x, z);
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);

      const indices = mesh.getIndices();
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
      if (indices && normals) {
        VertexData.ComputeNormals(positions, indices, normals);
        mesh.updateVerticesData(VertexBuffer.NormalKind, normals, false, false);
      }
    }

    mesh.receiveShadows = true;
    mesh.isPickable = true;
    mesh.checkCollisions = true;
    // A heightfield never moves; freezing spares a matrix rebuild per frame.
    mesh.freezeWorldMatrix();
    this.mesh = mesh;
  }

  /** Ground height in metres at a world position. Cheap; safe to call per frame. */
  heightAt(x: number, z: number): number {
    const half = this.size / 2;
    const u = x / this.size;
    const v = z / this.size;

    // Broad rolling ground.
    const rolling = (fbm(u * 3.2, v * 3.2, { octaves: 4, period: 4, seed: this.seed }) - 0.5) * 6.5;
    // Finer undulation so the surface is not glassy up close.
    const detail = (fbm(u * 14, v * 14, { octaves: 3, period: 16, seed: this.seed + 5 }) - 0.5) * 0.9;
    // Hills that climb near the boundary and close off the horizon.
    const radial = Math.min(1, Math.hypot(x, z) / half);
    const rim = Math.pow(Math.max(0, radial - 0.42) / 0.58, 2.1);
    const ridged = ridge(u * 5.5, v * 5.5, { octaves: 4, period: 6, seed: this.seed + 9 });
    const hills = rim * (16 + ridged * 26);
    // A settled, near-level shelf where a farmstead could plausibly sit.
    const shelf = Math.exp(-(x * x + z * z) / (2 * 26 * 26));

    return (rolling + detail) * (1 - shelf * 0.85) + hills;
  }

  /** Surface normal, from finite differences on the height function. */
  normalAt(x: number, z: number, epsilon = 0.5): Vector3 {
    const hx = this.heightAt(x + epsilon, z) - this.heightAt(x - epsilon, z);
    const hz = this.heightAt(x, z + epsilon) - this.heightAt(x, z - epsilon);
    return new Vector3(-hx, 2 * epsilon, -hz).normalize();
  }

  /** 0 on the flat, 1 on a wall. Used to decide what can grow or be built. */
  slopeAt(x: number, z: number): number {
    return 1 - Math.max(0, Math.min(1, this.normalAt(x, z).y));
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
