/**
 * Tokyo — one block, after dark, in the rain.
 *
 * Not a city: a street the player can believe they are standing in. Every
 * measurement is real — a 3.25 m traffic lane, a 160 mm kerb, a 1.83 m
 * vending machine — because when the proportions are right, primitives read
 * as a place, and when they are wrong no amount of shading rescues them.
 *
 * All street furniture comes from the prefab registry, so each piece has a
 * glTF slot waiting. The layout code never constructs a vending machine; it
 * asks for one and places it.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Material } from "@babylonjs/core/Materials/material";

import { awaitSceneReady, type GameScene, type SceneContext } from "../engine/SceneManager";
import type { QualitySettings } from "../core/Settings";
import type { Time } from "../core/Time";
import { Sky } from "../world/Sky";
import { Lighting } from "../world/Lighting";
import { Environment } from "../world/Environment";
import { CityMaterials, NEON } from "../world/CityMaterials";
import { PrefabRegistry } from "../world/Prefabs";
import { InteractionSystem } from "../world/Interaction";
import { Crowd } from "../world/Crowd";
import { Traffic } from "../world/Traffic";
import { Weather } from "../world/Weather";
import { LampPool, type LampSite } from "../world/LampPool";
import { makeRandom } from "../world/Noise";
import { tokyoPrefabs } from "./props/tokyo";
import { PlayerController } from "../player/PlayerController";
import { ThirdPersonCamera } from "../player/ThirdPersonCamera";

export const TOKYO_STREET_ID = "tokyoStreet";

// ---------------------------------------------------------------- layout
/** Half-width of the carriageway. Two 3.25 m lanes plus margins. */
const ROAD_HALF = 6;
/** Outer edge of the pavement, where the buildings start. */
const PAVE_OUTER = 11.5;
const KERB = 0.16;
const BLOCK_FROM = -78;
const BLOCK_TO = 78;
const CROSSING_Z = 0;
const CROSSING_HALF = 3.2;
const STATION_Z = 50;
const KONBINI_Z = -16;
const SEED = 4703;

/** Evening. Late enough for the signs to matter. */
const START_TIME_OF_DAY = 0.87;

export async function createTokyoStreet(ctx: SceneContext): Promise<GameScene> {
  const { engine, settings, input, audio, ui, state } = ctx;
  const quality = settings.value;

  ctx.progress(0.04, "Arriving in the city…");
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  scene.blockMaterialDirtyMechanism = true;
  scene.autoClearDepthAndStencil = true;

  const materials = new CityMaterials(
    scene,
    quality.textureSize,
    Math.min(8, Math.max(1, engine.getCaps().maxAnisotropy)),
  );
  const random = makeRandom(SEED);
  const collidable: Mesh[] = [];
  const casters: Mesh[] = [];

  const slab = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: Material,
    collides = true,
  ): Mesh => {
    const mesh = CreateBox(name, size, scene);
    mesh.position.copyFrom(at);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.checkCollisions = collides;
    mesh.isPickable = collides;
    mesh.freezeWorldMatrix();
    if (collides) collidable.push(mesh);
    return mesh;
  };

  // ------------------------------------------------------------- surfaces
  ctx.progress(0.14, "Laying the road…");
  const roadLength = BLOCK_TO - BLOCK_FROM;

  // Wet asphalt is darker and far smoother than dry, so the road's material
  // is one the weather can retune every frame.
  const roadMaterial = materials.road(ROAD_HALF * 2, roadLength);
  slab(
    "road",
    { width: ROAD_HALF * 2, height: 0.3, depth: roadLength },
    new Vector3(0, -0.15, (BLOCK_FROM + BLOCK_TO) / 2),
    roadMaterial,
  );

  const paving = materials.surfaceScaled("paving", PAVE_OUTER - ROAD_HALF, roadLength);
  const kerbMaterial = materials.painted("kerb", new Color3(0.5, 0.49, 0.46), 0.8);
  for (const side of [-1, 1] as const) {
    const centre = side * (ROAD_HALF + (PAVE_OUTER - ROAD_HALF) / 2);
    slab(
      `pavement${side}`,
      { width: PAVE_OUTER - ROAD_HALF, height: KERB, depth: roadLength },
      new Vector3(centre, KERB / 2, (BLOCK_FROM + BLOCK_TO) / 2),
      paving,
    );
    // The kerb stone itself, so the edge reads as granite rather than as the
    // side of the pavement slab.
    slab(
      `kerb${side}`,
      { width: 0.22, height: KERB + 0.02, depth: roadLength },
      new Vector3(side * (ROAD_HALF + 0.11), (KERB + 0.02) / 2, (BLOCK_FROM + BLOCK_TO) / 2),
      kerbMaterial,
      false,
    );
  }

  // Road markings sit a whisker above the asphalt to avoid z-fighting.
  const paint = materials.painted("roadPaint", new Color3(0.78, 0.78, 0.74), 0.7);
  const paintDeck = new TransformNode("markings", scene);
  const marking = (
    name: string,
    width: number,
    depth: number,
    x: number,
    z: number,
  ): void => {
    const mesh = CreateBox(name, { width, height: 0.02, depth }, scene);
    mesh.position.set(x, 0.011, z);
    mesh.material = paint;
    mesh.parent = paintDeck;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
  };
  for (let z = BLOCK_FROM + 3; z < BLOCK_TO; z += 6) {
    if (Math.abs(z - CROSSING_Z) < CROSSING_HALF + 2) continue;
    marking(`centre${z}`, 0.14, 3, 0, z);
  }
  for (const side of [-1, 1] as const) {
    marking(`edge${side}`, 0.12, roadLength, side * (ROAD_HALF - 0.5), (BLOCK_FROM + BLOCK_TO) / 2);
  }
  // Crossing: ladder bars, plus the stop line each side of it.
  for (let x = -ROAD_HALF + 0.9; x < ROAD_HALF - 0.6; x += 1.15) {
    marking(`zebra${x.toFixed(1)}`, 0.55, CROSSING_HALF * 2, x, CROSSING_Z);
  }
  for (const side of [-1, 1] as const) {
    marking(`stopLine${side}`, ROAD_HALF - 0.6, 0.3, side * (ROAD_HALF / 2 - 0.1), CROSSING_Z + side * (CROSSING_HALF + 1));
  }

  // Kerb ramps at the crossing, so stepping off the pavement is a slope.
  for (const side of [-1, 1] as const) {
    const ramp = CreateBox(
      `ramp${side}`,
      { width: 1.3, height: KERB, depth: CROSSING_HALF * 2 },
      scene,
    );
    ramp.position.set(side * (ROAD_HALF + 0.65), KERB / 2 - 0.04, CROSSING_Z);
    ramp.rotation.z = side * 0.12;
    ramp.material = paving;
    ramp.checkCollisions = true;
    ramp.receiveShadows = true;
    collidable.push(ramp);
  }

  // ------------------------------------------------------------ buildings
  ctx.progress(0.3, "Raising the block…");
  const facades = [
    materials.facade("a", { columns: 6, rows: 10, litFraction: 0.55, seed: 11 }),
    materials.facade("b", { columns: 5, rows: 14, litFraction: 0.42, seed: 29 }),
    materials.facade("c", { columns: 8, rows: 8, litFraction: 0.63, seed: 47 }),
  ];
  const shopFront = materials.surface("tileWall", 6);
  const glass = materials.glass();
  const buildingRoots: TransformNode[] = [];

  interface Storefront {
    x: number;
    z: number;
    width: number;
    side: -1 | 1;
  }
  const storefronts: Storefront[] = [];

  for (const side of [-1, 1] as const) {
    let z = BLOCK_FROM;
    while (z < BLOCK_TO) {
      const width = 8 + random() * 9;
      const gap = random() < 0.18 ? 1.2 + random() * 1.6 : 0.35;
      const depth = 12 + random() * 10;
      const height = 9 + random() * (random() < 0.22 ? 26 : 12);
      const centreZ = z + width / 2;
      // Leave the station forecourt and the shop plot clear.
      const reserved =
        (side === 1 && Math.abs(centreZ - STATION_Z) < 11) ||
        (side === -1 && Math.abs(centreZ - KONBINI_Z) < 9);
      if (reserved) {
        z += width + gap;
        continue;
      }

      const x = side * (PAVE_OUTER + depth / 2);
      const root = new TransformNode(`building.${side}.${centreZ.toFixed(0)}`, scene);
      buildingRoots.push(root);

      const tower = slab(
        `tower.${side}.${centreZ.toFixed(0)}`,
        { width: depth, height, depth: width },
        new Vector3(x, height / 2, centreZ),
        facades[Math.floor(random() * facades.length)] ?? facades[0]!,
      );
      tower.parent = root;

      // Ground floor: a shallow shop box pushed out toward the pavement.
      const shopDepth = 1.4;
      const shop = slab(
        `shop.${side}.${centreZ.toFixed(0)}`,
        { width: shopDepth, height: 3.4, depth: width - 0.6 },
        new Vector3(side * (PAVE_OUTER - shopDepth / 2 + 0.05), 1.7, centreZ),
        shopFront,
      );
      shop.parent = root;

      const window = CreateBox(
        `glass.${side}.${centreZ.toFixed(0)}`,
        { width: 0.08, height: 2.3, depth: width - 1.8 },
        scene,
      );
      window.position.set(side * (PAVE_OUTER - shopDepth - 0.02), 1.75, centreZ);
      window.material = glass;
      window.isPickable = false;
      window.parent = root;

      // Warm spill from inside the shop, which is what actually lights the
      // pavement in a street like this.
      const spill = CreateBox(
        `spill.${side}.${centreZ.toFixed(0)}`,
        { width: 0.06, height: 1.9, depth: width - 2.6 },
        scene,
      );
      // Behind the glass, not in front of it: at -0.12 these panels sat out
      // over the pavement and read as a white wall rather than an interior.
      spill.position.set(side * (PAVE_OUTER - shopDepth + 0.02), 1.7, centreZ);
      // A shop's interior seen through glass: bright, but nowhere near the
      // brightness of a sign. Large emissive areas clip to white long before
      // small ones do, so they get a fraction of the strength.
      spill.material = materials.emissive(
        random() < 0.5 ? "shopWarm" : "shopCool",
        random() < 0.5 ? new Color3(1, 0.84, 0.62) : new Color3(0.86, 0.94, 1),
        0.35,
      );
      spill.isPickable = false;
      spill.parent = root;

      storefronts.push({ x: side * (PAVE_OUTER - 0.2), z: centreZ, width, side });

      // Roof clutter reads as a real building from street level.
      if (random() < 0.7) {
        const box = slab(
          `roofbox.${side}.${centreZ.toFixed(0)}`,
          { width: 2 + random() * 2, height: 1.2 + random() * 1.4, depth: 2 + random() * 2 },
          new Vector3(x + (random() - 0.5) * depth * 0.4, height + 0.7, centreZ + (random() - 0.5) * width * 0.4),
          shopFront,
          false,
        );
        box.parent = root;
      }
      z += width + gap;
    }
  }

  // ------------------------------------------------------------- konbini
  ctx.progress(0.44, "Opening the shop…");
  const konbini = new TransformNode("konbini", scene);
  {
    const w = 13;
    const d = 9;
    const x = -(PAVE_OUTER + d / 2);
    slab(
      "konbini.shell",
      { width: d, height: 4.2, depth: w },
      new Vector3(x, 2.1, KONBINI_Z),
      materials.painted("konbiniShell", new Color3(0.5, 0.51, 0.5), 0.7),
    ).parent = konbini;
    // Full-height glazing, and the flat white interior glow behind it that
    // makes a convenience store visible from the far end of a street.
    const front = CreateBox("konbini.glass", { width: 0.1, height: 2.9, depth: w - 1.2 }, scene);
    front.position.set(-(PAVE_OUTER - 0.1), 1.6, KONBINI_Z);
    front.material = glass;
    front.isPickable = false;
    front.parent = konbini;

    const interior = CreateBox("konbini.interior", { width: 0.08, height: 2.7, depth: w - 1.6 }, scene);
    interior.position.set(-(PAVE_OUTER + 0.35), 1.6, KONBINI_Z);
    interior.material = materials.emissive("konbiniInterior", new Color3(0.94, 0.98, 1), 0.8);
    interior.isPickable = false;
    interior.parent = konbini;

    // The three-stripe fascia band. Colours of our own.
    const stripes: [Color3, number][] = [
      [NEON.lime, 0.34],
      [NEON.gold, 0],
      [NEON.ice, -0.34],
    ];
    for (const [colour, offset] of stripes) {
      const band = CreateBox(`konbini.band${offset}`, { width: 0.06, height: 0.3, depth: w - 0.4 }, scene);
      band.position.set(-(PAVE_OUTER - 0.16), 3.7 + offset, KONBINI_Z);
      band.material = materials.emissive(`band${offset}`, colour, 3);
      band.isPickable = false;
      band.parent = konbini;
    }
  }

  // ------------------------------------------------------ station entrance
  ctx.progress(0.52, "Finding the way underground…");
  const station = new TransformNode("station", scene);
  const stationMouth = new Vector3(PAVE_OUTER - 2.4, KERB, STATION_Z);
  {
    const concrete = materials.surface("concrete", 8);
    // A recessed forecourt with a canopy and a stair going down.
    slab(
      "station.wall",
      { width: 9, height: 7, depth: 20 },
      new Vector3(PAVE_OUTER + 4.5, 3.5, STATION_Z),
      concrete,
    ).parent = station;

    const canopy = slab(
      "station.canopy",
      { width: 5.4, height: 0.35, depth: 9 },
      new Vector3(PAVE_OUTER - 1.2, 3.6, STATION_Z),
      concrete,
      false,
    );
    canopy.parent = station;

    for (const z of [STATION_Z - 4.2, STATION_Z + 4.2]) {
      slab(
        `station.column${z}`,
        { width: 0.4, height: 3.6, depth: 0.4 },
        new Vector3(PAVE_OUTER - 3.4, 1.8, z),
        concrete,
      ).parent = station;
    }

    // Descending treads. They are walkable — the controller steps them.
    for (let i = 0; i < 7; i += 1) {
      const tread = slab(
        `station.step${i}`,
        { width: 3.6, height: 0.34, depth: 0.6 },
        new Vector3(PAVE_OUTER + 0.6 + i * 0.6, KERB - 0.17 - i * 0.3, STATION_Z),
        concrete,
      );
      tread.parent = station;
    }
    const mouth = CreateBox("station.mouth", { width: 0.1, height: 2.6, depth: 3.6 }, scene);
    mouth.position.set(PAVE_OUTER + 4.6, 0.6, STATION_Z);
    mouth.material = materials.emissive("stationGlow", new Color3(0.78, 0.88, 1), 0.7);
    mouth.isPickable = false;
    mouth.parent = station;

    const sign = CreateBox("station.sign", { width: 0.12, height: 0.8, depth: 6 }, scene);
    sign.position.set(PAVE_OUTER - 3.9, 4.3, STATION_Z);
    sign.material = materials.signboard("station", NEON.ice, 314);
    sign.isPickable = false;
    sign.parent = station;
  }

  // ------------------------------------------------------------- prefabs
  ctx.progress(0.62, "Setting the street furniture…");
  const prefabs = new PrefabRegistry(scene, ctx.assets);
  prefabs.defineAll(tokyoPrefabs(materials));
  await prefabs.prepare([
    "streetLight",
    "utilityPole",
    "vendingMachine",
    "trafficLight",
    "signPost",
    "trashBin",
    "planter",
    "bicycle",
    "car",
    "acUnit",
    "neonBanner",
    "awning",
  ]);

  const poleTops: Vector3[] = [];
  const lampSites: LampSite[] = [];
  for (const side of [-1, 1] as const) {
    const edge = side * (ROAD_HALF + 0.9);
    for (let z = BLOCK_FROM + 8; z < BLOCK_TO; z += 17) {
      prefabs.spawn("streetLight", {
        position: new Vector3(edge, KERB, z),
        rotationY: side > 0 ? Math.PI : 0,
      });
      // The lamp head hangs 1.36 m out over the carriageway.
      // Babylon's point lights fall off with the square of distance, so the
      // useful range of intensities is small: 30 puts about three quarters
      // of full exposure on the pavement directly beneath the lamp head.
      lampSites.push({
        position: new Vector3(edge - side * 1.36, 5.9, z),
        colour: new Color3(1, 0.9, 0.74),
        intensity: 30,
        range: 26,
      });
    }
    if (side === -1) {
      for (let z = BLOCK_FROM + 14; z < BLOCK_TO; z += 23) {
        prefabs.spawn("utilityPole", { position: new Vector3(edge - 0.4, KERB, z) });
        poleTops.push(new Vector3(edge - 0.4, 7.9, z));
      }
    }
  }

  // Overhead lines. One lines mesh for the lot: cheap, and the tangle of
  // wires overhead is half of what makes a Tokyo backstreet look like one.
  if (poleTops.length > 1) {
    const spans: Vector3[][] = [];
    for (let i = 1; i < poleTops.length; i += 1) {
      const a = poleTops[i - 1]!;
      const b = poleTops[i]!;
      for (const [dx, dy] of [
        [-0.7, 0],
        [0, -0.02],
        [0.7, 0.01],
        [0.35, -0.72],
      ] as const) {
        const sag = 0.55;
        const points: Vector3[] = [];
        for (let t = 0; t <= 6; t += 1) {
          const f = t / 6;
          points.push(
            new Vector3(
              a.x + dx,
              a.y + dy - Math.sin(f * Math.PI) * sag,
              a.z + (b.z - a.z) * f,
            ),
          );
        }
        spans.push(points);
      }
    }
    const wires = CreateLineSystem("wires", { lines: spans }, scene);
    wires.color = new Color3(0.05, 0.05, 0.06);
    wires.isPickable = false;
  }

  for (const side of [-1, 1] as const) {
    for (const offset of [-1, 1] as const) {
      prefabs.spawn("trafficLight", {
        position: new Vector3(side * (ROAD_HALF + 0.7), KERB, CROSSING_Z + offset * (CROSSING_HALF + 1.6)),
        rotationY: side > 0 ? Math.PI : 0,
      });
    }
  }

  // A bank of machines outside the shop, then a scattering elsewhere.
  const vendingSpots: Vector3[] = [];
  for (let i = 0; i < 3; i += 1) {
    const spot = new Vector3(-(PAVE_OUTER - 0.55), KERB, KONBINI_Z + 5.4 + i * 1.18);
    prefabs.spawn("vendingMachine", { position: spot, rotationY: Math.PI / 2 });
    vendingSpots.push(spot);
  }
  for (const [x, z] of [
    [PAVE_OUTER - 0.55, -34],
    [PAVE_OUTER - 0.55, 18],
    [-(PAVE_OUTER - 0.55), 34],
  ] as const) {
    const spot = new Vector3(x, KERB, z);
    prefabs.spawn("vendingMachine", {
      position: spot,
      rotationY: x > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
    vendingSpots.push(spot);
  }

  for (const front of storefronts) {
    if (random() < 0.55) {
      prefabs.spawn("awning", {
        position: new Vector3(front.x - front.side * 0.6, 3.15, front.z),
        rotationY: front.side > 0 ? Math.PI / 2 : -Math.PI / 2,
      });
    }
    if (random() < 0.62) {
      prefabs.spawn("neonBanner", {
        position: new Vector3(front.x - front.side * 0.5, 4.6 + random() * 2.4, front.z + (random() - 0.5) * 2),
        rotationY: front.side > 0 ? Math.PI / 2 : -Math.PI / 2,
      });
    }
    if (random() < 0.5) {
      prefabs.spawn("acUnit", {
        position: new Vector3(front.x - front.side * 0.35, 4.6 + random() * 3, front.z + (random() - 0.5) * 3),
        rotationY: front.side > 0 ? Math.PI / 2 : -Math.PI / 2,
      });
    }
  }

  for (let i = 0; i < 26; i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (ROAD_HALF + 1.2 + random() * 3.4);
    const z = BLOCK_FROM + random() * (BLOCK_TO - BLOCK_FROM);
    if (Math.abs(z - CROSSING_Z) < 6) continue;
    const roll = random();
    const id = roll < 0.3 ? "trashBin" : roll < 0.6 ? "planter" : roll < 0.85 ? "bicycle" : "signPost";
    prefabs.spawn(id, { position: new Vector3(x, KERB, z), rotationY: random() * Math.PI * 2 });
  }

  // ------------------------------------------------------------- lighting
  ctx.progress(0.72, "Turning the lights on…");
  const sky = new Sky(scene, quality.drawDistance);
  const lighting = new Lighting(scene);
  // A city at night is never black: sodium and sign light bounce off every
  // wet surface. Faking that in the ambient term costs one light, not fifty.
  // Enough bounce to read the pavement by, not so much that it stops being
  // night. The lamps and the signs are meant to do the work.
  lighting.setUrbanGlow(new Color3(0.07, 0.09, 0.15), new Color3(0.19, 0.12, 0.08), 0.5);
  const environment = new Environment(scene, sky);

  // Landmarks get their own entries in the pool, brighter and further
  // reaching than a street lamp, because they are what the player steers by.
  lampSites.push({
    position: new Vector3(0, 6.6, CROSSING_Z),
    colour: new Color3(1, 0.95, 0.85),
    intensity: 62,
    range: 44,
  });
  lampSites.push({
    position: new Vector3(-(PAVE_OUTER - 2.4), 3.2, KONBINI_Z),
    colour: new Color3(0.95, 0.98, 1),
    intensity: 46,
    range: 30,
  });
  lampSites.push({
    position: new Vector3(PAVE_OUTER - 2.6, 3.4, STATION_Z),
    colour: new Color3(0.72, 0.86, 1),
    intensity: 42,
    range: 28,
  });
  const lamps = new LampPool(scene, lampSites, 4);

  // Every lit material now sees the moon, the ambient dome and up to four
  // pooled lamps at once, which is past a PBR material's default budget.
  for (const material of scene.materials) {
    const withLights = material as Material & { maxSimultaneousLights?: number };
    if (typeof withLights.maxSimultaneousLights === "number") {
      withLights.maxSimultaneousLights = 6;
    }
  }

  // ------------------------------------------------------------- player
  ctx.progress(0.8, "Stepping outside…");
  const spawn = new Vector3(-(ROAD_HALF + 2.6), KERB, -46);
  const camera = new ThirdPersonCamera(scene, input);
  camera.setFarPlane(quality.drawDistance);
  // Open looking north, up the street, with the station lights at the far end.
  camera.setHeading(0, 0.2);
  const player = new PlayerController(scene, input, camera, audio, spawn);
  // Wide enough to include the station forecourt and the shop plot; the
  // buildings themselves are kept out of bounds by their own collision.
  player.setBounds({
    minX: -21,
    maxX: 21,
    minZ: BLOCK_FROM + 2,
    maxZ: BLOCK_TO - 2,
    floorY: -4,
  });
  scene.activeCamera = camera.camera;
  ctx.setActiveCamera(camera.camera);

  casters.push(...player.character.meshes);

  // ---------------------------------------------------------- inhabitants
  ctx.progress(0.87, "Letting people out…");
  const crowd = new Crowd(scene, materials, {
    count: Math.round(26 * Math.min(1.4, Math.max(0.4, quality.foliageDensity))),
    crossingZ: CROSSING_Z,
    seed: SEED + 1,
    lanes: [
      { x: -(ROAD_HALF + 2.2), from: BLOCK_FROM + 4, to: BLOCK_TO - 4, y: KERB },
      { x: -(ROAD_HALF + 4.1), from: BLOCK_FROM + 4, to: BLOCK_TO - 4, y: KERB },
      { x: ROAD_HALF + 2.2, from: BLOCK_FROM + 4, to: BLOCK_TO - 4, y: KERB },
      { x: ROAD_HALF + 4.1, from: BLOCK_FROM + 4, to: BLOCK_TO - 4, y: KERB },
    ],
  });

  const traffic = new Traffic(prefabs, {
    crossingZ: CROSSING_Z,
    carsPerLane: 5,
    vehicleGreen: 15,
    pedestrianGreen: 9,
    seed: SEED + 2,
    lanes: [
      { x: -2.9, y: 0, from: BLOCK_FROM, to: BLOCK_TO, direction: 1 },
      { x: 2.9, y: 0, from: BLOCK_FROM, to: BLOCK_TO, direction: -1 },
    ],
  });

  const weather = new Weather(scene, { maxDrops: 3600, radius: 15, height: 13 });
  weather.setBudget(quality.foliageDensity);
  weather.setTarget(0.72);

  // ---------------------------------------------------------- boundaries
  // Invisible walls at the ends of the block: better than letting the player
  // walk off the end of the built world and find out it stops.
  const wall = materials.painted("bound", new Color3(0, 0, 0), 1);
  for (const z of [BLOCK_FROM - 1, BLOCK_TO + 1]) {
    const bound = slab(
      `bound${z}`,
      { width: PAVE_OUTER * 2 + 8, height: 12, depth: 1 },
      new Vector3(0, 6, z),
      wall,
    );
    bound.isVisible = false;
  }

  // -------------------------------------------------------------- shadows
  lighting.applySettings(quality);
  for (const mesh of casters) lighting.addCaster(mesh, false);
  for (const id of ["car", "vendingMachine", "streetLight", "trashBin", "planter", "bicycle", "signPost"]) {
    for (const template of prefabs.templates(id)) lighting.addCaster(template, false);
  }
  for (const template of crowd.shadowTemplates) lighting.addCaster(template, false);

  scene.blockMaterialDirtyMechanism = false;

  // ---------------------------------------------------------- interaction
  const interaction = new InteractionSystem(ui, input);
  for (const [index, spot] of vendingSpots.entries()) {
    interaction.add({
      id: `vending.${index}`,
      position: spot.add(new Vector3(spot.x < 0 ? 1 : -1, 0, 0)),
      radius: 2.1,
      label: "Buy a hot can",
      activate: () => {
        audio.blip(880, 0.09);
        state.give("cannedCoffee", 1);
        window.setTimeout(() => audio.blip(520, 0.16), 260);
        ui.say(
          state.itemCount("cannedCoffee") === 1
            ? "Hot, and too sweet. It steadies her hands."
            : `Canned coffee ×${state.itemCount("cannedCoffee")}. She is stalling and she knows it.`,
          4.5,
        );
      },
    });
  }
  interaction.add({
    id: "station",
    position: stationMouth,
    radius: 3.4,
    label: "Enter the station",
    activate: () => {
      state.raise("reachedStation");
      audio.blip(420, 0.2);
      ui.say(
        "The last train south leaves at 23:40. There is nothing left up here to stay for.",
        6,
      );
      ui.setObjective("Board the last train south");
    },
  });

  // ------------------------------------------------------------ ambience
  const cityAmbience = audio.startCityAmbience();
  const rainAmbience = audio.startRain();
  cityAmbience?.setIntensity(0.85);
  rainAmbience?.setIntensity(0.6);
  // A four-chord loop in a minor mode; slow enough to sit under the traffic.
  const cue = audio.startCue([
    [0, 3, 7, 14],
    [-2, 3, 5, 12],
    [-4, 3, 8, 15],
    [-5, 2, 7, 12],
  ], 7.5);
  cue?.setIntensity(0.55);
  for (const spot of vendingSpots.slice(0, 3)) {
    audio.startHum(spot, 118, 9)?.setIntensity(0.7);
  }

  await awaitSceneReady(scene, 45);
  ctx.progress(1, "Ready.");

  state.setRegion(TOKYO_STREET_ID);
  ui.setObjective("Find the station");
  ui.say("Tokyo, a little before midnight. The rain has not let up all week.", 6.5);

  // ---------------------------------------------------------------- loop
  let elapsed = 0;
  const region: GameScene = {
    id: TOKYO_STREET_ID,
    scene,
    get camera(): Camera {
      return camera.camera;
    },

    update(time: Time): void {
      const dt = time.deltaSeconds;
      elapsed += dt;

      if (input.justPressed("cameraToggle")) camera.swapShoulder();

      player.update(dt);
      const feet = player.position;
      camera.update(feet, player.speed01, dt);

      const solar = sky.update(time.timeOfDay);
      lighting.update(solar);
      environment.update(time.rawDeltaSeconds);

      // Fog stays a warm city haze rather than the sky's near-black, so the
      // far end of the street dissolves into sign light.
      scene.fogColor = Color3.Lerp(
        sky.horizonColor(),
        new Color3(0.09, 0.08, 0.11),
        0.55,
      );

      lamps.update(dt, feet);
      traffic.update(dt);
      crowd.update(dt, feet, traffic.pedestriansMayCross);
      weather.update(dt, camera.camera.position);

      // Wet asphalt: darker, and smooth enough to hold the sign light.
      const wet = weather.wetness;
      roadMaterial.roughness = 0.78 - wet * 0.62;
      roadMaterial.albedoColor = new Color3(1 - wet * 0.55, 1 - wet * 0.55, 1 - wet * 0.5);
      player.surface = { hardness: 0.75 + wet * 0.25 };

      interaction.update(feet);
      audio.setListener(
        camera.camera.position,
        camera.camera.getDirection(Vector3.Forward()),
        Vector3.Up(),
      );

      // Traffic signal drives the visible bulbs as well as the cars.
      void elapsed;

      state.setPlayerPose({ x: feet.x, y: feet.y, z: feet.z, yaw: player.facingAngle });
      state.setClock(time.day, time.timeOfDay);
    },

    onSettingsChanged(next: Readonly<QualitySettings>): void {
      lighting.applySettings(next);
      environment.applySettings(next);
      camera.setFarPlane(next.drawDistance);
      sky.setFarPlane(next.drawDistance);
      weather.setBudget(next.foliageDensity);
    },

    dispose(): void {
      interaction.dispose();
      cue?.stop();
      cityAmbience?.stop();
      rainAmbience?.stop();
      weather.dispose();
      traffic.dispose();
      crowd.dispose();
      player.dispose();
      camera.dispose();
      prefabs.dispose();
      lamps.dispose();
      environment.dispose();
      lighting.dispose();
      sky.dispose();
      materials.dispose();
    },
  };

  environment.applySettings(quality);
  ctx.time.timeOfDay = START_TIME_OF_DAY;
  return region;
}
