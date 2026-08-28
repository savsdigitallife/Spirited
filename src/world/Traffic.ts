/**
 * Traffic, and the signal that governs it.
 *
 * The signal is the single clock both cars and pedestrians read, so a walker
 * never steps out in front of a car that has right of way. Cars drive their
 * lane, close up on the vehicle ahead, and stop at the line when the light
 * is against them.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetCatalog } from "../engine/AssetCatalog";
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
  /** Along-street position of the junction. */
  crossingZ: number;
  /** Seconds of green for vehicles, then for pedestrians. */
  vehicleGreen: number;
  pedestrianGreen: number;
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

export class Traffic {
  private readonly cars: Car[] = [];
  private phase = 0;
  private timer = 0;

  constructor(
    catalog: AssetCatalog,
    private readonly options: TrafficOptions,
  ) {
    const random = makeRandom(options.seed);
    for (const lane of options.lanes) {
      const span = lane.to - lane.from;
      for (let i = 0; i < options.carsPerLane; i += 1) {
        const z = lane.from + ((i + random() * 0.6) / options.carsPerLane) * span;
        const node = catalog.spawn("tokyo_car_01", {
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
    return this.phase === 1;
  }

  update(dt: number): void {
    this.timer += dt;
    const limit =
      this.phase === 0 ? this.options.vehicleGreen : this.options.pedestrianGreen;
    if (this.timer >= limit) {
      this.timer = 0;
      this.phase = this.phase === 0 ? 1 : 0;
    }

    const carsMayGo = this.phase === 0;
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
      const mustStop = !carsMayGo && toStopLine > 0 && toStopLine < 22;

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
