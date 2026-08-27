/**
 * Phase 1 proving ground.
 *
 * This region exists to prove the foundation, not to be a level: terrain
 * with real geometry, PBR surfaces with albedo/normal/roughness maps,
 * cascaded shadows, a moving sun, fog that matches the sky, instanced
 * scatter, two camera rigs, and input driving something in the world.
 *
 * Its props are primitives on purpose. Every one of them is fed by the same
 * material, shadow, instancing and streaming paths that authored glTF
 * assets will use in later phases, so replacing a box with a model is a
 * content change rather than an engine change.
 */

import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/thinInstanceMesh";

import type { GameScene, SceneContext } from "../engine/SceneManager";
import type { QualitySettings } from "../core/Settings";
import type { Time } from "../core/Time";
import { Terrain } from "../world/Terrain";
import { Sky } from "../world/Sky";
import { Lighting } from "../world/Lighting";
import { Environment } from "../world/Environment";
import { SurfaceLibrary } from "../world/ProceduralMaterials";
import { makeRandom } from "../world/Noise";

const TERRAIN_SIZE = 420;
const TERRAIN_SUBDIVISIONS = 200;
const SEED = 20260827;

/** Metres per second the focus rig walks; sprint multiplies it. */
const RIG_SPEED = 6.5;

export const PROVING_GROUND_ID = "provingGround";

export async function createProvingGround(ctx: SceneContext): Promise<GameScene> {
  const { engine, settings, input, hdr } = ctx;
  const quality = settings.value;

  ctx.progress(0.05, "Preparing region…");
  const scene = new Scene(engine);
  scene.useRightHandedSystem = false;
  scene.collisionsEnabled = true;
  scene.blockMaterialDirtyMechanism = true;

  // ---------------------------------------------------------------- cameras
  const focus = new TransformNode("rig.focus", scene);
  focus.position = new Vector3(0, 0, 0);

  const orbit = new ArcRotateCamera(
    "camera.orbit",
    -Math.PI / 2 + 0.5,
    1.02,
    16,
    Vector3.Zero(),
    scene,
  );
  orbit.lockedTarget = focus;
  orbit.lowerRadiusLimit = 3;
  orbit.upperRadiusLimit = 70;
  orbit.lowerBetaLimit = 0.15;
  orbit.upperBetaLimit = 1.48; // Stop just short of the ground plane.
  orbit.wheelDeltaPercentage = 0.02;
  orbit.panningSensibility = 0;
  orbit.minZ = 0.2;
  orbit.maxZ = quality.drawDistance;
  orbit.fov = 0.85;

  const fly = new UniversalCamera("camera.fly", new Vector3(28, 26, -34), scene);
  fly.setTarget(new Vector3(0, 4, 0));
  fly.speed = 0.9;
  fly.minZ = 0.2;
  fly.maxZ = quality.drawDistance;
  fly.fov = 0.85;
  fly.keysUp = [87, 38];
  fly.keysDown = [83, 40];
  fly.keysLeft = [65, 37];
  fly.keysRight = [68, 39];

  scene.activeCamera = orbit;
  const canvas = engine.getRenderingCanvas();
  if (canvas) orbit.attachControl(canvas, true);

  // ------------------------------------------------------------ atmosphere
  ctx.progress(0.15, "Raising the sky…");
  const sky = new Sky(scene, quality.drawDistance);
  const lighting = new Lighting(scene);
  const environment = new Environment(scene, sky);

  // ------------------------------------------------------------- surfaces
  ctx.progress(0.3, "Weaving surfaces…");
  const surfaces = new SurfaceLibrary(scene, {
    size: quality.textureSize,
    anisotropy: Math.min(8, Math.max(1, engine.getCaps().maxAnisotropy)),
  });

  // -------------------------------------------------------------- terrain
  ctx.progress(0.45, "Shaping the ground…");
  const terrain = new Terrain(scene, {
    size: TERRAIN_SIZE,
    subdivisions: TERRAIN_SUBDIVISIONS,
    seed: SEED,
  });
  terrain.mesh.material = surfaces.get("meadow", TERRAIN_SIZE);

  const drop = (x: number, z: number, lift = 0): Vector3 =>
    new Vector3(x, terrain.heightAt(x, z) + lift, z);

  // ----------------------------------------------------------- structures
  ctx.progress(0.6, "Setting the stones…");
  const timber = surfaces.get("timber", 3);
  const plaster = surfaces.get("plaster", 4);
  const tile = surfaces.get("tile", 5);
  const stone = surfaces.get("stone", 2.5);
  const soil = surfaces.get("soil", 8);

  const built: Mesh[] = [];

  /** A plain walled shell with a doorway gap, standing on the terrain. */
  const house = new TransformNode("prop.house", scene);
  house.position = drop(-9, 6);
  {
    const w = 11;
    const d = 8;
    const h = 3.4;
    const wall = (
      name: string,
      size: { width: number; height: number; depth: number },
      at: Vector3,
    ) => {
      const mesh = CreateBox(name, size, scene);
      mesh.position = at;
      mesh.material = plaster;
      mesh.parent = house;
      mesh.receiveShadows = true;
      built.push(mesh);
      return mesh;
    };

    wall("house.back", { width: w, height: h, depth: 0.32 }, new Vector3(0, h / 2, d / 2));
    wall("house.left", { width: 0.32, height: h, depth: d }, new Vector3(-w / 2, h / 2, 0));
    wall("house.right", { width: 0.32, height: h, depth: d }, new Vector3(w / 2, h / 2, 0));
    // Front wall split around a doorway, so the shell reads as enterable.
    wall("house.front.a", { width: 4.1, height: h, depth: 0.32 }, new Vector3(-3.45, h / 2, -d / 2));
    wall("house.front.b", { width: 4.1, height: h, depth: 0.32 }, new Vector3(3.45, h / 2, -d / 2));
    wall("house.front.top", { width: 2.8, height: 1.1, depth: 0.32 }, new Vector3(0, h - 0.55, -d / 2));

    const floor = CreateBox("house.floor", { width: w, height: 0.3, depth: d }, scene);
    floor.position = new Vector3(0, 0.15, 0);
    floor.material = timber;
    floor.parent = house;
    floor.receiveShadows = true;
    built.push(floor);

    // Two shallow roof slabs meeting at a ridge.
    for (const side of [-1, 1]) {
      const slab = CreateBox(
        `house.roof.${side}`,
        { width: w + 1.6, height: 0.26, depth: d * 0.62 },
        scene,
      );
      slab.material = tile;
      slab.parent = house;
      slab.position = new Vector3(0, h + 0.9, (side * d) / 4.4);
      slab.rotation.x = side * -0.42;
      slab.receiveShadows = true;
      built.push(slab);
    }

    // Veranda posts.
    for (const x of [-4.6, -1.6, 1.6, 4.6]) {
      const post = CreateCylinder(`house.post.${x}`, { diameter: 0.26, height: h }, scene);
      post.material = timber;
      post.parent = house;
      post.position = new Vector3(x, h / 2, -d / 2 - 1.9);
      post.receiveShadows = true;
      built.push(post);
    }
    const deck = CreateBox("house.deck", { width: w, height: 0.22, depth: 2.2 }, scene);
    deck.material = timber;
    deck.parent = house;
    deck.position = new Vector3(0, 0.42, -d / 2 - 1.1);
    deck.receiveShadows = true;
    built.push(deck);
  }

  /** Stone markers, to read shadow shape and contact against the ground. */
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const x = Math.cos(angle) * 21;
    const z = Math.sin(angle) * 21;
    const marker = new TransformNode(`prop.marker.${i}`, scene);
    marker.position = drop(x, z);

    const base = CreateBox(`marker.base.${i}`, { width: 1.1, height: 0.35, depth: 1.1 }, scene);
    base.position = new Vector3(0, 0.17, 0);
    const shaft = CreateCylinder(`marker.shaft.${i}`, { diameter: 0.38, height: 1.5 }, scene);
    shaft.position = new Vector3(0, 1.1, 0);
    const cap = CreateBox(`marker.cap.${i}`, { width: 0.95, height: 0.5, depth: 0.95 }, scene);
    cap.position = new Vector3(0, 2.1, 0);
    for (const part of [base, shaft, cap]) {
      part.material = stone;
      part.parent = marker;
      part.receiveShadows = true;
      built.push(part);
    }
  }

  /** A fence line that follows the terrain instead of floating over it. */
  {
    const posts = 26;
    for (let i = 0; i < posts; i += 1) {
      const t = i / (posts - 1);
      const x = -34 + t * 68;
      const z = -22 + Math.sin(t * 3.1) * 5;
      const post = CreateBox(`fence.post.${i}`, { width: 0.16, height: 1.5, depth: 0.16 }, scene);
      post.position = drop(x, z, 0.6);
      post.material = timber;
      post.receiveShadows = true;
      built.push(post);
      if (i === 0) continue;
      const prevT = (i - 1) / (posts - 1);
      const px = -34 + prevT * 68;
      const pz = -22 + Math.sin(prevT * 3.1) * 5;
      const a = drop(px, pz, 1);
      const b = drop(x, z, 1);
      const rail = CreateBox(`fence.rail.${i}`, {
        width: Vector3.Distance(a, b),
        height: 0.09,
        depth: 0.06,
      }, scene);
      rail.position = a.add(b).scale(0.5);
      rail.lookAt(b);
      rail.rotate(new Vector3(0, 1, 0), Math.PI / 2);
      rail.material = timber;
      rail.receiveShadows = true;
      built.push(rail);
    }
  }

  /** Tilled beds: flat soil patches, the future farming plots. */
  for (let i = 0; i < 3; i += 1) {
    const bed = CreateBox(`prop.bed.${i}`, { width: 7, height: 0.22, depth: 2.4 }, scene);
    bed.position = drop(6 + i * 0.4, -4 + i * 3.2, 0.11);
    bed.material = soil;
    bed.receiveShadows = true;
    built.push(bed);
  }

  // ------------------------------------------------------ instanced scatter
  ctx.progress(0.78, "Scattering the field…");
  const scatter = buildScatter(scene, terrain, surfaces, quality);

  // -------------------------------------------------------------- shadows
  ctx.progress(0.9, "Hanging the light…");
  lighting.applySettings(quality);
  for (const mesh of built) lighting.addCaster(mesh, false);
  for (const mesh of scatter.meshes) lighting.addCaster(mesh, false);

  // Materials stop being re-evaluated once the scene is assembled.
  scene.blockMaterialDirtyMechanism = false;
  scene.freezeActiveMeshes(false);
  scene.unfreezeActiveMeshes();

  // A visible stand-in for the player. Phase 2 replaces it with a real
  // character controller; for now it exists so input, the camera rig and
  // terrain height sampling can be seen working together.
  const rig = CreateSphere("rig.marker", { diameter: 1.1, segments: 16 }, scene);
  const rigMaterial = new PBRMaterial("rig.mat", scene);
  rigMaterial.albedoColor = new Color3(0.74, 0.36, 0.28);
  rigMaterial.metallic = 0;
  rigMaterial.roughness = 0.45;
  rig.material = rigMaterial;
  rig.receiveShadows = true;
  lighting.addCaster(rig, false);

  await scene.whenReadyAsync();
  ctx.progress(1, "Ready.");

  let usingFly = false;
  let heading = 0;
  const rigPosition = new Vector3(0, terrain.heightAt(0, 0), 0);

  const region: GameScene = {
    id: PROVING_GROUND_ID,
    scene,
    get camera(): Camera {
      return scene.activeCamera ?? orbit;
    },

    update(time: Time): void {
      const solar = sky.update(time.timeOfDay);
      lighting.update(solar);
      environment.update(time.rawDeltaSeconds);

      if (input.justPressed("cameraToggle")) {
        usingFly = !usingFly;
        const next = usingFly ? fly : orbit;
        const previous = usingFly ? orbit : fly;
        if (canvas) {
          previous.detachControl();
          next.attachControl(canvas, true);
        }
        scene.activeCamera = next;
        ctx.setActiveCamera(next);
      }

      if (usingFly) return;

      // Move the focus rig in camera space, which is how a third-person
      // character controller will read the same input in Phase 2.
      const axis = input.moveAxis();
      if (axis.x !== 0 || axis.y !== 0) {
        // getDirection, not getForwardRay: the ray helper pulls in Babylon's
        // Ray module as a side effect, and we do not need picking here.
        const forward = orbit.getDirection(Vector3.Forward());
        forward.y = 0;
        forward.normalize();
        const right = Vector3.Cross(Vector3.Up(), forward).normalize();
        const speed =
          RIG_SPEED *
          (input.isDown("sprint") ? 1.9 : input.isDown("walk") ? 0.45 : 1);
        const step = forward
          .scale(axis.y)
          .add(right.scale(-axis.x))
          .normalize()
          .scale(speed * time.deltaSeconds);
        rigPosition.addInPlace(step);
        heading = Math.atan2(step.x, step.z);

        const limit = TERRAIN_SIZE / 2 - 12;
        rigPosition.x = Math.max(-limit, Math.min(limit, rigPosition.x));
        rigPosition.z = Math.max(-limit, Math.min(limit, rigPosition.z));
      }

      rigPosition.y = terrain.heightAt(rigPosition.x, rigPosition.z) + 0.55;
      rig.position.copyFrom(rigPosition);
      rig.rotation.y = heading;
      focus.position.copyFrom(rigPosition);
      focus.position.y += 0.9;
    },

    onSettingsChanged(next: Readonly<QualitySettings>): void {
      lighting.applySettings(next);
      environment.applySettings(next);
      orbit.maxZ = next.drawDistance;
      fly.maxZ = next.drawDistance;
      sky.setFarPlane(next.drawDistance);
      // Casters do not need re-registering: Lighting keeps the list and
      // re-attaches it whenever it rebuilds the shadow map.
      scatter.setDensity(next.foliageDensity);
    },

    dispose(): void {
      scatter.dispose();
      environment.dispose();
      lighting.dispose();
      sky.dispose();
      terrain.dispose();
      surfaces.dispose();
    },
  };

  environment.applySettings(quality);
  return region;
}

interface Scatter {
  meshes: Mesh[];
  setDensity(density: number): void;
  dispose(): void;
}

/**
 * Grass tufts, boulders and trees placed once and drawn as thin instances:
 * thousands of objects, three draw calls. Density is a quality setting, so
 * the same placement can be thinned on weaker hardware without moving
 * anything the player might have already seen.
 */
function buildScatter(
  scene: Scene,
  terrain: Terrain,
  surfaces: SurfaceLibrary,
  quality: Readonly<QualitySettings>,
): Scatter {
  const random = makeRandom(SEED + 3);
  const half = terrain.size / 2 - 8;

  const tuft = CreateBox("scatter.tuft", { width: 0.42, height: 0.5, depth: 0.42 }, scene);
  tuft.material = surfaces.get("meadow", 1);
  tuft.receiveShadows = true;

  const boulder = CreateSphere("scatter.boulder", { diameter: 1, segments: 6 }, scene);
  boulder.material = surfaces.get("stone", 1.4);
  boulder.receiveShadows = true;

  const trunk = CreateCylinder("scatter.trunk", {
    diameterTop: 0.32,
    diameterBottom: 0.55,
    height: 4.6,
    tessellation: 8,
  }, scene);
  trunk.material = surfaces.get("timber", 2);
  trunk.receiveShadows = true;

  const canopy = CreateSphere("scatter.canopy", { diameter: 1, segments: 8 }, scene);
  const canopyMaterial = new PBRMaterial("scatter.canopy.mat", scene);
  canopyMaterial.albedoColor = new Color3(0.14, 0.23, 0.11);
  canopyMaterial.metallic = 0;
  canopyMaterial.roughness = 0.92;
  canopy.material = canopyMaterial;
  canopy.receiveShadows = true;

  // Placements are generated once at full density; the density setting
  // decides how many of them are uploaded.
  const tufts: Matrix[] = [];
  const boulders: Matrix[] = [];
  const trunks: Matrix[] = [];
  const canopies: Matrix[] = [];

  const compose = (
    position: Vector3,
    scale: Vector3,
    yaw: number,
    tilt = 0,
  ): Matrix =>
    Matrix.Compose(
      scale,
      Quaternion.FromEulerAngles(tilt, yaw, tilt * 0.6),
      position,
    );

  for (let i = 0; i < 9000; i += 1) {
    const x = (random() * 2 - 1) * half;
    const z = (random() * 2 - 1) * half;
    if (terrain.slopeAt(x, z) > 0.42) continue;
    const y = terrain.heightAt(x, z);
    const s = 0.6 + random() * 0.9;
    tufts.push(
      compose(
        new Vector3(x, y + 0.22 * s, z),
        new Vector3(s, s * (0.7 + random() * 0.9), s),
        random() * Math.PI * 2,
        (random() - 0.5) * 0.18,
      ),
    );
  }

  for (let i = 0; i < 420; i += 1) {
    const x = (random() * 2 - 1) * half;
    const z = (random() * 2 - 1) * half;
    const y = terrain.heightAt(x, z);
    const s = 0.5 + random() * 2.4;
    boulders.push(
      compose(
        new Vector3(x, y + s * 0.3, z),
        new Vector3(s, s * (0.5 + random() * 0.5), s * (0.7 + random() * 0.6)),
        random() * Math.PI * 2,
        (random() - 0.5) * 0.3,
      ),
    );
  }

  for (let i = 0; i < 260; i += 1) {
    const x = (random() * 2 - 1) * half;
    const z = (random() * 2 - 1) * half;
    // Keep the farmstead clearing open.
    if (Math.hypot(x, z) < 30) continue;
    if (terrain.slopeAt(x, z) > 0.5) continue;
    const y = terrain.heightAt(x, z);
    const s = 0.8 + random() * 0.7;
    const yaw = random() * Math.PI * 2;
    trunks.push(compose(new Vector3(x, y + 2.3 * s, z), new Vector3(s, s, s), yaw));
    const crowns = 2 + Math.floor(random() * 2);
    for (let c = 0; c < crowns; c += 1) {
      const spread = 1.4 * s;
      canopies.push(
        compose(
          new Vector3(
            x + (random() - 0.5) * spread,
            y + (4.2 + random() * 1.4) * s,
            z + (random() - 0.5) * spread,
          ),
          new Vector3(
            (2.6 + random() * 1.6) * s,
            (2.1 + random() * 1.2) * s,
            (2.6 + random() * 1.6) * s,
          ),
          random() * Math.PI * 2,
        ),
      );
    }
  }

  const sets: Array<{ mesh: Mesh; matrices: Matrix[] }> = [
    { mesh: tuft, matrices: tufts },
    { mesh: boulder, matrices: boulders },
    { mesh: trunk, matrices: trunks },
    { mesh: canopy, matrices: canopies },
  ];

  const upload = (density: number) => {
    for (const { mesh, matrices } of sets) {
      const count = Math.max(1, Math.min(matrices.length, Math.round(matrices.length * density)));
      const buffer = new Float32Array(count * 16);
      for (let i = 0; i < count; i += 1) {
        (matrices[i] as Matrix).copyToArray(buffer, i * 16);
      }
      mesh.thinInstanceSetBuffer("matrix", buffer, 16, true);
      // The source mesh sits at the origin; without a manual bound the
      // instances would be culled the moment the origin left the frustum.
      mesh.thinInstanceRefreshBoundingInfo(false);
      mesh.alwaysSelectAsActiveMesh = true;
    }
  };

  upload(quality.foliageDensity);

  return {
    meshes: sets.map((set) => set.mesh),
    setDensity: (density: number) => upload(density),
    dispose: () => {
      for (const { mesh } of sets) mesh.dispose();
      canopyMaterial.dispose();
    },
  };
}
