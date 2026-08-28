/**
 * Pedestrians.
 *
 * Not AI — routes. Each walker owns a lane, a direction and a speed, waits
 * at the kerb when the signal is against it, and wraps around at the ends of
 * the block. That is enough to make a street read as inhabited, and it costs
 * almost nothing, which matters because the alternative is thirty agents
 * pathfinding every frame for a prototype that does not need it.
 *
 * Bodies are GPU instances of a handful of templates. Only the walkers close
 * to the player animate their legs; the rest just translate. A figure forty
 * metres away in the rain does not need a stride.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { CityMaterials } from "./CityMaterials";
import { makeRandom } from "./Noise";

export interface CrowdLane {
  /** Fixed cross-street position of the lane. */
  x: number;
  /** Along-street extent the lane runs between. */
  from: number;
  to: number;
  /** Ground height of the pavement this lane runs on. */
  y: number;
}

export interface CrowdOptions {
  count: number;
  lanes: readonly CrowdLane[];
  /** Along-street position of the crossing walkers pause at. */
  crossingZ: number;
  seed: number;
}

interface Walker {
  root: TransformNode;
  hipL: TransformNode;
  hipR: TransformNode;
  lane: CrowdLane;
  offsetX: number;
  /** +1 walks toward `to`, -1 toward `from`. */
  direction: number;
  speed: number;
  phase: number;
  z: number;
  waiting: boolean;
}

/** Distance beyond which a walker stops animating its legs. */
const ANIMATE_RANGE = 42;
const STRIDE = 1.4;

export class Crowd {
  private readonly walkers: Walker[] = [];
  private readonly templates: Mesh[] = [];
  private accumulator = 0;

  constructor(
    private readonly scene: Scene,
    materials: CityMaterials,
    private readonly options: CrowdOptions,
  ) {
    const random = makeRandom(options.seed);

    // A small wardrobe. Each coat colour is one draw call for every walker
    // wearing it, so four is a good trade between variety and cost.
    const coats = [
      new Color3(0.11, 0.12, 0.15),
      new Color3(0.2, 0.16, 0.14),
      new Color3(0.09, 0.15, 0.18),
      new Color3(0.28, 0.26, 0.24),
    ].map((colour, index) => {
      const body = CreateCapsule(
        `crowd.body${index}`,
        { radius: 0.19, height: 0.92, tessellation: 8 },
        scene,
      );
      body.material = materials.painted(`coat${index}`, colour, 0.85);
      body.setEnabled(false);
      body.isPickable = false;
      this.templates.push(body);
      return body;
    });

    const head = CreateSphere("crowd.head", { diameter: 0.2, segments: 8 }, scene);
    head.material = materials.painted("crowdSkin", new Color3(0.62, 0.5, 0.43), 0.7);
    head.setEnabled(false);
    head.isPickable = false;
    this.templates.push(head);

    const leg = CreateBox("crowd.leg", { width: 0.13, height: 0.8, depth: 0.15 }, scene);
    // The template hangs below its origin so a parent node rotates it at the hip.
    leg.position.y = -0.4;
    leg.material = materials.painted("crowdTrousers", new Color3(0.1, 0.1, 0.12), 0.9);
    leg.setEnabled(false);
    leg.isPickable = false;
    this.templates.push(leg);

    for (let i = 0; i < options.count; i += 1) {
      const lane = options.lanes[Math.floor(random() * options.lanes.length)];
      if (!lane) continue;
      const root = new TransformNode(`walker.${i}`, scene);
      const coat = coats[Math.floor(random() * coats.length)] ?? coats[0];
      if (!coat) continue;

      const body = coat.createInstance(`walker.${i}.body`);
      body.parent = root;
      body.position.y = 1.29;

      const skull = head.createInstance(`walker.${i}.head`);
      skull.parent = root;
      skull.position.y = 1.8;

      const hipL = new TransformNode(`walker.${i}.hipL`, scene);
      hipL.parent = root;
      hipL.position.set(-0.09, 0.83, 0);
      const hipR = new TransformNode(`walker.${i}.hipR`, scene);
      hipR.parent = root;
      hipR.position.set(0.09, 0.83, 0);
      leg.createInstance(`walker.${i}.legL`).parent = hipL;
      leg.createInstance(`walker.${i}.legR`).parent = hipR;

      const direction = random() < 0.5 ? 1 : -1;
      const walker: Walker = {
        root,
        hipL,
        hipR,
        lane,
        offsetX: (random() - 0.5) * 1.5,
        direction,
        speed: 1.1 + random() * 0.55,
        phase: random() * Math.PI * 2,
        z: lane.from + random() * (lane.to - lane.from),
        waiting: false,
      };
      this.walkers.push(walker);
      this.place(walker);
    }
  }

  private place(walker: Walker): void {
    walker.root.position.set(walker.lane.x + walker.offsetX, walker.lane.y, walker.z);
    walker.root.rotation.y = walker.direction > 0 ? 0 : Math.PI;
  }

  /** Every mesh template, for registering shadow casters once. */
  get shadowTemplates(): readonly Mesh[] {
    return this.templates;
  }

  get population(): number {
    return this.walkers.length;
  }

  /**
   * @param canCross false while the signal is against pedestrians; walkers
   *                 approaching the crossing hold at the kerb.
   */
  update(dt: number, playerPosition: Vector3, canCross: boolean): void {
    this.accumulator += dt;
    for (const walker of this.walkers) {
      const approaching =
        Math.abs(walker.z - this.options.crossingZ) < 4 &&
        Math.sign(this.options.crossingZ - walker.z) === walker.direction;
      walker.waiting = approaching && !canCross;

      if (!walker.waiting) {
        walker.z += walker.speed * walker.direction * dt;
        if (walker.z > walker.lane.to) walker.z = walker.lane.from;
        if (walker.z < walker.lane.from) walker.z = walker.lane.to;
        walker.phase += (walker.speed / STRIDE) * Math.PI * 2 * dt;
      }
      walker.root.position.z = walker.z;
      walker.root.position.x = walker.lane.x + walker.offsetX;

      const distance = Vector3.Distance(walker.root.position, playerPosition);
      if (distance > ANIMATE_RANGE) continue;
      const swing = walker.waiting ? 0 : Math.sin(walker.phase) * 0.55;
      walker.hipL.rotation.x = swing;
      walker.hipR.rotation.x = -swing;
    }
  }

  dispose(): void {
    for (const walker of this.walkers) walker.root.dispose(false, true);
    this.walkers.length = 0;
    for (const template of this.templates) template.dispose();
    this.templates.length = 0;
    void this.scene;
  }
}
