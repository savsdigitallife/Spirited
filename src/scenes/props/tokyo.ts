/**
 * Tokyo street furniture, as prefab definitions.
 *
 * Each of these is a primitive stand-in with a `model` slot waiting for it.
 * The shapes are deliberately simple but correctly proportioned — a vending
 * machine is 1.83 m tall because that is how tall they are, and getting the
 * proportions right now is what makes a model swap a straight substitution
 * later rather than a re-layout.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PrefabDefinition } from "../../world/Prefabs";
import { CityMaterials, NEON } from "../../world/CityMaterials";

/** Model paths are declared even though the files do not exist yet. */
const MODEL_ROOT = "props/tokyo/";

function box(
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  at: Vector3,
  material: Mesh["material"],
): Mesh {
  const mesh = CreateBox(name, size, scene);
  mesh.position.copyFrom(at);
  mesh.material = material;
  return mesh;
}

export function tokyoPrefabs(materials: CityMaterials): PrefabDefinition[] {
  const metalDark = () => materials.painted("metalDark", new Color3(0.09, 0.1, 0.11), 0.45, 0.7);
  const metalPale = () => materials.painted("metalPale", new Color3(0.42, 0.44, 0.46), 0.4, 0.8);
  const plasticWhite = () => materials.painted("plasticWhite", new Color3(0.82, 0.83, 0.84), 0.5);

  return [
    {
      id: "streetLight",
      model: `${MODEL_ROOT}street-light.glb`,
      collides: true,
      build: ({ scene }) => {
        const pole = CreateCylinder(
          "pole",
          { diameter: 0.13, height: 6.2, tessellation: 8 },
          scene,
        );
        pole.position.y = 3.1;
        pole.material = metalPale();

        const arm = CreateCylinder("arm", { diameter: 0.09, height: 1.5, tessellation: 6 }, scene);
        arm.position.set(0.7, 6.05, 0);
        arm.rotation.z = Math.PI / 2;
        arm.material = metalPale();

        const lamp = box(
          scene,
          "lamp",
          { width: 0.5, height: 0.16, depth: 0.28 },
          new Vector3(1.36, 5.94, 0),
          materials.emissive("lampWhite", new Color3(1, 0.94, 0.82), 5),
        );
        return [pole, arm, lamp];
      },
    },
    {
      id: "utilityPole",
      model: `${MODEL_ROOT}utility-pole.glb`,
      collides: true,
      build: ({ scene }) => {
        const concrete = materials.painted("poleConcrete", new Color3(0.34, 0.34, 0.33), 0.85);
        const pole = CreateCylinder(
          "pole",
          { diameterTop: 0.22, diameterBottom: 0.3, height: 9, tessellation: 8 },
          scene,
        );
        pole.position.y = 4.5;
        pole.material = concrete;

        const parts: Mesh[] = [pole];
        // Cross-arms and the drum transformer that makes these unmistakable.
        for (const [y, length] of [
          [7.9, 1.8],
          [7.2, 1.4],
        ] as const) {
          const arm = box(
            scene,
            `arm${y}`,
            { width: length, height: 0.09, depth: 0.09 },
            new Vector3(0, y, 0),
            metalDark(),
          );
          parts.push(arm);
        }
        const drum = CreateCylinder(
          "transformer",
          { diameter: 0.46, height: 0.7, tessellation: 10 },
          scene,
        );
        drum.position.set(0.34, 6.2, 0);
        drum.material = metalPale();
        parts.push(drum);
        return parts;
      },
    },
    {
      id: "vendingMachine",
      model: `${MODEL_ROOT}vending-machine.glb`,
      collides: true,
      build: ({ scene }) => {
        const body = box(
          scene,
          "body",
          { width: 1.1, height: 1.83, depth: 0.72 },
          new Vector3(0, 0.915, 0),
          materials.painted("vendingBody", new Color3(0.72, 0.13, 0.16), 0.45),
        );
        const front = box(
          scene,
          "front",
          { width: 0.86, height: 1.12, depth: 0.05 },
          new Vector3(0, 1.12, -0.37),
          materials.emissive("vendingGlow", new Color3(1, 0.97, 0.86), 2.4),
        );
        const tray = box(
          scene,
          "tray",
          { width: 0.86, height: 0.2, depth: 0.08 },
          new Vector3(0, 0.36, -0.37),
          metalDark(),
        );
        return [body, front, tray];
      },
    },
    {
      id: "trafficLight",
      model: `${MODEL_ROOT}traffic-light.glb`,
      collides: true,
      build: ({ scene }) => {
        const pole = CreateCylinder("pole", { diameter: 0.12, height: 5, tessellation: 8 }, scene);
        pole.position.y = 2.5;
        pole.material = metalDark();
        const arm = CreateCylinder("arm", { diameter: 0.1, height: 2.2, tessellation: 6 }, scene);
        arm.position.set(1.05, 4.9, 0);
        arm.rotation.z = Math.PI / 2;
        arm.material = metalDark();
        const housing = box(
          scene,
          "housing",
          { width: 0.95, height: 0.32, depth: 0.24 },
          new Vector3(1.9, 4.72, 0),
          metalDark(),
        );
        const lamps: Mesh[] = [];
        const colours = [
          new Color3(0.2, 1, 0.35),
          new Color3(1, 0.82, 0.1),
          new Color3(1, 0.22, 0.15),
        ];
        colours.forEach((colour, index) => {
          const bulb = CreateSphere(`bulb${index}`, { diameter: 0.2, segments: 8 }, scene);
          bulb.position.set(1.62 + index * 0.28, 4.72, -0.13);
          bulb.material = materials.emissive(`signal${index}`, colour, index === 0 ? 4 : 0.35);
          lamps.push(bulb);
        });
        return [pole, arm, housing, ...lamps];
      },
    },
    {
      id: "signPost",
      model: `${MODEL_ROOT}sign-post.glb`,
      collides: true,
      build: ({ scene }) => {
        const pole = CreateCylinder("pole", { diameter: 0.07, height: 2.4, tessellation: 6 }, scene);
        pole.position.y = 1.2;
        pole.material = metalPale();
        const plate = box(
          scene,
          "plate",
          { width: 0.62, height: 0.2, depth: 0.03 },
          new Vector3(0.2, 2.3, 0),
          plasticWhite(),
        );
        const plate2 = box(
          scene,
          "plate2",
          { width: 0.48, height: 0.16, depth: 0.03 },
          new Vector3(0.14, 2.05, 0),
          materials.painted("signBlue", new Color3(0.1, 0.28, 0.55), 0.5),
        );
        return [pole, plate, plate2];
      },
    },
    {
      id: "trashBin",
      model: `${MODEL_ROOT}trash-bin.glb`,
      collides: true,
      build: ({ scene }) => {
        const bin = CreateCylinder(
          "bin",
          { diameter: 0.52, height: 0.9, tessellation: 12 },
          scene,
        );
        bin.position.y = 0.45;
        bin.material = metalPale();
        const lid = CreateCylinder("lid", { diameter: 0.58, height: 0.08, tessellation: 12 }, scene);
        lid.position.y = 0.93;
        lid.material = metalDark();
        return [bin, lid];
      },
    },
    {
      id: "planter",
      model: `${MODEL_ROOT}planter.glb`,
      collides: true,
      build: ({ scene }) => {
        const tub = box(
          scene,
          "tub",
          { width: 0.8, height: 0.5, depth: 0.8 },
          new Vector3(0, 0.25, 0),
          materials.painted("planterStone", new Color3(0.36, 0.35, 0.33), 0.9),
        );
        const shrub = CreateSphere("shrub", { diameter: 0.8, segments: 8 }, scene);
        shrub.position.y = 0.78;
        shrub.scaling.set(1, 0.75, 1);
        shrub.material = materials.painted("leaf", new Color3(0.11, 0.2, 0.1), 0.9);
        return [tub, shrub];
      },
    },
    {
      id: "bicycle",
      model: `${MODEL_ROOT}bicycle.glb`,
      collides: false,
      build: ({ scene }) => {
        const frame = box(
          scene,
          "frame",
          { width: 1.5, height: 0.07, depth: 0.05 },
          new Vector3(0, 0.65, 0),
          metalDark(),
        );
        const parts: Mesh[] = [frame];
        for (const x of [-0.6, 0.6]) {
          const wheel = CreateCylinder(
            `wheel${x}`,
            { diameter: 0.66, height: 0.045, tessellation: 14 },
            scene,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, 0.33, 0);
          wheel.material = metalDark();
          parts.push(wheel);
        }
        const basket = box(
          scene,
          "basket",
          { width: 0.34, height: 0.24, depth: 0.28 },
          new Vector3(-0.58, 0.86, 0),
          metalPale(),
        );
        parts.push(basket);
        return parts;
      },
    },
    {
      id: "car",
      model: `${MODEL_ROOT}car.glb`,
      collides: false,
      castsShadow: true,
      build: ({ scene }) => {
        const bodyMaterial = materials.painted("carBody", new Color3(0.18, 0.2, 0.24), 0.28, 0.65);
        const lower = box(
          scene,
          "lower",
          { width: 1.76, height: 0.62, depth: 4.3 },
          new Vector3(0, 0.62, 0),
          bodyMaterial,
        );
        const cabin = box(
          scene,
          "cabin",
          { width: 1.62, height: 0.58, depth: 2.3 },
          new Vector3(0, 1.2, -0.15),
          materials.glass(),
        );
        const parts: Mesh[] = [lower, cabin];
        for (const [x, z] of [
          [-0.86, 1.4],
          [0.86, 1.4],
          [-0.86, -1.4],
          [0.86, -1.4],
        ] as const) {
          const wheel = CreateCylinder(
            `wheel${x}${z}`,
            { diameter: 0.62, height: 0.22, tessellation: 12 },
            scene,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, 0.31, z);
          wheel.material = materials.painted("tyre", new Color3(0.04, 0.04, 0.05), 0.9);
          parts.push(wheel);
        }
        for (const x of [-0.6, 0.6]) {
          const head = box(
            scene,
            `head${x}`,
            { width: 0.34, height: 0.14, depth: 0.06 },
            new Vector3(x, 0.72, 2.16),
            materials.emissive("headlight", new Color3(1, 0.96, 0.88), 4.5),
          );
          parts.push(head);
          const tail = box(
            scene,
            `tail${x}`,
            { width: 0.3, height: 0.12, depth: 0.06 },
            new Vector3(x, 0.78, -2.16),
            materials.emissive("taillight", new Color3(1, 0.16, 0.12), 3),
          );
          parts.push(tail);
        }
        return parts;
      },
    },
    {
      id: "acUnit",
      model: `${MODEL_ROOT}ac-unit.glb`,
      collides: false,
      build: ({ scene }) => {
        const shell = box(
          scene,
          "shell",
          { width: 0.86, height: 0.6, depth: 0.34 },
          new Vector3(0, 0, 0),
          materials.painted("acShell", new Color3(0.6, 0.6, 0.58), 0.7),
        );
        const grille = box(
          scene,
          "grille",
          { width: 0.6, height: 0.44, depth: 0.03 },
          new Vector3(0, 0, -0.18),
          materials.painted("acGrille", new Color3(0.2, 0.2, 0.2), 0.8),
        );
        return [shell, grille];
      },
    },
    {
      id: "neonBanner",
      model: `${MODEL_ROOT}neon-banner.glb`,
      collides: false,
      castsShadow: false,
      build: ({ scene }) => {
        // A vertical shop banner: dark plate, glowing strokes, a bright rim.
        const plate = box(
          scene,
          "plate",
          { width: 0.62, height: 2.6, depth: 0.1 },
          new Vector3(0, 0, 0),
          materials.signboard("banner", NEON.rose, 991),
        );
        plate.rotation.z = Math.PI / 2;
        const rim = box(
          scene,
          "rim",
          { width: 0.68, height: 2.66, depth: 0.06 },
          new Vector3(0, 0, 0.05),
          materials.emissive("bannerRim", NEON.ice, 2.6),
        );
        rim.rotation.z = Math.PI / 2;
        return [plate, rim];
      },
    },
    {
      id: "awning",
      model: `${MODEL_ROOT}awning.glb`,
      collides: false,
      castsShadow: true,
      build: ({ scene }) => {
        const cloth = box(
          scene,
          "cloth",
          { width: 3.2, height: 0.08, depth: 1.4 },
          new Vector3(0, 0, 0),
          materials.painted("awningCloth", new Color3(0.2, 0.11, 0.1), 0.9),
        );
        cloth.rotation.x = -0.22;
        const lip = box(
          scene,
          "lip",
          { width: 3.2, height: 0.22, depth: 0.06 },
          new Vector3(0, -0.2, -0.68),
          materials.painted("awningLip", new Color3(0.75, 0.68, 0.55), 0.8),
        );
        return [cloth, lip];
      },
    },
  ];
}
