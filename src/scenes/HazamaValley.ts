/**
 * Hazama — the valley, at first light.
 *
 * Everything Tokyo was, inverted. Tokyo is a corridor: two walls, a strip of
 * sky, and no horizon. The valley is the opposite — you can see two
 * kilometres of it, the light comes from one low sun rather than forty
 * signs, and the loudest thing is a river you cannot see from the road.
 *
 * The layout is a real one: a river down the middle, paddy terraces on the
 * flat west bank, the railway and the village strung along the drier east
 * side, a shrine up the slope behind them, and a track heading east out of
 * the village toward a farm that is not built yet.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Material } from "@babylonjs/core/Materials/material";

import { awaitSceneReady, type GameScene, type SceneContext } from "../engine/SceneManager";
import type { QualitySettings } from "../core/Settings";
import type { Time } from "../core/Time";
import { Terrain } from "../world/Terrain";
import { Sky } from "../world/Sky";
import { Lighting } from "../world/Lighting";
import { Environment } from "../world/Environment";
import { Water } from "../world/Water";
import { SurfaceLibrary } from "../world/ProceduralMaterials";
import { PrefabRegistry } from "../world/Prefabs";
import { InteractionSystem } from "../world/Interaction";
import { fbm, ridge, makeRandom } from "../world/Noise";
import { ruralPrefabs } from "./props/rural";
import { PlayerController } from "../player/PlayerController";
import { ThirdPersonCamera } from "../player/ThirdPersonCamera";

export const HAZAMA_VALLEY_ID = "hazamaValley";

// ---------------------------------------------------------------- layout
const TERRAIN_SIZE = 760;
const TERRAIN_SUBDIVISIONS = 190;
const SEED = 60712;

/** The valley floor's baseline height. */
const FLOOR = 2.4;
/** Where the mountains start to climb, measured across the valley. */
const WALL_START = 108;

const RAIL_X = 46;
const ROAD_X = 60;
const PLATFORM_Z = -110;
const SHRINE = new Vector3(88, 0, 26);
const TRACK_Z = 84;
/** Water surface of the river. */
const RIVER_LEVEL = 0.9;
/** Just after dawn. */
const START_TIME_OF_DAY = 0.272;

/**
 * The valley's own view distance, in metres.
 *
 * The graphics presets set draw distance for a city street, where 260 m is
 * more than you can see anyway. Out here the far wall of the valley is four
 * hundred metres away and the point of the place is that you can see it, so
 * the region asks for its own far plane and only lets the preset raise it.
 */
const VALLEY_VIEW = 900;
/** Thin enough to keep the mountains, thick enough to keep the distance. */
const VALLEY_FOG = 0.0013;

/** The river's course: two sine terms, so it wanders without repeating. */
function riverX(z: number): number {
  return Math.sin(z * 0.0105) * 22 + Math.sin(z * 0.031 + 1.1) * 7;
}

interface Shelf {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  /** Metres over which the shelf blends into the surrounding ground. */
  feather: number;
}

/** Ground that has been levelled: paddies, the village, the shrine, the track. */
const SHELVES: Shelf[] = [
  // The village strip, with the railway and the road on it.
  { minX: 38, maxX: 78, minZ: -140, maxZ: 130, y: 4.6, feather: 16 },
  // The track east out of the village.
  { minX: 74, maxX: 110, minZ: 76, maxZ: 92, y: 5.2, feather: 10 },
  // The shrine's terrace, up the slope behind the village.
  { minX: 78, maxX: 98, minZ: 14, maxZ: 40, y: 9.6, feather: 12 },
];

/** Flooded terraces on the west bank, stepping down toward the river. */
interface Paddy {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  y: number;
}
const PADDIES: Paddy[] = [];
for (const [column, x] of [-84, -66, -48].entries()) {
  for (const [row, z] of [-92, -20, 54, 118].entries()) {
    PADDIES.push({
      x,
      z,
      halfX: 8,
      halfZ: 24,
      // West is uphill; each column drains into the next.
      y: 4.9 - column * 0.65 + (row % 2) * 0.12,
    });
  }
}
for (const paddy of PADDIES) {
  SHELVES.push({
    minX: paddy.x - paddy.halfX,
    maxX: paddy.x + paddy.halfX,
    minZ: paddy.z - paddy.halfZ,
    maxZ: paddy.z + paddy.halfZ,
    y: paddy.y,
    feather: 5,
  });
}

/** 0 outside the shelf, 1 on it, smooth across the feather. */
function shelfWeight(shelf: Shelf, x: number, z: number): number {
  const dx = Math.max(shelf.minX - x, 0, x - shelf.maxX);
  const dz = Math.max(shelf.minZ - z, 0, z - shelf.maxZ);
  const d = Math.hypot(dx, dz);
  if (d >= shelf.feather) return 0;
  const t = 1 - d / shelf.feather;
  return t * t * (3 - 2 * t);
}

/** The valley's landform. One function; the mesh and gameplay both read it. */
function valleyShape(x: number, z: number): number {
  const across = Math.abs(x);
  let h =
    FLOOR + (fbm(x * 0.0042, z * 0.0042, { octaves: 4, period: 6, seed: SEED }) - 0.5) * 3.2;

  // Mountain walls. Ridged noise keeps the skyline from reading as a bowl.
  const climb = Math.max(0, Math.min(1, (across - WALL_START) / 230));
  const eased = climb * climb * (3 - 2 * climb);
  if (eased > 0) {
    const crags = ridge(x * 0.0034, z * 0.0034, { octaves: 5, period: 8, seed: SEED + 4 });
    h += eased * (48 + crags * 92);
  }

  // The river's channel, and the low bank thrown up either side of it.
  const fromRiver = Math.abs(x - riverX(z));
  h -= 4.3 * Math.exp(-((fromRiver / 10) ** 2));
  h += 1.1 * Math.exp(-(((fromRiver - 15) / 9) ** 2));

  // Levelled ground wins over everything: people flatten what they use.
  for (const shelf of SHELVES) {
    const w = shelfWeight(shelf, x, z);
    if (w > 0) h += (shelf.y - h) * w;
  }
  return h;
}

export async function createHazamaValley(ctx: SceneContext): Promise<GameScene> {
  const { engine, settings, input, audio, ui, state } = ctx;
  const quality = settings.value;

  ctx.progress(0.04, "Arriving…");
  const scene = new Scene(engine);
  scene.collisionsEnabled = true;
  scene.blockMaterialDirtyMechanism = true;

  const surfaces = new SurfaceLibrary(scene, {
    size: quality.textureSize,
    anisotropy: Math.min(8, Math.max(1, engine.getCaps().maxAnisotropy)),
  });
  const random = makeRandom(SEED + 1);

  const paintedCache = new Map<string, PBRMaterial>();
  const painted = (name: string, colour: Color3, roughness = 0.9, metallic = 0): PBRMaterial => {
    const cached = paintedCache.get(name);
    if (cached) return cached;
    const material = new PBRMaterial(`valley.${name}`, scene);
    material.albedoColor = colour;
    material.roughness = roughness;
    material.metallic = metallic;
    paintedCache.set(name, material);
    return material;
  };
  const emissive = (name: string, colour: Color3, strength = 1.2): PBRMaterial => {
    const key = `emissive.${name}`;
    const cached = paintedCache.get(key);
    if (cached) return cached;
    const material = new PBRMaterial(`valley.${key}`, scene);
    material.unlit = true;
    material.albedoColor = colour.scale(strength);
    paintedCache.set(key, material);
    return material;
  };

  const built: Mesh[] = [];
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
    built.push(mesh);
    return mesh;
  };

  // -------------------------------------------------------------- terrain
  ctx.progress(0.16, "Shaping the valley…");
  const terrain = new Terrain(scene, {
    size: TERRAIN_SIZE,
    subdivisions: TERRAIN_SUBDIVISIONS,
    seed: SEED,
    shape: valleyShape,
  });
  terrain.mesh.material = surfaces.get("meadow", TERRAIN_SIZE);

  const ground = (x: number, z: number, lift = 0): Vector3 =>
    new Vector3(x, terrain.heightAt(x, z) + lift, z);

  // ---------------------------------------------------------------- water
  ctx.progress(0.3, "Letting the river in…");
  const water = new Water(scene, Math.min(512, quality.textureSize));
  // The river as a chain of segments following its own course.
  for (let z = -340; z <= 340; z += 28) {
    const a = riverX(z - 14);
    const b = riverX(z + 14);
    const sheet = water.addSheet(`river.${z}`, "river", {
      width: 21,
      depth: 30,
      at: new Vector3(riverX(z), RIVER_LEVEL, z),
      rotationY: Math.atan2(b - a, 28),
    });
    void sheet;
  }
  for (const [i, paddy] of PADDIES.entries()) {
    water.addSheet(`paddy.${i}`, "paddy", {
      width: paddy.halfX * 2 - 1.2,
      depth: paddy.halfZ * 2 - 1.2,
      at: new Vector3(paddy.x, paddy.y + 0.16, paddy.z),
    });
  }
  water.finalise();

  // Earth bunds around each terrace, which is what holds the water in.
  const soil = surfaces.get("soil", 10);
  for (const [i, paddy] of PADDIES.entries()) {
    for (const [dx, dz, w, d] of [
      [paddy.halfX, 0, 0.7, paddy.halfZ * 2],
      [-paddy.halfX, 0, 0.7, paddy.halfZ * 2],
      [0, paddy.halfZ, paddy.halfX * 2, 0.7],
      [0, -paddy.halfZ, paddy.halfX * 2, 0.7],
    ] as const) {
      slab(
        `bund.${i}.${dx}.${dz}`,
        { width: w, height: 0.7, depth: d },
        new Vector3(paddy.x + dx, paddy.y + 0.2, paddy.z + dz),
        soil,
        false,
      );
    }
  }

  // -------------------------------------------------------------- prefabs
  ctx.progress(0.44, "Building the village…");
  const prefabs = new PrefabRegistry(scene, ctx.assets);
  prefabs.defineAll(ruralPrefabs({ surfaces, painted, emissive }));
  await prefabs.prepare([
    "cedar",
    "broadleaf",
    "farmhouse",
    "barn",
    "shed",
    "torii",
    "shrine",
    "stoneLantern",
    "ruralPole",
    "fenceRun",
    "boulder",
    "signpost",
    "riceRow",
  ]);

  // --------------------------------------------------------------- railway
  ctx.progress(0.54, "Laying the line…");
  const rail = painted("rail", new Color3(0.28, 0.22, 0.18), 0.5, 0.85);
  const sleeper = painted("sleeper", new Color3(0.17, 0.13, 0.1), 0.95);
  slab(
    "railway.ballast",
    { width: 5.4, height: 0.5, depth: 700 },
    new Vector3(RAIL_X, 4.6, 0),
    surfaces.getScaled("stone", 5.4, 700),
  );
  for (const offset of [-0.72, 0.72]) {
    slab(
      `railway.rail${offset}`,
      { width: 0.12, height: 0.16, depth: 700 },
      new Vector3(RAIL_X + offset, 4.93, 0),
      rail,
      false,
    );
  }
  // Sleepers as instances: seven hundred metres of them for one draw call.
  const sleeperTemplate = CreateBox("railway.sleeper", { width: 2.5, height: 0.14, depth: 0.26 }, scene);
  sleeperTemplate.material = sleeper;
  sleeperTemplate.setEnabled(false);
  sleeperTemplate.isPickable = false;
  for (let z = -348; z <= 348; z += 0.62) {
    const instance = sleeperTemplate.createInstance(`sleeper.${z.toFixed(1)}`);
    instance.position.set(RAIL_X, 4.86, z);
    instance.isPickable = false;
  }

  // The halt she stepped off at: a platform, a shelter, and a name board.
  const concrete = surfaces.getScaled("stone", 4.4, 26);
  const platform = new TransformNode("platform", scene);
  slab(
    "platform.deck",
    { width: 4.4, height: 1.0, depth: 26 },
    new Vector3(RAIL_X - 4.6, 4.9, PLATFORM_Z),
    concrete,
  ).parent = platform;
  slab(
    "platform.edge",
    { width: 0.4, height: 1.04, depth: 26 },
    new Vector3(RAIL_X - 2.6, 4.92, PLATFORM_Z),
    painted("platformEdge", new Color3(0.68, 0.66, 0.6), 0.8),
  ).parent = platform;
  for (const z of [PLATFORM_Z - 3, PLATFORM_Z + 3]) {
    slab(
      `platform.post${z}`,
      { width: 0.14, height: 2.4, depth: 0.14 },
      new Vector3(RAIL_X - 6.2, 6.6, z),
      painted("shelterPost", new Color3(0.24, 0.2, 0.16), 0.9),
    ).parent = platform;
  }
  slab(
    "platform.shelterRoof",
    { width: 3, height: 0.14, depth: 8 },
    new Vector3(RAIL_X - 5.6, 7.85, PLATFORM_Z),
    surfaces.get("tile", 4),
    false,
  ).parent = platform;
  slab(
    "platform.bench",
    { width: 0.6, height: 0.12, depth: 3 },
    new Vector3(RAIL_X - 6.6, 5.85, PLATFORM_Z),
    surfaces.get("timber", 2),
    false,
  ).parent = platform;
  const nameBoard = slab(
    "platform.sign",
    { width: 0.1, height: 0.5, depth: 2.6 },
    new Vector3(RAIL_X - 6.9, 6.9, PLATFORM_Z + 5),
    painted("nameBoard", new Color3(0.8, 0.78, 0.7), 0.85),
    false,
  );
  nameBoard.parent = platform;

  // ------------------------------------------------------------------ road
  const dirt = surfaces.getScaled("soil", 5, 300);
  slab("road", { width: 5, height: 0.24, depth: 300 }, new Vector3(ROAD_X, 4.66, 0), dirt);
  slab(
    "road.spur",
    { width: 14, height: 0.24, depth: 4.2 },
    new Vector3(RAIL_X + 7, 4.66, PLATFORM_Z),
    dirt,
  );
  slab(
    "track.farm",
    { width: 46, height: 0.24, depth: 4 },
    new Vector3(ROAD_X + 23, 5.26, TRACK_Z),
    surfaces.getScaled("soil", 46, 4),
  );

  // ------------------------------------------------------------- buildings
  const houseZs = [-64, -40, -14, 12, 38, 66];
  for (const [i, z] of houseZs.entries()) {
    const east = i % 2 === 0;
    const x = ROAD_X + (east ? 11 : -11);
    prefabs.spawn("farmhouse", {
      position: ground(x, z),
      rotationY: east ? -Math.PI / 2 : Math.PI / 2,
      name: `house.${i}`,
    });
    if (random() < 0.7) {
      prefabs.spawn("barn", {
        position: ground(x + (east ? 9 : -9), z + 9),
        rotationY: random() * Math.PI * 2,
        name: `barn.${i}`,
      });
    }
    if (random() < 0.6) {
      prefabs.spawn("shed", {
        position: ground(x + (east ? 6 : -6), z - 8),
        rotationY: random() * Math.PI * 2,
        name: `shed.${i}`,
      });
    }
  }

  // Poles down the road, with the wires left off: out here they are single
  // strung lines and reading them as clutter would be wrong.
  for (let z = -110; z <= 110; z += 26) {
    prefabs.spawn("ruralPole", { position: ground(ROAD_X + 3.4, z) });
  }

  // ------------------------------------------------------------ the shrine
  ctx.progress(0.66, "Setting the shrine…");
  const shrineNode = prefabs.spawn("shrine", {
    position: ground(SHRINE.x, SHRINE.z),
    rotationY: -Math.PI / 2,
    name: "shrine",
  });
  prefabs.spawn("torii", {
    position: ground(SHRINE.x - 15, SHRINE.z),
    rotationY: Math.PI / 2,
    name: "shrine.torii",
  });
  for (const dz of [-4, 4]) {
    prefabs.spawn("stoneLantern", {
      position: ground(SHRINE.x - 8, SHRINE.z + dz),
      name: `shrine.lantern${dz}`,
    });
  }
  // Steps up from the road to the terrace.
  {
    const from = ground(SHRINE.x - 22, SHRINE.z);
    const to = ground(SHRINE.x - 12, SHRINE.z);
    const steps = 12;
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      slab(
        `shrine.step${i}`,
        { width: 1.0, height: 0.42, depth: 3.2 },
        new Vector3(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t - 0.1,
          SHRINE.z,
        ),
        concrete,
      );
    }
  }

  // ------------------------------------------------------------ vegetation
  ctx.progress(0.78, "Planting…");
  const density = Math.min(1.4, Math.max(0.35, quality.foliageDensity));
  let cedars = 0;
  for (let i = 0; i < 2600; i += 1) {
    const x = (random() * 2 - 1) * (TERRAIN_SIZE / 2 - 20);
    const z = (random() * 2 - 1) * (TERRAIN_SIZE / 2 - 20);
    const across = Math.abs(x);
    if (across < 96) continue;
    if (terrain.slopeAt(x, z) > 0.62) continue;
    if (random() > density * 0.55) continue;
    prefabs.spawn("cedar", {
      position: ground(x, z),
      rotationY: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.6,
    });
    cedars += 1;
  }
  for (let i = 0; i < 700; i += 1) {
    const z = (random() * 2 - 1) * (TERRAIN_SIZE / 2 - 40);
    const side = random() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (13 + random() * 22);
    if (Math.abs(x) > 100) continue;
    if (random() > density * 0.5) continue;
    prefabs.spawn("broadleaf", {
      position: ground(x, z),
      rotationY: random() * Math.PI * 2,
      scale: 0.75 + random() * 0.7,
    });
  }
  for (let i = 0; i < 260; i += 1) {
    const z = (random() * 2 - 1) * 330;
    const x = riverX(z) + (random() * 2 - 1) * 13;
    prefabs.spawn("boulder", {
      position: ground(x, z),
      rotationY: random() * Math.PI * 2,
      scale: 0.6 + random() * 2.2,
    });
  }
  // Rice, in rows, in the terraces that have water in them.
  for (const paddy of PADDIES) {
    const rows = Math.max(2, Math.round(9 * density));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < Math.max(2, Math.round(5 * density)); c += 1) {
        prefabs.spawn("riceRow", {
          position: new Vector3(
            paddy.x - paddy.halfX + 2 + (c / Math.max(1, Math.round(5 * density))) * (paddy.halfX * 2 - 4),
            paddy.y + 0.1,
            paddy.z - paddy.halfZ + 3 + (r / rows) * (paddy.halfZ * 2 - 6),
          ),
        });
      }
    }
  }
  // Fences along the paddock edges beside the road.
  for (let z = -80; z <= 80; z += 3) {
    if (Math.abs(z % 24) > 12) continue;
    prefabs.spawn("fenceRun", { position: ground(ROAD_X - 4.2, z) });
  }

  // -------------------------------------------------------------- lighting
  ctx.progress(0.86, "Waiting for the sun…");
  const sky = new Sky(scene, Math.max(VALLEY_VIEW, quality.drawDistance));
  const lighting = new Lighting(scene);
  const environment = new Environment(scene, sky);

  // -------------------------------------------------------------- player
  const spawn = ground(RAIL_X - 5.4, PLATFORM_Z - 6, 1.05);
  const camera = new ThirdPersonCamera(scene, input);
  camera.setFarPlane(Math.max(VALLEY_VIEW, quality.drawDistance));
  // Facing up the line and across at the village, so both are in the opening
  // shot: the way she came, and the way she is going.
  camera.setHeading(0.5, 0.13);
  const player = new PlayerController(scene, input, camera, audio, spawn);
  player.surface = { hardness: 0.35 };
  // The valley's ground is a function, so the controller reads it directly
  // rather than colliding with the mesh — exact on any slope, at any frame
  // rate, and it spares a swept test against a two-hundred-thousand-triangle
  // landscape every frame.
  player.setGroundHeight((x, z) => terrain.heightAt(x, z));
  terrain.mesh.checkCollisions = false;
  player.setBounds({
    minX: -(TERRAIN_SIZE / 2 - 30),
    maxX: TERRAIN_SIZE / 2 - 30,
    minZ: -(TERRAIN_SIZE / 2 - 30),
    maxZ: TERRAIN_SIZE / 2 - 30,
    floorY: -20,
  });
  scene.activeCamera = camera.camera;
  ctx.setActiveCamera(camera.camera);

  lighting.applySettings(quality);
  for (const mesh of player.character.meshes) lighting.addCaster(mesh, false);
  for (const mesh of built) lighting.addCaster(mesh, false);
  for (const id of ["cedar", "broadleaf", "farmhouse", "barn", "shed", "torii", "shrine", "stoneLantern", "ruralPole", "boulder"]) {
    for (const template of prefabs.templates(id)) lighting.addCaster(template, false);
  }
  lighting.addCaster(sleeperTemplate, false);

  scene.blockMaterialDirtyMechanism = false;

  // ---------------------------------------------------------- interaction
  const interaction = new InteractionSystem(ui, input);
  interaction.add({
    id: "shrine",
    position: ground(SHRINE.x - 4, SHRINE.z, 1),
    radius: 4,
    label: "Look at the shrine",
    activate: () => {
      audio.blip(392, 0.24);
      state.raise("sawShrine");
      ui.say(
        "Someone has swept the step this morning. There is no one on the road in either direction.",
        6,
      );
    },
  });
  interaction.add({
    id: "signpost",
    position: ground(ROAD_X + 4, TRACK_Z, 1),
    radius: 3.6,
    label: "Read the signpost",
    activate: () => {
      audio.blip(520, 0.16);
      state.raise("foundFarmTrack");
      ui.say("The track east. Her grandmother's name is still on the board, badly repainted.", 6);
      ui.setObjective("Follow the track east, to the farm");
    },
  });
  prefabs.spawn("signpost", { position: ground(ROAD_X + 4, TRACK_Z), rotationY: -0.4 });

  await awaitSceneReady(scene, 60);
  ctx.progress(1, "Ready.");

  // -------------------------------------------------------------- ambience
  const wind = audio.startWind();
  wind?.setIntensity(0.55);
  const river = audio.startWater(new Vector3(riverX(PLATFORM_Z), RIVER_LEVEL, PLATFORM_Z), 90);
  river?.setIntensity(0.9);
  const cue = audio.startCue(
    [
      [0, 7, 12, 16],
      [2, 7, 14, 19],
      [-3, 4, 9, 16],
      [-1, 7, 11, 14],
    ],
    11,
  );
  cue?.setIntensity(0.4);

  state.setChapter("valley");
  state.setRegion(HAZAMA_VALLEY_ID);
  ui.setObjective("Walk into the village");
  ui.say("Hazama. Six in the morning, and the whole valley is awake before her.", 6.5);

  ctx.time.timeOfDay = START_TIME_OF_DAY;

  let sinceBird = 2;
  let sinceRiverMove = 0;

  const region: GameScene = {
    id: HAZAMA_VALLEY_ID,
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
      // Morning haze: warmer and paler than the sky alone, and it burns off
      // as the sun climbs.
      // Morning haze, warmer and paler than the sky, burning off as the sun
      // climbs. Kept light: the valley's whole argument is the distance.
      const haze = Math.max(0, 1 - solar.daylight * 1.4);
      scene.fogColor = Color3.Lerp(
        sky.horizonColor(),
        new Color3(0.79, 0.76, 0.71),
        0.22 + haze * 0.22,
      );

      water.update(time.rawDeltaSeconds);

      // The river's sound follows the nearest point of it.
      sinceRiverMove += dt;
      if (sinceRiverMove > 0.4) {
        sinceRiverMove = 0;
        river?.setPosition({ x: riverX(feet.z), y: RIVER_LEVEL, z: feet.z });
      }

      // Birds, sparsely, and only while it is light.
      sinceBird -= dt;
      if (sinceBird <= 0) {
        sinceBird = 2.5 + Math.random() * 7;
        if (solar.daylight > 0.15) audio.birdCall();
      }

      // Softer footfalls than the city: this is earth and gravel.
      player.surface = { hardness: feet.x > RAIL_X - 8 && feet.x < ROAD_X + 4 ? 0.5 : 0.28 };

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
      const far = Math.max(VALLEY_VIEW, next.drawDistance);
      camera.setFarPlane(far);
      sky.setFarPlane(far);
      scene.fogDensity = VALLEY_FOG;
    },

    dispose(): void {
      interaction.dispose();
      cue?.stop();
      wind?.stop();
      river?.stop();
      water.dispose();
      player.dispose();
      camera.dispose();
      prefabs.dispose();
      sleeperTemplate.dispose();
      platform.dispose(false, true);
      shrineNode.dispose(false, true);
      environment.dispose();
      lighting.dispose();
      sky.dispose();
      terrain.dispose();
      surfaces.dispose();
      void cedars;
    },
  };

  environment.applySettings(quality);
  // Environment derives fog from the preset's draw distance, which is a
  // city figure; the valley overrides it with its own.
  scene.fogDensity = VALLEY_FOG;
  return region;
}
