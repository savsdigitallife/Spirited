/**
 * Buildings, assembled from parts.
 *
 * The old street drew each block as one extruded box with a window texture on
 * it, which is why it read as a grey box with a window texture on it. A real
 * frontage is a stack of bands — a shopfront at the bottom, floors of windows
 * and balconies above, a parapet and a mess of equipment on the roof — and
 * every one of those bands is where the detail lives at the distance a player
 * actually looks.
 *
 * So: a building is composed from kits, and each kit knows how to build one
 * band. Varying which kits are chosen, and by how much, is what makes
 * sixteen buildings on one street look like sixteen buildings rather than one
 * building sixteen times.
 *
 * Everything static in a building is merged per material at the end, so a
 * frontage with thirty pieces on it still costs three or four draw calls.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { CityMaterials, NEON, type NeonColour } from "./CityMaterials";
import { makeRandom } from "./Noise";

/** What is on the ground floor. Decides the whole frontage's character. */
export type BusinessKind =
  | "ramen"
  | "konbini"
  | "cafe"
  | "maidcafe"
  | "izakaya"
  | "laundry"
  | "bookshop"
  | "salon"
  | "shutter"
  | "lobby";

export interface BuildingSpec {
  /** Frontage width along the street. */
  width: number;
  /** Depth back from the pavement. */
  depth: number;
  floors: number;
  /** Distance from the street centre line to the frontage. */
  setback: number;
  /** Position along the street. */
  z: number;
  /** -1 for the west side, +1 for the east. */
  side: -1 | 1;
  business: BusinessKind;
  /** Chooses facade tone, window rhythm and trim. */
  variant: number;
  seed: number;
  /**
   * True for shops the player can walk into. The doorway is left open and
   * the glazing is split around it, rather than a sealed pane she would
   * have to walk through.
   */
  enterable?: boolean;
}

export interface BuiltBuilding {
  /** Merged, collidable shell and detail. */
  meshes: Mesh[];
  /** Glass, drawn after the opaque pass. Never collidable. */
  glass: Mesh[];
  /** Where the door is, in world space — for interaction points. */
  entrance: Vector3;
  /** The bay behind the glass, for an interior to be dropped into. */
  interior: {
    centre: Vector3;
    width: number;
    depth: number;
    height: number;
    /** Along-street position of the doorway. */
    doorZ: number;
  } | null;
  business: BusinessKind;
}

const FLOOR_HEIGHT = 3.1;
const SHOPFRONT_HEIGHT = 3.5;
/** How far the shopfront glass is recessed from the building line. */
const RECESS = 0.55;

interface Kit {
  scene: Scene;
  materials: CityMaterials;
  parts: Mesh[];
  glass: Mesh[];
  random: () => number;
  /** +1 or -1: which way is out of the building, across the pavement. */
  out: number;
  /**
   * One direction convention, stated once.
   *
   * `toward(d)` is d metres out over the pavement from the building line;
   * `into(d)` is d metres back inside it. Awnings, balconies, signage and
   * pipework all project; glazing, doorways and thresholds all recess. Every
   * one of them was previously written with the same sign, which buried half
   * the frontage detail inside the wall.
   */
  toward: (d: number) => number;
  into: (d: number) => number;
}

function slab(
  kit: Kit,
  name: string,
  size: { width: number; height: number; depth: number },
  at: Vector3,
  material: Material,
  rotationY = 0,
): Mesh {
  const mesh = CreateBox(name, size, kit.scene);
  mesh.position.copyFrom(at);
  mesh.rotation.y = rotationY;
  mesh.material = material;
  kit.parts.push(mesh);
  return mesh;
}

/** Signage colour per business, so a street reads at a glance. */
const SIGN_COLOUR: Record<BusinessKind, NeonColour> = {
  ramen: "gold",
  konbini: "lime",
  cafe: "peach",
  maidcafe: "violet",
  izakaya: "rose",
  laundry: "ice",
  bookshop: "violet",
  salon: "rose",
  shutter: "ice",
  lobby: "ice",
};

const BUSINESS_NAME: Record<BusinessKind, string> = {
  ramen: "ramen",
  konbini: "konbini",
  cafe: "cafe",
  maidcafe: "maidcafe",
  izakaya: "izakaya",
  laundry: "laundry",
  bookshop: "books",
  salon: "salon",
  shutter: "shutter",
  lobby: "lobby",
};

/**
 * The ground floor.
 *
 * A recessed glass front with a stall riser under it, a door, a lit sign
 * band over the opening, and whatever that particular trade puts on the
 * pavement. The recess matters more than it sounds: a flush glass wall reads
 * as a texture, and half a metre of setback gives the frontage a shadow, a
 * threshold and somewhere for a menu board to stand.
 */
function shopfront(kit: Kit, spec: BuildingSpec): BuiltBuilding["interior"] {
  const { materials } = kit;
  const w = spec.width;
  const openWidth = Math.min(w - 1.2, w * 0.78);
  const glassX = kit.into(RECESS);
  const tile = materials.surface("tileWall", 5);
  const trim = materials.painted("shopTrim", new Color3(0.11, 0.11, 0.13), 0.5, 0.6);

  // Pilasters either side of the opening, and the beam over it.
  const pier = (w - openWidth) / 2;
  for (const sign of [-1, 1] as const) {
    slab(
      kit,
      `pier${sign}`,
      { width: RECESS + 0.3, height: SHOPFRONT_HEIGHT, depth: pier },
      new Vector3(kit.into((RECESS + 0.3) / 2), SHOPFRONT_HEIGHT / 2, spec.z + sign * (w - pier) / 2),
      tile,
    );
  }
  slab(
    kit,
    "lintel",
    { width: RECESS + 0.35, height: 0.75, depth: w },
    new Vector3(kit.into((RECESS + 0.35) / 2), SHOPFRONT_HEIGHT - 0.375, spec.z),
    tile,
  );

  if (spec.business === "shutter") {
    // A closed roller shutter: corrugated, and it tells you the street has
    // businesses that are not open right now, which is its own detail.
    const shutter = materials.painted("shutter", new Color3(0.3, 0.3, 0.32), 0.62, 0.55);
    slab(
      kit,
      "shutter",
      { width: 0.12, height: SHOPFRONT_HEIGHT - 0.9, depth: openWidth },
      new Vector3(glassX, (SHOPFRONT_HEIGHT - 0.9) / 2 + 0.1, spec.z),
      shutter,
    );
    for (let i = 0; i < 14; i += 1) {
      slab(
        kit,
        `corrugation${i}`,
        { width: 0.05, height: 0.06, depth: openWidth },
        new Vector3(glassX + kit.out * 0.07, 0.35 + i * 0.2, spec.z),
        trim,
      );
    }
    return null;
  }

  // Stall riser under the glazing — with a gap at the door on a shop you
  // can walk into, because a 0.42 m kerb across the entrance is a wall.
  const doorWidthEarly = 1.1;
  const doorZEarly = spec.z + (spec.business === "konbini" ? 0 : -openWidth * 0.28);
  const riserRuns: [number, number][] = spec.enterable
    ? [
        [spec.z - openWidth / 2, doorZEarly - doorWidthEarly * 0.75],
        [doorZEarly + doorWidthEarly * 0.75, spec.z + openWidth / 2],
      ]
    : [[spec.z - openWidth / 2, spec.z + openWidth / 2]];
  for (const [from, to] of riserRuns) {
    if (to - from < 0.15) continue;
    slab(
      kit,
      "riser",
      { width: 0.16, height: 0.42, depth: to - from },
      new Vector3(glassX, 0.21, (from + to) / 2),
      trim,
    );
  }
  const glassHeight = SHOPFRONT_HEIGHT - 1.35;
  const doorWidth = doorWidthEarly;
  const doorZ = doorZEarly;

  // Glazing. An enterable shop gets two panes with a gap where the door is,
  // so the way in is a real opening rather than a pane of glass the player
  // walks through.
  const glazing: [number, number][] = spec.enterable
    ? [
        [spec.z - openWidth / 2, doorZ - doorWidth * 0.75],
        [doorZ + doorWidth * 0.75, spec.z + openWidth / 2],
      ]
    : [[spec.z - openWidth / 2, spec.z + openWidth / 2]];
  for (const [from, to] of glazing) {
    const span = to - from;
    if (span < 0.15) continue;
    const pane = CreateBox("shopGlass", { width: 0.06, height: glassHeight, depth: span }, kit.scene);
    pane.position.set(glassX, 0.42 + glassHeight / 2, (from + to) / 2);
    pane.material = materials.glass();
    kit.glass.push(pane);
  }

  // Mullions across the glazing: the one detail that stops a shopfront
  // looking like a hole with a colour behind it.
  const mullions = Math.max(2, Math.round(openWidth / 1.3));
  for (let i = 1; i < mullions; i += 1) {
    const z = spec.z - openWidth / 2 + (i / mullions) * openWidth;
    if (Math.abs(z - doorZ) < doorWidth * 0.6) continue;
    slab(kit, `mullion${i}`, { width: 0.11, height: glassHeight, depth: 0.09 }, new Vector3(glassX, 0.42 + glassHeight / 2, z), trim);
  }
  slab(kit, "transom", { width: 0.12, height: 0.1, depth: openWidth }, new Vector3(glassX, 0.42 + glassHeight, spec.z), trim);

  // The door. A closed shop keeps its leaf; an open one has the leaf slid
  // back into its pocket beside the opening, which is what these doors do.
  // A frame is two jambs and a head. Built as one slab it was a solid block
  // filling the doorway, and the shop could not be walked into at all.
  for (const side of [-1, 1] as const) {
    slab(
      kit,
      `doorJamb${side}`,
      { width: 0.16, height: 2.25, depth: 0.1 },
      new Vector3(glassX, 1.125, doorZ + side * (doorWidth / 2 + 0.05)),
      trim,
    );
  }
  slab(kit, "doorHead", { width: 0.16, height: 0.16, depth: doorWidth + 0.2 }, new Vector3(glassX, 2.17, doorZ), trim);
  if (spec.enterable) {
    slab(
      kit,
      "doorLeafOpen",
      { width: 0.07, height: 2.05, depth: doorWidth * 0.9 },
      new Vector3(glassX, 1.05, doorZ + doorWidth * 1.05),
      materials.glass(),
    );
    // A lit head over the opening, so the way in reads from up the street.
    slab(
      kit,
      "doorGlow",
      { width: 0.05, height: 0.09, depth: doorWidth + 0.4 },
      new Vector3(kit.into(RECESS - 0.03), 2.32, doorZ),
      materials.emissive("doorwayGlow", new Color3(1, 0.86, 0.62), 1.1),
    );
  } else {
    slab(
      kit,
      "doorLeaf",
      { width: 0.08, height: 2.05, depth: doorWidth },
      new Vector3(glassX + kit.out * 0.04, 1.05, doorZ),
      materials.glass(),
    );
    slab(kit, "doorRail", { width: 0.1, height: 0.06, depth: doorWidth * 0.7 }, new Vector3(glassX + kit.out * 0.1, 1.02, doorZ), trim);
  }
  // A threshold step, which is what makes a doorway feel like a doorway.
  slab(kit, "threshold", { width: RECESS + 0.2, height: 0.09, depth: doorWidth + 0.5 }, new Vector3(kit.into(RECESS / 2), 0.045, doorZ), materials.surface("paving", 3));

  // Sign band over the opening, then the trade's own signage.
  const colour = NEON[SIGN_COLOUR[spec.business]];
  slab(
    kit,
    "signBand",
    { width: 0.1, height: 0.62, depth: w - 0.3 },
    new Vector3(kit.toward(0.06), SHOPFRONT_HEIGHT - 0.42, spec.z),
    materials.signboard(`${BUSINESS_NAME[spec.business]}${spec.variant}`, colour, spec.seed),
  );
  slab(
    kit,
    "signGlow",
    { width: 0.05, height: 0.09, depth: w - 0.4 },
    new Vector3(kit.toward(0.13), SHOPFRONT_HEIGHT - 0.78, spec.z),
    materials.emissive(`under${SIGN_COLOUR[spec.business]}`, colour, 1.4),
  );

  return {
    // Just behind the glass, not in front of it: at 0.15 the room's own
    // side walls stood between the window and the fittings.
    centre: new Vector3(kit.into(RECESS + 0.05), 0, spec.z),
    width: openWidth,
    depth: spec.depth * 0.44,
    height: glassHeight + 0.42,
    doorZ,
  };
}

/** Whatever the trade hangs off its own frontage. */
function tradeDressing(kit: Kit, spec: BuildingSpec): void {
  const { materials } = kit;
  const colour = NEON[SIGN_COLOUR[spec.business]];

  if (spec.business === "ramen" || spec.business === "izakaya") {
    // A curtain across the top of the doorway, split into panels.
    const noren = materials.painted(
      spec.business === "ramen" ? "norenRed" : "norenIndigo",
      spec.business === "ramen" ? new Color3(0.32, 0.06, 0.06) : new Color3(0.06, 0.09, 0.2),
      0.92,
    );
    for (let i = 0; i < 4; i += 1) {
      slab(
        kit,
        `noren${i}`,
        { width: 0.04, height: 0.72, depth: 0.5 },
        new Vector3(kit.into(RECESS - 0.08), 1.98, spec.z - 0.85 + i * 0.53),
        noren,
      );
    }
    // Paper lanterns on a rail: the unmistakable read for both trades.
    for (let i = 0; i < 3; i += 1) {
      const lantern = CreateCylinder(
        `lantern${i}`,
        { diameter: 0.24, height: 0.34, tessellation: 12 },
        kit.scene,
      );
      lantern.position.set(kit.toward(0.34), 2.66, spec.z - 1.1 + i * 1.1);
      // Bright enough to glow, not so bright it becomes a white slab: a
      // 0.24 m lantern seen from two metres clips at anything above about 1.
      lantern.material = materials.emissive("lanternPaper", new Color3(1, 0.6, 0.32), 0.95);
      kit.parts.push(lantern);
    }
  }

  if (
    spec.business === "ramen" ||
    spec.business === "cafe" ||
    spec.business === "maidcafe" ||
    spec.business === "izakaya"
  ) {
    // A menu board out on the pavement.
    slab(kit, "menuBoard", { width: 0.09, height: 1.1, depth: 0.62 }, new Vector3(kit.toward(0.85), 0.72, spec.z + 1.5), materials.signboard(`menu${spec.seed}`, NEON.gold, spec.seed + 3), 0.18);
    slab(kit, "menuLegs", { width: 0.5, height: 0.16, depth: 0.5 }, new Vector3(kit.toward(0.85), 0.1, spec.z + 1.5), materials.painted("boardLeg", new Color3(0.12, 0.1, 0.09), 0.8));
  }

  if (spec.business === "maidcafe") {
    // An upstairs-café frontage brought down to the street: a pastel awning,
    // a string of small lamps along its lip, and a standee by the door. The
    // house is an invention of this street's, as every business here is.
    slab(kit, "awning", { width: 1.4, height: 0.1, depth: spec.width - 1.2 }, new Vector3(kit.toward(0.75), 3.05, spec.z), materials.painted("awningRose", new Color3(0.62, 0.3, 0.42), 0.9), 0);
    slab(kit, "awningLip", { width: 0.08, height: 0.24, depth: spec.width - 1.2 }, new Vector3(kit.toward(1.42), 2.93, spec.z), materials.painted("awningCream", new Color3(0.94, 0.9, 0.86), 0.85));
    const lamps = Math.max(5, Math.round(spec.width - 2));
    for (let i = 0; i < lamps; i += 1) {
      const bulb = CreateSphere(`cafeBulb${i}`, { diameter: 0.11, segments: 6 }, kit.scene);
      bulb.position.set(kit.toward(1.42), 2.76, spec.z - (spec.width - 2) / 2 + (i / (lamps - 1)) * (spec.width - 2));
      bulb.material = materials.emissive("cafeBulb", new Color3(1, 0.86, 0.72), 1.1);
      kit.parts.push(bulb);
    }
    // The standee: a lit board on legs, angled at whoever is walking past.
    slab(kit, "standee", { width: 0.1, height: 1.35, depth: 0.7 }, new Vector3(kit.toward(1.05), 0.82, spec.z - 1.8), materials.signboard(`standee${spec.seed}`, NEON.violet, spec.seed + 5), 0.22);
    slab(kit, "standeeFoot", { width: 0.55, height: 0.14, depth: 0.55 }, new Vector3(kit.toward(1.05), 0.09, spec.z - 1.8), materials.painted("boardLeg", new Color3(0.12, 0.1, 0.09), 0.8));
  }

  if (spec.business === "cafe") {
    // Awning and a pavement table.
    slab(kit, "awning", { width: 1.5, height: 0.1, depth: spec.width - 1 }, new Vector3(kit.toward(0.8), 3.05, spec.z), materials.painted("awningStripe", new Color3(0.5, 0.16, 0.16), 0.9), 0);
    slab(kit, "awningLip", { width: 0.08, height: 0.26, depth: spec.width - 1 }, new Vector3(kit.toward(1.52), 2.92, spec.z), materials.painted("awningTrim", new Color3(0.86, 0.82, 0.72), 0.85));
  }

  if (spec.business === "konbini") {
    // A full-width fascia in the chain's colours. Original livery: three
    // bands, lime over gold over ice, on white.
    const bands: [Color3, number][] = [
      [NEON.lime, 0.24],
      [NEON.gold, 0],
      [NEON.ice, -0.24],
    ];
    for (const [band, dy] of bands) {
      slab(kit, `fascia${dy}`, { width: 0.06, height: 0.2, depth: spec.width - 0.2 }, new Vector3(kit.toward(0.16), SHOPFRONT_HEIGHT + 0.55 + dy, spec.z), materials.emissive(`konbiniBand${dy}`, band, 1.5));
    }
    slab(kit, "fasciaPlate", { width: 0.12, height: 0.95, depth: spec.width }, new Vector3(kit.toward(0.1), SHOPFRONT_HEIGHT + 0.55, spec.z), materials.painted("konbiniPlate", new Color3(0.72, 0.73, 0.72), 0.7));
  }

  // A projecting sign, hung off the wall at right angles so it is legible
  // from up the street rather than only from in front of it.
  if (spec.business !== "shutter" && spec.business !== "lobby") {
    const height = 1.4 + kit.random() * 1.6;
    slab(kit, "bladeSign", { width: 0.9, height, depth: 0.12 }, new Vector3(kit.toward(0.75), SHOPFRONT_HEIGHT + 1.4 + height / 2, spec.z + (kit.random() - 0.5) * spec.width * 0.4), materials.signboard(`blade${spec.seed}`, colour, spec.seed + 11));
    slab(kit, "bladeArm", { width: 0.5, height: 0.06, depth: 0.06 }, new Vector3(kit.toward(0.45), SHOPFRONT_HEIGHT + 1.5, spec.z), materials.painted("signArm", new Color3(0.1, 0.1, 0.11), 0.6, 0.5));
  }
}

/** One residential or office floor: windows, sometimes a balcony. */
function floorBand(kit: Kit, spec: BuildingSpec, level: number, y: number): void {
  const { materials } = kit;
  const facade = materials.facade(`v${spec.variant}`, {
    columns: 5 + (spec.variant % 3),
    rows: 3,
    litFraction: 0.34 + (spec.seed % 7) * 0.06,
    seed: spec.seed + level,
  });

  // The wall panel for this floor. Split from the others so each floor can
  // differ, which is what a real building does and a single extrusion cannot.
  slab(kit, `wall${level}`, { width: 0.24, height: FLOOR_HEIGHT, depth: spec.width }, new Vector3(kit.into(0.12), y + FLOOR_HEIGHT / 2, spec.z), facade);

  const trim = materials.painted("windowTrim", new Color3(0.16, 0.16, 0.18), 0.55, 0.4);
  const bands = Math.max(2, Math.round(spec.width / 2.1));
  for (let i = 0; i < bands; i += 1) {
    const z = spec.z - spec.width / 2 + (i + 0.5) * (spec.width / bands);
    slab(kit, `winSill${level}.${i}`, { width: 0.3, height: 0.09, depth: 1.35 }, new Vector3(kit.toward(0.14), y + 0.95, z), trim);
    slab(kit, `winHead${level}.${i}`, { width: 0.26, height: 0.08, depth: 1.4 }, new Vector3(kit.toward(0.12), y + 2.42, z), trim);
  }

  const balcony = spec.variant % 3 === 0 && level > 0;
  if (balcony) {
    slab(kit, `balcony${level}`, { width: 1.1, height: 0.11, depth: spec.width - 0.6 }, new Vector3(kit.toward(0.55), y + 0.9, spec.z), materials.surface("concrete", 3));
    // Railing: posts and two rails, because a solid parapet at this scale
    // just reads as another wall.
    const posts = Math.max(3, Math.round((spec.width - 0.6) / 0.55));
    for (let i = 0; i <= posts; i += 1) {
      const z = spec.z - (spec.width - 0.6) / 2 + (i / posts) * (spec.width - 0.6);
      slab(kit, `rail${level}.${i}`, { width: 0.05, height: 0.95, depth: 0.05 }, new Vector3(kit.toward(1.05), y + 1.43, z), trim);
    }
    for (const dy of [0.55, 0.95]) {
      slab(kit, `railBar${level}.${dy}`, { width: 0.06, height: 0.05, depth: spec.width - 0.6 }, new Vector3(kit.toward(1.05), y + 0.9 + dy, spec.z), trim);
    }
    // And what people actually keep on a balcony.
    if (kit.random() < 0.6) {
      slab(kit, `acUnit${level}`, { width: 0.4, height: 0.55, depth: 0.8 }, new Vector3(kit.toward(0.42), y + 1.22, spec.z + (kit.random() - 0.5) * (spec.width - 1.6)), materials.painted("acShell", new Color3(0.62, 0.62, 0.6), 0.7));
    }
    if (kit.random() < 0.45) {
      slab(kit, `laundryPole${level}`, { width: 0.05, height: 0.05, depth: spec.width - 1.2 }, new Vector3(kit.toward(0.95), y + 2.0, spec.z), trim);
    }
  } else if (kit.random() < 0.55) {
    // No balcony: the condenser goes on a bracket on the wall instead.
    slab(kit, `wallAc${level}`, { width: 0.42, height: 0.5, depth: 0.72 }, new Vector3(kit.toward(0.4), y + 1.7, spec.z + (kit.random() - 0.5) * (spec.width - 1.4)), materials.painted("acShell", new Color3(0.62, 0.62, 0.6), 0.7));
  }
}

/** Parapet, tanks, condensers and aerials. */
function roofscape(kit: Kit, spec: BuildingSpec, top: number): void {
  const { materials } = kit;
  const concrete = materials.surface("concrete", 4);
  const metal = materials.painted("roofMetal", new Color3(0.42, 0.43, 0.44), 0.45, 0.75);

  slab(kit, "parapet", { width: 0.3, height: 0.85, depth: spec.width }, new Vector3(kit.toward(0.05), top + 0.42, spec.z), concrete);
  slab(kit, "coping", { width: 0.42, height: 0.12, depth: spec.width + 0.1 }, new Vector3(kit.toward(0.1), top + 0.9, spec.z), metal);

  const backX = kit.into(spec.depth * 0.5);
  if (kit.random() < 0.7) {
    const tank = CreateCylinder("waterTank", { diameter: 1.5, height: 1.5, tessellation: 12 }, kit.scene);
    tank.position.set(backX, top + 1.5, spec.z + (kit.random() - 0.5) * spec.width * 0.4);
    tank.material = metal;
    kit.parts.push(tank);
    for (const dz of [-0.5, 0.5]) {
      slab(kit, `tankLeg${dz}`, { width: 0.12, height: 0.75, depth: 0.12 }, new Vector3(backX + dz, top + 0.38, tank.position.z + dz), metal);
    }
  }
  for (let i = 0; i < 1 + Math.floor(kit.random() * 3); i += 1) {
    slab(kit, `condenser${i}`, { width: 0.8 + kit.random() * 0.5, height: 0.7, depth: 1 + kit.random() * 0.6 }, new Vector3(backX + kit.out * kit.random() * 2, top + 0.35, spec.z + (kit.random() - 0.5) * spec.width * 0.7), metal);
  }
  if (kit.random() < 0.5) {
    const mast = CreateCylinder("mast", { diameter: 0.07, height: 3 + kit.random() * 3, tessellation: 6 }, kit.scene);
    mast.position.set(backX, top + 1.5 + (3 + kit.random() * 3) / 2, spec.z + (kit.random() - 0.5) * spec.width);
    mast.material = metal;
    kit.parts.push(mast);
  }
}

/** Pipes, cable trays and meter boxes running up the frontage. */
function services(kit: Kit, spec: BuildingSpec, top: number): void {
  const { materials } = kit;
  const metal = materials.painted("pipeMetal", new Color3(0.24, 0.25, 0.26), 0.55, 0.6);
  const zEdge = spec.z + (kit.random() < 0.5 ? -1 : 1) * (spec.width / 2 - 0.35);

  const downpipe = CreateCylinder("downpipe", { diameter: 0.13, height: top, tessellation: 8 }, kit.scene);
  downpipe.position.set(kit.toward(0.12), top / 2, zEdge);
  downpipe.material = metal;
  kit.parts.push(downpipe);

  for (let y = 1.2; y < top; y += 2.6) {
    slab(kit, `bracket${y}`, { width: 0.18, height: 0.05, depth: 0.05 }, new Vector3(kit.toward(0.06), y, zEdge), metal);
  }
  slab(kit, "meterBox", { width: 0.22, height: 0.62, depth: 0.42 }, new Vector3(kit.toward(0.13), 1.35, spec.z + (kit.random() - 0.5) * spec.width * 0.6), materials.painted("meterBox", new Color3(0.5, 0.5, 0.47), 0.7));
  slab(kit, "cableTray", { width: 0.1, height: 0.1, depth: spec.width * 0.7 }, new Vector3(kit.toward(0.1), SHOPFRONT_HEIGHT + 0.05, spec.z), metal);
}

export function buildBuilding(
  scene: Scene,
  materials: CityMaterials,
  spec: BuildingSpec,
): BuiltBuilding {
  // The frontage plane, and which way is out of the building.
  const faceX = spec.side * spec.setback;
  const out = -spec.side;
  const kit: Kit = {
    scene,
    materials,
    parts: [],
    glass: [],
    random: makeRandom(spec.seed),
    out,
    toward: (d: number) => faceX + out * d,
    into: (d: number) => faceX - out * d,
  };

  const top = SHOPFRONT_HEIGHT + spec.floors * FLOOR_HEIGHT;

  // Depth of the room behind the glass. The mass has to make way for it.
  const roomDepth = spec.depth * 0.44;
  const interior = shopfront(kit, spec);
  tradeDressing(kit, spec);
  for (let level = 0; level < spec.floors; level += 1) {
    floorBand(kit, spec, level, SHOPFRONT_HEIGHT + level * FLOOR_HEIGHT);
  }
  roofscape(kit, spec, top);
  services(kit, spec, top);

  // The mass behind the frontage, in two parts.
  //
  // A single box from the ground up is the obvious way to do this and it is
  // why the shops could not be seen into: the room behind the glass sat
  // inside the mass, entirely enclosed in concrete. The upper storeys get
  // their mass; the ground floor only gets it behind wherever the shop's own
  // room ends.
  const concrete = materials.surface("concrete", 8);
  const upper = top - SHOPFRONT_HEIGHT;
  slab(
    kit,
    "massUpper",
    { width: spec.depth, height: upper, depth: spec.width },
    new Vector3(kit.into(RECESS + spec.depth * 0.5), SHOPFRONT_HEIGHT + upper / 2, spec.z),
    concrete,
  );
  const groundBack = spec.enterable ? 0 : interior ? spec.depth - roomDepth : spec.depth;
  if (groundBack > 0.2) {
    slab(
      kit,
      "massGround",
      { width: groundBack, height: SHOPFRONT_HEIGHT, depth: spec.width },
      new Vector3(
        kit.into(RECESS + (interior ? roomDepth : 0) + groundBack * 0.5),
        SHOPFRONT_HEIGHT / 2,
        spec.z,
      ),
      concrete,
    );
  }

  // One mesh per building, sub-meshed by material: thirty pieces of frontage
  // for three or four draw calls.
  const merged = Mesh.MergeMeshes(kit.parts, true, true, undefined, false, true);
  const meshes = merged ? [merged] : kit.parts;
  for (const mesh of meshes) {
    mesh.name = `building.${spec.side}.${Math.round(spec.z)}`;
    mesh.checkCollisions = true;
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
  }
  for (const pane of kit.glass) {
    pane.isPickable = false;
    pane.renderingGroupId = 1;
    pane.freezeWorldMatrix();
  }

  return {
    meshes,
    glass: kit.glass,
    entrance: new Vector3(kit.toward(0.9), 0, interior?.doorZ ?? spec.z),
    interior,
    business: spec.business,
  };
}
