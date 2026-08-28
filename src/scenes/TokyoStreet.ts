/**
 * Tokyo — one backstreet, after midnight, in the rain.
 *
 * Rebuilt from the first version, which was a wide road between two rows of
 * extruded boxes. The two things that were wrong with it were the
 * proportions and the density, and they are related: a 12 m carriageway with
 * 5.5 m pavements is an arterial road, and an arterial road needs a hundred
 * objects to look occupied, so it looked empty. A real backstreet in this
 * part of the city is about seven metres kerb to kerb with two and a half
 * metres of pavement, and at that width the buildings lean over you and a
 * dozen objects fill it.
 *
 * So: sixty-four metres of street, sixteen buildings, every ground floor a
 * business you can see into, and street furniture placed the way it actually
 * accumulates — against the wall, at the kerb, and wherever a shop has put
 * something out.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
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
import { CityMaterials, NEON, ROAD_TILE } from "../world/CityMaterials";
import { AssetCatalog } from "../engine/AssetCatalog";
import { InteractionSystem } from "../world/Interaction";
import { Citizens, type Doorway } from "../world/Citizens";
import { Traffic } from "../world/Traffic";
import { Weather } from "../world/Weather";
import { LampPool, type LampSite } from "../world/LampPool";
import { WetGround } from "../world/WetGround";
import { planarUv, tint } from "../world/Shapes";
import { STATION_COPY } from "../world/Signage";
import { buildAlley } from "../world/Alley";
import { buildBuilding, type BusinessKind, type BuiltBuilding } from "../world/Facades";
import { ShopInteriors } from "../world/ShopInterior";
import { buildEnterable, type EnterableRoom } from "../world/Interiors";
import { makeRandom } from "../world/Noise";
import { tokyoPrefabs } from "./props/tokyo";
import { PlayerController } from "../player/PlayerController";
import { ThirdPersonCamera } from "../player/ThirdPersonCamera";
import { TRAIN_INTERLUDE_ID } from "./TrainInterlude";

export const TOKYO_STREET_ID = "tokyoStreet";

// ---------------------------------------------------------------- layout
/** Half the carriageway: two 3.4 m lanes, which is what these streets are. */
const ROAD_HALF = 3.4;
/**
 * The building line. Three metres of pavement each side.
 *
 * Two and a half was more authentic and unplayable: with poles and railings
 * on it, the walkable band came out at about a metre, and a third-person
 * camera three metres behind her spent the whole street inside a utility
 * pole. Three metres keeps the street narrow and enclosed and leaves her
 * somewhere to walk.
 */
const PAVE_OUTER = 6.4;
const KERB = 0.15;
const BLOCK_FROM = -32;
const BLOCK_TO = 32;
const CROSSING_Z = 5;
const CROSSING_HALF = 2.6;
const STATION_Z = 27;
/** The alley mouth, on the west side between the two shuttered units. */
const ALLEY_Z = 2.5;
const SEED = 91733;
/** The hanging banners, which differ only in what they say. */
const BANNERS = ["neon_banner_01", "neon_banner_02", "neon_banner_03"] as const;
/** Late. The signs are the light source, which is the point of the place. */
const START_TIME_OF_DAY = 0.965;

interface Plot {
  z: number;
  width: number;
  floors: number;
  depth: number;
  business: BusinessKind;
  /** Shops with a real room behind the door rather than a view of one. */
  enterable?: boolean;
}

/**
 * The two frontages, plotted by hand.
 *
 * Deliberately not random: a street reads as a place when the businesses are
 * arranged the way businesses arrange themselves — the konbini on the corner
 * by the crossing, food clustered together, a shuttered unit between them,
 * and the residential entrances filling the gaps.
 */
const WEST: Plot[] = [
  { z: -28, width: 7.5, floors: 4, depth: 11, business: "lobby" },
  { z: -20, width: 6.5, floors: 3, depth: 10, business: "laundry" },
  { z: -13, width: 7, floors: 5, depth: 12, business: "izakaya" },
  { z: -5.5, width: 8, floors: 2, depth: 12, business: "ramen", enterable: true },
  // Two narrow shuttered units either side of the alley mouth, which is what
  // is left when a lane takes the middle of a plot.
  { z: -0.8, width: 1.8, floors: 4, depth: 10, business: "shutter" },
  { z: 6, width: 2.2, floors: 3, depth: 10, business: "shutter" },
  { z: 11.2, width: 7.5, floors: 3, depth: 12, business: "maidcafe", enterable: true },
  { z: 18, width: 7, floors: 6, depth: 13, business: "bookshop" },
  { z: 25.5, width: 6.5, floors: 4, depth: 10, business: "lobby" },
];

const EAST: Plot[] = [
  { z: -27, width: 7, floors: 3, depth: 10, business: "salon" },
  { z: -19.5, width: 7.5, floors: 5, depth: 12, business: "izakaya" },
  { z: -12, width: 6.5, floors: 2, depth: 10, business: "shutter" },
  { z: -4, width: 9, floors: 3, depth: 13, business: "konbini", enterable: true },
  { z: 5.5, width: 6.5, floors: 4, depth: 11, business: "lobby" },
  { z: 13, width: 7, floors: 3, depth: 11, business: "cafe" },
  { z: 20.5, width: 7, floors: 5, depth: 12, business: "bookshop" },
];

export async function createTokyoStreet(ctx: SceneContext): Promise<GameScene> {
  const { engine, settings, input, audio, ui, state } = ctx;
  const quality = settings.value;

  ctx.progress(0.03, "Arriving in the city…");
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  scene.blockMaterialDirtyMechanism = true;
  // Glass and water draw in group 1 and must keep the depth the opaque pass
  // wrote, or a shopfront window paints over the room behind it.
  scene.setRenderingAutoClearDepthStencil(1, false, false, false);

  const materials = new CityMaterials(
    scene,
    quality.textureSize,
    Math.min(8, Math.max(1, engine.getCaps().maxAnisotropy)),
  );
  const random = makeRandom(SEED);
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
    return mesh;
  };

  // ------------------------------------------------------------- surfaces
  ctx.progress(0.1, "Laying the road…");
  const roadLength = BLOCK_TO - BLOCK_FROM + 24;
  const roadCentre = (BLOCK_FROM + BLOCK_TO) / 2;
  const roadMaterial = materials.road();
  planarUv(
    slab(
      "road",
      { width: ROAD_HALF * 2, height: 0.3, depth: roadLength },
      new Vector3(0, -0.15, roadCentre),
      roadMaterial,
    ),
    ROAD_TILE,
  );

  // Everything laid on the carriageway: the tracks the traffic has polished,
  // the joints between passes of the paver, the trench patches, and the
  // ironwork. A road with none of these reads as a grey ribbon; a road with
  // them reads as a road that has been dug up and mended for forty years.
  const trackMaterial = materials.road({ polish: 0.24 });
  const roadSurfaces = [roadMaterial, trackMaterial];

  const onRoad = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: Material,
    options: { rotationY?: number; shade?: number } = {},
  ): Mesh => {
    const mesh = CreateBox(name, size, scene);
    mesh.position.copyFrom(at);
    mesh.rotation.y = options.rotationY ?? 0;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    // Same grain as the road under it, continuous across the join, and a
    // tone of its own from vertex colour rather than a second material.
    planarUv(mesh, ROAD_TILE);
    if (options.shade !== undefined) {
      tint(mesh, new Color3(options.shade, options.shade, options.shade));
    }
    mesh.freezeWorldMatrix();
    return mesh;
  };

  // Two wheel tracks a lane, worn smooth by everything that has driven over
  // them. In the rain they are the brightest thing on the carriageway.
  for (const lane of [-1, 1] as const) {
    for (const offset of [-0.78, 0.78]) {
      onRoad(
        `wheelTrack${lane}${offset}`,
        { width: 0.5, height: 0.02, depth: roadLength - 2 },
        new Vector3(lane * (ROAD_HALF / 2) + offset * 0.5, 0.003, roadCentre),
        trackMaterial,
        { shade: 0.88 },
      );
    }
  }

  const seamMaterial = materials.painted("roadSeam", new Color3(0.042, 0.04, 0.04), 0.6);
  // Backfilled trenches are the same asphalt, laid later and smoother.
  const patchMaterial = materials.road({ polish: 0.45 });
  roadSurfaces.push(patchMaterial);
  // The gutter joint down each kerb, and the transverse joints between the
  // paver's passes.
  for (const side of [-1, 1] as const) {
    onRoad(
      `gutterSeam${side}`,
      { width: 0.05, height: 0.02, depth: roadLength },
      new Vector3(side * (ROAD_HALF - 0.42), 0.004, roadCentre),
      seamMaterial,
    );
  }
  {
    const seams = makeRandom(SEED + 61);
    for (let z = BLOCK_FROM - 8; z < BLOCK_TO + 8; z += 11 + seams() * 6) {
      if (Math.abs(z - CROSSING_Z) < CROSSING_HALF + 1.5) continue;
      onRoad(`crossSeam${z.toFixed(1)}`, { width: ROAD_HALF * 2, height: 0.02, depth: 0.06 }, new Vector3(0, 0.004, z), seamMaterial);
    }
    // Trench patches: a utility cut, backfilled and never quite matched.
    for (let i = 0; i < 5; i += 1) {
      const z = BLOCK_FROM + 4 + seams() * (roadLength - 12);
      if (Math.abs(z - CROSSING_Z) < CROSSING_HALF + 2) continue;
      const width = 1.1 + seams() * 2.4;
      const depth = 0.9 + seams() * 2.2;
      onRoad(
        `roadPatch${i}`,
        { width, height: 0.024, depth },
        new Vector3((seams() - 0.5) * (ROAD_HALF * 1.4), 0.005, z),
        patchMaterial,
        { rotationY: (seams() - 0.5) * 0.08, shade: 0.72 + seams() * 0.12 },
      );
    }
    // Cracks, as meshes rather than as texture: a crack in a tiled map
    // repeats down the whole street and reads as a stripe. Laid once, they
    // read as cracks.
    for (let i = 0; i < 7; i += 1) {
      const z = BLOCK_FROM + 2 + seams() * (roadLength - 8);
      const x = (seams() - 0.5) * (ROAD_HALF * 1.7);
      const length = 1.2 + seams() * 3.5;
      onRoad(
        `roadCrack${i}`,
        { width: 0.05 + seams() * 0.03, height: 0.02, depth: length },
        new Vector3(x, 0.0045, z),
        seamMaterial,
        { rotationY: (seams() - 0.5) * 1.6 },
      );
      // A branch off it, so it bends the way a crack does.
      onRoad(
        `roadCrackBranch${i}`,
        { width: 0.04, height: 0.02, depth: length * 0.55 },
        new Vector3(x + (seams() - 0.5) * 0.6, 0.0045, z + length * 0.35),
        seamMaterial,
        { rotationY: (seams() - 0.5) * 2.2 },
      );
    }

    // Ironwork. A manhole is the one thing on a road surface with a hard
    // edge and a highlight, which is why a street without them looks flat.
    const iron = materials.painted("manhole", new Color3(0.14, 0.135, 0.13), 0.42, 0.75);
    const ironRim = materials.painted("manholeRim", new Color3(0.1, 0.1, 0.1), 0.7);
    for (let i = 0; i < 7; i += 1) {
      const onPavement = i >= 5;
      const z = BLOCK_FROM + 3 + seams() * (roadLength - 10);
      const x = onPavement
        ? (seams() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.2 + seams() * 2)
        : (seams() - 0.5) * (ROAD_HALF * 1.5);
      const y = onPavement ? KERB : 0;
      const diameter = onPavement ? 0.5 : 0.66;
      const frame = CreateCylinder(`manholeFrame${i}`, { diameter: diameter + 0.1, height: 0.02, tessellation: 20 }, scene);
      frame.position.set(x, y + 0.006, z);
      frame.material = ironRim;
      frame.isPickable = false;
      frame.freezeWorldMatrix();
      const cover = CreateCylinder(`manhole${i}`, { diameter, height: 0.03, tessellation: 20 }, scene);
      cover.position.set(x, y + 0.008, z);
      cover.material = iron;
      cover.isPickable = false;
      cover.freezeWorldMatrix();
    }
  }

  // A floor under everything. The pavement stops at the building line, the
  // shopfronts are recessed behind it, and the gap between the two was a
  // hole she could sprint into and fall out of the world through.
  slab(
    "base",
    { width: 60, height: 0.4, depth: roadLength + 20 },
    new Vector3(0, -0.35, roadCentre),
    materials.surface("concrete", 20),
  );

  // One tile every three metres, laid on the ground plane rather than on
  // each slab's own face, so the pavement reads as paving instead of as
  // corduroy.
  const PAVE_TILE = 0.9;
  const paving = materials.planarSurface("paving", PAVE_TILE);
  const kerbMaterial = materials.painted("kerb", new Color3(0.5, 0.49, 0.46), 0.8);
  for (const side of [-1, 1] as const) {
    planarUv(
      slab(
        `pavement${side}`,
        // Run it past the building line so the recessed doorways have floor.
        { width: PAVE_OUTER - ROAD_HALF + 0.8, height: KERB, depth: roadLength },
        new Vector3(side * (ROAD_HALF + (PAVE_OUTER - ROAD_HALF + 0.8) / 2), KERB / 2, roadCentre),
        paving,
      ),
      PAVE_TILE,
    );
    slab(
      `kerb${side}`,
      { width: 0.2, height: KERB + 0.02, depth: roadLength },
      new Vector3(side * (ROAD_HALF + 0.1), (KERB + 0.02) / 2, roadCentre),
      kerbMaterial,
      false,
    );
  }

  // Markings sit a whisker above the asphalt to avoid z-fighting.
  const paint = materials.painted("roadPaint", new Color3(0.76, 0.76, 0.72), 0.7);
  const markings = new TransformNode("markings", scene);
  const marking = (name: string, width: number, depth: number, x: number, z: number): void => {
    const mesh = CreateBox(name, { width, height: 0.02, depth }, scene);
    mesh.position.set(x, 0.011, z);
    mesh.material = paint;
    mesh.parent = markings;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
  };
  for (let z = BLOCK_FROM - 10; z < BLOCK_TO + 10; z += 5) {
    if (Math.abs(z - CROSSING_Z) < CROSSING_HALF + 2) continue;
    marking(`centre${z}`, 0.11, 2.4, 0, z);
  }
  for (let x = -ROAD_HALF + 0.75; x < ROAD_HALF - 0.5; x += 0.95) {
    marking(`zebra${x.toFixed(1)}`, 0.44, CROSSING_HALF * 2, x, CROSSING_Z);
  }
  for (const side of [-1, 1] as const) {
    marking(`stop${side}`, ROAD_HALF - 0.5, 0.26, side * (ROAD_HALF / 2 - 0.1), CROSSING_Z + side * (CROSSING_HALF + 0.9));
  }

  // Tactile paving and a dropped kerb at the crossing.
  const tactile = materials.painted("tactile", new Color3(0.82, 0.74, 0.28), 0.85);
  for (const side of [-1, 1] as const) {
    const ramp = slab(
      `ramp${side}`,
      { width: 1.1, height: KERB, depth: CROSSING_HALF * 2 },
      new Vector3(side * (ROAD_HALF + 0.55), KERB / 2 - 0.035, CROSSING_Z),
      paving,
    );
    ramp.rotation.z = side * 0.1;
    planarUv(ramp, PAVE_TILE);
    const pad = CreateBox(`tactile${side}`, { width: 0.9, height: 0.03, depth: CROSSING_HALF * 1.7 }, scene);
    pad.position.set(side * (ROAD_HALF + 0.75), KERB + 0.005, CROSSING_Z);
    pad.material = tactile;
    pad.isPickable = false;
  }

  // ------------------------------------------------------------ buildings
  ctx.progress(0.22, "Raising the frontages…");
  const interiors = new ShopInteriors(scene, materials);
  const rooms: EnterableRoom[] = [];
  const buildings: BuiltBuilding[] = [];
  let plotSeed = SEED;
  for (const [side, plots] of [[-1, WEST], [1, EAST]] as const) {
    for (const plot of plots) {
      plotSeed += 37;
      const built = buildBuilding(scene, materials, {
        width: plot.width,
        depth: plot.depth,
        floors: plot.floors,
        setback: PAVE_OUTER,
        z: plot.z,
        side,
        business: plot.business,
        variant: plotSeed % 5,
        seed: plotSeed,
        enterable: plot.enterable,
      });
      buildings.push(built);
      if (!built.interior) continue;

      if (
        plot.enterable &&
        (plot.business === "ramen" || plot.business === "konbini" || plot.business === "maidcafe")
      ) {
        // A real room, not a view of one.
        rooms.push(
          buildEnterable(
            scene,
            {
              id: plot.business === "maidcafe" ? "maid_cafe_01" : `${plot.business}_shop_01`,
              kind: plot.business === "maidcafe" ? "cafe" : plot.business,
              faceX: side * PAVE_OUTER,
              out: -side,
              z: plot.z,
              doorZ: built.interior.doorZ,
              width: plot.width - 0.6,
              depth: plot.depth - 1.2,
              height: 2.9,
            },
            () => undefined,
          ),
        );
      } else {
        interiors.add(plot.business, { ...built.interior, out: -side }, plotSeed);
      }
    }
  }

  // ------------------------------------------------------ station entrance
  ctx.progress(0.4, "Finding the way underground…");
  const station = new TransformNode("station", scene);
  const stationMouth = new Vector3(PAVE_OUTER - 2, KERB, STATION_Z);
  {
    const concrete = materials.surface("concrete", 8);
    slab("station.wall", { width: 10, height: 8, depth: 12 }, new Vector3(PAVE_OUTER + 5, 4, STATION_Z), concrete).parent = station;
    slab("station.canopy", { width: 4.6, height: 0.3, depth: 7 }, new Vector3(PAVE_OUTER - 1, 3.3, STATION_Z), concrete, false).parent = station;
    for (const z of [STATION_Z - 3.2, STATION_Z + 3.2]) {
      slab(`station.col${z}`, { width: 0.36, height: 3.3, depth: 0.36 }, new Vector3(PAVE_OUTER - 3, 1.65, z), concrete).parent = station;
    }
    for (let i = 0; i < 7; i += 1) {
      slab(
        `station.step${i}`,
        { width: 3.2, height: 0.34, depth: 0.55 },
        new Vector3(PAVE_OUTER + 0.5 + i * 0.55, KERB - 0.17 - i * 0.29, STATION_Z),
        concrete,
      ).parent = station;
    }
    const mouth = CreateBox("station.mouth", { width: 0.1, height: 2.4, depth: 3.2 }, scene);
    mouth.position.set(PAVE_OUTER + 4.4, 0.5, STATION_Z);
    mouth.material = materials.emissive("stationGlow", new Color3(0.78, 0.88, 1), 0.75);
    mouth.isPickable = false;
    mouth.parent = station;
    const sign = CreateBox("station.sign", { width: 0.12, height: 0.7, depth: 5 }, scene);
    sign.position.set(PAVE_OUTER - 3.4, 3.95, STATION_Z);
    sign.material = materials.painted("signPlate", new Color3(0.03, 0.035, 0.04), 0.6);
    sign.isPickable = false;
    sign.parent = station;
    // The name of the station, facing the street it is on.
    const signFace = CreatePlane("station.signFace", { width: 5, height: 0.7 }, scene);
    signFace.position.set(PAVE_OUTER - 3.47, 3.95, STATION_Z);
    signFace.rotation.y = Math.PI / 2;
    signFace.material = materials.sign("station", STATION_COPY, NEON.ice, 5 / 0.7);
    signFace.isPickable = false;
    signFace.parent = station;
  }

  // -------------------------------------------------------------- prefabs
  ctx.progress(0.5, "Setting the street furniture…");
  const catalog = new AssetCatalog(scene, ctx.assets);
  catalog.defineAll(tokyoPrefabs(materials));
  await catalog.prepare([
    "street_light_01", "utility_pole_01", "vending_machine_01", "traffic_light_01", "sign_post_01",
    "trash_bin_01", "planter_01", "bicycle_01", "tokyo_car_01", ...BANNERS,
    "bollard_01", "guardrail_01", "utility_box_01", "drain_grate_01", "bike_rack_01",
    "crate_01", "traffic_cone_01", "scooter_01", "bench_01", "street_condenser_01", "gas_bottles_01",
  ]);

  catalog.applyLevelsOfDetail();
  catalog.reportMissing("Tokyo backstreet");

  const lampSites: LampSite[] = [];
  const poleTops: Vector3[] = [];

  // Lamps and poles alternate down the two kerbs, which is how a street this
  // width is actually lit and wired.
  for (const side of [-1, 1] as const) {
    const kerbX = side * (ROAD_HALF + 0.35);
    for (let z = BLOCK_FROM + 4; z < BLOCK_TO; z += 13) {
      const at = z + (side > 0 ? 6.5 : 0);
      if (at > BLOCK_TO - 2) continue;
      catalog.spawn("street_light_01", { position: new Vector3(kerbX, KERB, at), rotationY: side > 0 ? Math.PI : 0 });
      lampSites.push({
        position: new Vector3(kerbX - side * 1.36, 5.9, at),
        colour: new Color3(1, 0.9, 0.74),
        intensity: 26,
        range: 22,
      });
    }
    if (side === -1) {
      for (let z = BLOCK_FROM + 9; z < BLOCK_TO; z += 15) {
        catalog.spawn("utility_pole_01", { position: new Vector3(kerbX - 0.1, KERB, z) });
        poleTops.push(new Vector3(kerbX - 0.1, 7.9, z));
      }
    }
  }

  // Overhead lines. Half of what makes a Tokyo backstreet look like one is
  // the tangle above head height.
  if (poleTops.length > 1) {
    const spans: Vector3[][] = [];
    for (let i = 1; i < poleTops.length; i += 1) {
      const a = poleTops[i - 1]!;
      const b = poleTops[i]!;
      for (const [dx, dy] of [[-0.7, 0], [0, -0.02], [0.7, 0.01], [0.35, -0.72], [-0.35, -0.9]] as const) {
        const points: Vector3[] = [];
        for (let t = 0; t <= 6; t += 1) {
          const f = t / 6;
          points.push(new Vector3(a.x + dx, a.y + dy - Math.sin(f * Math.PI) * 0.5, a.z + (b.z - a.z) * f));
        }
        spans.push(points);
      }
    }
    // And a few drops across the street to the far frontage.
    for (const top of poleTops) {
      spans.push([
        new Vector3(top.x, top.y - 0.4, top.z),
        new Vector3(0, top.y - 1.1, top.z + 1.5),
        new Vector3(PAVE_OUTER - 0.4, top.y - 1.6, top.z + 2.5),
      ]);
    }
    const wires = CreateLineSystem("wires", { lines: spans }, scene);
    wires.color = new Color3(0.04, 0.04, 0.05);
    wires.isPickable = false;
  }

  for (const side of [-1, 1] as const) {
    for (const offset of [-1, 1] as const) {
      catalog.spawn("traffic_light_01", {
        position: new Vector3(side * (ROAD_HALF + 0.5), KERB, CROSSING_Z + offset * (CROSSING_HALF + 1.2)),
        rotationY: side > 0 ? Math.PI : 0,
      });
    }
  }

  /**
   * Street clutter.
   *
   * Two lines of it: one hard against the shopfronts where shops put things
   * out, one at the kerb where the street's own equipment goes. Objects are
   * kept clear of the doorways and the crossing, which is what stops a dense
   * street from becoming an obstacle course.
   */
  const doorZs = buildings.map((b) => b.entrance.z);
  const clearOfDoors = (z: number, margin: number): boolean =>
    doorZs.every((d) => Math.abs(d - z) > margin) && Math.abs(z - CROSSING_Z) > CROSSING_HALF + 1.5;

  const vendingSpots: Vector3[] = [];
  for (const side of [-1, 1] as const) {
    const wallX = side * (PAVE_OUTER - 0.42);
    const kerbX = side * (ROAD_HALF + 0.4);
    const facing = side > 0 ? -Math.PI / 2 : Math.PI / 2;

    // Against the wall.
    for (let z = BLOCK_FROM + 2; z < BLOCK_TO - 1; z += 1.6 + random() * 1.4) {
      if (!clearOfDoors(z, 2.1)) continue;
      const roll = random();
      if (roll < 0.14) {
        const spot = new Vector3(wallX - side * 0.1, KERB, z);
        catalog.spawn("vending_machine_01", { position: spot, rotationY: facing });
        vendingSpots.push(spot);
      } else if (roll < 0.28) {
        catalog.spawn("street_condenser_01", { position: new Vector3(wallX, KERB, z), rotationY: facing });
      } else if (roll < 0.4) {
        catalog.spawn("crate_01", { position: new Vector3(wallX, KERB, z), rotationY: random() * 6.28 });
      } else if (roll < 0.5) {
        catalog.spawn("gas_bottles_01", { position: new Vector3(wallX, KERB, z), rotationY: random() * 6.28 });
      } else if (roll < 0.6) {
        catalog.spawn("trash_bin_01", { position: new Vector3(wallX, KERB, z), rotationY: random() * 6.28 });
      } else if (roll < 0.7) {
        catalog.spawn("utility_box_01", { position: new Vector3(wallX, KERB, z), rotationY: facing });
      } else if (roll < 0.82) {
        catalog.spawn("bicycle_01", { position: new Vector3(wallX + side * 0.2, KERB, z), rotationY: facing + 0.1 });
      } else if (roll < 0.9) {
        catalog.spawn("planter_01", { position: new Vector3(wallX, KERB, z), rotationY: random() * 6.28 });
      } else {
        catalog.spawn("bench_01", { position: new Vector3(wallX, KERB, z), rotationY: facing });
      }
    }

    // At the kerb.
    for (let z = BLOCK_FROM + 3; z < BLOCK_TO - 2; z += 2.2 + random() * 2) {
      if (Math.abs(z - CROSSING_Z) < CROSSING_HALF + 2) continue;
      const roll = random();
      if (roll < 0.35) {
        catalog.spawn("bollard_01", { position: new Vector3(kerbX, KERB, z) });
      } else if (roll < 0.5) {
        catalog.spawn("guardrail_01", { position: new Vector3(kerbX, KERB, z) });
      } else if (roll < 0.62) {
        catalog.spawn("traffic_cone_01", { position: new Vector3(kerbX - side * 0.3, KERB, z) });
      } else if (roll < 0.72) {
        catalog.spawn("scooter_01", { position: new Vector3(kerbX - side * 0.6, KERB, z), rotationY: facing });
      } else if (roll < 0.82) {
        catalog.spawn("bike_rack_01", { position: new Vector3(kerbX - side * 0.5, KERB, z), rotationY: facing });
        for (let b = 0; b < 3; b += 1) {
          catalog.spawn("bicycle_01", { position: new Vector3(kerbX - side * 0.75, KERB, z - 0.9 + b * 0.6), rotationY: facing });
        }
      } else if (roll < 0.9) {
        catalog.spawn("sign_post_01", { position: new Vector3(kerbX, KERB, z), rotationY: facing });
      }
      if (random() < 0.3) {
        catalog.spawn("drain_grate_01", { position: new Vector3(side * (ROAD_HALF - 0.45), 0.011, z + 0.6) });
      }
    }

    // Hanging signage above the shopfronts, on the frontages themselves.
    for (const plot of side === -1 ? WEST : EAST) {
      if (plot.business === "shutter" || plot.business === "lobby") continue;
      catalog.spawn(BANNERS[Math.floor(random() * BANNERS.length)] ?? "neon_banner_01", {
        position: new Vector3(side * (PAVE_OUTER - 0.35), 5.4 + random() * 2.6, plot.z + (random() - 0.5) * plot.width * 0.5),
        rotationY: facing,
      });
    }
  }

  // ---------------------------------------------------------- the backdrop
  ctx.progress(0.62, "Filling in the skyline…");
  const skyline = new TransformNode("skyline", scene);
  {
    // Exterior only, no collision, never approached: enough towers beyond
    // the block that the street reads as one street in a city rather than a
    // diorama on a table. Three depth bands so it has parallax.
    const facades = [
      materials.facade("far1", { columns: 8, rows: 22, litFraction: 0.3, seed: 71 }),
      materials.facade("far2", { columns: 6, rows: 30, litFraction: 0.22, seed: 83 }),
      materials.facade("far3", { columns: 10, rows: 18, litFraction: 0.37, seed: 97 }),
    ];
    const bands: [number, number, number][] = [
      [26, 55, 14],
      [58, 110, 26],
      [125, 210, 40],
    ];
    for (const [nearest, furthest, maxWidth] of bands) {
      for (let i = 0; i < 46; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = nearest + random() * (furthest - nearest);
        const x = Math.cos(angle) * radius;
        const z = roadCentre + Math.sin(angle) * radius * 1.3;
        // Leave the street's own corridor clear.
        if (Math.abs(x) < 22 && Math.abs(z - roadCentre) < 60) continue;
        const width = 8 + random() * maxWidth;
        const height = 18 + random() * (radius * 0.55);
        const tower = CreateBox(`skyline.${i}.${radius.toFixed(0)}`, { width, height, depth: width * (0.7 + random() * 0.6) }, scene);
        tower.position.set(x, height / 2, z);
        tower.rotation.y = random() * Math.PI;
        tower.material = facades[Math.floor(random() * facades.length)] ?? facades[0]!;
        tower.isPickable = false;
        tower.parent = skyline;
        tower.freezeWorldMatrix();
        // A red aircraft light on the tall ones, which is most of what the
        // Tokyo skyline is after dark.
        if (height > 55 && random() < 0.7) {
          const beacon = CreateBox(`beacon.${i}`, { width: 1.2, height: 1.2, depth: 1.2 }, scene);
          beacon.position.set(x, height + 1, z);
          beacon.material = materials.emissive("beacon", new Color3(1, 0.12, 0.1), 2.2);
          beacon.isPickable = false;
          beacon.parent = skyline;
        }
      }
    }
  }

  // -------------------------------------------------------------- lighting
  ctx.progress(0.72, "Turning the lights on…");
  // ---------------------------------------------------------------- alley
  // Between the two shuttered units: three metres wide, eleven deep, and
  // dark at the far end.
  const alley = buildAlley(scene, materials, {
    faceX: -PAVE_OUTER,
    out: 1,
    z: ALLEY_Z,
    width: 4.2,
    depth: 11,
    wallHeight: 9,
    seed: SEED + 21,
  });
  lampSites.push({ position: alley.lampAt, colour: alley.lampColour, intensity: 15, range: 11 });

  const sky = new Sky(scene, quality.drawDistance);
  const lighting = new Lighting(scene);
  // A lit street is never black. The ambient carries the bounce off wet
  // asphalt and forty signs; the pooled lamps carry the local contrast.
  lighting.setUrbanGlow(new Color3(0.07, 0.09, 0.15), new Color3(0.2, 0.13, 0.09), 0.55);
  const environment = new Environment(scene, sky);
  // What the windows have to show. The frontages carry the signage and the
  // lit shopfronts, and the near towers carry the rest of the city's light;
  // the small street furniture is left out, because at a probe's resolution
  // a bollard is one dark pixel that costs a draw call.
  environment.reflect([
    ...buildings.flatMap((built) => built.meshes),
    ...skyline
      .getChildMeshes()
      .filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.position.length() < 70),
  ]);

  // Shopfronts are light sources too, and they are what makes some stretches
  // of the pavement bright and others dark.
  for (const built of buildings) {
    if (!built.interior) continue;
    const warm = built.business === "konbini" || built.business === "laundry";
    lampSites.push({
      position: new Vector3(built.entrance.x, 2.2, built.entrance.z),
      colour: warm ? new Color3(0.86, 0.94, 1) : new Color3(1, 0.78, 0.5),
      intensity: warm ? 34 : 24,
      range: warm ? 16 : 12,
    });
  }
  lampSites.push({
    position: new Vector3(0, 5.6, CROSSING_Z),
    colour: new Color3(1, 0.95, 0.85),
    intensity: 44,
    range: 30,
  });
  // What the rain leaves behind: puddles across the carriageway, and a smear
  // of each of those lights down the wet ground under it.
  const wetGround = new WetGround(
    scene,
    lampSites.map((site) => ({ at: site.position, colour: site.colour, strength: site.intensity / 34 })),
    {
      y: 0.016,
      roadHalf: ROAD_HALF,
      paveOuter: PAVE_OUTER,
      from: BLOCK_FROM + 2,
      to: BLOCK_TO - 2,
      clearAround: { z: CROSSING_Z, half: CROSSING_HALF + 1 },
      seed: SEED + 5,
      puddles: quality.foliageDensity > 0.6 ? 30 : 18,
    },
  );

  const lamps = new LampPool(scene, lampSites, 4);

  for (const material of scene.materials) {
    const withLights = material as Material & { maxSimultaneousLights?: number };
    if (typeof withLights.maxSimultaneousLights === "number") withLights.maxSimultaneousLights = 6;
  }

  // --------------------------------------------------------------- player
  ctx.progress(0.8, "Stepping outside…");
  // Mid-pavement, clear of both the kerb line and the shopfronts.
  const spawn = new Vector3(-(ROAD_HALF + 1.6), KERB, -25);
  const camera = new ThirdPersonCamera(scene, input);
  camera.setFarPlane(Math.max(340, quality.drawDistance));
  camera.setHeading(0, 0.16);
  const player = new PlayerController(scene, input, camera, audio, spawn);
  // Wide enough to contain the enterable rooms, which reach ten metres back
  // from the building line. Everything solid between here and there is
  // collidable, so the bounds are a backstop rather than the wall.
  // The district is one level: the road, the pavement over its kerb, the
  // rooms behind the building line and the alley beyond them. Only the
  // station stairs go below it, so only they are left to collision alone.
  player.setGroundHeight((x, z) =>
    x > PAVE_OUTER && Math.abs(z - STATION_Z) < 7 ? -3 : 0,
  );
  player.setBounds({
    minX: -18,
    maxX: 18,
    minZ: BLOCK_FROM - 6,
    maxZ: BLOCK_TO + 2,
    floorY: -2,
  });
  scene.activeCamera = camera.camera;
  ctx.setActiveCamera(camera.camera);
  casters.push(...player.character.meshes);
  // Only the built mass stops the camera. Street furniture is scenery.
  for (const built of buildings) camera.addOccluders(built.meshes);
  camera.addOccluders(scene.meshes.filter((m) => m.name.startsWith("station.")));
  camera.addOccluders(alley.shell);

  // ----------------------------------------------------------- inhabitants
  ctx.progress(0.88, "Letting people out…");
  // Doors people actually use. Fed from the buildings, so adding a shop to
  // the plot table puts people in and out of it with no further work.
  const doorways: Doorway[] = buildings
    .filter((b) => b.interior)
    .map((b, i) => ({
      id: `door.${i}`,
      at: b.entrance.clone(),
      facing: b.entrance.x < 0 ? -Math.PI / 2 : Math.PI / 2,
    }));

  const crowd = new Citizens(scene, materials, {
    // The floor matters more than the ceiling: a street with ten people on it
    // reads as empty at any frame rate, so the low preset still gets a crowd
    // and pays for it with detail range instead.
    count: Math.round(30 * Math.min(1.4, Math.max(0.6, quality.foliageDensity))),
    crossingZ: CROSSING_Z,
    doors: doorways,
    seed: SEED + 1,
    lanes: [
      { x: -(ROAD_HALF + 1.2), from: BLOCK_FROM + 2, to: BLOCK_TO - 2, y: KERB },
      { x: -(ROAD_HALF + 2.2), from: BLOCK_FROM + 2, to: BLOCK_TO - 2, y: KERB },
      { x: ROAD_HALF + 1.2, from: BLOCK_FROM + 2, to: BLOCK_TO - 2, y: KERB },
      { x: ROAD_HALF + 2.2, from: BLOCK_FROM + 2, to: BLOCK_TO - 2, y: KERB },
    ],
  });

  const traffic = new Traffic(catalog, {
    crossingZ: CROSSING_Z,
    carsPerLane: 3,
    vehicleGreen: 16,
    pedestrianGreen: 10,
    seed: SEED + 2,
    lanes: [
      { x: -1.7, y: 0, from: BLOCK_FROM - 12, to: BLOCK_TO + 12, direction: 1 },
      { x: 1.7, y: 0, from: BLOCK_FROM - 12, to: BLOCK_TO + 12, direction: -1 },
    ],
  });

  const weather = new Weather(scene, { maxDrops: 3600, radius: 12, height: 12 });
  weather.setBudget(quality.foliageDensity);
  weather.setTarget(0.7);

  // Ends of the block: the street runs on past them visually, but not on foot.
  const wall = materials.painted("bound", new Color3(0, 0, 0), 1);
  for (const z of [BLOCK_FROM - 7, BLOCK_TO + 3]) {
    slab(`bound${z}`, { width: PAVE_OUTER * 2 + 6, height: 14, depth: 1 }, new Vector3(0, 7, z), wall).isVisible = false;
  }

  // --------------------------------------------------------------- shadows
  lighting.applySettings(quality);
  for (const mesh of casters) lighting.addCaster(mesh, false);
  for (const built of buildings) for (const mesh of built.meshes) lighting.addCaster(mesh, false);
  for (const id of ["tokyo_car_01", "vending_machine_01", "street_light_01", "trash_bin_01", "planter_01", "bicycle_01", "bollard_01", "guardrail_01", "utility_box_01", "crate_01", "scooter_01", "bench_01", "street_condenser_01"]) {
    for (const template of catalog.templates(id)) lighting.addCaster(template, false);
  }
  for (const template of crowd.shadowTemplates) lighting.addCaster(template, false);

  scene.blockMaterialDirtyMechanism = false;

  // ----------------------------------------------------------- interaction
  const interaction = new InteractionSystem(ui, input);
  for (const [index, spot] of vendingSpots.entries()) {
    interaction.add({
      id: `vending.${index}`,
      position: spot.add(new Vector3(spot.x < 0 ? 1 : -1, 0, 0)),
      radius: 1.7,
      label: "Buy a hot can",
      activate: () => {
        audio.blip(880, 0.09);
        player.playAnimation("interact");
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

  /** What she notices at each door. The street's storytelling lives here. */
  const DOOR_LINES: Partial<Record<BusinessKind, string>> = {
    ramen: "Six seats, five of them taken. The cook does not look up.",
    konbini: "Open, the way it has been open every night of her life here.",
    cafe: "Chairs already stacked on two of the tables.",
    izakaya: "Someone inside is telling the end of a story, loudly.",
    laundry: "One machine still turning. Nobody watching it.",
    bookshop: "Shut. The window display has not changed since spring.",
    salon: "Shut. A single lamp left on over the mirrors.",
  };
  for (const [index, built] of buildings.entries()) {
    const line = DOOR_LINES[built.business];
    if (!line) continue;
    interaction.add({
      id: `door.${index}`,
      position: built.entrance.clone(),
      radius: 1.9,
      label: built.business === "konbini" || built.business === "ramen" ? "Look inside" : "Look",
      activate: () => {
        player.playAnimation("interact");
        audio.blip(340, 0.1);
        ui.say(line, 4.5);
      },
    });
  }

  /**
   * What there is to do inside.
   *
   * Interactions are declared where the room is, so a shop with a counter
   * and a cook has ordering and conversation without the street's code
   * knowing anything about ramen.
   */
  let seatedAt: EnterableRoom | null = null;
  for (const room of rooms) {
    if (room.kind === "ramen") {
      const seat = room.seats.find((s) => !s.taken);
      if (seat) {
        interaction.add({
          id: `${room.id}.sit`,
          position: seat.at.clone(),
          radius: 1.3,
          label: seatedAt === room ? "Get up" : "Sit at the counter",
          activate: () => {
            if (seatedAt === room) {
              seatedAt = null;
              player.releaseAnimation();
              player.setLocked(false);
              ui.say("She leaves the stool spinning.", 3);
              return;
            }
            seatedAt = room;
            player.teleport(new Vector3(seat.at.x, KERB, seat.at.z), seat.facing);
            player.setLocked(true);
            player.playAnimation("sit");
            audio.blip(300, 0.14);
            ui.say("The stool is still warm. The cook does not look up.", 4);
          },
        });
      }
      interaction.add({
        id: `${room.id}.order`,
        position: room.counterAt.clone(),
        radius: 2.2,
        label: "Order",
        activate: () => {
          audio.blip(660, 0.12);
          if (seatedAt === room) player.playAnimation("eat");
          state.give("ramen", 1);
          state.raise("ateRamen");
          ui.say(
            state.itemCount("ramen") === 1
              ? "\"Shoyu. Extra spring onion.\" He is already reaching for a bowl."
              : "\"Same again?\" He does not wait for an answer.",
            5,
          );
        },
      });
    }

    if (room.kind === "konbini") {
      interaction.add({
        id: `${room.id}.shelf`,
        position: new Vector3(room.threshold.x + (room.threshold.x < 0 ? -2.4 : 2.4), 0, room.threshold.z - 1.5),
        radius: 2,
        label: "Take something from the shelf",
        activate: () => {
          player.playAnimation("pickUp");
          audio.blip(720, 0.08);
          const items = ["onigiri", "bento", "melonBread", "coldTea"];
          const item = items[Math.floor(Math.random() * items.length)] ?? "onigiri";
          state.give(item, 1);
          ui.say(`She puts a ${item.replace(/([A-Z])/g, " $1").toLowerCase()} in the basket.`, 3.5);
        },
      });
      interaction.add({
        id: `${room.id}.till`,
        position: room.counterAt.clone(),
        radius: 2,
        label: "Pay",
        activate: () => {
          player.playAnimation("interact");
          audio.blip(880, 0.07);
          window.setTimeout(() => audio.blip(1180, 0.09), 180);
          const basket =
            state.itemCount("onigiri") + state.itemCount("bento") +
            state.itemCount("melonBread") + state.itemCount("coldTea");
          state.raise("shoppedAtKonbini");
          ui.say(
            basket === 0
              ? "\"Nothing today?\" The clerk goes back to the magazine rack."
              : `${basket} item${basket === 1 ? "" : "s"}. He bags them without being asked and wishes her a good night.`,
            5,
          );
        },
      });
    }

    if (room.kind === "cafe") {
      const seat = room.seats.find((s) => !s.taken);
      if (seat) {
        interaction.add({
          id: `${room.id}.sit`,
          position: seat.at.clone(),
          radius: 1.4,
          label: "Take a table",
          activate: () => {
            if (seatedAt === room) {
              seatedAt = null;
              player.releaseAnimation();
              player.setLocked(false);
              ui.say("She leaves the cup where it is.", 3);
              return;
            }
            seatedAt = room;
            player.teleport(new Vector3(seat.at.x, KERB, seat.at.z), seat.facing);
            player.setLocked(true);
            player.playAnimation("sit");
            audio.blip(520, 0.12);
            ui.say("Someone is singing along to the speakers. Nobody minds.", 4);
          },
        });
      }
      interaction.add({
        id: `${room.id}.order`,
        position: room.counterAt.clone(),
        radius: 2.4,
        label: "Order",
        activate: () => {
          audio.blip(780, 0.1);
          window.setTimeout(() => audio.blip(980, 0.1), 150);
          state.give("cremeSoda", 1);
          state.raise("visitedCafe");
          ui.say(
            state.itemCount("cremeSoda") === 1
              ? "\"Welcome home.\" It is what they say to everyone, and it still lands."
              : "\"Another? Of course.\"",
            5,
          );
        },
      });
    }
  }

  interaction.add({
    id: "alley.shrine",
    position: alley.shrineAt.clone(),
    radius: 1.8,
    label: "Leave a coin",
    activate: () => {
      player.playAnimation("interact");
      audio.blip(1240, 0.1);
      window.setTimeout(() => audio.blip(880, 0.16), 220);
      state.raise("leftOffering");
      ui.say(
        "The coin rings on the stone. For a moment the rain sounds further away than it is.",
        5.5,
      );
    },
  });

  interaction.add({
    id: "station",
    position: stationMouth,
    radius: 3.2,
    label: "Take the last train south",
    activate: async () => {
      state.raise("reachedStation");
      audio.blip(420, 0.22);
      ui.hidePrompt();
      ui.setObjective(null);
      ui.say("23:40. There is nothing left up here to stay for.", 4);
      await new Promise((resolve) => window.setTimeout(resolve, 2200));
      ctx.travel(TRAIN_INTERLUDE_ID);
    },
  });

  // -------------------------------------------------------------- ambience
  const cityAmbience = audio.startCityAmbience();
  const rainAmbience = audio.startRain();
  cityAmbience?.setIntensity(0.8);
  rainAmbience?.setIntensity(0.62);
  const cue = audio.startCue(
    [
      [0, 3, 7, 14],
      [-2, 3, 5, 12],
      [-4, 3, 8, 15],
      [-5, 2, 7, 12],
    ],
    7.5,
  );
  cue?.setIntensity(0.5);
  for (const spot of vendingSpots.slice(0, 4)) audio.startHum(spot, 118, 8)?.setIntensity(0.7);

  await awaitSceneReady(scene, 60);
  ctx.progress(1, "Ready.");

  state.setRegion(TOKYO_STREET_ID);
  ui.setObjective("Find the station");
  ui.say("Tokyo, a little before midnight. The rain has not let up all week.", 6.5);
  ctx.time.timeOfDay = START_TIME_OF_DAY;

  const region: GameScene = {
    id: TOKYO_STREET_ID,
    scene,
    get camera(): Camera {
      return camera.camera;
    },

    update(time: Time): void {
      const dt = time.deltaSeconds;
      if (input.justPressed("cameraToggle")) camera.swapShoulder();

      player.update(dt);
      const feet = player.position;
      camera.update(feet, player.speed01, dt);

      const solar = sky.update(time.timeOfDay);
      lighting.update(solar);
      environment.update(time.rawDeltaSeconds);
      // The far end of the street dissolves into sign light, not into black.
      scene.fogColor = Color3.Lerp(sky.horizonColor(), new Color3(0.11, 0.09, 0.12), 0.5);

      // Inside, the street framing puts the camera through the back wall.
      const room = rooms.find((r) => r.contains(feet)) ?? null;
      // The alley is three metres wide, which is closer than the street
      // camera can hold without ending up in a wall.
      camera.setProfile(room || alley.contains(feet) ? "interior" : "street");
      for (const each of rooms) each.update(dt);
      alley.update(dt, feet);
      cityAmbience?.setIntensity(room ? 0.28 : 0.8);
      rainAmbience?.setIntensity(room ? 0.14 : 0.62);

      lamps.update(dt, feet);
      traffic.update(dt);
      crowd.setWetness(weather.wetness);
      wetGround.setWetness(weather.wetness);
      crowd.setTimeOfDay(time.timeOfDay);
      crowd.update(dt, feet, traffic.pedestriansMayCross);
      weather.update(dt, camera.camera.position);

      const wet = weather.wetness;
      // Roughness is a multiplier over the asphalt's own map now, so the
      // patches and the polished wheel tracks keep their relative gloss as
      // the whole surface wets.
      for (const surface of roadSurfaces) surface.roughness = 1 - wet * 0.86;
      roadMaterial.albedoColor = new Color3(1 - wet * 0.58, 1 - wet * 0.58, 1 - wet * 0.52);
      player.surface = { hardness: 0.75 + wet * 0.25 };

      interaction.update(feet);
      audio.setListener(
        camera.camera.position,
        camera.camera.getDirection(Vector3.Forward()),
        Vector3.Up(),
      );

      state.setPlayerPose({ x: feet.x, y: feet.y, z: feet.z, yaw: player.facingAngle });
      state.setClock(time.day, time.timeOfDay);
    },

    onSettingsChanged(next: Readonly<QualitySettings>): void {
      lighting.applySettings(next);
      environment.applySettings(next);
      const far = Math.max(340, next.drawDistance);
      camera.setFarPlane(far);
      sky.setFarPlane(far);
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
      catalog.dispose();
      interiors.dispose();
      for (const room of rooms) room.dispose();
      wetGround.dispose();
      alley.dispose();
      lamps.dispose();
      skyline.dispose(false, true);
      station.dispose(false, true);
      markings.dispose(false, true);
      environment.dispose();
      lighting.dispose();
      sky.dispose();
      materials.dispose();
    },
  };

  environment.applySettings(quality);
  return region;
}
