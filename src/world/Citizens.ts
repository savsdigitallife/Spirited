/**
 * The people on the street.
 *
 * These are the same body the player is: `buildHuman` builds both, so a
 * pedestrian has a face, a jaw, eyes with irises, knees and elbows, and
 * whatever they are wearing — not a capsule with a sphere on top.
 *
 * The constraint that shaped it is that a street needs twenty-odd people and
 * twenty individually built bodies is several hundred draw calls. So the
 * geometry is built once and instanced, and what makes each person themselves
 * is a **per-instance colour**: skin, hair, irises and every garment are
 * carried in a vertex buffer one entry per copy, so no two people on the
 * street share a colour while all of them share their vertices. Height is a
 * scale on the root; build, hair style and what they are wearing come from a
 * spec generated per person.
 *
 * Twenty-four people still cost about forty draw calls.
 *
 * Behaviour is a small state machine rather than pathfinding. People walk a
 * route, wait at the kerb when the signal is against them, stop to look at a
 * phone, stand in pairs and talk, go into a shop and come out of it again,
 * and put up an umbrella when it rains. Which of those they do depends on the
 * time of day.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { CityMaterials } from "./CityMaterials";
import { revolve } from "./Shapes";
import { makeRandom } from "./Noise";
import {
  buildHuman,
  buildHumanTemplates,
  type HumanTemplates,
  type JointName,
} from "../player/rig/HumanRig";
import { crowdReferenceSpec, crowdSpec, type HairStyle } from "../player/rig/CharacterSpec";

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
  joints: Record<JointName, TransformNode>;
  /** Shown only inside the detail radius. */
  detail: AbstractMesh[];
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

/** Where the rig rests its hips, in body heights. */
const HIP_HEIGHT = 0.53;

/**
 * What stops being drawn first.
 *
 * A face is a few pixels at the far end of the street. These go at
 * `DETAIL_RANGE`, which is about a third of the crowd's cost for something
 * nobody can see anyway.
 */
const FINE_PARTS: readonly string[] = [
  "eye", "iris", "pupil", "brow", "mouth", "nose", "hand",
  "stripe", "bagStrap", "bag", "collar", "pleat",
];

export class Citizens {
  private readonly people: Citizen[] = [];
  private readonly templates: Mesh[] = [];
  private readonly templateSets: HumanTemplates[] = [];
  private readonly options: CitizensOptions;
  private rainWetness = 0;
  private timeOfDay = 0.9;

  constructor(scene: Scene, materials: CityMaterials, options: CitizensOptions) {
    this.options = options;
    const random = makeRandom(options.seed);

    // One body's geometry, instanced into everybody. The parts come from a
    // reference person built a metre tall with every optional garment on, so
    // the set contains every part anyone might need; a person who is not
    // wearing a skirt simply never instances the skirt.
    //
    // Hair is the one thing whose *shape* differs, so each style gets its own
    // few meshes and shares the rest of the body with every other style.
    const styles: readonly HairStyle[] = ["long", "bob", "short", "tied", "cap"];
    const base = buildHumanTemplates(scene, crowdReferenceSpec("long"));
    this.templateSets.push(base);
    const byStyle = new Map<HairStyle, HumanTemplates>([["long", base]]);
    for (const style of styles) {
      if (style === "long") continue;
      const built = buildHumanTemplates(scene, crowdReferenceSpec(style));
      const hair = new Map<string, Mesh>();
      for (const [id, mesh] of built.parts) {
        if (id.startsWith("hair")) hair.set(id, mesh);
        else mesh.dispose();
      }
      byStyle.set(style, { parts: new Map([...base.parts, ...hair]), dispose: () => undefined });
      this.templateSets.push({
        parts: hair,
        dispose(): void {
          for (const mesh of hair.values()) mesh.dispose();
        },
      });
    }
    for (const set of this.templateSets) {
      for (const mesh of set.parts.values()) {
        mesh.addLODLevel(CULL_RANGE, null);
        this.templates.push(mesh);
      }
    }

    // Umbrellas and phones belong to nobody in particular, so they are built
    // and instanced the same way the bodies are.
    const prop = (mesh: Mesh, name: string, colour: Color3, roughness: number, metallic = 0): Mesh => {
      mesh.name = `citizen.${name}`;
      mesh.material = materials.painted(`citizen.${name}`, colour, roughness, metallic);
      mesh.setEnabled(false);
      mesh.isPickable = false;
      mesh.addLODLevel(CULL_RANGE, null);
      mesh.registerInstancedBuffer("color", 4);
      mesh.instancedBuffers.color = new Color4(1, 1, 1, 1);
      this.templates.push(mesh);
      return mesh;
    };
    const umbrella = prop(
      revolve(
        scene,
        "u",
        [
          [0, 0.2], [0.16, 0.14], [0.3, 0.055], [0.42, 0],
          [0.43, 0.015], [0.3, 0.075], [0.16, 0.16], [0, 0.215],
        ],
        12,
      ),
      "umbrella",
      new Color3(1, 1, 1),
      0.7,
    );
    const shaft = prop(
      CreateCylinder("s", { diameter: 0.018, height: 0.78, tessellation: 6 }, scene),
      "umbrellaShaft",
      new Color3(0.55, 0.55, 0.58),
      0.5,
      0.6,
    );
    const phone = CreateBox("citizen.phone", { width: 0.07, height: 0.13, depth: 0.01 }, scene);
    phone.material = materials.emissive("phoneScreen", new Color3(0.62, 0.78, 1), 0.7);
    phone.setEnabled(false);
    phone.isPickable = false;
    phone.addLODLevel(CULL_RANGE, null);
    this.templates.push(phone);
    const CANOPY: readonly [number, number, number][] = [
      [0.12, 0.13, 0.17], [0.68, 0.68, 0.7], [0.2, 0.3, 0.5],
      [0.5, 0.16, 0.2], [0.16, 0.32, 0.24], [0.75, 0.7, 0.3],
    ];

    // ------------------------------------------------------------- assembly
    for (let i = 0; i < options.count; i += 1) {
      const lane = options.lanes[Math.floor(random() * options.lanes.length)];
      if (!lane) continue;
      const spec = crowdSpec(random, i);
      const templates = byStyle.get(spec.hairStyle) ?? base;
      // Built a metre tall and then scaled, because the geometry is shared:
      // every proportion in the rig is a fraction of height, so one scale on
      // the root is a person of a different size rather than a stretched one.
      const rig = buildHuman(scene, { ...spec, height: 1 }, { from: templates });
      const root = rig.root;
      root.name = `citizen.${i}`;
      root.scaling.setAll(spec.height);

      const detail: AbstractMesh[] = [];
      for (const mesh of rig.meshes) {
        mesh.isPickable = false;
        const id = mesh.name.slice(mesh.name.lastIndexOf(".") + 1);
        if (FINE_PARTS.some((part) => id.startsWith(part))) detail.push(mesh);
      }

      const person: Citizen = {
        root,
        joints: rig.joints,
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
      const shade = CANOPY[Math.floor(random() * CANOPY.length)] ?? CANOPY[0]!;
      const canopy = umbrella.createInstance(`citizen.${i}.umbrella`);
      canopy.parent = root;
      canopy.position.set(0, 1.9, 0.05);
      canopy.instancedBuffers.color = new Color4(shade[0], shade[1], shade[2], 1);
      canopy.isPickable = false;
      canopy.setEnabled(false);
      const stick = shaft.createInstance(`citizen.${i}.umbrellaShaft`);
      stick.parent = root;
      stick.position.set(0, 1.52, 0.05);
      stick.isPickable = false;
      stick.setEnabled(false);
      person.umbrella = canopy;
      canopy.metadata = { shaft: stick };

      const screen = phone.createInstance(`citizen.${i}.phone`);
      screen.parent = rig.joints.wristL;
      screen.position.set(0.02, -0.05, -0.07);
      screen.isPickable = false;
      screen.setEnabled(false);
      person.phone = screen;
      detail.push(screen);

      this.people.push(person);
      this.place(person);
    }
  }


  private place(person: Citizen): void {
    person.root.position.set(person.lane.x + person.offsetX, person.lane.y, person.z);
    person.root.rotation.y = person.direction > 0 ? Math.PI : 0;
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
    person.root.rotation.y = person.direction > 0 ? Math.PI : 0;
  }

  private animate(dt: number, person: Citizen, raining: boolean): void {
    const j = person.joints;
    const still = person.activity === "waiting" || person.activity === "talking" || person.activity === "phone";
    const swing = still ? 0 : Math.sin(person.phase) * 0.5;

    // Knees and elbows, not only hips and shoulders. A leg that swings from
    // the hip with no bend in it is a pendulum and reads as one; the knee
    // folding on the back swing is most of what makes a walk a walk.
    j.thighL.rotation.x = swing;
    j.thighR.rotation.x = -swing;
    j.kneeL.rotation.x = (still ? 0 : 0.08) + Math.max(0, -swing) * 0.9;
    j.kneeR.rotation.x = (still ? 0 : 0.08) + Math.max(0, swing) * 0.9;
    j.ankleL.rotation.x = -j.kneeL.rotation.x * 0.4;
    j.ankleR.rotation.x = -j.kneeR.rotation.x * 0.4;
    j.shoulderL.rotation.x = -swing * 0.7;
    j.shoulderR.rotation.x = swing * 0.7;
    j.elbowL.rotation.x = 0.18 + Math.max(0, swing) * 0.5;
    j.elbowR.rotation.x = 0.18 + Math.max(0, -swing) * 0.5;
    // The body rises on each stride and the shoulders counter-rotate.
    j.hips.position.y = HIP_HEIGHT + (still ? 0 : Math.abs(Math.sin(person.phase)) * 0.012);
    j.spine.rotation.y = still ? 0 : Math.sin(person.phase) * 0.05;
    j.head.rotation.x = 0;

    if (person.activity === "phone") {
      // One arm up, head down over it.
      j.shoulderL.rotation.x = -0.85;
      j.elbowL.rotation.x = 1.45;
      j.shoulderR.rotation.x = 0.05;
      j.elbowR.rotation.x = 0.2;
      j.head.rotation.x = 0.4;
    }
    if (person.activity === "talking") {
      // A small, irregular gesture; enough to read as conversation.
      j.shoulderR.rotation.x = -0.45 + Math.sin(performance.now() / 420 + person.phase) * 0.25;
      j.elbowR.rotation.x = 0.9;
    }

    const wantUmbrella = raining && person.activity !== "inside";
    if (person.umbrella && person.umbrella.isEnabled() !== wantUmbrella) {
      person.umbrella.setEnabled(wantUmbrella);
      const shaft = (person.umbrella.metadata as { shaft?: InstancedMesh } | undefined)?.shaft;
      shaft?.setEnabled(wantUmbrella);
    }
    if (wantUmbrella) {
      j.shoulderR.rotation.x = -1.3;
      j.elbowR.rotation.x = 1.05;
    }
    void dt;
  }


  dispose(): void {
    for (const person of this.people) person.root.dispose(false, true);
    this.people.length = 0;
    for (const set of this.templateSets) set.dispose();
    this.templateSets.length = 0;
    for (const template of this.templates) template.dispose();
    this.templates.length = 0;
  }
}
