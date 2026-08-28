/**
 * The last train south.
 *
 * A real region, not a cut-away: a carriage you are sitting in, with the
 * country going past the window and the sky turning while it does. The
 * camera is scripted and the player has no control, but everything on screen
 * is the same renderer, materials and lighting as the rest of the game —
 * which is the whole reason to do a transition in-engine rather than as a
 * video or a fade to a caption.
 *
 * It runs a little under a minute and can be skipped at any point.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { makeGlass } from "../world/Glass";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Camera } from "@babylonjs/core/Cameras/camera";

import { awaitSceneReady, type GameScene, type SceneContext } from "../engine/SceneManager";
import type { Time } from "../core/Time";
import type { QualitySettings } from "../core/Settings";
import { Character } from "../player/Character";
import { aikoSpec } from "../player/rig/CharacterSpec";
import { makeRandom } from "../world/Noise";
import { HAZAMA_VALLEY_ID } from "./HazamaValley";

export const TRAIN_INTERLUDE_ID = "trainInterlude";

/** Seconds the whole sequence runs for. */
const DURATION = 54;
/** Metres of carriage, end to end. */
const CAR_LENGTH = 19;
const CAR_WIDTH = 2.9;
const CAR_HEIGHT = 2.35;
/**
 * Where Aiko is sitting: on the right-hand bench, facing across the aisle.
 *
 * Her feet are on the floor, so the rig's root is at floor level and the
 * seated pose puts her hips at bench height. Nobody sits facing the wall —
 * she has her back to one window and is watching the other one.
 */
const SEAT = new Vector3(1.02, 0.02, -1.2);

interface CameraKey {
  /** 0..1 through the sequence. */
  at: number;
  position: Vector3;
  target: Vector3;
  fov: number;
}

/**
 * The shot list. Down the carriage, in toward her, then out of the window
 * with her — so the last thing on screen before the countryside is the
 * countryside arriving.
 */
const SHOTS: CameraKey[] = [
  { at: 0, position: new Vector3(0.3, 1.5, -8.4), target: new Vector3(-0.4, 1.15, 0), fov: 0.86 },
  { at: 0.34, position: new Vector3(0.55, 1.32, -4.4), target: new Vector3(-0.75, 1.1, -1.1), fov: 0.9 },
  { at: 0.6, position: new Vector3(0.15, 1.22, -2.6), target: new Vector3(-1.0, 1.05, -1.2), fov: 0.86 },
  { at: 0.82, position: new Vector3(-0.55, 1.24, -2.05), target: new Vector3(-1.55, 1.15, -0.7), fov: 0.8 },
  { at: 1, position: new Vector3(-0.95, 1.3, -1.5), target: new Vector3(-2.6, 1.2, -0.2), fov: 0.72 },
];

interface Line {
  at: number;
  text: string;
  seconds: number;
}

/** Original text. Sparse on purpose: the window is doing the talking. */
const LINES: Line[] = [
  { at: 0.03, text: "23:41. The carriage is nearly empty.", seconds: 5 },
  { at: 0.2, text: "She has the deed in her coat pocket and has not taken it out since Ueno.", seconds: 6 },
  { at: 0.42, text: "The city thins. Then it stops altogether.", seconds: 5 },
  { at: 0.62, text: "Somewhere past Kōriyama the windows go black, and stay black for an hour.", seconds: 6.5 },
  { at: 0.84, text: "By the time there is light again, the buildings have become hills.", seconds: 6 },
];

function surface(
  scene: Scene,
  name: string,
  colour: [number, number, number],
  roughness: number,
  metallic = 0,
): PBRMaterial {
  const material = new PBRMaterial(`train.${name}`, scene);
  material.albedoColor = new Color3(...colour);
  material.roughness = roughness;
  material.metallic = metallic;
  return material;
}

function glow(scene: Scene, name: string, colour: Color3, strength: number): PBRMaterial {
  const material = new PBRMaterial(`train.${name}`, scene);
  material.unlit = true;
  material.albedoColor = colour.scale(strength);
  return material;
}

export async function createTrainInterlude(ctx: SceneContext): Promise<GameScene> {
  const { engine, settings, input, audio, ui, state } = ctx;
  const quality = settings.value;

  ctx.progress(0.1, "Boarding…");
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.008, 0.01, 0.016, 1);
  scene.blockMaterialDirtyMechanism = true;
  // The window glass draws in group 1; it must not clear the depth the
  // carriage wrote, or it would paint over the world outside.
  scene.setRenderingAutoClearDepthStencil(1, false, false, false);

  const camera = new UniversalCamera("camera.interlude", SHOTS[0]!.position.clone(), scene);
  camera.inputs.clear();
  camera.minZ = 0.05;
  camera.maxZ = 400;
  scene.activeCamera = camera;
  ctx.setActiveCamera(camera);

  // ------------------------------------------------------------- carriage
  ctx.progress(0.3, "Finding a seat…");
  const car = new TransformNode("carriage", scene);
  const floorMat = surface(scene, "floor", [0.16, 0.15, 0.14], 0.85);
  const panelMat = surface(scene, "panel", [0.62, 0.6, 0.56], 0.6);
  const trimMat = surface(scene, "trim", [0.28, 0.3, 0.32], 0.35, 0.8);
  const seatMat = surface(scene, "seat", [0.13, 0.2, 0.28], 0.9);
  const glassMat = makeGlass(scene, "train.glass", "carriage");

  const part = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: PBRMaterial,
  ): Mesh => {
    const mesh = CreateBox(`car.${name}`, size, scene);
    mesh.position.copyFrom(at);
    mesh.material = material;
    mesh.parent = car;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  };

  part("floor", { width: CAR_WIDTH, height: 0.1, depth: CAR_LENGTH }, new Vector3(0, -0.05, 0), floorMat);
  part("ceiling", { width: CAR_WIDTH, height: 0.1, depth: CAR_LENGTH }, new Vector3(0, CAR_HEIGHT, 0), panelMat);
  part("endA", { width: CAR_WIDTH, height: CAR_HEIGHT, depth: 0.12 }, new Vector3(0, CAR_HEIGHT / 2, CAR_LENGTH / 2), panelMat);
  part("endB", { width: CAR_WIDTH, height: CAR_HEIGHT, depth: 0.12 }, new Vector3(0, CAR_HEIGHT / 2, -CAR_LENGTH / 2), panelMat);

  // Side walls in segments, leaving window bays between them.
  for (const side of [-1, 1] as const) {
    const x = (side * CAR_WIDTH) / 2;
    part(`sill${side}`, { width: 0.1, height: 0.78, depth: CAR_LENGTH }, new Vector3(x, 0.39, 0), panelMat);
    part(`head${side}`, { width: 0.1, height: 0.5, depth: CAR_LENGTH }, new Vector3(x, CAR_HEIGHT - 0.25, 0), panelMat);
    for (let i = -3; i <= 3; i += 1) {
      const z = i * 2.7;
      part(`mullion${side}.${i}`, { width: 0.12, height: 1.1, depth: 0.16 }, new Vector3(x, 1.33, z), trimMat);
      const pane = part(
        `pane${side}.${i}`,
        { width: 0.04, height: 1.05, depth: 2.5 },
        new Vector3(x, 1.33, z + 1.35),
        glassMat,
      );
      pane.renderingGroupId = 1;
    }
    // Bench, back rest, and the grab rail above it.
    part(`bench${side}`, { width: 0.62, height: 0.1, depth: CAR_LENGTH - 2.4 }, new Vector3(x - side * 0.4, 0.42, 0), seatMat);
    part(`benchBack${side}`, { width: 0.1, height: 0.52, depth: CAR_LENGTH - 2.4 }, new Vector3(x - side * 0.09, 0.72, 0), seatMat);
    const rail = CreateCylinder(`car.rail${side}`, { diameter: 0.045, height: CAR_LENGTH - 2 }, scene);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x - side * 0.62, 1.92, 0);
    rail.material = trimMat;
    rail.parent = car;
    rail.isPickable = false;
    // Hanging straps.
    for (let i = -6; i <= 6; i += 1) {
      const strap = part(
        `strap${side}.${i}`,
        { width: 0.03, height: 0.24, depth: 0.03 },
        new Vector3(x - side * 0.62, 1.76, i * 1.3),
        trimMat,
      );
      const loop = part(
        `loop${side}.${i}`,
        { width: 0.11, height: 0.11, depth: 0.03 },
        new Vector3(x - side * 0.62, 1.6, i * 1.3),
        trimMat,
      );
      void strap;
      void loop;
    }
  }

  // Ceiling fluorescents: the light everyone remembers a night train by.
  const tubeMat = glow(scene, "tube", new Color3(0.93, 0.96, 1), 1.35);
  for (let i = -3; i <= 3; i += 1) {
    part("tube" + i, { width: 0.34, height: 0.05, depth: 2.2 }, new Vector3(0, CAR_HEIGHT - 0.08, i * 2.7), tubeMat);
  }
  const interior = new HemisphericLight("train.ambient", Vector3.Up(), scene);
  interior.diffuse = new Color3(0.82, 0.87, 0.95);
  interior.groundColor = new Color3(0.12, 0.13, 0.15);
  interior.intensity = 0.75;
  const keyLight = new PointLight("train.key", new Vector3(0, CAR_HEIGHT - 0.3, -1.5), scene);
  keyLight.diffuse = new Color3(0.92, 0.95, 1);
  keyLight.intensity = 14;
  keyLight.range = 12;

  // ----------------------------------------------------------------- Aiko
  const aiko = new Character(scene, aikoSpec());
  aiko.root.position.copyFrom(SEAT);
  aiko.root.rotation.y = -Math.PI / 2;
  aiko.settle();
  aiko.play("sit");

  // -------------------------------------------------------------- outside
  ctx.progress(0.55, "Leaving…");
  const outsideMat = surface(scene, "outside", [0.05, 0.055, 0.07], 0.95);
  const litMat = glow(scene, "distantLight", new Color3(1, 0.82, 0.5), 1.1);
  const coldMat = glow(scene, "distantCold", new Color3(0.7, 0.85, 1), 0.9);

  /**
   * Scenery going past. One template per look, instanced, recycled at the
   * end of the run — so an hour of countryside costs three draw calls.
   */
  const massTemplate = CreateBox("outside.mass", { width: 1, height: 1, depth: 1 }, scene);
  massTemplate.material = outsideMat;
  massTemplate.setEnabled(false);
  massTemplate.isPickable = false;
  const litTemplate = CreateBox("outside.lit", { width: 1, height: 1, depth: 1 }, scene);
  litTemplate.material = litMat;
  litTemplate.setEnabled(false);
  litTemplate.isPickable = false;
  const coldTemplate = CreateBox("outside.cold", { width: 1, height: 1, depth: 1 }, scene);
  coldTemplate.material = coldMat;
  coldTemplate.setEnabled(false);
  coldTemplate.isPickable = false;

  const random = makeRandom(8801);
  interface Passing {
    node: TransformNode;
    side: number;
    lane: number;
  }
  const passing: Passing[] = [];
  const RUN = 150;
  const count = Math.round(120 * Math.min(1.3, Math.max(0.4, quality.foliageDensity)));

  for (let i = 0; i < count; i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const lane = 1 + Math.floor(random() * 3);
    const node = new TransformNode(`passing.${i}`, scene);
    const roll = random();
    const template = roll < 0.62 ? massTemplate : roll < 0.86 ? litTemplate : coldTemplate;
    const instance = template.createInstance(`passing.${i}.mesh`);
    instance.parent = node;
    node.position.set(side * (5 + lane * 5.5 + random() * 3), 0, (random() - 0.5) * RUN);
    node.scaling.set(1.6 + random() * 3, 3 + random() * 14, 1.6 + random() * 4);
    passing.push({ node, side, lane });
  }

  /** Reshapes one piece of scenery for how rural the train has got. */
  const reshape = (item: Passing, rural: number): void => {
    const height = (1 - rural) * (4 + random() * 22) + rural * (1.6 + random() * 4.5);
    item.node.scaling.set(
      1.4 + random() * (rural > 0.6 ? 2 : 4),
      Math.max(1, height),
      1.4 + random() * 4,
    );
    item.node.position.x =
      item.side * (5 + item.lane * 5.5 + random() * (3 + rural * 14));
    item.node.position.y = rural > 0.7 && random() < 0.5 ? -1.2 : 0;
  };

  const skyPlane = CreateBox("outside.sky", { width: 900, height: 260, depth: 1 }, scene);
  const skyMat = glow(scene, "sky", new Color3(0.02, 0.028, 0.05), 1);
  skyPlane.material = skyMat;
  skyPlane.position.set(0, 40, 0);
  skyPlane.isPickable = false;
  // A far backdrop, painted rather than lit; the sky's job here is colour.
  skyPlane.renderingGroupId = 0;
  skyPlane.infiniteDistance = true;

  scene.blockMaterialDirtyMechanism = false;
  await awaitSceneReady(scene, 30);
  ctx.progress(1, "Ready.");

  // ----------------------------------------------------------------- run
  const rumble = audio.startTrain();
  rumble?.setIntensity(0.9);
  const cue = audio.startCue(
    [
      [0, 5, 12],
      [-2, 5, 10],
      [-4, 3, 8],
      [-5, 3, 10],
    ],
    9,
  );
  cue?.setIntensity(0.34);

  ui.setCinematic(true);
  ui.setObjective(null);
  ui.showPrompt({ key: "E", label: "Skip" });
  state.raise("boardedTrain");
  state.setChapter("journey");
  state.setRegion(TRAIN_INTERLUDE_ID);

  let elapsed = 0;
  let spoken = 0;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    ui.setCinematic(false);
    ui.hidePrompt();
    rumble?.stop();
    cue?.stop();
    ctx.travel(HAZAMA_VALLEY_ID);
  };

  const region: GameScene = {
    id: TRAIN_INTERLUDE_ID,
    scene,
    get camera(): Camera {
      return camera;
    },

    update(time: Time): void {
      const dt = time.rawDeltaSeconds;
      elapsed += dt;
      const t = Math.min(1, elapsed / DURATION);
      // How far from the city we are. Everything outside reads from this.
      const rural = Math.max(0, Math.min(1, (t - 0.18) / 0.62));

      if (input.justPressed("interact") || input.justPressed("jump")) {
        finish();
        return;
      }

      // Camera: interpolate the shot list, smoothstepped between keys.
      let a = SHOTS[0]!;
      let b = SHOTS[SHOTS.length - 1]!;
      for (let i = 1; i < SHOTS.length; i += 1) {
        if (t <= SHOTS[i]!.at) {
          a = SHOTS[i - 1]!;
          b = SHOTS[i]!;
          break;
        }
      }
      const span = Math.max(1e-4, b.at - a.at);
      const raw = Math.max(0, Math.min(1, (t - a.at) / span));
      const k = raw * raw * (3 - 2 * raw);
      camera.position.copyFrom(Vector3.Lerp(a.position, b.position, k));
      camera.setTarget(Vector3.Lerp(a.target, b.target, k));
      camera.fov = a.fov + (b.fov - a.fov) * k;
      // The carriage is never quite still.
      // Sitting still, but her hair is not: the carriage sways and so does
      // she, and that is most of what stops the shot looking like a photo.
      aiko.update(dt, { speed: 0, runSpeed: 4, grounded: true, verticalSpeed: 0, turnRate: 0 }, SEAT.y);

      const sway = Math.sin(elapsed * 2.3) * 0.012 + Math.sin(elapsed * 7.1) * 0.004;
      camera.position.y += sway;
      camera.position.x += Math.sin(elapsed * 1.7) * 0.01;

      // Scenery: fast, and thinning out.
      const speed = 42 + rural * 16;
      for (const item of passing) {
        item.node.position.z -= speed * dt;
        if (item.node.position.z < -RUN / 2) {
          item.node.position.z += RUN;
          reshape(item, rural);
        }
      }

      // Night into dawn, outside and in the reflection on the glass.
      const dawn = Math.max(0, Math.min(1, (t - 0.7) / 0.3));
      skyMat.albedoColor = Color3.Lerp(
        new Color3(0.02, 0.028, 0.05),
        new Color3(0.5, 0.42, 0.44),
        dawn,
      ).add(new Color3(0.28, 0.19, 0.12).scale(dawn * dawn));
      scene.clearColor = new Color4(
        skyMat.albedoColor.r,
        skyMat.albedoColor.g,
        skyMat.albedoColor.b,
        1,
      );
      interior.intensity = 0.75 - dawn * 0.2;
      keyLight.intensity = 14 - dawn * 5;

      while (spoken < LINES.length && t >= (LINES[spoken]?.at ?? 2)) {
        const line = LINES[spoken]!;
        ui.say(line.text, line.seconds);
        spoken += 1;
      }

      if (t >= 1) finish();
    },

    onSettingsChanged(next: Readonly<QualitySettings>): void {
      camera.maxZ = Math.max(200, Math.min(400, next.drawDistance));
    },

    dispose(): void {
      ui.setCinematic(false);
      rumble?.stop();
      cue?.stop();
      aiko.dispose();
      for (const item of passing) item.node.dispose(false, true);
      massTemplate.dispose();
      litTemplate.dispose();
      coldTemplate.dispose();
      skyPlane.dispose();
      keyLight.dispose();
      interior.dispose();
      car.dispose(false, true);
    },
  };

  return region;
}
