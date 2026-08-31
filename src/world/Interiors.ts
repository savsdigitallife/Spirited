/**
 * Rooms you can walk into.
 *
 * The visual interiors behind the other shop windows are dressing; these are
 * places. They have collidable floors and furniture, a doorway with no glass
 * across it, their own light, staff and customers built from the same rig as
 * the player, and things to do in them.
 *
 * They live in the street's own scene rather than as separate regions. A
 * doorway you walk through with no load is worth a great deal, and a room
 * this size costs less than the frontage in front of it.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { Character } from "../player/Character";
import type { CharacterSpec } from "../player/rig/CharacterSpec";
import { revolve, chamferedBlock } from "./Shapes";
import { makeGlass } from "./Glass";
import { ramenHouse, type RamenHouse } from "./Ramen";

export type InteriorKind = "ramen" | "konbini" | "cafe";

export interface EnterableSpec {
  id: string;
  kind: InteriorKind;
  /** The building line. */
  faceX: number;
  /** +1 or -1: which way is out, across the pavement. */
  out: number;
  /** Centre of the frontage along the street. */
  z: number;
  /** Along-street position of the doorway. */
  doorZ: number;
  /** Room width along the street. */
  width: number;
  /** Room depth into the building. */
  depth: number;
  height: number;
  /** Which house a ramen shop is fitted out as. */
  house?: RamenHouse;
}

export interface Seat {
  /** Where she sits. */
  at: Vector3;
  facing: number;
  taken: boolean;
}

export interface EnterableRoom {
  id: string;
  kind: InteriorKind;
  /** A standing shop: there is nowhere to sit, and nobody expects to. */
  standing: boolean;
  /** Just outside the door, on the pavement. */
  entrance: Vector3;
  /** Just inside the door. */
  threshold: Vector3;
  seats: Seat[];
  /** Where the person who works here stands. */
  counterAt: Vector3;
  contains(point: Vector3): boolean;
  update(dt: number, playerPosition: Vector3): void;
  dispose(): void;
}

/**
 * How each trade lights and finishes its room.
 *
 * The rooms carry their own light — the street lamps are all outside — so
 * every surface is given an emissive fraction of its own albedo as well.
 * That fraction is what decides whether a room reads as warm or clinical
 * from the pavement, and it matters more than the point light does.
 */
const PALETTE: Record<
  InteriorKind,
  {
    wall: Color3;
    wallGlow: number;
    /** The band around the bottom of the walls, and its rail. */
    dado: Color3;
    floor: Color3;
    floorGlow: number;
    lamp: Color3;
    intensity: number;
  }
> = {
  ramen: {
    wall: new Color3(0.29, 0.2, 0.14),
    wallGlow: 0.3,
    dado: new Color3(0.33, 0.13, 0.09),
    floor: new Color3(0.16, 0.13, 0.11),
    floorGlow: 0.3,
    lamp: new Color3(1, 0.8, 0.52),
    intensity: 14,
  },
  konbini: {
    wall: new Color3(0.76, 0.77, 0.76),
    wallGlow: 0.5,
    dado: new Color3(0.52, 0.54, 0.56),
    floor: new Color3(0.62, 0.62, 0.6),
    floorGlow: 0.35,
    lamp: new Color3(0.92, 0.96, 1),
    intensity: 22,
  },
  cafe: {
    wall: new Color3(0.74, 0.62, 0.64),
    wallGlow: 0.3,
    dado: new Color3(0.42, 0.24, 0.31),
    floor: new Color3(0.34, 0.24, 0.24),
    floorGlow: 0.32,
    lamp: new Color3(1, 0.83, 0.86),
    intensity: 15,
  },
};

const STAFF_RAMEN: CharacterSpec = {
  name: "cook",
  height: 1.7,
  build: 0.55,
  skin: new Color3(0.76, 0.6, 0.5),
  hairColour: new Color3(0.06, 0.05, 0.05),
  eyeColour: new Color3(0.16, 0.12, 0.1),
  hairStyle: "short",
  face: true,
  simulatedHair: false,
  outfit: {
    style: "work",
    top: new Color3(0.82, 0.8, 0.75),
    bottom: new Color3(0.14, 0.14, 0.16),
    hose: new Color3(0.14, 0.14, 0.16),
    shoes: new Color3(0.1, 0.1, 0.1),
    accent: new Color3(0.2, 0.16, 0.13),
    skirt: false,
    bag: false,
  },
};

const STAFF_KONBINI: CharacterSpec = {
  ...STAFF_RAMEN,
  name: "clerk",
  height: 1.63,
  build: 0.3,
  hairStyle: "tied",
  outfit: {
    ...STAFF_RAMEN.outfit,
    top: new Color3(0.28, 0.42, 0.58),
    accent: new Color3(0.72, 0.72, 0.2),
  },
};

const PATRON: CharacterSpec = {
  ...STAFF_RAMEN,
  name: "patron",
  height: 1.68,
  build: 0.45,
  face: false,
  hairStyle: "short",
  outfit: {
    ...STAFF_RAMEN.outfit,
    top: new Color3(0.16, 0.17, 0.2),
  },
};

/**
 * The café's staff.
 *
 * An original house uniform: a dark pinafore over a pale blouse, a cream
 * apron and band. It belongs to this shop and to no other, here or
 * elsewhere.
 */
const STAFF_CAFE: CharacterSpec = {
  ...STAFF_RAMEN,
  name: "server",
  height: 1.6,
  build: 0.28,
  hairStyle: "tied",
  face: true,
  outfit: {
    ...STAFF_RAMEN.outfit,
    top: new Color3(0.16, 0.13, 0.19),
    bottom: new Color3(0.16, 0.13, 0.19),
    hose: new Color3(0.9, 0.89, 0.88),
    shoes: new Color3(0.14, 0.11, 0.13),
    accent: new Color3(0.96, 0.92, 0.9),
    skirt: true,
  },
};

/** Steam, for the pots. One system per room, off when nobody is near. */
function steamSystem(scene: Scene, at: Vector3): ParticleSystem {
  const texture = new DynamicTexture("steam", { width: 32, height: 32 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,0.75)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  texture.update(false);
  texture.hasAlpha = true;

  const steam = new ParticleSystem("steam", 90, scene);
  steam.particleTexture = texture;
  steam.emitter = at.clone();
  steam.minEmitBox = new Vector3(-0.25, 0, -0.35);
  steam.maxEmitBox = new Vector3(0.25, 0, 0.35);
  steam.color1 = new Color4(1, 0.97, 0.92, 0.24);
  steam.color2 = new Color4(0.92, 0.94, 1, 0.16);
  steam.colorDead = new Color4(1, 1, 1, 0);
  steam.minSize = 0.14;
  steam.maxSize = 0.5;
  steam.minLifeTime = 1.4;
  steam.maxLifeTime = 2.8;
  steam.emitRate = 22;
  steam.direction1 = new Vector3(-0.1, 1, -0.1);
  steam.direction2 = new Vector3(0.1, 1.4, 0.1);
  steam.minEmitPower = 0.18;
  steam.maxEmitPower = 0.42;
  steam.gravity = new Vector3(0, 0.35, 0);
  steam.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  steam.start();
  return steam;
}

/** Past this, a room's staff and customers are switched off entirely. */
const CROWD_RANGE = 24;

export function buildEnterable(
  scene: Scene,
  spec: EnterableSpec,
  register: (mesh: Mesh) => void,
): EnterableRoom {
  const parts: Mesh[] = [];
  const cache = new Map<string, PBRMaterial>();
  const surface = (name: string, colour: Color3, roughness = 0.8, metallic = 0, glow = 0.5): Material => {
    const cached = cache.get(name);
    if (cached) return cached;
    const material = new PBRMaterial(`room.${spec.id}.${name}`, scene);
    material.albedoColor = colour;
    material.roughness = roughness;
    material.metallic = metallic;
    // Rooms carry their own light, as the visual interiors do.
    material.emissiveColor = colour.scale(glow);
    cache.set(name, material);
    return material;
  };

  const inward = -spec.out;
  const backX = spec.faceX + inward * spec.depth;
  const put = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: Material,
    collides = false,
  ): Mesh => {
    const mesh = CreateBox(`room.${spec.id}.${name}`, size, scene);
    mesh.position.copyFrom(at);
    mesh.material = material;
    mesh.checkCollisions = collides;
    mesh.isPickable = collides;
    mesh.receiveShadows = false;
    parts.push(mesh);
    register(mesh);
    return mesh;
  };

  const midX = spec.faceX + inward * spec.depth * 0.5;
  const house = spec.house;
  const palette = house
    ? {
        wall: house.interior.wall,
        wallGlow: 0.3,
        dado: house.interior.counterTop.scale(0.6),
        floor: house.interior.floor,
        floorGlow: 0.3,
        lamp: house.interior.lamp,
        intensity: house.interior.lampIntensity,
      }
    : PALETTE[spec.kind];
  const wall = surface("wall", palette.wall, 0.86, 0, palette.wallGlow);

  put("floor", { width: spec.depth, height: 0.12, depth: spec.width }, new Vector3(midX, -0.06, spec.z), surface("floor", palette.floor, 0.6, 0, palette.floorGlow), true);
  put("ceiling", { width: spec.depth, height: 0.12, depth: spec.width }, new Vector3(midX, spec.height, spec.z), wall);
  put("back", { width: 0.2, height: spec.height, depth: spec.width }, new Vector3(backX, spec.height / 2, spec.z), wall, true);
  for (const side of [-1, 1] as const) {
    put(`side${side}`, { width: spec.depth, height: spec.height, depth: 0.2 }, new Vector3(midX, spec.height / 2, spec.z + side * spec.width / 2), wall, true);
  }

  // A dado band around the room with a rail on top of it. One horizontal
  // break is most of what stops a bare wall reading as a blank screen.
  const dado = surface("dado", palette.dado, 0.8, 0, palette.wallGlow * 0.95);
  const rail = surface("dadoRail", palette.dado.scale(0.55), 0.7, 0, palette.wallGlow * 0.8);
  put("dadoBack", { width: 0.06, height: 1.02, depth: spec.width - 0.2 }, new Vector3(backX - inward * 0.13, 0.51, spec.z), dado);
  put("railBack", { width: 0.1, height: 0.07, depth: spec.width - 0.2 }, new Vector3(backX - inward * 0.15, 1.05, spec.z), rail);
  for (const side of [-1, 1] as const) {
    put(`dado${side}`, { width: spec.depth - 0.3, height: 1.02, depth: 0.06 }, new Vector3(midX, 0.51, spec.z + side * (spec.width / 2 - 0.13)), dado);
    put(`rail${side}`, { width: spec.depth - 0.3, height: 0.07, depth: 0.1 }, new Vector3(midX, 1.05, spec.z + side * (spec.width / 2 - 0.15)), rail);
  }

  // Its own light. One per room: enough for contrast against the street,
  // and it is what makes a doorway read as somewhere warmer than outside.
  const lamp = new PointLight(`room.${spec.id}.light`, new Vector3(midX, spec.height - 0.4, spec.z), scene);
  lamp.diffuse = palette.lamp;
  lamp.specular = lamp.diffuse.scale(0.4);
  lamp.intensity = palette.intensity;
  lamp.range = 14;

  put(
    "ceilingLight",
    { width: spec.depth * 0.65, height: 0.06, depth: spec.width * 0.5 },
    new Vector3(midX, spec.height - 0.14, spec.z),
    surface("tube", palette.lamp, 0.4, 0, spec.kind === "konbini" ? 1.5 : 1.1),
  );

  const seats: Seat[] = [];
  const people: Character[] = [];
  let steam: ParticleSystem | null = null;
  let counterAt = new Vector3(midX, 0, spec.z);

  if (spec.kind === "ramen") {
    // Every house is fitted out differently: a straight counter with stools,
    // a standing shop with nowhere to sit, or a horseshoe with the kitchen
    // in the middle of it. What they share is the back line — pots, hood,
    // steam — because that is the part the trade decides, not the owner.
    const shop = house ?? ramenHouse(undefined);
    const plan = shop.interior.plan;
    const wood = surface("counterTop", shop.interior.counterTop, 0.4, 0, 0.5);
    const body = surface("counterSide", shop.interior.counterTop.scale(0.6), 0.75);
    const steel = surface("steel", new Color3(0.55, 0.56, 0.58), 0.32, 0.8, 0.35);
    const stoolColour = surface("stool", shop.interior.stool, 0.65);
    const counterHeight = plan === "standing" ? 1.08 : 1.02;

    // The kitchen line, and what is boiling on it.
    put("kitchen", { width: 0.75, height: 0.95, depth: spec.width - 0.5 }, new Vector3(backX - inward * 0.5, 0.47, spec.z), steel, true);
    put("hood", { width: 0.9, height: 0.5, depth: spec.width - 0.5 }, new Vector3(backX - inward * 0.5, spec.height - 0.5, spec.z), steel);
    for (let i = 0; i < 3; i += 1) {
      const pot = revolve(
        scene,
        `room.${spec.id}.pot${i}`,
        [[0, 0], [0.19, 0], [0.2, 0.06], [0.2, 0.3], [0.22, 0.32], [0.19, 0.33], [0, 0.33]],
        12,
      );
      pot.position.set(backX - inward * 0.5, 0.98, spec.z - 1 + i);
      pot.material = steel;
      parts.push(pot);
      register(pot);
    }
    steam = steamSystem(scene, new Vector3(backX - inward * 0.5, 1.3, spec.z));

    /** Lays a run of counter, and returns where a person at it would stand. */
    const counterRun = (
      name: string,
      size: { width: number; depth: number },
      at: Vector3,
    ): void => {
      put(`${name}Top`, { width: size.width, height: 0.08, depth: size.depth }, new Vector3(at.x, counterHeight, at.z), wood, true);
      put(`${name}Body`, { width: size.width - 0.1, height: counterHeight - 0.02, depth: size.depth - 0.02 }, new Vector3(at.x, (counterHeight - 0.02) / 2, at.z), body, true);
    };

    const stool = (x: number, z: number, index: number): void => {
      const seat = revolve(scene, `room.${spec.id}.stool${index}`, [[0, 0], [0.16, 0.01], [0.17, 0.05], [0, 0.06]], 12);
      seat.position.set(x, 0.66, z);
      seat.material = stoolColour;
      parts.push(seat);
      register(seat);
      const leg = CreateCylinder(`room.${spec.id}.stoolLeg${index}`, { diameter: 0.07, height: 0.63, tessellation: 8 }, scene);
      leg.position.set(x, 0.32, z);
      leg.material = steel;
      parts.push(leg);
      register(leg);
    };

    const counterX = spec.faceX + inward * (spec.depth * (plan === "standing" ? 0.46 : 0.55));
    const facingCounter = spec.out > 0 ? -Math.PI / 2 : Math.PI / 2;

    if (plan === "horseshoe") {
      // A counter round three sides, so half the room is looking at the
      // cook and the other half at each other.
      counterRun("counter", { width: 0.8, depth: spec.width - 0.6 }, new Vector3(counterX, 0, spec.z));
      for (const side of [-1, 1] as const) {
        const z = spec.z + side * (spec.width / 2 - 0.75);
        counterRun(`counterWing${side}`, { width: spec.depth * 0.34, depth: 0.7 }, new Vector3(counterX - inward * (spec.depth * 0.19), 0, z));
      }
      const stools = Math.max(4, Math.round((spec.width - 1.6) / 0.72));
      for (let i = 0; i < stools; i += 1) {
        const z = spec.z - (spec.width - 1.8) / 2 + (i / Math.max(1, stools - 1)) * (spec.width - 1.8);
        const x = counterX - inward * 0.9;
        stool(x, z, i);
        seats.push({ at: new Vector3(x, 0, z), facing: facingCounter, taken: false });
      }
      // And two along each wing, facing across the room.
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < 2; i += 1) {
          const x = counterX - inward * (spec.depth * 0.12 + i * 0.72);
          const z = spec.z + side * (spec.width / 2 - 1.45);
          stool(x, z, 20 + side * 5 + i);
          seats.push({ at: new Vector3(x, 0, z), facing: side > 0 ? 0 : Math.PI, taken: false });
        }
      }
    } else if (plan === "standing") {
      // No stools at all: a high counter, a shelf along the wall, and
      // everybody out again in ten minutes.
      counterRun("counter", { width: 0.62, depth: spec.width - 0.5 }, new Vector3(counterX, 0, spec.z));
      counterRun("shelf", { width: spec.depth * 0.3, depth: 0.42 }, new Vector3(spec.faceX + inward * (spec.depth * 0.22), 0, spec.z + spec.width / 2 - 0.45));
      const spots = Math.max(4, Math.round((spec.width - 1) / 0.72));
      for (let i = 0; i < spots; i += 1) {
        const z = spec.z - (spec.width - 1.2) / 2 + (i / Math.max(1, spots - 1)) * (spec.width - 1.2);
        seats.push({ at: new Vector3(counterX - inward * 0.72, 0, z), facing: facingCounter, taken: false });
      }
      // The tray return, and the water jug everyone helps themselves to.
      put("trayShelf", { width: 0.4, height: 0.06, depth: 0.9 }, new Vector3(spec.faceX + inward * 0.55, 1.15, spec.z - spec.width / 2 + 0.7), steel);
      for (let i = 0; i < 3; i += 1) {
        put(`tray${i}`, { width: 0.34, height: 0.03, depth: 0.28 }, new Vector3(spec.faceX + inward * 0.55, 1.2 + i * 0.035, spec.z - spec.width / 2 + 0.45 + i * 0.02), surface("tray", new Color3(0.35, 0.12, 0.1), 0.5));
      }
    } else {
      counterRun("counter", { width: 0.8, depth: spec.width - 0.6 }, new Vector3(counterX, 0, spec.z));
      const stools = Math.max(4, Math.round((spec.width - 1.2) / 0.68));
      for (let i = 0; i < stools; i += 1) {
        const z = spec.z - (spec.width - 1.4) / 2 + (i / Math.max(1, stools - 1)) * (spec.width - 1.4);
        const x = counterX - inward * 0.85;
        stool(x, z, i);
        seats.push({ at: new Vector3(x, 0, z), facing: facingCounter, taken: false });
      }
    }

    // Menu strips over the counter: every house has them, and every house
    // has a different number of things it will admit to selling.
    const strips = shop.interior.decor === "spartan" ? 8 : 6;
    for (let i = 0; i < strips; i += 1) {
      put(
        `menu${i}`,
        { width: 0.05, height: 0.46, depth: 0.16 },
        new Vector3(backX - inward * 0.12, spec.height - 0.78, spec.z - spec.width * 0.34 + i * (spec.width * 0.68) / (strips - 1)),
        surface("menu", new Color3(1, 0.94, 0.76), 0.5, 0, 1.2),
      );
    }

    // The cook, at the pots, working. And in the busier houses, a second
    // pair of hands on the other end of the line.
    counterAt = new Vector3(counterX + inward * 0.55, 0, spec.z);
    const cook = new Character(scene, { ...STAFF_RAMEN, name: `cook.${shop.id}` });
    cook.root.position.copyFrom(counterAt);
    cook.root.rotation.y = spec.out > 0 ? Math.PI / 2 : -Math.PI / 2;
    cook.settle();
    cook.play("cook");
    people.push(cook);
    if (shop.interior.assistant) {
      const hand = new Character(scene, {
        ...STAFF_RAMEN,
        name: `hand.${shop.id}`,
        height: 1.62,
        build: 0.4,
        hairStyle: "tied",
      });
      hand.root.position.set(counterAt.x, 0, spec.z + spec.width * 0.3);
      hand.root.rotation.y = cook.root.rotation.y;
      hand.settle();
      hand.play("cook");
      people.push(hand);
    }

    // Whoever is eating, and the bowls in front of them.
    const takenCount = Math.min(shop.interior.patrons, seats.length);
    for (let n = 0; n < takenCount; n += 1) {
      const index = Math.min(seats.length - 1, 1 + Math.round(n * (seats.length - 2) / Math.max(1, takenCount)));
      const seat = seats[index];
      if (!seat || seat.taken) continue;
      seat.taken = true;
      const patron = new Character(scene, { ...PATRON, name: `patron.${shop.id}.${n}` });
      patron.root.position.copyFrom(seat.at);
      patron.root.rotation.y = seat.facing;
      patron.settle();
      patron.play(plan === "standing" ? "eatStanding" : "eat");
      people.push(patron);
      const bowl = revolve(scene, `room.${spec.id}.bowl${index}`, [[0, 0], [0.11, 0.005], [0.13, 0.07], [0.125, 0.075], [0.1, 0.02], [0, 0.015]], 12);
      bowl.position.set(counterX, counterHeight + 0.04, seat.at.z);
      bowl.material = surface("bowl", new Color3(0.86, 0.84, 0.78), 0.35, 0, 0.5);
      parts.push(bowl);
      register(bowl);
    }

    // Noren over the doorway, hung on the inside, in the house's colour.
    const norenCloth = surface(`noren.${shop.id}`, shop.noren, 0.9, 0, 0.6);
    put("norenRail", { width: 0.07, height: 0.07, depth: 1.8 }, new Vector3(spec.faceX + inward * 0.4, 2.3, spec.doorZ), body);
    for (let i = 0; i < shop.norenPanels; i += 1) {
      put(
        `noren${i}`,
        { width: 0.04, height: 0.62, depth: 0.3 },
        new Vector3(spec.faceX + inward * 0.4, 1.95, spec.doorZ - 0.68 + i * (1.36 / Math.max(1, shop.norenPanels - 1))),
        norenCloth,
      );
    }

    // Decor. The quiet house has a couple of lanterns and a calendar; the
    // loud one has lanterns, a shelf of bottles and posters everywhere; the
    // standing shop has a clock and a price list and nothing else at all.
    if (shop.interior.decor !== "spartan") {
      const lanternPaper = surface(`lanternIn.${shop.id}`, new Color3(0.95, 0.34, 0.17), 0.7, 0, 0.85);
      const cordColour = surface("cord", new Color3(0.09, 0.08, 0.08), 0.8);
      const lanterns = shop.interior.decor === "loud" ? 4 : 3;
      for (let i = 0; i < lanterns; i += 1) {
        const z = spec.z - spec.width * 0.32 + i * ((spec.width * 0.64) / Math.max(1, lanterns - 1));
        const lantern = revolve(
          scene,
          `room.${spec.id}.lantern${i}`,
          [[0, 0], [0.09, 0.015], [0.16, 0.11], [0.17, 0.2], [0.16, 0.3], [0.09, 0.38], [0, 0.395]],
          12,
        );
        lantern.position.set(spec.faceX + inward * 1.15, 2.05, z);
        lantern.material = lanternPaper;
        parts.push(lantern);
        register(lantern);
        put(`lanternCord${i}`, { width: 0.03, height: 0.5, depth: 0.03 }, new Vector3(spec.faceX + inward * 1.15, 2.68, z), cordColour);
      }
    }

    const posters = shop.interior.decor === "loud" ? 7 : shop.interior.decor === "homely" ? 4 : 2;
    for (let i = 0; i < posters; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      put(
        `poster${i}`,
        { width: 0.46, height: 0.6, depth: 0.03 },
        new Vector3(spec.faceX + inward * (2.2 + Math.floor(i / 2) * 1.5), 1.85 + (i % 3) * 0.12, spec.z + side * (spec.width / 2 - 0.13)),
        surface(`poster${i}`, new Color3(0.94, 0.9 - (i % 4) * 0.14, 0.55 + (i % 4) * 0.09), 0.7, 0, 0.5),
      );
    }

    if (shop.interior.decor === "loud") {
      // A shelf of bottles the regulars keep, and a television nobody
      // watches, which is what the back wall of one of these looks like.
      put("bottleShelf", { width: 0.26, height: 0.06, depth: spec.width * 0.5 }, new Vector3(backX - inward * 0.16, 1.95, spec.z), body);
      for (let i = 0; i < 9; i += 1) {
        const bottle = CreateCylinder(`room.${spec.id}.bottle${i}`, { diameter: 0.09, height: 0.3, tessellation: 8 }, scene);
        bottle.position.set(backX - inward * 0.16, 2.13, spec.z - spec.width * 0.22 + i * (spec.width * 0.44) / 8);
        bottle.material = surface(i % 2 ? "bottleGreen" : "bottleAmber", i % 2 ? new Color3(0.12, 0.28, 0.16) : new Color3(0.45, 0.28, 0.09), 0.3, 0, 0.5);
        parts.push(bottle);
        register(bottle);
      }
      put("tv", { width: 0.09, height: 0.44, depth: 0.76 }, new Vector3(spec.faceX + inward * 0.5, 2.35, spec.z - spec.width / 2 + 0.9), surface("tvScreen", new Color3(0.55, 0.7, 0.85), 0.35, 0, 0.9));
    }

    if (shop.interior.decor === "homely") {
      // A calendar and a radio on a shelf, which is what a shop run by one
      // person for twenty years actually accumulates.
      put("calendar", { width: 0.04, height: 0.5, depth: 0.34 }, new Vector3(spec.faceX + inward * 1.6, 2.05, spec.z - spec.width / 2 + 0.2), surface("calendar", new Color3(0.92, 0.9, 0.85), 0.7, 0, 0.5));
      put("radioShelf", { width: 0.28, height: 0.05, depth: 0.6 }, new Vector3(backX - inward * 0.2, 1.85, spec.z + spec.width * 0.3), body);
      put("radio", { width: 0.18, height: 0.14, depth: 0.32 }, new Vector3(backX - inward * 0.22, 1.95, spec.z + spec.width * 0.3), surface("radio", new Color3(0.3, 0.26, 0.22), 0.6));
    }

    if (shop.interior.decor === "spartan") {
      // A clock and a price list. Nothing else: this is a shop you are in
      // for nine minutes.
      const clock = revolve(scene, `room.${spec.id}.clock`, [[0, 0], [0.17, 0], [0.18, 0.03], [0, 0.035]], 14);
      clock.rotation.z = Math.PI / 2;
      clock.position.set(spec.faceX + inward * 0.3, 2.42, spec.z);
      clock.material = surface("clock", new Color3(0.94, 0.93, 0.9), 0.4, 0, 0.7);
      parts.push(clock);
      register(clock);
      put("priceList", { width: 0.04, height: 0.68, depth: 1.1 }, new Vector3(spec.faceX + inward * 0.3, 2.42, spec.z + spec.width / 2 - 1.1), surface("priceList", new Color3(0.96, 0.95, 0.9), 0.6, 0, 0.8));
    }

    if (shop.ticketMachine) {
      // Bought at the door, handed over at the counter.
      const machineZ = spec.z + (spec.doorZ > spec.z ? -1 : 1) * (spec.width / 2 - 0.55);
      const machine = chamferedBlock(scene, `room.${spec.id}.ticketMachine`, { width: 0.5, height: 1.42, depth: 0.6 }, 0.04);
      machine.position.set(spec.faceX + inward * 0.65, 0.71, machineZ);
      machine.material = surface("machineBody", new Color3(0.14, 0.15, 0.18), 0.55, 0.3, 0.3);
      machine.checkCollisions = true;
      parts.push(machine);
      register(machine);
      put("ticketPanel", { width: 0.04, height: 0.52, depth: 0.46 }, new Vector3(spec.faceX + inward * 0.38, 1.14, machineZ), surface("ticketPanel", new Color3(1, 0.86, 0.42), 0.4, 0, 1.1));
    }
  } else if (spec.kind === "konbini") {
    // Konbini: cold cabinets across the back, gondolas, a till by the door.
    const steel = surface("fridgeFrame", new Color3(0.24, 0.25, 0.27), 0.45, 0.5, 0.3);
    put("fridgeWall", { width: 0.6, height: 2.1, depth: spec.width - 0.5 }, new Vector3(backX - inward * 0.4, 1.05, spec.z), steel, true);
    put("fridgeGlow", { width: 0.06, height: 1.8, depth: spec.width - 0.8 }, new Vector3(backX - inward * 0.72, 1.05, spec.z), surface("fridgeLight", new Color3(0.8, 0.93, 1), 0.3, 0, 1.5));
    // The cabinet doors themselves, in front of the stock.
    const fridgeDoors = CreateBox(`room.${spec.id}.fridgeGlass`, { width: 0.04, height: 1.95, depth: spec.width - 0.6 }, scene);
    fridgeDoors.position.set(backX - inward * 0.78, 1.05, spec.z);
    fridgeDoors.material = makeGlass(scene, `room.${spec.id}.fridgeGlass`, "cabinet");
    fridgeDoors.isPickable = false;
    fridgeDoors.receiveShadows = false;
    parts.push(fridgeDoors);
    register(fridgeDoors);

    // Bottles and cans behind the cabinet glass, in rows.
    const drinkColours = [
      new Color3(0.15, 0.35, 0.2), new Color3(0.7, 0.72, 0.75), new Color3(0.85, 0.6, 0.2),
      new Color3(0.2, 0.28, 0.6), new Color3(0.75, 0.2, 0.2),
    ];
    const drinks: Mesh[] = [];
    const perRow = Math.floor((spec.width - 1.2) / 0.11);
    for (let row = 0; row < 4; row += 1) {
      for (let i = 0; i < perRow; i += 1) {
        const bottle = CreateCylinder(`room.${spec.id}.bottle`, { diameter: 0.075, height: 0.2, tessellation: 6 }, scene);
        bottle.position.set(backX - inward * 0.62, 0.42 + row * 0.44, spec.z - (spec.width - 1.2) / 2 + i * 0.11);
        bottle.material = surface(
          `drink${(row + i) % drinkColours.length}`,
          drinkColours[(row + i) % drinkColours.length] ?? new Color3(0.6, 0.6, 0.6),
          0.35,
          0,
          0.7,
        );
        drinks.push(bottle);
      }
    }
    const fridgeStock = Mesh.MergeMeshes(drinks, true, true, undefined, false, true);
    if (fridgeStock) {
      fridgeStock.name = `room.${spec.id}.fridgeStock`;
      fridgeStock.isPickable = false;
      fridgeStock.receiveShadows = false;
      parts.push(fridgeStock);
      register(fridgeStock);
    }

    const shelfUnit = surface("shelfUnit", new Color3(0.6, 0.6, 0.58), 0.7, 0, 0.4);
    // Stock, one packet at a time.
    //
    // A shelf modelled as a single coloured slab reads as a ramp. Modelled as
    // rows of small boxes it reads as a shop, and merging each gondola's
    // stock into one mesh keeps it at one draw call all the same.
    const packetColours = [
      new Color3(0.82, 0.3, 0.22), new Color3(0.95, 0.78, 0.24), new Color3(0.24, 0.5, 0.78),
      new Color3(0.32, 0.62, 0.36), new Color3(0.9, 0.9, 0.86), new Color3(0.6, 0.32, 0.6),
      new Color3(0.9, 0.55, 0.2), new Color3(0.18, 0.2, 0.24),
    ];
    const packetMaterials = packetColours.map((colour, index) =>
      surface(`packet${index}`, colour, 0.75, 0, 0.6),
    );
    const shelfRun = spec.width - 2.4;
    for (let i = 0; i < 3; i += 1) {
      const x = spec.faceX + inward * (spec.depth * 0.32 + i * 0.75);
      put(`gondola${i}`, { width: 0.5, height: 1.4, depth: spec.width - 2.2 }, new Vector3(x, 0.7, spec.z), shelfUnit, true);
      const stock: Mesh[] = [];
      for (let shelf = 0; shelf < 3; shelf += 1) {
        put(`shelfBoard${i}.${shelf}`, { width: 0.46, height: 0.03, depth: shelfRun }, new Vector3(x, 0.3 + shelf * 0.44, spec.z), shelfUnit);
        let z = spec.z - shelfRun / 2 + 0.06;
        let pick = (i * 7 + shelf * 3) % packetColours.length;
        while (z < spec.z + shelfRun / 2 - 0.06) {
          const depth = 0.09 + (pick % 3) * 0.035;
          const height = 0.22 + (pick % 4) * 0.05;
          const packet = CreateBox(`room.${spec.id}.packet`, { width: 0.2, height, depth }, scene);
          packet.position.set(x, 0.32 + shelf * 0.44 + height / 2, z + depth / 2);
          packet.material = packetMaterials[pick % packetMaterials.length] ?? shelfUnit;
          stock.push(packet);
          z += depth + 0.015;
          pick += 1;
        }
      }
      const merged = Mesh.MergeMeshes(stock, true, true, undefined, false, true);
      if (merged) {
        merged.name = `room.${spec.id}.stock${i}`;
        merged.isPickable = false;
        merged.receiveShadows = false;
        parts.push(merged);
        register(merged);
      }
    }

    const tillZ = spec.doorZ + (spec.width > 6 ? 2.2 : 1.6);
    put("till", { width: 0.65, height: 0.98, depth: 1.7 }, new Vector3(spec.faceX + inward * 0.85, 0.49, tillZ), shelfUnit, true);
    put("tillTop", { width: 0.72, height: 0.07, depth: 1.75 }, new Vector3(spec.faceX + inward * 0.85, 1.0, tillZ), surface("counterTop", new Color3(0.36, 0.23, 0.13), 0.4, 0, 0.5));
    const register_ = chamferedBlock(scene, `room.${spec.id}.register`, { width: 0.34, height: 0.26, depth: 0.42 }, 0.04);
    register_.position.set(spec.faceX + inward * 0.85, 1.03, tillZ - 0.4);
    register_.material = surface("registerBody", new Color3(0.2, 0.21, 0.24), 0.5);
    parts.push(register_);
    register(register_);

    put("atm", { width: 0.5, height: 1.7, depth: 0.8 }, new Vector3(backX - inward * 0.45, 0.85, spec.z - spec.width * 0.36), surface("atm", new Color3(0.18, 0.2, 0.24), 0.5, 0.3, 0.35), true);
    put("atmScreen", { width: 0.05, height: 0.36, depth: 0.46 }, new Vector3(backX - inward * 0.72, 1.3, spec.z - spec.width * 0.36), surface("atmScreen", new Color3(0.5, 0.8, 1), 0.3, 0, 1.3));

    counterAt = new Vector3(spec.faceX + inward * 1.55, 0, tillZ);
    const clerk = new Character(scene, STAFF_KONBINI);
    clerk.root.position.copyFrom(counterAt);
    clerk.root.rotation.y = spec.out > 0 ? -Math.PI / 2 : Math.PI / 2;
    clerk.settle();
    people.push(clerk);

    const shopper = new Character(scene, PATRON);
    shopper.root.position.set(spec.faceX + inward * (spec.depth * 0.5), 0, spec.z - spec.width * 0.25);
    shopper.root.rotation.y = spec.out > 0 ? Math.PI : 0;
    shopper.settle();
    people.push(shopper);
  } else {
    // A small café done in the maid-café idiom, invented for this street:
    // pastel room, lace trim, a corner stage for the evening's song, and
    // staff in a house uniform that belongs to this shop and nowhere else.
    const wood = surface("cafeWood", new Color3(0.4, 0.25, 0.19), 0.5, 0, 0.5);
    const lace = surface("lace", new Color3(0.97, 0.9, 0.92), 0.55, 0, 0.85);
    const pink = surface("cafePink", new Color3(0.9, 0.5, 0.6), 0.6, 0, 0.9);
    const counterZ = spec.z - spec.width * 0.2;

    put("counter", { width: 0.72, height: 1.06, depth: spec.width * 0.5 }, new Vector3(backX - inward * 0.65, 0.53, counterZ), wood, true);
    put("counterTop", { width: 0.86, height: 0.07, depth: spec.width * 0.54 }, new Vector3(backX - inward * 0.65, 1.09, counterZ), lace);
    put("backShelf", { width: 0.32, height: 1.4, depth: spec.width * 0.5 }, new Vector3(backX - inward * 0.18, 1.85, counterZ), wood);
    for (let i = 0; i < 7; i += 1) {
      const cup = revolve(
        scene,
        `room.${spec.id}.cup${i}`,
        [[0, 0], [0.035, 0], [0.038, 0.02], [0.042, 0.08], [0.036, 0.082], [0.03, 0.02], [0, 0.018]],
        10,
      );
      cup.position.set(backX - inward * 0.34, 1.4 + (i % 2) * 0.52, counterZ - spec.width * 0.2 + i * (spec.width * 0.4) / 6);
      cup.material = i % 3 === 0 ? pink : lace;
      parts.push(cup);
      register(cup);
    }

    // The cake dome on the counter, which is the one thing on this street
    // that catches the light from inside and out at once.
    const dome = revolve(
      scene,
      `room.${spec.id}.cakeDome`,
      [[0, 0], [0.22, 0], [0.22, 0.02], [0.2, 0.16], [0.13, 0.25], [0, 0.27]],
      16,
    );
    dome.position.set(backX - inward * 0.65, 1.13, counterZ + spec.width * 0.16);
    dome.material = makeGlass(scene, `room.${spec.id}.domeGlass`, "cabinet");
    parts.push(dome);
    register(dome);

    // Round tables with two chairs each. She can sit at any of them.
    const chairColour = surface("cafeChair", new Color3(0.55, 0.28, 0.34), 0.65, 0, 0.55);
    for (let i = 0; i < 3; i += 1) {
      const z = spec.z - spec.width * 0.28 + i * (spec.width * 0.28);
      const x = spec.faceX + inward * (spec.depth * (0.3 + (i % 2) * 0.18));
      const top = revolve(scene, `room.${spec.id}.table${i}`, [[0, 0], [0.33, 0], [0.34, 0.02], [0.33, 0.045], [0, 0.045]], 16);
      top.position.set(x, 0.72, z);
      top.material = lace;
      parts.push(top);
      register(top);
      const stem = CreateCylinder(`room.${spec.id}.tableStem${i}`, { diameterTop: 0.1, diameterBottom: 0.34, height: 0.72, tessellation: 10 }, scene);
      stem.position.set(x, 0.36, z);
      stem.material = wood;
      stem.checkCollisions = true;
      parts.push(stem);
      register(stem);
      for (const side of [-1, 1] as const) {
        const chairX = x + inward * side * 0.62;
        put(`chairSeat${i}${side}`, { width: 0.38, height: 0.06, depth: 0.38 }, new Vector3(chairX, 0.45, z), chairColour);
        put(`chairBack${i}${side}`, { width: 0.06, height: 0.5, depth: 0.36 }, new Vector3(chairX + inward * side * 0.16, 0.7, z), chairColour);
        for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]] as const) {
          put(`chairLeg${i}${side}${lx}${lz}`, { width: 0.04, height: 0.44, depth: 0.04 }, new Vector3(chairX + lx, 0.22, z + lz), chairColour);
        }
        seats.push({ at: new Vector3(chairX, 0, z), facing: inward * side > 0 ? -Math.PI / 2 : Math.PI / 2, taken: false });
      }
    }

    // The stage corner: a step up, a mic, and a strip of lights over it.
    const stageZ = spec.z + spec.width * 0.34;
    put("stage", { width: spec.depth * 0.3, height: 0.16, depth: spec.width * 0.28 }, new Vector3(backX - inward * (spec.depth * 0.2), 0.08, stageZ), wood, true);
    const mic = CreateCylinder(`room.${spec.id}.micStand`, { diameter: 0.035, height: 1.3, tessellation: 6 }, scene);
    mic.position.set(backX - inward * (spec.depth * 0.2), 0.81, stageZ);
    mic.material = surface("machineBody", new Color3(0.14, 0.15, 0.18), 0.55, 0.3, 0.3);
    parts.push(mic);
    register(mic);
    put("stageLights", { width: spec.depth * 0.24, height: 0.05, depth: 0.1 }, new Vector3(backX - inward * (spec.depth * 0.2), spec.height - 0.35, stageZ), surface("stageGlow", new Color3(1, 0.72, 0.85), 0.4, 0, 1.6));

    // Bunting across the front of the room.
    for (let i = 0; i < 9; i += 1) {
      put(
        `bunting${i}`,
        { width: 0.02, height: 0.16, depth: 0.16 },
        new Vector3(spec.faceX + inward * 0.7, spec.height - 0.42, spec.z - spec.width * 0.4 + i * (spec.width * 0.8) / 8),
        i % 2 === 0 ? pink : lace,
      );
    }

    // Two pendants over the tables. Low enough to make pools of light rather
    // than lighting the ceiling.
    for (let i = 0; i < 2; i += 1) {
      const z = spec.z - spec.width * 0.24 + i * (spec.width * 0.44);
      const x = spec.faceX + inward * (spec.depth * 0.36);
      const shade = revolve(scene, `room.${spec.id}.pendant${i}`, [[0, 0.3], [0.22, 0], [0.21, 0], [0.02, 0.28], [0, 0.3]], 14);
      shade.position.set(x, 2.1, z);
      shade.material = pink;
      parts.push(shade);
      register(shade);
      put(`pendantCord${i}`, { width: 0.02, height: 0.5, depth: 0.02 }, new Vector3(x, 2.65, z), surface("cord", new Color3(0.09, 0.08, 0.08), 0.8));
      const bulb = revolve(scene, `room.${spec.id}.pendantBulb${i}`, [[0, 0], [0.05, 0.02], [0.05, 0.08], [0, 0.1]], 8);
      bulb.position.set(x, 2.06, z);
      bulb.material = surface("bulbGlow", new Color3(1, 0.87, 0.74), 0.4, 0, 1.7);
      parts.push(bulb);
      register(bulb);
    }

    counterAt = new Vector3(backX - inward * 1.2, 0, counterZ);
    const server = new Character(scene, STAFF_CAFE);
    server.root.position.copyFrom(counterAt);
    server.root.rotation.y = spec.out > 0 ? Math.PI / 2 : -Math.PI / 2;
    server.settle();
    people.push(server);

    const floorStaff = new Character(scene, { ...STAFF_CAFE, name: "server2", height: 1.66, hairStyle: "bob" });
    floorStaff.root.position.set(spec.faceX + inward * (spec.depth * 0.42), 0, spec.z + spec.width * 0.12);
    floorStaff.root.rotation.y = spec.out > 0 ? Math.PI / 2 : -Math.PI / 2;
    floorStaff.settle();
    people.push(floorStaff);

    // One customer, already served.
    const guestSeat = seats[1];
    if (guestSeat) {
      guestSeat.taken = true;
      const guest = new Character(scene, PATRON);
      guest.root.position.copyFrom(guestSeat.at);
      guest.root.rotation.y = guestSeat.facing;
      guest.settle();
      guest.play("sit");
      people.push(guest);
    }
  }

  // One mesh for everything that does not move.
  //
  // A room is sixty small boxes — counter, stools, pots, posters, bottles —
  // and sixty draw calls a room, five rooms deep, was the frame time. They
  // never move relative to each other, so they are merged into one mesh with
  // its materials as sub-meshes: five draw calls become one.
  const collidable = parts.filter((mesh) => mesh.checkCollisions);
  const fittings = parts.filter((mesh) => !mesh.checkCollisions);
  const merged: Mesh[] = [];
  const fold = (group: Mesh[], name: string, collides: boolean): void => {
    if (group.length === 0) return;
    const mesh = Mesh.MergeMeshes(group, true, true, undefined, false, true);
    if (!mesh) return;
    mesh.name = `room.${spec.id}.${name}`;
    mesh.checkCollisions = collides;
    mesh.isPickable = collides;
    mesh.receiveShadows = false;
    mesh.freezeWorldMatrix();
    merged.push(mesh);
    register(mesh);
  };
  fold(collidable, "shell", true);
  fold(fittings, "fittings", false);

  const centre = new Vector3(midX, 1, spec.z);
  const steamRate = steam?.emitRate ?? 0;
  let peopleShown = true;

  const halfWidth = spec.width / 2;
  const minX = Math.min(spec.faceX, backX);
  const maxX = Math.max(spec.faceX, backX);

  const idle = { speed: 0, runSpeed: 4, grounded: true, verticalSpeed: 0, turnRate: 0 };

  return {
    id: spec.id,
    kind: spec.kind,
    standing: spec.house?.interior.plan === "standing",
    entrance: new Vector3(spec.faceX + spec.out * 1.1, 0, spec.doorZ),
    threshold: new Vector3(spec.faceX + inward * 1.0, 0, spec.doorZ),
    seats,
    counterAt,
    contains(point: Vector3): boolean {
      return (
        point.x > minX - 0.3 &&
        point.x < maxX + 0.3 &&
        point.z > spec.z - halfWidth &&
        point.z < spec.z + halfWidth
      );
    },
    update(dt: number, playerPosition: Vector3): void {
      // A room you cannot make out is a room that does not need drawing.
      //
      // The fittings are one merged mesh, so they cost a draw call and can
      // stay; the people are forty meshes each and an animation update, and
      // past twenty-odd metres they are three pixels. This is most of what
      // the street's frame time was going on.
      const near = Vector3.DistanceSquared(playerPosition, centre) < CROWD_RANGE * CROWD_RANGE;
      if (near !== peopleShown) {
        peopleShown = near;
        for (const person of people) person.root.setEnabled(near);
        if (steam) steam.emitRate = near ? steamRate : 0;
      }
      if (!near) return;
      // Staff and customers breathe, and the one who is eating keeps eating.
      for (const person of people) person.update(dt, idle, 0);
    },
    dispose(): void {
      steam?.dispose(true);
      for (const person of people) person.dispose();
      for (const mesh of merged) mesh.dispose();
      lamp.dispose();
    },
  };
}
