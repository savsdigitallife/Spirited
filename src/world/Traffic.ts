/**
 * Traffic, and the signal that governs it.
 *
 * The signal is the single clock everything reads — the cars, the people
 * waiting to cross, and the three lenses in every signal head on the street.
 * They cannot disagree, because there is only one phase and all three take it
 * from here: the cars stop because the light is red, not alongside it.
 *
 * Green, amber, red, in that order and for real durations. Amber is not
 * decoration: it is the two or three seconds that let a car already on top of
 * the line go through instead of standing on the brakes, which is the
 * difference between traffic and a row of objects being toggled.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AssetCatalog } from "../engine/AssetCatalog";
import type { CityMaterials, SignalAspect } from "./CityMaterials";
import { makeRandom } from "./Noise";

export interface TrafficLane {
  /** Cross-street position of the lane centre. */
  x: number;
  /** Road surface height. */
  y: number;
  from: number;
  to: number;
  /** +1 drives toward `to`. */
  direction: 1 | -1;
}

export interface TrafficOptions {
  lanes: readonly TrafficLane[];
  carsPerLane: number;
  /**
   * The body styles to draw from. Dealt without replacement, so a street
   * only repeats a shape once it has run out of shapes.
   */
  bodies: readonly string[];
  /** Along-street position of the junction. */
  crossingZ: number;
  /** Seconds of green for vehicles, then for pedestrians. */
  vehicleGreen: number;
  pedestrianGreen: number;
  /** Seconds of amber between the two. */
  amber?: number;
  seed: number;
}

interface Car {
  node: TransformNode;
  lane: TrafficLane;
  z: number;
  speed: number;
  cruise: number;
}

/** How far ahead a car looks before it starts braking. */
const HEADWAY = 9;
/** Where a car stops relative to the crossing centre. */
const STOP_LINE = 6.5;
/** How far back a car starts reading the signal at all. */
const SIGHT = 26;
/**
 * On amber, a car this close to the line is committed and goes through.
 * Braking from here would be the emergency stop nobody makes in traffic.
 */
const COMMITTED = 3;
/** How bright the aspect being shown is, against the two that are not. */
const LIT = 5.5;
const DARK = 0.12;

export class Traffic {
  private readonly cars: Car[] = [];
  private readonly lamps: Record<SignalAspect, PBRMaterial>;
  private aspect: SignalAspect = "green";
  private timer = 0;

  constructor(
    catalog: AssetCatalog,
    materials: CityMaterials,
    private readonly options: TrafficOptions,
  ) {
    this.lamps = {
      green: materials.signalLamp("green"),
      amber: materials.signalLamp("amber"),
      red: materials.signalLamp("red"),
    };
    this.showAspect("green");
    const random = makeRandom(options.seed);
    // One shuffled bag of body styles for the whole street rather than a
    // roll per car: two of the same shape nose to tail is the one thing that
    // makes generated traffic look generated.
    const bag = [...options.bodies];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    let dealt = 0;
    for (const lane of options.lanes) {
      const span = lane.to - lane.from;
      for (let i = 0; i < options.carsPerLane; i += 1) {
        const z = lane.from + ((i + random() * 0.6) / options.carsPerLane) * span;
        const body = bag[dealt % bag.length] ?? bag[0]!;
        dealt += 1;
        const node = catalog.spawn(body, {
          position: new Vector3(lane.x, lane.y, z),
          rotationY: lane.direction > 0 ? 0 : Math.PI,
          name: `car.${lane.x}.${i}`,
        });
        const cruise = 7 + random() * 3.5;
        this.cars.push({ node, lane, z, speed: cruise, cruise });
      }
    }
  }

  /** True while pedestrians have right of way. */
  get pedestriansMayCross(): boolean {
    return this.aspect === "red";
  }

  /** What every signal head on the street is showing. */
  get signal(): SignalAspect {
    return this.aspect;
  }

  /** Lights the aspect being shown and puts the other two out. */
  private showAspect(aspect: SignalAspect): void {
    this.aspect = aspect;
    for (const key of ["green", "amber", "red"] as const) {
      const material = this.lamps[key];
      const on = key === aspect;
      // These are unlit, so the brightness lives in the albedo; the emissive
      // is set alongside it so the two never say different things.
      const strength = on ? LIT : DARK;
      material.emissiveIntensity = strength;
      material.albedoColor = material.emissiveColor.scale(strength);
    }
  }

  update(dt: number): void {
    this.timer += dt;
    const held =
      this.aspect === "green"
        ? this.options.vehicleGreen
        : this.aspect === "amber"
          ? (this.options.amber ?? 3)
          : this.options.pedestrianGreen;
    if (this.timer >= held) {
      this.timer = 0;
      this.showAspect(
        this.aspect === "green" ? "amber" : this.aspect === "amber" ? "red" : "green",
      );
    }

    const carsMayGo = this.aspect === "green";
    for (const car of this.cars) {
      // Distance to the car in front, in this lane, in travel order.
      let gap = Infinity;
      for (const other of this.cars) {
        if (other === car || other.lane !== car.lane) continue;
        const ahead = (other.z - car.z) * car.lane.direction;
        if (ahead > 0 && ahead < gap) gap = ahead;
      }

      const toStopLine =
        (this.options.crossingZ - STOP_LINE * car.lane.direction - car.z) *
        car.lane.direction;
      // Red means stop at the line. Amber means the same, unless the line is
      // already under the bumper.
      const committed = this.aspect === "amber" && toStopLine < COMMITTED;
      const mustStop = !carsMayGo && !committed && toStopLine > 0 && toStopLine < SIGHT;

      let target = car.cruise;
      if (gap < HEADWAY) target = Math.max(0, car.cruise * (gap / HEADWAY - 0.15));
      if (mustStop) target = Math.min(target, Math.max(0, (toStopLine - 1.5) * 0.9));

      // Brake harder than you accelerate; it looks like a car and not a puck.
      const rate = target < car.speed ? 9 : 3.2;
      car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));

      car.z += car.speed * car.lane.direction * dt;
      const span = car.lane.to - car.lane.from;
      if (car.z > car.lane.to) car.z -= span;
      if (car.z < car.lane.from) car.z += span;
      car.node.position.z = car.z;
    }
  }

  get count(): number {
    return this.cars.length;
  }

  dispose(): void {
    for (const car of this.cars) car.node.dispose(false, true);
    this.cars.length = 0;
  }
}
