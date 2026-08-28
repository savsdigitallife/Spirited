/**
 * The people on the street.
 *
 * Replaces the first crowd, which was a capsule on two legs and read as a
 * skittle. The constraint that shaped this is that a street needs twenty-odd
 * people and twenty individually modelled characters is unaffordable — so
 * this is a parts bin: a couple of dozen unique meshes, each with one
 * material, instanced into as many bodies as the street needs. Variety comes
 * from which parts are chosen, how they are scaled and what they are
 * carrying, not from more geometry.
 *
 * Twenty-four people cost about twenty draw calls.
 *
 * Behaviour is a small state machine rather than pathfinding. People walk a
 * route, wait at the kerb when the signal is against them, stop to look at a
 * phone, stand in pairs and talk, go into a shop and come out of it again,
 * and put up an umbrella when it rains. Which of those they do depends on the
 * time of day.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { CityMaterials } from "./CityMaterials";
import { revolve } from "./Shapes";
import { makeRandom } from "./Noise";

export interface CitizenLane {
  /** Fixed cross-street position of the lane. */
  x: number;
  from: number;
  to: number;
  /** Pavement height. */
  y: number;
}

export interface Doorway {
  id: string;
  /** Where someone stands to go in. */
  at: Vector3;
  /** Which way they face to enter. */
  facing: number;
}

export interface CitizensOptions {
  count: number;
  lanes: readonly CitizenLane[];
  /** Along-street position of the crossing. */
  crossingZ: number;
  /** Doors people go in and out of. */
  doors: readonly Doorway[];
  seed: number;
}

type Activity = "walking" | "waiting" | "phone" | "talking" | "entering" | "inside" | "leaving";

interface Parts {
  root: TransformNode;
  hipL: TransformNode;
  hipR: TransformNode;
  shoulderL: TransformNode;
  shoulderR: TransformNode;
  /** Shown only inside the detail radius. */
  detail: InstancedMesh[];
  umbrella: InstancedMesh | null;
  phone: InstancedMesh | null;
}

interface Citizen extends Parts {
  lane: CitizenLane;
  offsetX: number;
  direction: number;
  /** Metres per second when walking. */
  pace: number;
  phase: number;
  z: number;
  activity: Activity;
  /** Seconds left in the current activity. */
  timer: number;
  door: Doorway | null;
  detailShown: boolean;
}

/** Beyond this, limbs stop animating and the small parts are hidden. */
const DETAIL_RANGE = 26;
/** Beyond this, the whole person is hidden; the LOD level does the culling. */
const CULL_RANGE = 85;
const STRIDE = 1.42;

/** Coats, trousers and hair, kept few so the draw calls stay few. */
const COAT_COLOURS: readonly [string, Color3][] = [
  ["charcoal", new Color3(0.1, 0.11, 0.13)],
  ["navy", new Color3(0.08, 0.11, 0.19)],
  ["camel", new Color3(0.32, 0.24, 0.16)],
  ["olive", new Color3(0.16, 0.18, 0.12)],
  ["cream", new Color3(0.5, 0.47, 0.42)],
  ["wine", new Color3(0.24, 0.1, 0.13)],
];
const LEG_COLOURS: readonly [string, Color3][] = [
  ["dark", new Color3(0.09, 0.09, 0.11)],
  ["denim", new Color3(0.15, 0.19, 0.26)],
  ["grey", new Color3(0.26, 0.26, 0.27)],
];
const SKIN_TONES: readonly [string, Color3][] = [
  ["light", new Color3(0.84, 0.68, 0.58)],
  ["mid", new Color3(0.7, 0.53, 0.42)],
  ["deep", new Color3(0.44, 0.31, 0.24)],
];
const HAIR_COLOURS: readonly [string, Color3][] = [
  ["black", new Color3(0.05, 0.045, 0.05)],
  ["brown", new Color3(0.15, 0.1, 0.07)],
  ["grey", new Color3(0.46, 0.45, 0.44)],
];

export class Citizens {
  private readonly people: Citizen[] = [];
  private readonly templates: Mesh[] = [];
  private readonly options: CitizensOptions;
  private rainWetness = 0;
  private timeOfDay = 0.9;

  constructor(scene: Scene, materials: CityMaterials, options: CitizensOptions) {
    this.options = options;
    const random = makeRandom(options.seed);

    const template = (mesh: Mesh, name: string, colour: Color3, roughness: number, metallic = 0): Mesh => {
      mesh.name = `citizen.${name}`;
      mesh.material = materials.painted(`citizen.${name}`, colour, roughness, metallic);
      mesh.setEnabled(false);
      mesh.isPickable = false;
      // One cull distance for every part, so a distant person vanishes whole.
      mesh.addLODLevel(CULL_RANGE, null);
      this.templates.push(mesh);
      return mesh;
    };

    // ---- torsos. A coat: shoulders, body, and a hem that flares slightly.
    const torsos = COAT_COLOURS.map(([name, colour]) => {
      const body = CreateCapsule(`t${name}`, { radius: 0.145, height: 0.62, tessellation: 8 }, scene);
      body.scaling.z = 0.72;
      return template(body, `torso.${name}`, colour, 0.86);
    });
    const hems = COAT_COLOURS.map(([name, colour]) => {
      const hem = revolve(
        scene,
        `h${name}`,
        [
          [0.148, 0],
          [0.168, -0.1],
          [0.176, -0.22],
          [0, -0.225],
        ],
        10,
      );
      hem.scaling.z = 0.74;
      return template(hem, `hem.${name}`, colour, 0.88);
    });
    const yokes = COAT_COLOURS.map(([name, colour]) => {
      const yoke = CreateCapsule(`y${name}`, { radius: 0.062, height: 0.33, tessellation: 8 }, scene);
      yoke.rotation.z = Math.PI / 2;
      yoke.scaling.z = 0.72;
      return template(yoke, `yoke.${name}`, colour, 0.86);
    });
    const arms = COAT_COLOURS.map(([name, colour]) => {
      const arm = CreateCapsule(`a${name}`, { radius: 0.05, height: 0.56, tessellation: 6 }, scene);
      return template(arm, `arm.${name}`, colour, 0.86);
    });

    // ---- legs and shoes
    const legs = LEG_COLOURS.map(([name, colour]) => {
      const leg = CreateCapsule(`l${name}`, { radius: 0.062, height: 0.82, tessellation: 6 }, scene);
      leg.position.y = -0.41;
      return template(leg, `leg.${name}`, colour, 0.88);
    });
    const shoe = template(
      CreateBox("shoe", { width: 0.085, height: 0.06, depth: 0.2 }, scene),
      "shoe",
      new Color3(0.06, 0.06, 0.07),
      0.5,
    );

    // ---- heads, faces and hair
    const heads = SKIN_TONES.map(([name, colour]) => {
      const head = CreateSphere(`hd${name}`, { diameter: 0.2, segments: 10 }, scene);
      head.scaling.set(0.9, 1.12, 0.98);
      return template(head, `head.${name}`, colour, 0.62);
    });
    // Eyes as one part: two dark ovals on a bar, which at three metres reads
    // as a face and costs a single instance.
    const eyes = template(
      CreateBox("eyes", { width: 0.115, height: 0.016, depth: 0.02 }, scene),
      "eyes",
      new Color3(0.06, 0.05, 0.06),
      0.35,
    );
    const hairStyles: Mesh[] = [];
    for (const [cname, colour] of HAIR_COLOURS) {
      // short
      const short = CreateSphere(`hs${cname}`, { diameter: 0.207, segments: 10 }, scene);
      short.scaling.set(0.98, 1.02, 1.04);
      hairStyles.push(template(short, `hair.short.${cname}`, colour, 0.4));
      // bob: cap plus a squared-off mass to the jaw
      const bob = CreateCapsule(`hb${cname}`, { radius: 0.108, height: 0.3, tessellation: 10 }, scene);
      bob.scaling.set(1, 1, 0.94);
      hairStyles.push(template(bob, `hair.bob.${cname}`, colour, 0.4));
      // tied back
      const tied = CreateCapsule(`ht${cname}`, { radius: 0.05, height: 0.34, tessellation: 6 }, scene);
      hairStyles.push(template(tied, `hair.tied.${cname}`, colour, 0.4));
    }

    // ---- what people carry
    const bag = template(
      CreateBox("bag", { width: 0.1, height: 0.26, depth: 0.14 }, scene),
      "bag",
      new Color3(0.2, 0.16, 0.13),
      0.75,
    );
    const shopper = template(
      CreateBox("shopper", { width: 0.2, height: 0.26, depth: 0.11 }, scene),
      "shopper",
      new Color3(0.72, 0.7, 0.64),
      0.9,
    );
    const phone = template(
      CreateBox("phone", { width: 0.07, height: 0.13, depth: 0.01 }, scene),
      "phone",
      new Color3(0.7, 0.85, 1),
      0.3,
    );
    phone.material = materials.emissive("phoneScreen", new Color3(0.62, 0.78, 1), 0.7);

    // An umbrella: a revolved canopy, a shaft and a handle. Revolved rather
    // than a cone, so the dome has a lip and reads as fabric over ribs.
    const canopy = revolve(
      scene,
      "umbrella",
      [
        [0, 0.2],
        [0.16, 0.14],
        [0.3, 0.055],
        [0.42, 0.0],
        [0.43, 0.015],
        [0.3, 0.075],
        [0.16, 0.16],
        [0, 0.215],
      ],
      12,
    );
    const umbrella = template(canopy, "umbrella", new Color3(0.12, 0.13, 0.17), 0.7);
    const shaft = template(
      CreateCylinder("umbrellaShaft", { diameter: 0.018, height: 0.78, tessellation: 6 }, scene),
      "umbrellaShaft",
      new Color3(0.1, 0.1, 0.11),
      0.5,
      0.6,
    );

    // ------------------------------------------------------------- assembly
    for (let i = 0; i < options.count; i += 1) {
      const lane = options.lanes[Math.floor(random() * options.lanes.length)];
      if (!lane) continue;
      const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)] ?? list[0]!;
      const coatIndex = Math.floor(random() * COAT_COLOURS.length);
      const root = new TransformNode(`citizen.${i}`, scene);
      const detail: InstancedMesh[] = [];

      const add = (source: Mesh, parent: TransformNode, at: Vector3, isDetail = false): InstancedMesh => {
        const instance = source.createInstance(`citizen.${i}.${source.name}`);
        instance.parent = parent;
        instance.position.copyFrom(at);
        instance.isPickable = false;
        if (isDetail) detail.push(instance);
        return instance;
      };

      // Height and build vary per person; everything else hangs off them.
      const height = 0.9 + random() * 0.2;
      root.scaling.setAll(height);

      add(torsos[coatIndex]!, root, new Vector3(0, 1.22, 0));
      add(hems[coatIndex]!, root, new Vector3(0, 1.02, 0));
      add(yokes[coatIndex]!, root, new Vector3(0, 1.44, 0), true);

      const head = add(pick(heads), root, new Vector3(0, 1.66, 0));
      void head;
      add(eyes, root, new Vector3(0, 1.68, -0.088), true);
      const hair = pick(hairStyles);
      const hairY = hair.name.includes("bob") ? 1.63 : hair.name.includes("tied") ? 1.6 : 1.675;
      const hairZ = hair.name.includes("tied") ? 0.085 : 0;
      add(hair, root, new Vector3(0, hairY, hairZ));

      const shoulderL = new TransformNode(`citizen.${i}.shoulderL`, scene);
      shoulderL.parent = root;
      shoulderL.position.set(-0.175, 1.44, 0);
      const shoulderR = new TransformNode(`citizen.${i}.shoulderR`, scene);
      shoulderR.parent = root;
      shoulderR.position.set(0.175, 1.44, 0);
      add(arms[coatIndex]!, shoulderL, new Vector3(0, -0.28, 0), true);
      add(arms[coatIndex]!, shoulderR, new Vector3(0, -0.28, 0), true);

      const hipL = new TransformNode(`citizen.${i}.hipL`, scene);
      hipL.parent = root;
      hipL.position.set(-0.085, 0.86, 0);
      const hipR = new TransformNode(`citizen.${i}.hipR`, scene);
      hipR.parent = root;
      hipR.position.set(0.085, 0.86, 0);
      const legMesh = pick(legs);
      add(legMesh, hipL, Vector3.Zero());
      add(legMesh, hipR, Vector3.Zero());
      add(shoe, hipL, new Vector3(0, -0.82, -0.05), true);
      add(shoe, hipR, new Vector3(0, -0.82, -0.05), true);

      // Something in the hands, most of the time.
      const carry = random();
      if (carry < 0.3) add(bag, shoulderR, new Vector3(0.02, -0.52, 0.03), true);
      else if (carry < 0.45) add(shopper, shoulderL, new Vector3(-0.02, -0.55, 0), true);

      const person: Citizen = {
        root,
        hipL,
        hipR,
        shoulderL,
        shoulderR,
        detail,
        umbrella: null,
        phone: null,
        lane,
        offsetX: (random() - 0.5) * 0.7,
        direction: random() < 0.5 ? 1 : -1,
        pace: 1.05 + random() * 0.55,
        phase: random() * Math.PI * 2,
        z: lane.from + random() * (lane.to - lane.from),
        activity: "walking",
        timer: 3 + random() * 12,
        door: null,
        detailShown: true,
      };

      // Umbrella and phone exist from the start but stay hidden until wanted;
      // creating instances during play would stutter.
      person.umbrella = add(umbrella, root, new Vector3(0, 1.9, 0.05));
      const stick = add(shaft, root, new Vector3(0, 1.52, 0.05));
      person.umbrella.setEnabled(false);
      stick.setEnabled(false);
      (person.umbrella.metadata as { shaft?: InstancedMesh } | undefined) ??
        (person.umbrella.metadata = {});
      (person.umbrella.metadata as { shaft?: InstancedMesh }).shaft = stick;

      person.phone = add(phone, shoulderL, new Vector3(0.06, -0.5, -0.12), true);
      person.phone.setEnabled(false);

      this.people.push(person);
      this.place(person);
    }
  }

  private place(person: Citizen): void {
    person.root.position.set(person.lane.x + person.offsetX, person.lane.y, person.z);
    person.root.rotation.y = person.direction > 0 ? 0 : Math.PI;
  }

  /** Every unique mesh, for registering shadow casters once. */
  get shadowTemplates(): readonly Mesh[] {
    return this.templates;
  }

  get population(): number {
    return this.people.length;
  }

  /** 0 dry, 1 downpour. Umbrellas go up and paces quicken. */
  setWetness(value: number): void {
    this.rainWetness = value;
  }

  /** Drives how many people are about and what they are doing. */
  setTimeOfDay(value: number): void {
    this.timeOfDay = value;
  }

  /**
   * How busy the street should be right now.
   *
   * A commuter peak in the morning, a lull through the middle of the day, a
   * long evening peak, and a thin late-night crowd. Nobody is created or
   * destroyed — people are simply present or not, which costs nothing.
   */
  private crowdFraction(): number {
    const hour = this.timeOfDay * 24;
    if (hour >= 7 && hour < 9.5) return 1;
    if (hour >= 9.5 && hour < 16) return 0.55;
    if (hour >= 16 && hour < 21) return 0.95;
    if (hour >= 21 && hour < 24) return 0.82;
    return 0.25;
  }

  update(dt: number, playerPosition: Vector3, canCross: boolean): void {
    const wanted = Math.round(this.people.length * this.crowdFraction());
    const raining = this.rainWetness > 0.35;

    for (const [index, person] of this.people.entries()) {
      const present = index < wanted;
      if (person.root.isEnabled() !== present) person.root.setEnabled(present);
      if (!present) continue;

      this.think(dt, person, canCross, raining);
      this.move(dt, person);

      const distance = Vector3.Distance(person.root.position, playerPosition);
      const detailed = distance < DETAIL_RANGE;
      if (detailed !== person.detailShown) {
        person.detailShown = detailed;
        for (const part of person.detail) part.setEnabled(detailed);
      }
      if (detailed) this.animate(dt, person, raining);
    }
  }

  /** Chooses what someone is doing, and for how long. */
  private think(dt: number, person: Citizen, canCross: boolean, raining: boolean): void {
    person.timer -= dt;

    // The kerb overrides everything: nobody steps out on a red.
    const nearCrossing = Math.abs(person.z - this.options.crossingZ) < 3.5;
    const headingIntoIt =
      Math.sign(this.options.crossingZ - person.z) === person.direction && nearCrossing;
    if (headingIntoIt && !canCross && person.activity === "walking") {
      person.activity = "waiting";
      return;
    }
    if (person.activity === "waiting") {
      if (canCross || !nearCrossing) person.activity = "walking";
      return;
    }

    if (person.timer > 0) return;

    switch (person.activity) {
      case "walking": {
        const roll = Math.random();
        // Late at night people head for the lit doors; in the day they walk.
        const doorChance = this.timeOfDay > 0.85 || this.timeOfDay < 0.05 ? 0.35 : 0.2;
        if (roll < doorChance && this.options.doors.length > 0) {
          const door =
            this.options.doors[Math.floor(Math.random() * this.options.doors.length)] ?? null;
          if (door && Math.abs(door.at.z - person.z) < 14) {
            person.door = door;
            person.activity = "entering";
            person.timer = 8;
            break;
          }
        }
        if (roll < doorChance + 0.18 && !raining) {
          person.activity = "phone";
          person.timer = 4 + Math.random() * 7;
          person.phone?.setEnabled(person.detailShown);
        } else if (roll < doorChance + 0.26) {
          person.activity = "talking";
          person.timer = 6 + Math.random() * 8;
        } else {
          person.timer = 6 + Math.random() * 14;
        }
        break;
      }
      case "phone":
        person.phone?.setEnabled(false);
        person.activity = "walking";
        person.timer = 8 + Math.random() * 12;
        break;
      case "talking":
        person.activity = "walking";
        person.timer = 8 + Math.random() * 12;
        break;
      case "entering":
        // Arrived, or gave up trying to get there.
        person.activity = "inside";
        person.timer = 10 + Math.random() * 25;
        person.root.setEnabled(false);
        break;
      case "inside":
        person.activity = "leaving";
        person.timer = 2;
        person.root.setEnabled(true);
        if (person.door) {
          person.z = person.door.at.z;
          person.direction = Math.random() < 0.5 ? 1 : -1;
        }
        break;
      case "leaving":
        person.door = null;
        person.activity = "walking";
        person.timer = 10 + Math.random() * 14;
        break;
    }
  }

  private move(dt: number, person: Citizen): void {
    if (person.activity === "waiting" || person.activity === "talking" || person.activity === "inside") {
      return;
    }

    if (person.activity === "entering" && person.door) {
      // Walk to the door, then sidle across the pavement into it.
      const toDoor = person.door.at.z - person.z;
      person.z += Math.sign(toDoor) * Math.min(Math.abs(toDoor), person.pace * dt);
      const wantX = person.door.at.x;
      const x = person.root.position.x;
      person.root.position.x = x + Math.sign(wantX - x) * Math.min(Math.abs(wantX - x), person.pace * dt);
      person.root.position.z = person.z;
      person.phase += (person.pace / STRIDE) * Math.PI * 2 * dt;
      if (Math.abs(toDoor) < 0.4 && Math.abs(wantX - x) < 0.4) person.timer = 0;
      return;
    }

    // Rain makes people walk faster and look at their feet.
    const pace = person.pace * (person.activity === "phone" ? 0.6 : 1) * (this.rainWetness > 0.35 ? 1.2 : 1);
    person.z += pace * person.direction * dt;
    if (person.z > person.lane.to) person.z = person.lane.from;
    if (person.z < person.lane.from) person.z = person.lane.to;
    person.phase += (pace / STRIDE) * Math.PI * 2 * dt;
    person.root.position.z = person.z;
    person.root.position.x = person.lane.x + person.offsetX;
    person.root.rotation.y = person.direction > 0 ? 0 : Math.PI;
  }

  private animate(dt: number, person: Citizen, raining: boolean): void {
    const still = person.activity === "waiting" || person.activity === "talking" || person.activity === "phone";
    const swing = still ? 0 : Math.sin(person.phase) * 0.5;
    person.hipL.rotation.x = swing;
    person.hipR.rotation.x = -swing;
    person.shoulderL.rotation.x = -swing * 0.7;
    person.shoulderR.rotation.x = swing * 0.7;

    if (person.activity === "phone") {
      // One arm up, head down over it.
      person.shoulderL.rotation.x = -1.15;
      person.shoulderR.rotation.x = 0.05;
    }
    if (person.activity === "talking") {
      // A small, irregular gesture; enough to read as conversation.
      person.shoulderR.rotation.x = -0.5 + Math.sin(performance.now() / 420 + person.phase) * 0.25;
    }

    const wantUmbrella = raining && person.activity !== "inside";
    if (person.umbrella && person.umbrella.isEnabled() !== wantUmbrella) {
      person.umbrella.setEnabled(wantUmbrella);
      const shaft = (person.umbrella.metadata as { shaft?: InstancedMesh } | undefined)?.shaft;
      shaft?.setEnabled(wantUmbrella);
      if (wantUmbrella) person.shoulderR.rotation.x = -1.35;
    }
    void dt;
  }

  dispose(): void {
    for (const person of this.people) person.root.dispose(false, true);
    this.people.length = 0;
    for (const template of this.templates) template.dispose();
    this.templates.length = 0;
  }
}
