/**
 * A jointed human body, built from a spec.
 *
 * The joint names and their hierarchy are the ones a glTF humanoid skeleton
 * uses, so when a rigged model arrives the builder is replaced and the
 * animation code — which only ever names joints — keeps working. That is the
 * whole reason this is a named hierarchy and not a bag of boxes.
 *
 * Limbs are capsules and tapered cylinders rather than cuboids. A box arm
 * reads as a mannequin from any distance; a tapered capsule reads as an arm
 * from about three metres, which is where the camera is.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { CharacterSpec } from "./CharacterSpec";

export type JointName =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "shoulderL"
  | "elbowL"
  | "wristL"
  | "shoulderR"
  | "elbowR"
  | "wristR"
  | "thighL"
  | "kneeL"
  | "ankleL"
  | "thighR"
  | "kneeR"
  | "ankleR";

export const JOINT_NAMES: readonly JointName[] = [
  "hips", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "wristL",
  "shoulderR", "elbowR", "wristR",
  "thighL", "kneeL", "ankleL",
  "thighR", "kneeR", "ankleR",
];

export interface HumanRig {
  readonly root: TransformNode;
  readonly joints: Record<JointName, TransformNode>;
  readonly meshes: readonly AbstractMesh[];
  /** Where hair hangs from: the back of the skull. */
  readonly napeAnchor: TransformNode;
  /** Metres, floor to crown. */
  readonly height: number;
  /** Rest height of the hips above the floor. */
  readonly hipHeight: number;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** Which part of a person a material stands for. */
export type Role =
  | "skin" | "hair" | "top" | "bottom" | "hose" | "shoes"
  | "accent" | "eyeWhite" | "iris" | "pupil" | "lip";

interface Palette {
  skin: PBRMaterial;
  hair: PBRMaterial;
  top: PBRMaterial;
  bottom: PBRMaterial;
  hose: PBRMaterial;
  shoes: PBRMaterial;
  accent: PBRMaterial;
  eyeWhite: PBRMaterial;
  iris: PBRMaterial;
  pupil: PBRMaterial;
  lip: PBRMaterial;
}

function colour4(colour: Color3): Color4 {
  return new Color4(colour.r, colour.g, colour.b, 1);
}

function matte(scene: Scene, id: string, colour: Color3, roughness: number, metallic = 0): PBRMaterial {
  const material = new PBRMaterial(id, scene);
  material.albedoColor = colour;
  material.roughness = roughness;
  material.metallic = metallic;
  material.specularIntensity = 0.4;
  return material;
}

/**
 * Materials are shared between everyone built from the same spec name.
 *
 * A body needs ten materials, and ten materials is ten shader permutations
 * to compile. Six people in a room built independently is sixty compiles and
 * a visibly long load; six people sharing three palettes is thirty, and the
 * variation the player sees comes from the parts and proportions anyway.
 */
const paletteCache = new Map<string, Palette>();

function palette(scene: Scene, spec: CharacterSpec): Palette {
  const key = `${scene.uid}:${spec.name}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const id = (part: string) => `char.${spec.name}.${part}`;
  const built = {
    skin: matte(scene, id("skin"), spec.skin, 0.62),
    // Sleek, not matte: black hair with no sheen is a black hole on screen.
    hair: matte(scene, id("hair"), spec.hairColour, 0.28, 0.06),
    top: matte(scene, id("top"), spec.outfit.top, 0.82),
    bottom: matte(scene, id("bottom"), spec.outfit.bottom, 0.86),
    hose: matte(scene, id("hose"), spec.outfit.hose, 0.7),
    shoes: matte(scene, id("shoes"), spec.outfit.shoes, 0.5),
    accent: matte(scene, id("accent"), spec.outfit.accent, 0.78),
    eyeWhite: matte(scene, id("sclera"), new Color3(0.9, 0.89, 0.88), 0.25),
    iris: matte(scene, id("iris"), spec.eyeColour, 0.18, 0.1),
    pupil: matte(scene, id("pupil"), new Color3(0.02, 0.02, 0.03), 0.2),
    lip: matte(scene, id("lip"), new Color3(0.55, 0.32, 0.31), 0.5),
  };
  paletteCache.set(key, built);
  return built;
}

/**
 * A body's geometry, built once and instanced into a crowd.
 *
 * Twenty individually built people is twenty times the geometry, twenty times
 * the materials and several hundred draw calls, which a street cannot afford.
 * Twenty instances of one body is one draw call per part — and the reason
 * they are not twenty identical people is that each instance carries its own
 * colour in a per-instance vertex buffer, so skin, hair, eyes and every
 * garment are that person's alone while the geometry is shared.
 *
 * Keyed by the part id `attach` is called with, so the same builder fills it
 * and reads it back and the two can never drift apart.
 */
export interface HumanTemplates {
  readonly parts: ReadonlyMap<string, Mesh>;
  dispose(): void;
}

export interface HumanOptions {
  /**
   * Instance these rather than building geometry. The spec still decides
   * every proportion, position and colour; only the vertices are shared.
   */
  from?: HumanTemplates;
  /** Collect the geometry built, to be instanced later. */
  collect?: Map<string, Mesh>;
}

/** White, so an instance's own colour is the colour that reaches the screen. */
const NEUTRAL = new Color3(1, 1, 1);
const neutralCache = new Map<string, Palette>();

function neutralPalette(scene: Scene): Palette {
  const cached = neutralCache.get(String(scene.uid));
  if (cached) return cached;
  // Roughness still belongs to the material — skin is not shoe leather — but
  // the colour is white in all of them and comes from the instance.
  const id = (part: string) => `crowd.${part}`;
  const built: Palette = {
    skin: matte(scene, id("skin"), NEUTRAL, 0.62),
    hair: matte(scene, id("hair"), NEUTRAL, 0.28, 0.06),
    top: matte(scene, id("top"), NEUTRAL, 0.82),
    bottom: matte(scene, id("bottom"), NEUTRAL, 0.86),
    hose: matte(scene, id("hose"), NEUTRAL, 0.7),
    shoes: matte(scene, id("shoes"), NEUTRAL, 0.5),
    accent: matte(scene, id("accent"), NEUTRAL, 0.78),
    eyeWhite: matte(scene, id("sclera"), NEUTRAL, 0.25),
    iris: matte(scene, id("iris"), NEUTRAL, 0.18, 0.1),
    pupil: matte(scene, id("pupil"), NEUTRAL, 0.2),
    lip: matte(scene, id("lip"), NEUTRAL, 0.5),
  };
  neutralCache.set(String(scene.uid), built);
  return built;
}

/**
 * Builds one body purely for its geometry, and hands back the parts.
 *
 * The rig itself is thrown away; what survives is a disabled mesh per part,
 * each carrying a per-instance colour buffer, ready to be instanced by
 * anyone. Built from a spec like everyone else, so a template is never a
 * second description of what a person is.
 */
export function buildHumanTemplates(scene: Scene, shape: CharacterSpec): HumanTemplates {
  const parts = new Map<string, Mesh>();
  const rig = buildHuman(scene, shape, { collect: parts });
  for (const mesh of parts.values()) {
    mesh.setParent(null);
    mesh.position.setAll(0);
    mesh.rotation.setAll(0);
    mesh.scaling.setAll(1);
    mesh.setEnabled(false);
    mesh.isPickable = false;
    // Four floats an instance: the colour this copy of the part is painted.
    mesh.registerInstancedBuffer("color", 4);
    mesh.instancedBuffers.color = new Color4(1, 1, 1, 1);
  }
  rig.root.dispose(false, false);
  return {
    parts,
    dispose(): void {
      for (const mesh of parts.values()) mesh.dispose();
      parts.clear();
    },
  };
}

export function buildHuman(
  scene: Scene,
  spec: CharacterSpec,
  options: HumanOptions = {},
): HumanRig {
  const p = options.from ? neutralPalette(scene) : palette(scene, spec);
  // Which colour an instance of a part is painted, by the material the
  // builder chose for it. Reading the role off the material rather than
  // naming it at every call site is what keeps the two modes in step.
  const roleColour = new Map<PBRMaterial, Color4>([
    [p.skin, colour4(spec.skin)],
    [p.hair, colour4(spec.hairColour)],
    [p.top, colour4(spec.outfit.top)],
    [p.bottom, colour4(spec.outfit.bottom)],
    [p.hose, colour4(spec.outfit.hose)],
    [p.shoes, colour4(spec.outfit.shoes)],
    [p.accent, colour4(spec.outfit.accent)],
    [p.eyeWhite, new Color4(0.9, 0.89, 0.88, 1)],
    [p.iris, colour4(spec.eyeColour)],
    [p.pupil, new Color4(0.02, 0.02, 0.03, 1)],
    [p.lip, colour4(spec.lipColour ?? new Color3(0.55, 0.32, 0.31))],
  ]);
  const meshes: AbstractMesh[] = [];
  const root = new TransformNode(`${spec.name}.root`, scene);

  // Proportions are taken off the total height so the same builder makes a
  // 1.5 m child and a 1.9 m man without any of it coming apart.
  const H = spec.height;
  const headH = H * 0.132;
  const hipY = H * 0.53;
  const chestY = H * 0.145;
  const shoulderY = H * 0.225;
  const thigh = H * 0.245;
  const shin = H * 0.235;
  const upperArm = H * 0.185;
  const foreArm = H * 0.165;
  const wide = 0.86 + spec.build * 0.4;

  const joints = {} as Record<JointName, TransformNode>;
  const joint = (name: JointName, parent: TransformNode, at: Vector3): TransformNode => {
    const node = new TransformNode(`${spec.name}.${name}`, scene);
    node.parent = parent;
    node.position.copyFrom(at);
    joints[name] = node;
    return node;
  };
  const attach = (
    id: string,
    parent: TransformNode,
    build: () => Mesh,
    at: Vector3,
    material: PBRMaterial,
  ): AbstractMesh => {
    const template = options.from?.parts.get(id);
    let node: AbstractMesh;
    if (template) {
      const instance = template.createInstance(`${spec.name}.${id}`);
      instance.instancedBuffers.color = roleColour.get(material) ?? new Color4(1, 1, 1, 1);
      node = instance;
    } else {
      const mesh = build();
      mesh.name = `${spec.name}.${id}`;
      mesh.material = material;
      options.collect?.set(id, mesh);
      node = mesh;
    }
    node.parent = parent;
    node.position.copyFrom(at);
    node.isPickable = false;
    node.receiveShadows = true;
    meshes.push(node);
    return node;
  };

  // ------------------------------------------------------------------ core
  const hips = joint("hips", root, new Vector3(0, hipY, 0));
  const spine = joint("spine", hips, new Vector3(0, H * 0.045, 0));
  const chest = joint("chest", spine, new Vector3(0, chestY, 0));
  const neck = joint("neck", chest, new Vector3(0, H * 0.115, 0));
  const head = joint("head", neck, new Vector3(0, H * 0.038, 0));

  const pelvis = attach(
    "pelvis",
    hips,
    () => CreateCapsule("", { radius: H * 0.072 * wide, height: H * 0.115, tessellation: 12 }, scene),
    new Vector3(0, -H * 0.01, 0),
    spec.outfit.skirt ? p.hose : p.bottom,
  );
  pelvis.scaling.z = 0.82;

  const torso = attach(
    "torso",
    spine,
    () => CreateCapsule("", { radius: H * 0.073 * wide, height: H * 0.26, tessellation: 14 }, scene),
    new Vector3(0, chestY * 0.55, 0),
    p.top,
  );
  torso.scaling.set(1.06, 1, 0.66);

  // A separate shoulder yoke keeps the top from reading as a bottle.
  const yoke = attach(
    "yoke",
    chest,
    () => CreateCapsule("", { radius: H * 0.052 * wide, height: H * 0.22 * wide, tessellation: 10 }, scene),
    new Vector3(0, shoulderY - chestY, 0),
    p.top,
  );
  yoke.rotation.z = Math.PI / 2;
  yoke.scaling.z = 0.72;

  attach(
    "neck",
    neck,
    () => CreateCylinder("", { diameter: H * 0.048, height: H * 0.05, tessellation: 10 }, scene),
    new Vector3(0, H * 0.012, 0),
    p.skin,
  );

  // ------------------------------------------------------------------ head
  const skull = attach(
    "skull",
    head,
    () => CreateSphere("", { diameter: headH * 0.82, segments: 16 }, scene),
    new Vector3(0, headH * 0.36, 0),
    p.skin,
  );
  skull.scaling.set(0.9, 1.14, 0.98);

  const jaw = attach(
    "jaw",
    head,
    () => CreateSphere("", { diameter: headH * 0.6, segments: 12 }, scene),
    new Vector3(0, headH * 0.2, -headH * 0.05),
    p.skin,
  );
  jaw.scaling.set(0.86, 0.9, 1.0);

  if (spec.face) {
    // Eyes are three nested pieces, sunk into the face so the lids read as
    // shadow rather than needing lid geometry.
    for (const side of [-1, 1] as const) {
      const x = side * headH * 0.155;
      const y = headH * 0.375;
      const z = -headH * 0.315;
      const white = attach(
        `eye${side}`,
        head,
        () => CreateSphere("", { diameter: headH * 0.135, segments: 10 }, scene),
        new Vector3(x, y, z),
        p.eyeWhite,
      );
      white.scaling.set(1, 0.72, 0.6);
      const iris = attach(
        `iris${side}`,
        head,
        () => CreateCylinder("", { diameter: headH * 0.082, height: headH * 0.012, tessellation: 12 }, scene),
        new Vector3(x, y, z - headH * 0.036),
        p.iris,
      );
      iris.rotation.x = Math.PI / 2;
      const pupil = attach(
        `pupil${side}`,
        head,
        () => CreateCylinder("", { diameter: headH * 0.038, height: headH * 0.014, tessellation: 10 }, scene),
        new Vector3(x, y, z - headH * 0.042),
        p.pupil,
      );
      pupil.rotation.x = Math.PI / 2;
      const brow = attach(
        `brow${side}`,
        head,
        () => CreateBox("", { width: headH * 0.17, height: headH * 0.026, depth: headH * 0.03 }, scene),
        new Vector3(x, y + headH * 0.105, z - headH * 0.01),
        p.hair,
      );
      brow.rotation.z = side * -0.07;
    }
    const mouth = attach(
      "mouth",
      head,
      () => CreateBox("", { width: headH * 0.15, height: headH * 0.022, depth: headH * 0.02 }, scene),
      new Vector3(0, headH * 0.19, -headH * 0.33),
      p.lip,
    );
    mouth.rotation.x = 0.1;
    const nose = attach(
      "nose",
      head,
      () => CreateSphere("", { diameter: headH * 0.07, segments: 8 }, scene),
      new Vector3(0, headH * 0.29, -headH * 0.35),
      p.skin,
    );
    nose.scaling.set(0.8, 0.9, 1.1);
  }

  if (spec.face) {
    // Ears. Tiny, and the difference between a head and an egg.
    for (const side of [-1, 1] as const) {
      const ear = attach(
        `ear${side}`,
        head,
        () => CreateSphere("", { diameter: headH * 0.14, segments: 8 }, scene),
        new Vector3(side * headH * 0.35, headH * 0.34, headH * 0.02),
        p.skin,
      );
      ear.scaling.set(0.5, 1.2, 0.9);
    }
  }

  // ------------------------------------------------------------------ hair
  const napeAnchor = new TransformNode(`${spec.name}.nape`, scene);
  napeAnchor.parent = head;
  napeAnchor.position.set(0, headH * 0.3, headH * 0.34);

  if (spec.hairStyle !== "cap") {
    // The cap: a shell over the skull, slightly proud of it.
    const cap = attach(
      "hairCap",
      head,
      () => CreateSphere("", { diameter: headH * 0.88, segments: 16 }, scene),
      // Back and up: a cap that reaches past the eyes is a motorcycle helmet,
      // and it is what made every face on the street a blank.
      new Vector3(0, headH * 0.44, headH * 0.09),
      p.hair,
    );
    cap.scaling.set(0.96, 0.98, 0.88);

    // Blunt bangs: a slab across the brow with a straight lower edge, which
    // is the whole point of the cut.
    const fringe = attach(
      "hairFringe",
      head,
      () => CreateBox("", { width: headH * 0.62, height: headH * 0.3, depth: headH * 0.2 }, scene),
      new Vector3(0, headH * 0.47, -headH * 0.29),
      p.hair,
    );
    fringe.scaling.z = 1.1;

    if (spec.hairStyle === "long" || spec.hairStyle === "bob") {
      // Side curtains framing the face, kept separate from the swinging mass
      // so the face is never occluded by physics.
      for (const side of [-1, 1] as const) {
        const lock = attach(
          `hairSide${side}`,
          head,
          () =>
            CreateBox(
            "",
            {
              width: headH * 0.16,
              height: spec.hairStyle === "long" ? headH * 1.5 : headH * 0.6,
              depth: headH * 0.42,
            },
            scene,
          ),
          new Vector3(
            side * headH * 0.36,
            headH * (spec.hairStyle === "long" ? -0.28 : 0.16),
            -headH * 0.06,
          ),
          p.hair,
        );
        lock.rotation.z = side * 0.03;
      }
    }
  }

  // ------------------------------------------------------------------ arms
  const arm = (side: 1 | -1, id: "L" | "R") => {
    const shoulder = joint(
      `shoulder${id}` as JointName,
      chest,
      new Vector3(side * H * 0.098 * wide, shoulderY - chestY, 0),
    );
    const sleeve = attach(
      `upperArm${id}`,
      shoulder,
      () => CreateCapsule("", { radius: H * 0.030 * wide, height: upperArm, tessellation: 10 }, scene),
      new Vector3(0, -upperArm / 2, 0),
      p.top,
    );
    void sleeve;
    const elbow = joint(`elbow${id}` as JointName, shoulder, new Vector3(0, -upperArm, 0));
    attach(
      `foreArm${id}`,
      elbow,
      () => CreateCapsule("", { radius: H * 0.024 * wide, height: foreArm, tessellation: 10 }, scene),
      new Vector3(0, -foreArm / 2, 0),
      spec.outfit.style === "street" ? p.skin : p.top,
    );
    const wrist = joint(`wrist${id}` as JointName, elbow, new Vector3(0, -foreArm, 0));
    const hand = attach(
      `hand${id}`,
      wrist,
      () => CreateCapsule("", { radius: H * 0.020, height: H * 0.075, tessellation: 8 }, scene),
      new Vector3(0, -H * 0.028, 0),
      p.skin,
    );
    hand.scaling.set(0.62, 1, 1.25);
  };
  arm(-1, "L");
  arm(1, "R");

  // ------------------------------------------------------------------ legs
  const leg = (side: 1 | -1, id: "L" | "R") => {
    const thighJoint = joint(
      `thigh${id}` as JointName,
      hips,
      new Vector3(side * H * 0.058 * wide, -H * 0.035, 0),
    );
    attach(
      `thigh${id}`,
      thighJoint,
      () => CreateCapsule("", { radius: H * 0.048 * wide, height: thigh, tessellation: 10 }, scene),
      new Vector3(0, -thigh / 2, 0),
      spec.outfit.skirt ? p.hose : p.bottom,
    );
    const knee = joint(`knee${id}` as JointName, thighJoint, new Vector3(0, -thigh, 0));
    attach(
      `shin${id}`,
      knee,
      () => CreateCapsule("", { radius: H * 0.038 * wide, height: shin, tessellation: 10 }, scene),
      new Vector3(0, -shin / 2, 0),
      spec.outfit.skirt ? p.hose : p.bottom,
    );
    const ankle = joint(`ankle${id}` as JointName, knee, new Vector3(0, -shin, 0));
    const boot = attach(
      `boot${id}`,
      ankle,
      () => CreateBox("", { width: H * 0.062, height: H * 0.085, depth: H * 0.15 }, scene),
      new Vector3(0, H * 0.018, -H * 0.022),
      p.shoes,
    );
    void boot;
    // A chunky sole, which is most of what makes a boot a boot.
    attach(
      `sole${id}`,
      ankle,
      () => CreateBox("", { width: H * 0.068, height: H * 0.028, depth: H * 0.16 }, scene),
      new Vector3(0, -H * 0.012, -H * 0.024),
      p.shoes,
    );
  };
  leg(-1, "L");
  leg(1, "R");

  // ---------------------------------------------------------------- clothes
  if (spec.outfit.skirt) {
    // Pleats: a ring of thin slabs around a tapered cone. Cheap, and it
    // catches the light in vertical bands the way cloth does.
    const skirtTop = -H * 0.02;
    const skirt = attach(
      "skirt",
      hips,
      () =>
        CreateCylinder(
        "",
        { diameterTop: H * 0.19 * wide, diameterBottom: H * 0.27 * wide, height: H * 0.115, tessellation: 16 },
        scene,
      ),
      new Vector3(0, skirtTop - H * 0.045, 0),
      p.bottom,
    );
    void skirt;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const pleat = attach(
        `pleat${i}`,
        hips,
        () => CreateBox("", { width: H * 0.016, height: H * 0.115, depth: H * 0.02 }, scene),
        new Vector3(
          Math.sin(angle) * H * 0.125 * wide,
          skirtTop - H * 0.045,
          Math.cos(angle) * H * 0.125 * wide,
        ),
        p.bottom,
      );
      pleat.rotation.y = angle;
    }
  }

  if (spec.outfit.style === "street") {
    // An oversized jacket: hem below the hip, open front, wide collar.
    const hem = attach(
      "jacketHem",
      spine,
      () =>
        CreateCylinder(
        "",
        { diameterTop: H * 0.2 * wide, diameterBottom: H * 0.225 * wide, height: H * 0.1, tessellation: 14 },
        scene,
      ),
      new Vector3(0, -H * 0.012, 0),
      p.top,
    );
    hem.scaling.z = 0.78;
    const collar = attach(
      "collar",
      chest,
      () => CreateCylinder("", { diameter: H * 0.085, height: H * 0.035, tessellation: 12 }, scene),
      new Vector3(0, H * 0.1, 0),
      p.top,
    );
    collar.scaling.z = 0.85;
    // A stripe of the accent colour down the sleeve, which is what makes it
    // read as a garment rather than as a painted limb.
    for (const side of [-1, 1] as const) {
      const key = side < 0 ? "shoulderL" : "shoulderR";
      const stripe = attach(
        `stripe${side}`,
        joints[key as JointName],
        () => CreateBox("", { width: H * 0.012, height: upperArm * 0.8, depth: H * 0.03 }, scene),
        new Vector3(side * H * 0.036 * wide, -upperArm / 2, 0),
        p.accent,
      );
      void stripe;
    }
  }

  if (spec.outfit.bag) {
    const strap = attach(
      "bagStrap",
      chest,
      () => CreateBox("", { width: H * 0.022, height: H * 0.2, depth: H * 0.16 }, scene),
      new Vector3(-H * 0.03, H * 0.03, 0),
      p.accent,
    );
    strap.rotation.z = 0.42;
    const bag = attach(
      "bag",
      hips,
      () => CreateBox("", { width: H * 0.11, height: H * 0.09, depth: H * 0.05 }, scene),
      new Vector3(H * 0.1, H * 0.02, H * 0.02),
      p.accent,
    );
    bag.rotation.z = -0.12;
  }

  const rig: HumanRig = {
    root,
    joints,
    meshes,
    napeAnchor,
    height: H,
    hipHeight: hipY,
    setVisible(visible: boolean): void {
      for (const mesh of meshes) mesh.isVisible = visible;
    },
    dispose(): void {
      // The palette is shared with everyone else built from this spec, so it
      // belongs to the scene rather than to any one body.
      root.dispose(false, true);
    },
  };
  return rig;
}
