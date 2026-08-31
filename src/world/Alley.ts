/**
 * The alley.
 *
 * A three-metre gap between two buildings that the street plan leaves and
 * the city fills: air-conditioning stacked up the walls, cable runs, a
 * fire escape, crates nobody has moved in a year, a vent breathing steam,
 * one working lamp, and a small shrine in a niche at the dead end.
 *
 * It exists for contrast. A main street is wide, lit and busy; twelve
 * metres off it there is somewhere narrow, dark and quiet, and having both
 * within a few steps is most of what makes a city block feel real.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { CityMaterials } from "./CityMaterials";
import { pipe, corrugatedSheet, railingRun, revolve, boxUv } from "./Shapes";
import { CONCRETE_TILE } from "./Concrete";
import { makeRandom } from "./Noise";

export interface AlleySpec {
  /** The building line it opens off. */
  faceX: number;
  /** +1 or -1: which way is out, towards the street. */
  out: number;
  /** Centre line along the street. */
  z: number;
  /** Clear width between the walls. */
  width: number;
  /** How far back it runs before the dead end. */
  depth: number;
  /** Height of the walls either side. */
  wallHeight: number;
  seed: number;
}

export interface BuiltAlley {
  /** The walls, so the camera knows not to reverse through them. */
  shell: Mesh[];
  /** Out on the pavement, where the alley opens. */
  mouth: Vector3;
  /** The dead end, where the shrine is. */
  shrineAt: Vector3;
  /** The one lamp, for the street's light pool and its wet-ground smear. */
  lampAt: Vector3;
  lampColour: Color3;
  /** True while the player is between the walls. */
  contains(point: Vector3): boolean;
  update(dt: number, playerPosition: Vector3): void;
  dispose(): void;
}

/** The vent's breath. Off unless somebody is in the alley to see it. */
function ventSteam(scene: Scene, at: Vector3): ParticleSystem {
  const texture = new DynamicTexture("alley.steam", { width: 32, height: 32 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  texture.update(false);
  texture.hasAlpha = true;

  const steam = new ParticleSystem("alley.steam", 140, scene);
  steam.particleTexture = texture;
  steam.emitter = at.clone();
  steam.minEmitBox = new Vector3(-0.3, 0, -0.5);
  steam.maxEmitBox = new Vector3(0.3, 0, 0.5);
  steam.color1 = new Color4(0.9, 0.9, 0.94, 0.18);
  steam.color2 = new Color4(0.82, 0.86, 0.95, 0.1);
  steam.colorDead = new Color4(0.85, 0.88, 0.95, 0);
  steam.minSize = 0.5;
  steam.maxSize = 2.2;
  steam.minLifeTime = 2.4;
  steam.maxLifeTime = 5;
  steam.emitRate = 0;
  steam.direction1 = new Vector3(-0.15, 1, -0.15);
  steam.direction2 = new Vector3(0.15, 1.5, 0.15);
  steam.minEmitPower = 0.25;
  steam.maxEmitPower = 0.6;
  steam.gravity = new Vector3(0, 0.5, 0);
  steam.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  steam.start();
  return steam;
}

export function buildAlley(scene: Scene, materials: CityMaterials, spec: AlleySpec): BuiltAlley {
  const random = makeRandom(spec.seed);
  const parts: Mesh[] = [];
  const inward = -spec.out;
  const backX = spec.faceX + inward * spec.depth;
  const midX = spec.faceX + inward * spec.depth * 0.5;
  const half = spec.width / 2;

  // Tighter world scales than the street uses: an alley is read from a metre
  // away, where the frontage textures go soft.
  const concrete = materials.concrete();
  const tile = materials.surface("tileWall", 2);
  // The tile wall is the alley's own cached material (the cache key carries
  // the world scale), so softening its relief does not touch the street's.
  {
    const bump = tile.bumpTexture as { level?: number } | null;
    if (bump && typeof bump.level === "number") bump.level = 0.4;
  }
  const paint = (name: string, colour: Color3, roughness = 0.7, metallic = 0) =>
    materials.painted(`alley.${name}`, colour, roughness, metallic);

  const put = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: Material,
    collides = true,
  ): Mesh => {
    const mesh = CreateBox(`alley.${name}`, size, scene);
    mesh.position.copyFrom(at);
    mesh.material = material;
    mesh.checkCollisions = collides;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    parts.push(mesh);
    return mesh;
  };

  const keep = (mesh: Mesh, material: Material, collides = false): Mesh => {
    mesh.material = material;
    mesh.checkCollisions = collides;
    mesh.isPickable = false;
    parts.push(mesh);
    return mesh;
  };

  // ------------------------------------------------------------- the shell
  // Collidable: without it she walks in off the kerb and drops through.
  put("floor", { width: spec.depth + 0.4, height: 0.12, depth: spec.width }, new Vector3(midX, -0.05, spec.z), concrete, true);
  put("back", { width: 0.4, height: spec.wallHeight, depth: spec.width + 1.6 }, new Vector3(backX, spec.wallHeight / 2, spec.z), concrete);
  for (const side of [-1, 1] as const) {
    put(
      `wall${side}`,
      { width: spec.depth, height: spec.wallHeight, depth: 0.4 },
      new Vector3(midX, spec.wallHeight / 2, spec.z + side * (half + 0.2)),
      side < 0 ? concrete : tile,
    );
    // A capping course, so the wall tops are not raw edges against the sky.
    put(
      `cap${side}`,
      { width: spec.depth, height: 0.22, depth: 0.56 },
      new Vector3(midX, spec.wallHeight + 0.11, spec.z + side * (half + 0.2)),
      paint("cap", new Color3(0.16, 0.16, 0.17), 0.85),
      false,
    );
  }

  // ------------------------------------------------------------- servicing
  // Condensers stacked up both walls: the sound and the sight of a back lane.
  const steel = paint("steel", new Color3(0.62, 0.63, 0.64), 0.42, 0.7);
  const grille = paint("grille", new Color3(0.2, 0.21, 0.22), 0.55, 0.3);
  for (let i = 0; i < 7; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = spec.faceX + inward * (1.6 + random() * (spec.depth - 3));
    const y = 1.1 + Math.floor(random() * 3) * 1.35;
    put(`ac${i}`, { width: 0.78, height: 0.6, depth: 0.42 }, new Vector3(x, y, spec.z + side * (half - 0.21)), steel, false);
    put(`acGrille${i}`, { width: 0.5, height: 0.44, depth: 0.06 }, new Vector3(x, y, spec.z + side * (half - 0.44)), grille, false);
    const bracket = put(`acBracket${i}`, { width: 0.86, height: 0.06, depth: 0.4 }, new Vector3(x, y - 0.33, spec.z + side * (half - 0.22)), grille, false);
    bracket.receiveShadows = false;
  }

  // Drainpipes down the tiled side, and the cable runs that feed the block.
  for (let i = 0; i < 3; i += 1) {
    const x = spec.faceX + inward * (2.2 + i * (spec.depth - 4) / 2);
    const down = pipe(
      scene,
      `alley.downpipe${i}`,
      [
        new Vector3(x, 0, spec.z + half - 0.32),
        new Vector3(x, spec.wallHeight * 0.55, spec.z + half - 0.32),
        new Vector3(x + inward * 0.25, spec.wallHeight * 0.7, spec.z + half - 0.32),
        new Vector3(x + inward * 0.25, spec.wallHeight, spec.z + half - 0.32),
      ],
      0.07,
      8,
    );
    keep(down, paint("pipe", new Color3(0.3, 0.29, 0.27), 0.75));
  }
  for (let i = 0; i < 5; i += 1) {
    const x = spec.faceX + inward * (1.4 + i * (spec.depth - 2.5) / 4);
    const sag = 0.35 + random() * 0.5;
    const y = spec.wallHeight * 0.62 + random() * 1.4;
    const cable = pipe(
      scene,
      `alley.cable${i}`,
      [
        new Vector3(x, y, spec.z - half),
        new Vector3(x, y - sag, spec.z),
        new Vector3(x, y, spec.z + half),
      ],
      0.025,
      6,
    );
    keep(cable, paint("cable", new Color3(0.06, 0.06, 0.07), 0.9));
  }

  // A fire escape on the concrete side: a landing, its railing, and the
  // stair up out of sight.
  const landingX = spec.faceX + inward * (spec.depth * 0.45);
  put("landing", { width: 2.4, height: 0.1, depth: 1.0 }, new Vector3(landingX, 3.2, spec.z - half + 0.5), grille, false);
  const rail = railingRun(scene, "alley.landingRail", 2.4, 0.95, 0.6, steel);
  if (rail) {
    rail.rotation.y = Math.PI / 2;
    rail.position.set(landingX, 3.25, spec.z - half + 0.95);
    keep(rail, steel);
  }
  for (let i = 0; i < 7; i += 1) {
    put(
      `stair${i}`,
      { width: 0.9, height: 0.06, depth: 0.28 },
      new Vector3(landingX + inward * 1.35, 3.2 + (i + 1) * 0.34, spec.z - half + 0.6 + i * 0.05),
      grille,
      false,
    );
  }

  // The shutter on the dead-end wall, and the door beside it.
  const shutter = corrugatedSheet(scene, "alley.shutter", 2.2, 2.4, 10, 0.04);
  shutter.rotation.y = Math.PI / 2;
  shutter.position.set(backX - inward * 0.22, 0.02, spec.z - 0.9);
  keep(shutter, paint("shutter", new Color3(0.22, 0.24, 0.23), 0.72, 0.25));
  put("serviceDoor", { width: 0.1, height: 2.05, depth: 0.9 }, new Vector3(backX - inward * 0.22, 1.02, spec.z + 1.5), paint("door", new Color3(0.16, 0.19, 0.2), 0.7, 0.2), false);
  put("doorLamp", { width: 0.12, height: 0.16, depth: 0.26 }, new Vector3(backX - inward * 0.3, 2.28, spec.z + 1.5), materials.emissive("alley.doorLamp", new Color3(0.6, 0.75, 0.5), 1.1), false);

  // ---------------------------------------------------------- the clutter
  const crateWood = paint("crate", new Color3(0.34, 0.26, 0.17), 0.85);
  const plastic = paint("plastic", new Color3(0.14, 0.2, 0.16), 0.6);
  for (let i = 0; i < 6; i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const x = spec.faceX + inward * (2 + random() * (spec.depth - 3.5));
    const z = spec.z + side * (half - 0.45 - random() * 0.2);
    if (random() < 0.55) {
      const stack = 1 + Math.floor(random() * 3);
      for (let s = 0; s < stack; s += 1) {
        put(`crate${i}.${s}`, { width: 0.52, height: 0.34, depth: 0.52 }, new Vector3(x + (s % 2) * 0.05, 0.17 + s * 0.34, z), crateWood, s === 0);
      }
    } else {
      const bin = revolve(
        scene,
        `alley.bin${i}`,
        [[0, 0], [0.29, 0], [0.31, 0.1], [0.32, 0.72], [0.34, 0.76], [0.3, 0.78], [0, 0.79]],
        12,
      );
      bin.position.set(x, 0, z);
      keep(bin, plastic, true);
    }
  }
  // Bagged rubbish by the wall, waiting for a collection at four in the
  // morning: low, soft shapes that break up the floor line.
  for (let i = 0; i < 5; i += 1) {
    const bag = revolve(
      scene,
      `alley.bag${i}`,
      [[0, 0], [0.24, 0.02], [0.28, 0.18], [0.2, 0.34], [0.06, 0.4], [0, 0.4]],
      10,
    );
    bag.position.set(
      spec.faceX + inward * (2.5 + random() * (spec.depth - 4)),
      0,
      spec.z + (random() < 0.5 ? -1 : 1) * (half - 0.4),
    );
    bag.scaling.set(0.8 + random() * 0.5, 0.8 + random() * 0.4, 0.8 + random() * 0.5);
    keep(bag, paint("bag", new Color3(0.09, 0.1, 0.1), 0.55));
  }
  // Gas bottles chained by the kitchen door of whatever backs onto this.
  for (let i = 0; i < 3; i += 1) {
    const bottle = CreateCylinder(`alley.gas${i}`, { diameter: 0.3, height: 0.78, tessellation: 10 }, scene);
    bottle.position.set(backX - inward * 0.9, 0.39, spec.z - half + 0.55 + i * 0.34);
    keep(bottle, paint("gas", new Color3(0.5, 0.19, 0.14), 0.55, 0.3), true);
  }

  // ------------------------------------------------------------ the light
  // One working lamp, wall-mounted, halfway down. Everything past it is dark
  // enough that the shrine at the end is only a shape until you are close.
  const lampAt = new Vector3(spec.faceX + inward * (spec.depth * 0.42), 2.9, spec.z + half - 0.4);
  put("lampBracket", { width: 0.06, height: 0.06, depth: 0.34 }, new Vector3(lampAt.x, lampAt.y + 0.16, lampAt.z + 0.12), grille, false);
  put("lampShade", { width: 0.42, height: 0.1, depth: 0.42 }, new Vector3(lampAt.x, lampAt.y + 0.1, lampAt.z), paint("shade", new Color3(0.18, 0.18, 0.19), 0.7), false);
  put("lampGlass", { width: 0.3, height: 0.1, depth: 0.3 }, new Vector3(lampAt.x, lampAt.y, lampAt.z), materials.emissive("alley.lamp", new Color3(1, 0.88, 0.66), 1.6), false);

  // ----------------------------------------------------------- the shrine
  // A small niche in the dead-end wall: a stone, a plate, two cups, and a
  // light somebody still bothers to keep lit. It is the first thing in the
  // city that belongs to the other half of this story.
  const shrineAt = new Vector3(backX - inward * 0.55, 0, spec.z - half + 0.75);
  const stone = paint("stone", new Color3(0.42, 0.42, 0.4), 0.85);
  put("shrineBase", { width: 0.55, height: 0.5, depth: 0.75 }, new Vector3(shrineAt.x, 0.25, shrineAt.z), stone, true);
  put("shrineBody", { width: 0.42, height: 0.62, depth: 0.52 }, new Vector3(shrineAt.x, 0.81, shrineAt.z), stone, false);
  const roof = revolve(scene, "alley.shrineRoof", [[0, 0.24], [0.36, 0], [0.38, 0.03], [0.05, 0.3], [0, 0.3]], 4);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(shrineAt.x, 1.12, shrineAt.z);
  keep(roof, stone);
  put("shrineGlow", { width: 0.06, height: 0.3, depth: 0.28 }, new Vector3(shrineAt.x - inward * 0.2, 0.86, shrineAt.z), materials.emissive("alley.shrine", new Color3(1, 0.62, 0.3), 1.3), false);
  for (let i = 0; i < 2; i += 1) {
    const cup = revolve(scene, `alley.cup${i}`, [[0, 0], [0.035, 0], [0.04, 0.05], [0.032, 0.052], [0, 0.045]], 8);
    cup.position.set(shrineAt.x - inward * 0.22, 0.5, shrineAt.z - 0.12 + i * 0.24);
    keep(cup, paint("cup", new Color3(0.85, 0.84, 0.8), 0.4));
  }

  // Paper on the walls: notices, a parking plate, a poster nobody took down.
  for (let i = 0; i < 5; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = spec.faceX + inward * (1.2 + random() * (spec.depth - 2.5));
    const height = 0.4 + random() * 0.7;
    put(
      `notice${i}`,
      { width: 0.5 + random() * 0.3, height, depth: 0.03 },
      new Vector3(x, 1.3 + random() * 1.1, spec.z + side * (half - 0.03)),
      paint(
        `notice${i % 3}`,
        i % 3 === 0
          ? new Color3(0.78, 0.76, 0.7)
          : i % 3 === 1
            ? new Color3(0.24, 0.3, 0.45)
            : new Color3(0.5, 0.16, 0.14),
        0.85,
      ),
      false,
    );
  }
  // Junction boxes and conduit, which is what actually covers a back wall.
  for (let i = 0; i < 4; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = spec.faceX + inward * (1.8 + i * (spec.depth - 3) / 3);
    put(`box${i}`, { width: 0.3, height: 0.42, depth: 0.16 }, new Vector3(x, 1.55, spec.z + side * (half - 0.08)), grille, false);
    const conduit = pipe(
      scene,
      `alley.conduit${i}`,
      [new Vector3(x, 1.76, spec.z + side * (half - 0.06)), new Vector3(x, spec.wallHeight * 0.8, spec.z + side * (half - 0.06))],
      0.035,
      6,
    );
    keep(conduit, grille);
  }

  const steam = ventSteam(scene, new Vector3(spec.faceX + inward * (spec.depth * 0.62), 0.05, spec.z + 0.2));
  put("vent", { width: 0.9, height: 0.04, depth: 1.2 }, new Vector3(spec.faceX + inward * (spec.depth * 0.62), 0.02, spec.z + 0.2), grille, false);

  for (const part of parts) {
    if (part.material === concrete) boxUv(part, CONCRETE_TILE);
  }

  const minX = Math.min(spec.faceX, backX);
  const maxX = Math.max(spec.faceX, backX);

  const shell = parts.filter((mesh) => /wall|back|floor/.test(mesh.name));

  return {
    shell,
    mouth: new Vector3(spec.faceX + spec.out * 1.2, 0, spec.z),
    shrineAt,
    lampAt,
    lampColour: new Color3(1, 0.88, 0.66),
    contains(point: Vector3): boolean {
      return point.x > minX - 0.5 && point.x < maxX + 0.5 && Math.abs(point.z - spec.z) < half + 0.3;
    },
    update(_dt: number, playerPosition: Vector3): void {
      // The vent only breathes when there is somebody to see it breathe.
      const near = Vector3.DistanceSquared(playerPosition, steam.emitter as Vector3) < 400;
      steam.emitRate = near ? 26 : 0;
    },
    dispose(): void {
      steam.dispose(true);
      for (const mesh of parts) mesh.dispose();
    },
  };
}
