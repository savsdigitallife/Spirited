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
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetDefinition } from "../../engine/AssetCatalog";
import { CityMaterials, NEON } from "../../world/CityMaterials";
import { revolve } from "../../world/Shapes";


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


/**
 * A road wheel: a grooved rubber tyre on a bright alloy rim.
 *
 * Both are surfaces of revolution, which is what they are in life — the
 * tyre's profile carries the bead, the sidewall bulge, the shoulders and
 * three circumferential grooves, and the rim's carries the barrel and its
 * lips. A cylinder with a black material reads as a bin lid; a profile with
 * a sidewall and a tread reads as a tyre from the pavement.
 *
 * Built lying along the lathe's Y axis and laid over onto the axle by the
 * caller's merge, so the whole set of four ends up as one mesh.
 */
function roadWheel(
  scene: Scene,
  name: string,
  at: Vector3,
  tyreMaterial: Mesh["material"],
  rimMaterial: Mesh["material"],
  discMaterial: Mesh["material"],
): Mesh[] {
  const width = 0.205;
  const parts: Mesh[] = [];
  // Lay the lathe's axis onto the axle, and put the rim's face outward: the
  // spokes are on the far end of the profile, so the two sides of the car
  // turn opposite ways.
  const outward = at.x >= 0 ? -1 : 1;
  const place = (mesh: Mesh): Mesh => {
    mesh.rotation.z = (outward * Math.PI) / 2;
    mesh.position.set(at.x + (outward * width) / 2, at.y, at.z);
    parts.push(mesh);
    return mesh;
  };

  const tyre = revolve(
    scene,
    `${name}.tyre`,
    [
      [0.188, 0],
      [0.208, 0.005],
      [0.262, 0.016],
      [0.292, 0.032],
      [0.307, 0.05],
      [0.311, 0.062],
      [0.296, 0.068],
      [0.311, 0.075],
      [0.311, 0.098],
      [0.295, 0.104],
      [0.311, 0.111],
      [0.311, 0.134],
      [0.296, 0.14],
      [0.311, 0.146],
      [0.307, 0.156],
      [0.292, 0.174],
      [0.262, 0.19],
      [0.208, 0.2],
      [0.188, 0.205],
    ],
    22,
  );
  tyre.material = tyreMaterial;
  place(tyre);

  // The rim: a barrel with a lip at each end, closed by the face the spokes
  // stand on.
  const rim = revolve(
    scene,
    `${name}.rim`,
    [
      [0, 0.012],
      [0.176, 0.012],
      [0.191, 0.004],
      [0.191, 0.026],
      [0.172, 0.05],
      [0.172, 0.16],
      [0.191, 0.18],
      [0.191, 0.201],
      [0.176, 0.193],
      [0.13, 0.193],
    ],
    22,
  );
  rim.material = rimMaterial;
  place(rim);

  // Five spokes across the face, and a cap over the hub.
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const spoke = CreateBox(`${name}.spoke${i}`, { width: 0.058, height: 0.026, depth: 0.14 }, scene);
    spoke.position.set(Math.sin(angle) * 0.095, 0.184, Math.cos(angle) * 0.095);
    spoke.rotation.y = angle;
    // Baked, because `place` then overwrites the transform with the wheel's
    // own: everything below it has to be geometry by that point.
    spoke.bakeCurrentTransformIntoVertices();
    spoke.material = rimMaterial;
    place(spoke);
  }
  const cap = revolve(
    scene,
    `${name}.hub`,
    [[0, 0.202], [0.05, 0.2], [0.058, 0.19], [0.058, 0.17], [0, 0.168]],
    16,
  );
  cap.material = rimMaterial;
  place(cap);

  // The brake disc behind the spokes, just visible through them.
  const disc = CreateCylinder(`${name}.disc`, { diameter: 0.26, height: 0.02, tessellation: 20 }, scene);
  disc.position.set(0, 0.13, 0);
  disc.bakeCurrentTransformIntoVertices();
  disc.material = discMaterial;
  place(disc);

  return parts;
}

export function tokyoPrefabs(materials: CityMaterials): AssetDefinition[] {
  const metalDark = () => materials.painted("metalDark", new Color3(0.09, 0.1, 0.11), 0.45, 0.7);
  const metalPale = () => materials.painted("metalPale", new Color3(0.42, 0.44, 0.46), 0.4, 0.8);
  const plasticWhite = () => materials.painted("plasticWhite", new Color3(0.82, 0.83, 0.84), 0.5);

  return [
    {
      id: "street_light_01",
      category: "prop",
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
      id: "utility_pole_01",
      category: "prop",
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
      id: "vending_machine_01",
      category: "prop",
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
        // The pane in front of the display, which is what actually catches
        // the street: a vending machine at night is mostly a lit rectangle
        // behind glass.
        const pane = box(
          scene,
          "pane",
          { width: 0.9, height: 1.16, depth: 0.03 },
          new Vector3(0, 1.12, -0.4),
          materials.glass("cabinet"),
        );
        const tray = box(
          scene,
          "tray",
          { width: 0.86, height: 0.2, depth: 0.08 },
          new Vector3(0, 0.36, -0.37),
          metalDark(),
        );
        return [body, front, pane, tray];
      },
    },
    {
      id: "traffic_light_01",
      category: "prop",
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
      id: "sign_post_01",
      category: "prop",
      cullAt: 70,
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
      id: "trash_bin_01",
      category: "prop",
      cullAt: 60,
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
      id: "planter_01",
      category: "prop",
      cullAt: 60,
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
      id: "bicycle_01",
      category: "vehicle",
      cullAt: 70,
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
      id: "tokyo_car_01",
      category: "vehicle",
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
          materials.glass("vehicle"),
        );
        const parts: Mesh[] = [lower, cabin];

        // Rubber, alloy and iron: a tyre is a dielectric and almost matte, a
        // rim is a polished metal that returns the street, and the disc
        // behind it is somewhere between the two.
        const rubber = materials.painted("tyre", new Color3(0.032, 0.032, 0.035), 0.82);
        const alloy = materials.painted("wheelRim", new Color3(0.84, 0.85, 0.88), 0.14, 1);
        const brake = materials.painted("brakeDisc", new Color3(0.3, 0.29, 0.3), 0.4, 0.85);
        const wheelParts: Mesh[] = [];
        for (const [x, z] of [
          [-0.82, 1.4],
          [0.82, 1.4],
          [-0.82, -1.4],
          [0.82, -1.4],
        ] as const) {
          wheelParts.push(
            ...roadWheel(scene, `wheel${x}${z}`, new Vector3(x, 0.311, z), rubber, alloy, brake),
          );
        }
        // One mesh for the set: they never move relative to each other, and
        // the catalog instances every part of a prefab separately.
        const wheels = Mesh.MergeMeshes(wheelParts, true, true, undefined, false, true);
        if (wheels) {
          wheels.name = "wheels";
          parts.push(wheels);
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
      id: "ac_unit_01",
      category: "prop",
      cullAt: 70,
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
      id: "neon_banner_01",
      category: "prop",
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
      id: "bollard_01",
      category: "prop",
      cullAt: 55,
      collides: true,
      build: ({ scene }) => {
        const post = CreateCylinder("post", { diameter: 0.11, height: 0.85, tessellation: 10 }, scene);
        post.position.y = 0.42;
        post.material = materials.painted("bollard_01", new Color3(0.72, 0.72, 0.7), 0.55, 0.3);
        const band = box(
          scene,
          "band",
          { width: 0.13, height: 0.07, depth: 0.13 },
          new Vector3(0, 0.72, 0),
          materials.emissive("bollardBand", new Color3(1, 0.55, 0.15), 0.9),
        );
        const cap = CreateSphere("cap", { diameter: 0.115, segments: 8 }, scene);
        cap.position.y = 0.85;
        cap.material = materials.painted("bollard_01", new Color3(0.72, 0.72, 0.7), 0.55, 0.3);
        return [post, band, cap];
      },
    },
    {
      id: "guardrail_01",
      category: "prop",
      cullAt: 80,
      collides: true,
      build: ({ scene }) => {
        const steel = materials.painted("railSteel", new Color3(0.62, 0.63, 0.62), 0.45, 0.7);
        const parts: Mesh[] = [];
        for (const z of [-1.1, 1.1]) {
          const post = CreateCylinder(`post${z}`, { diameter: 0.075, height: 0.8, tessellation: 8 }, scene);
          post.position.set(0, 0.4, z);
          post.material = steel;
          parts.push(post);
        }
        for (const y of [0.78, 0.45]) {
          const rail = CreateCylinder(`rail${y}`, { diameter: 0.06, height: 2.2, tessellation: 8 }, scene);
          rail.rotation.x = Math.PI / 2;
          rail.position.set(0, y, 0);
          rail.material = steel;
          parts.push(rail);
        }
        return parts;
      },
    },
    {
      id: "utility_box_01",
      category: "prop",
      cullAt: 70,
      collides: true,
      build: ({ scene }) => {
        const shell = box(
          scene,
          "shell",
          { width: 0.55, height: 1.15, depth: 0.42 },
          new Vector3(0, 0.58, 0),
          materials.painted("utilityGrey", new Color3(0.46, 0.47, 0.45), 0.7),
        );
        const plinth = box(
          scene,
          "plinth",
          { width: 0.62, height: 0.1, depth: 0.5 },
          new Vector3(0, 0.05, 0),
          materials.painted("kerb", new Color3(0.5, 0.49, 0.46), 0.8),
        );
        const label = box(
          scene,
          "label",
          { width: 0.22, height: 0.16, depth: 0.02 },
          new Vector3(0.1, 0.86, -0.22),
          materials.painted("labelPlate", new Color3(0.8, 0.78, 0.7), 0.7),
        );
        return [plinth, shell, label];
      },
    },
    {
      id: "drain_grate_01",
      category: "prop",
      cullAt: 40,
      collides: false,
      castsShadow: false,
      build: ({ scene }) => {
        const frame = box(
          scene,
          "frame",
          { width: 0.42, height: 0.04, depth: 0.62 },
          new Vector3(0, 0.02, 0),
          materials.painted("ironDark", new Color3(0.13, 0.13, 0.14), 0.6, 0.7),
        );
        const parts: Mesh[] = [frame];
        for (let i = 0; i < 5; i += 1) {
          parts.push(
            box(
              scene,
              `slot${i}`,
              { width: 0.3, height: 0.05, depth: 0.05 },
              new Vector3(0, 0.015, -0.22 + i * 0.11),
              materials.painted("ironVoid", new Color3(0.03, 0.03, 0.035), 0.9),
            ),
          );
        }
        return parts;
      },
    },
    {
      id: "bike_rack_01",
      category: "prop",
      cullAt: 60,
      collides: false,
      build: ({ scene }) => {
        const steel = materials.painted("railSteel", new Color3(0.62, 0.63, 0.62), 0.45, 0.7);
        const parts: Mesh[] = [];
        for (let i = 0; i < 4; i += 1) {
          const hoop = CreateBox(`hoop${i}`, { width: 0.05, height: 0.5, depth: 0.05 }, scene);
          hoop.position.set(-0.25, 0.25, -0.9 + i * 0.6);
          hoop.material = steel;
          parts.push(hoop);
          const arm = CreateBox(`arm${i}`, { width: 0.55, height: 0.05, depth: 0.05 }, scene);
          arm.position.set(0, 0.48, -0.9 + i * 0.6);
          arm.material = steel;
          parts.push(arm);
        }
        return parts;
      },
    },
    {
      id: "crate_01",
      category: "prop",
      cullAt: 55,
      collides: true,
      build: ({ scene }) => {
        const a = box(
          scene,
          "a",
          { width: 0.52, height: 0.32, depth: 0.38 },
          new Vector3(0, 0.16, 0),
          materials.painted("crateBlue", new Color3(0.12, 0.24, 0.4), 0.85),
        );
        const b = box(
          scene,
          "b",
          { width: 0.5, height: 0.3, depth: 0.36 },
          new Vector3(0.04, 0.47, 0.03),
          materials.painted("crateGrey", new Color3(0.35, 0.35, 0.33), 0.85),
        );
        b.rotation.y = 0.22;
        return [a, b];
      },
    },
    {
      id: "traffic_cone_01",
      category: "prop",
      cullAt: 50,
      collides: false,
      build: ({ scene }) => {
        const body = CreateCylinder(
          "body",
          { diameterTop: 0.04, diameterBottom: 0.26, height: 0.62, tessellation: 10 },
          scene,
        );
        body.position.y = 0.31;
        body.material = materials.painted("coneOrange", new Color3(0.72, 0.24, 0.06), 0.75);
        const base = box(
          scene,
          "base",
          { width: 0.34, height: 0.04, depth: 0.34 },
          new Vector3(0, 0.02, 0),
          materials.painted("coneOrange", new Color3(0.72, 0.24, 0.06), 0.75),
        );
        const stripe = CreateCylinder(
          "stripe",
          { diameterTop: 0.14, diameterBottom: 0.18, height: 0.1, tessellation: 10 },
          scene,
        );
        stripe.position.y = 0.4;
        stripe.material = materials.painted("coneStripe", new Color3(0.82, 0.82, 0.8), 0.7);
        return [base, body, stripe];
      },
    },
    {
      id: "scooter_01",
      category: "vehicle",
      cullAt: 75,
      collides: true,
      build: ({ scene }) => {
        const paint = materials.painted("scooterPaint", new Color3(0.5, 0.5, 0.52), 0.35, 0.5);
        const dark = materials.painted("tyre", new Color3(0.04, 0.04, 0.05), 0.9);
        const parts: Mesh[] = [];
        const body = box(scene, "body", { width: 0.34, height: 0.4, depth: 1.0 }, new Vector3(0, 0.55, -0.1), paint);
        parts.push(body);
        parts.push(box(scene, "deck", { width: 0.32, height: 0.1, depth: 0.55 }, new Vector3(0, 0.32, 0.35), paint));
        parts.push(box(scene, "seat", { width: 0.3, height: 0.12, depth: 0.5 }, new Vector3(0, 0.78, -0.2), dark));
        const column = CreateCylinder("column", { diameter: 0.07, height: 0.75, tessellation: 8 }, scene);
        column.position.set(0, 0.75, 0.62);
        column.rotation.x = -0.22;
        column.material = paint;
        parts.push(column);
        parts.push(box(scene, "bars", { width: 0.6, height: 0.06, depth: 0.06 }, new Vector3(0, 1.08, 0.55), dark));
        for (const [z, d] of [[0.7, 0.42], [-0.55, 0.42]] as const) {
          const wheel = CreateCylinder(`wheel${z}`, { diameter: d, height: 0.11, tessellation: 12 }, scene);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(0, d / 2, z);
          wheel.material = dark;
          parts.push(wheel);
        }
        return parts;
      },
    },
    {
      id: "bench_01",
      category: "prop",
      cullAt: 70,
      collides: true,
      build: ({ scene }) => {
        const wood = materials.painted("benchWood", new Color3(0.3, 0.22, 0.15), 0.85);
        const steel = materials.painted("railSteel", new Color3(0.62, 0.63, 0.62), 0.45, 0.7);
        const parts: Mesh[] = [
          box(scene, "seat", { width: 0.42, height: 0.07, depth: 1.6 }, new Vector3(0, 0.44, 0), wood),
          box(scene, "back", { width: 0.07, height: 0.42, depth: 1.6 }, new Vector3(0.18, 0.68, 0), wood),
        ];
        for (const z of [-0.65, 0.65]) {
          parts.push(box(scene, `leg${z}`, { width: 0.06, height: 0.44, depth: 0.06 }, new Vector3(-0.14, 0.22, z), steel));
          parts.push(box(scene, `leg2${z}`, { width: 0.06, height: 0.44, depth: 0.06 }, new Vector3(0.16, 0.22, z), steel));
        }
        return parts;
      },
    },
    {
      id: "street_condenser_01",
      category: "prop",
      cullAt: 60,
      collides: true,
      build: ({ scene }) => {
        const shell = box(
          scene,
          "shell",
          { width: 0.4, height: 0.72, depth: 0.95 },
          new Vector3(0, 0.42, 0),
          materials.painted("acShell", new Color3(0.6, 0.6, 0.58), 0.7),
        );
        const grille = box(
          scene,
          "grille",
          { width: 0.05, height: 0.55, depth: 0.7 },
          new Vector3(-0.2, 0.42, 0),
          materials.painted("acGrille", new Color3(0.2, 0.2, 0.2), 0.8),
        );
        const frame = box(
          scene,
          "frame",
          { width: 0.5, height: 0.12, depth: 1.02 },
          new Vector3(0, 0.06, 0),
          materials.painted("ironDark", new Color3(0.13, 0.13, 0.14), 0.6, 0.7),
        );
        return [frame, shell, grille];
      },
    },
    {
      id: "gas_bottles_01",
      category: "prop",
      cullAt: 50,
      collides: true,
      build: ({ scene }) => {
        const steel = materials.painted("bottleSteel", new Color3(0.55, 0.5, 0.42), 0.5, 0.6);
        const parts: Mesh[] = [];
        for (let i = 0; i < 3; i += 1) {
          const bottle = CreateCylinder(`bottle${i}`, { diameter: 0.3, height: 0.9, tessellation: 10 }, scene);
          bottle.position.set((i % 2) * 0.32, 0.45, i * 0.3);
          bottle.material = steel;
          parts.push(bottle);
        }
        return parts;
      },
    },
    {
      id: "awning_01",
      category: "prop",
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
