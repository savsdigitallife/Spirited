/**
 * Hair that moves.
 *
 * A Verlet chain hanging from the nape, simulated in world space and drawn as
 * a taper of segments. World space is the point: the character's transform is
 * not applied to the hair, so walking, turning and stopping all put real
 * inertia into it without a line of code that knows what walking is.
 *
 * Aiko's hair reaches nearly to the floor, which is a deliberate visual
 * signature and also the hardest case — a long chain wants to whip, pass
 * through her, and sweep the pavement. The three constraint passes below are
 * each there to stop one of those.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";

export interface HairOptions {
  /** Number of simulated links. More is smoother and costs more. */
  segments: number;
  /** Total length, metres. */
  length: number;
  /** Width of the mass at the top. It tapers to a third of this. */
  width: number;
  material: Material;
  /** 0 free-swinging, 1 stiff. Falls off along the chain. */
  stiffness: number;
  /** Per-second velocity retention. Lower is heavier and calmer. */
  damping: number;
}

const GRAVITY = -13;
/** Distance kept from the body's centre line. */
const BODY_RADIUS = 0.17;

export class HairSim {
  private readonly root: TransformNode;
  private readonly links: Mesh[] = [];
  private readonly points: Vector3[] = [];
  private readonly previous: Vector3[] = [];
  private readonly segmentLength: number;
  private readonly options: HairOptions;
  private accumulator = 0;

  constructor(scene: Scene, options: HairOptions) {
    this.options = options;
    this.segmentLength = options.length / options.segments;
    // Parented to nothing that moves: the chain owns its own world positions.
    this.root = new TransformNode("hair.root", scene);

    for (let i = 0; i <= options.segments; i += 1) {
      this.points.push(new Vector3(0, -i * this.segmentLength, 0));
      this.previous.push(this.points[i]!.clone());
    }
    for (let i = 0; i < options.segments; i += 1) {
      const t = i / options.segments;
      // Wide at the shoulders, narrowing to a point: a rope of even width
      // reads as a tail, not as hair.
      const width = options.width * (1 - t * 0.62);
      const link = CreateBox(
        `hair.link.${i}`,
        { width, height: width * 0.55, depth: this.segmentLength * 1.06 },
        scene,
      );
      link.material = options.material;
      link.parent = this.root;
      link.isPickable = false;
      link.receiveShadows = true;
      this.links.push(link);
    }
  }

  get meshes(): readonly Mesh[] {
    return this.links;
  }

  /** Drops the whole chain straight down from the anchor. Use after a teleport. */
  reset(anchor: Vector3, back: Vector3): void {
    for (let i = 0; i <= this.options.segments; i += 1) {
      const drop = i * this.segmentLength;
      this.points[i]!.set(
        anchor.x + back.x * drop * 0.12,
        anchor.y - drop,
        anchor.z + back.z * drop * 0.12,
      );
      this.previous[i]!.copyFrom(this.points[i]!);
    }
    this.place();
  }

  /**
   * @param anchor  world position of the nape
   * @param back    unit vector away from the character's face
   * @param bodyAt  world position of the body's centre line at hip height
   * @param floorY  ground height under the character
   */
  update(dt: number, anchor: Vector3, back: Vector3, bodyAt: Vector3, floorY: number): void {
    // Fixed steps: a chain integrated at a variable rate changes stiffness
    // with the frame rate, which is exactly what long hair must not do.
    const step = 1 / 90;
    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    let steps = 0;
    while (this.accumulator >= step && steps < 8) {
      this.simulate(step, anchor, back, bodyAt, floorY);
      this.accumulator -= step;
      steps += 1;
    }
    if (steps > 0) this.place();
  }

  private simulate(dt: number, anchor: Vector3, back: Vector3, bodyAt: Vector3, floorY: number): void {
    const n = this.options.segments;
    const damping = Math.pow(this.options.damping, dt * 60);

    this.points[0]!.copyFrom(anchor);
    this.previous[0]!.copyFrom(anchor);

    for (let i = 1; i <= n; i += 1) {
      const p = this.points[i]!;
      const prev = this.previous[i]!;
      const vx = (p.x - prev.x) * damping;
      const vy = (p.y - prev.y) * damping;
      const vz = (p.z - prev.z) * damping;
      prev.copyFrom(p);
      p.x += vx;
      p.y += vy + GRAVITY * dt * dt;
      p.z += vz;
    }

    // Three passes is enough to look inextensible without going rigid.
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 1; i <= n; i += 1) {
        const a = this.points[i - 1]!;
        const p = this.points[i]!;

        // 1. Length. The parent never moves for its child, so the whole
        //    chain settles from the head down in one pass.
        let dx = p.x - a.x;
        let dy = p.y - a.y;
        let dz = p.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-5;
        const scale = this.segmentLength / d;
        p.x = a.x + dx * scale;
        p.y = a.y + dy * scale;
        p.z = a.z + dz * scale;

        // 2. Stiffness, pulling each link back toward hanging down and a
        //    little behind her. Strong near the scalp, almost nothing at the
        //    tips, which is how hair actually behaves.
        const t = i / n;
        const k = this.options.stiffness * (1 - t) * (1 - t) * 0.5;
        if (k > 0) {
          const restX = a.x + back.x * this.segmentLength * 0.16;
          const restY = a.y - this.segmentLength;
          const restZ = a.z + back.z * this.segmentLength * 0.16;
          p.x += (restX - p.x) * k;
          p.y += (restY - p.y) * k;
          p.z += (restZ - p.z) * k;
        }

        // 3. Her own body. Without this the mass swings straight through her
        //    chest on every turn.
        dx = p.x - bodyAt.x;
        dz = p.z - bodyAt.z;
        const radial = Math.hypot(dx, dz);
        if (radial < BODY_RADIUS && p.y > floorY + 0.15 && p.y < bodyAt.y + 0.75) {
          const push = radial < 1e-4 ? BODY_RADIUS : BODY_RADIUS / radial;
          p.x = bodyAt.x + dx * push;
          p.z = bodyAt.z + dz * push;
        }
        // And the ground, so it pools rather than sweeping through it.
        if (p.y < floorY + 0.04) p.y = floorY + 0.04;
      }
    }
  }

  /** Points each link from its parent to its own position. */
  private place(): void {
    for (let i = 0; i < this.options.segments; i += 1) {
      const a = this.points[i]!;
      const b = this.points[i + 1]!;
      const link = this.links[i]!;
      link.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      // The link's length runs along its local Z, which is what lookAt aims.
      if (Vector3.DistanceSquared(a, b) > 1e-8) link.lookAt(b);
    }
  }

  setVisible(visible: boolean): void {
    for (const link of this.links) link.isVisible = visible;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}
