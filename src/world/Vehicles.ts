/**
 * Car bodies.
 *
 * The street had one car in it: a box for the body, a box for the glass, and
 * four wheels. Six copies of it went up and down the road. What a street of
 * traffic actually looks like is fourteen different shapes — something tall
 * and narrow with a sliding door, something low with a long bonnet, a flatbed
 * with the cab over the front axle, a taxi with a sign on the roof — and the
 * silhouette is what tells them apart at forty metres, long before the paint
 * does.
 *
 * So a body here is a **side profile**, which is how a car is drawn before it
 * is a car. Two closed outlines in the (along, height) plane — the sheet metal
 * below the beltline and the glasshouse above it — are extruded across the
 * width and then sculpted: drawn in above the beltline (tumblehome), narrowed
 * towards the nose and tail (plan taper), and tucked under at the sills. Those
 * three operations are the difference between a slab and a car body, and they
 * come almost free because they are one pass over the vertices of a mesh that
 * is built once and instanced.
 *
 * Everything else — arches, bumpers, lamps, mirrors, pillars — is placed
 * against the sculpted surface using the same functions that sculpted it, so
 * a mirror sits on the flank of a wide car and on the flank of a narrow one
 * without either being a special case.
 *
 * Nothing here is a copy of a real vehicle. These are the *body styles* a
 * street has in it, drawn from the proportions those styles have always had.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetDefinition } from "../engine/AssetCatalog";
import type { CityMaterials } from "./CityMaterials";
import { pipe, prism, revolve, type Profile } from "./Shapes";

/** Extras a body can carry, over and above the shape itself. */
export interface VehicleExtras {
  /** A lit sign on the roof. */
  taxiSign?: boolean;
  /** Two bars along the roof. */
  roofRails?: boolean;
  /** A lip on the boot lid. */
  spoiler?: boolean;
  /** Black plastic over the arches, and a rubbing strip along the flanks. */
  cladding?: boolean;
  /** Chrome bumpers and round lamps instead of body-colour and slim ones. */
  chrome?: boolean;
  /** A load bed behind the cab, with drop sides. */
  bed?: boolean;
  /** No roof: a windscreen frame, a tonneau and two headrests. */
  open?: boolean;
  /** A painted band along the flanks, the way a trade vehicle is signed. */
  liveryBand?: Color3;
}

export interface VehicleSpec {
  id: string;
  /** What body style this is, in a phrase. For the docs and the report. */
  kind: string;
  length: number;
  width: number;
  /** Underside of the body pan. */
  ride: number;
  /** Bottom of the rocker, below which the body tucks in. */
  sill: number;
  /** Where sheet metal stops and glass starts. */
  belt: number;
  /** Top of the roof. */
  roof: number;
  /** Height of the leading edge of the bonnet. */
  bonnet: number;
  /** Distance from the nose back to the base of the windscreen. */
  dash: number;
  /** How far back the windscreen leans, along the car. */
  screenRake: number;
  /** Distance from the tail forward to the base of the rear screen. */
  tail: number;
  /** How far forward the rear screen leans. A fastback is most of the roof. */
  rearRake: number;
  /** A box body over the rear: what makes a van a van. */
  cargo?: { height: number };
  wheelbase: number;
  track: number;
  wheelRadius: number;
  /** How wide the tyre is, relative to the canonical 0.205 m. */
  tyreWidth?: number;
  /** How far the body draws in between the beltline and the roof. */
  tumblehome: number;
  /** How far the body narrows towards the nose and the tail, in plan. */
  taper: number;
  /** Four side windows or two. */
  doors: 2 | 4;
  paint: Color3;
  /** Roughness and metalness of the paint: a lacquer, a flat, a pearl. */
  finish?: [number, number];
  extras?: VehicleExtras;
}

/** The wheel the whole street rolls on, at its authored size. */
const WHEEL_RADIUS = 0.311;
const WHEEL_WIDTH = 0.205;

/* ------------------------------------------------------------------ shape */

/**
 * How wide the body is, as a fraction of its full width, at a given height
 * and position along the car.
 *
 * The one function that makes an extruded slab read as a car, and the one
 * every piece of trim is placed with, so a mirror or an arch sits on the
 * surface rather than near it.
 */
function widthAt(spec: VehicleSpec, y: number, z: number): number {
  const half = spec.length / 2;
  let factor = 1;
  // Tumblehome: the glasshouse is always narrower than the shoulders.
  if (y > spec.belt && spec.roof > spec.belt) {
    const t = Math.min(1, (y - spec.belt) / (spec.roof - spec.belt));
    factor *= 1 - spec.tumblehome * t;
  }
  // Plan taper: nose and tail are narrower than the middle. Squared, so the
  // sides are straight over the doors and only draw in at the ends.
  const along = Math.min(1, Math.abs(z) / half);
  factor *= 1 - spec.taper * along * along;
  // And the body tucks under below the rocker.
  if (y < spec.sill && spec.sill > 0) {
    factor *= 1 - 0.12 * Math.min(1, (spec.sill - y) / spec.sill);
  }
  return factor;
}

/** Where the flank is, in metres from the centreline. */
function flankX(spec: VehicleSpec, y: number, z: number): number {
  return (spec.width / 2) * widthAt(spec, y, z);
}

/**
 * Extrudes a side profile across the car and sculpts it.
 *
 * The profile is authored in (along, height) with the nose at +along, which
 * is how a car is drawn. `extrude` sweeps a shape lying in XY along a path,
 * so the sweep comes out along Z; this rotates the result a quarter turn —
 * a proper rotation, not a mirror, so the winding survives — and then applies
 * `widthAt` to every vertex.
 */
function panel(
  scene: Scene,
  name: string,
  spec: VehicleSpec,
  profile: Profile,
  from: number,
  to: number,
): Mesh {
  const mesh = prism(scene, name, profile, from, to);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions) return mesh;
  for (let i = 0; i < positions.length / 3; i += 1) {
    const along = positions[i * 3] ?? 0;
    const height = positions[i * 3 + 1] ?? 0;
    const across = positions[i * 3 + 2] ?? 0;
    // Quarter turn about Y: along becomes Z, across becomes X.
    const z = along;
    const y = height;
    const scale = widthAt(spec, y, z);
    positions[i * 3] = -across * scale;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    if (normals) {
      const nx = normals[i * 3] ?? 0;
      const ny = normals[i * 3 + 1] ?? 0;
      const nz = normals[i * 3 + 2] ?? 0;
      // The same turn, then the inverse of the width scale, which is what
      // narrowing a surface does to the normal across it.
      let rx = -nz / Math.max(0.05, scale);
      const ry = ny;
      const rz = nx;
      const length = Math.hypot(rx, ry, rz) || 1;
      rx /= length;
      normals[i * 3] = rx;
      normals[i * 3 + 1] = ry / length;
      normals[i * 3 + 2] = rz / length;
    }
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  if (normals) mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  return mesh;
}

/**
 * The sheet metal: bumper to bumper, underside to beltline, with an opening
 * cut over each wheel.
 *
 * The arches are the point. A body without them is a slab with four discs
 * beside it, because the top half of every tyre is inside the bodywork; with
 * them the wheel sits in an opening and the car has somewhere to put its
 * suspension. They are what makes the outline concave, and the reason the
 * caps are triangulated rather than fanned.
 */
function bodyProfile(spec: VehicleSpec): Profile {
  const half = spec.length / 2;
  const dashZ = half - spec.dash;
  const tailZ = -half + spec.tail;
  const deck = spec.tail > 0.4 ? spec.belt - 0.02 : spec.belt;
  const points: [number, number][] = [
    // Under the front bumper, tucked back the way a valance is.
    [half - 0.16, spec.ride],
    [half - 0.02, spec.ride + 0.1],
    [half, spec.bonnet - 0.34],
    // The nose: a bumper face, then the leading edge of the bonnet.
    [half - 0.04, spec.bonnet - 0.06],
    [half - 0.16, spec.bonnet],
    // Bonnet rising to the base of the windscreen.
    [dashZ + spec.dash * 0.45, spec.bonnet + (spec.belt - spec.bonnet) * 0.4],
    [dashZ, spec.belt],
    // The beltline, all the way back to the base of the rear screen.
    [tailZ, spec.belt],
    // The boot deck, or straight down the back of a hatch.
    [-half + 0.14, deck],
    [-half, deck - 0.1],
    [-half, spec.ride + 0.12],
    [-half + 0.16, spec.ride],
  ];
  // Running forward along the underside, an arch over each axle.
  const radius = spec.wheelRadius + 0.045;
  const arch = (centre: number): void => {
    points.push([centre - radius, spec.ride]);
    for (let i = 0; i <= 6; i += 1) {
      const angle = Math.PI - (i / 6) * Math.PI;
      points.push([centre + radius * Math.cos(angle), spec.wheelRadius + radius * Math.sin(angle)]);
    }
    points.push([centre + radius, spec.ride]);
  };
  arch(-spec.wheelbase / 2);
  arch(spec.wheelbase / 2);
  return points;
}

/** The glasshouse: windscreen, roof, rear screen, closed along the beltline. */
function cabinProfile(spec: VehicleSpec): Profile {
  const half = spec.length / 2;
  const dashZ = half - spec.dash;
  const tailZ = -half + spec.tail;
  return [
    [dashZ, spec.belt],
    [dashZ - spec.screenRake, spec.roof],
    [tailZ + spec.rearRake, spec.roof],
    [tailZ, spec.belt],
  ];
}

/* ------------------------------------------------------------------ wheel */

/**
 * A road wheel: a grooved rubber tyre on a bright alloy rim.
 *
 * Both are surfaces of revolution, which is what they are in life — the
 * tyre's profile carries the bead, the sidewall bulge, the shoulders and
 * three circumferential grooves, and the rim's carries the barrel and its
 * lips. A cylinder with a black material reads as a bin lid; a profile with
 * a sidewall and a tread reads as a tyre from the pavement.
 *
 * Authored at one size and scaled, so a kei van and a 4x4 roll on the same
 * wheel at the sizes those vehicles actually use.
 */
export function roadWheel(
  scene: Scene,
  name: string,
  at: Vector3,
  radius: number,
  width: number,
  tyreMaterial: Material | null,
  rimMaterial: Material | null,
  discMaterial: Material | null,
): Mesh[] {
  const r = radius / WHEEL_RADIUS;
  const w = width / WHEEL_WIDTH;
  const scaled = (profile: Profile): Profile =>
    profile.map(([a, b]) => [a * r, b * w] as [number, number]);
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
    scaled([
      [0.188, 0], [0.208, 0.005], [0.262, 0.016], [0.292, 0.032], [0.307, 0.05],
      [0.311, 0.062], [0.296, 0.068], [0.311, 0.075], [0.311, 0.098], [0.295, 0.104],
      [0.311, 0.111], [0.311, 0.134], [0.296, 0.14], [0.311, 0.146], [0.307, 0.156],
      [0.292, 0.174], [0.262, 0.19], [0.208, 0.2], [0.188, 0.205],
    ]),
    20,
  );
  tyre.material = tyreMaterial;
  place(tyre);

  const rim = revolve(
    scene,
    `${name}.rim`,
    scaled([
      [0, 0.012], [0.176, 0.012], [0.191, 0.004], [0.191, 0.026], [0.172, 0.05],
      [0.172, 0.16], [0.191, 0.18], [0.191, 0.201], [0.176, 0.193], [0.13, 0.193],
    ]),
    20,
  );
  rim.material = rimMaterial;
  place(rim);

  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const spoke = CreateBox(
      `${name}.spoke${i}`,
      { width: 0.058 * r, height: 0.026 * w, depth: 0.14 * r },
      scene,
    );
    spoke.position.set(Math.sin(angle) * 0.095 * r, 0.184 * w, Math.cos(angle) * 0.095 * r);
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
    scaled([[0, 0.202], [0.05, 0.2], [0.058, 0.19], [0.058, 0.17], [0, 0.168]]),
    12,
  );
  cap.material = rimMaterial;
  place(cap);

  const disc = CreateCylinder(
    `${name}.disc`,
    { diameter: 0.26 * r, height: 0.02 * w, tessellation: 16 },
    scene,
  );
  disc.position.set(0, 0.13 * w, 0);
  disc.bakeCurrentTransformIntoVertices();
  disc.material = discMaterial;
  place(disc);

  return parts;
}

/* --------------------------------------------------------------- assembly */

/** Everything a body is trimmed with, shared across the whole street. */
interface Trim {
  glass: Material;
  tyre: Material;
  alloy: Material;
  brake: Material;
  dark: Material;
  chrome: Material;
  plate: Material;
  lensRed: Material;
  lensAmber: Material;
  lensClear: Material;
  lampLit: Material;
  tailLit: Material;
  signLit: Material;
}

function makeTrim(materials: CityMaterials): Trim {
  return {
    glass: materials.glass("vehicle"),
    // Rubber, alloy and iron: a tyre is a dielectric and almost matte, a rim
    // is a polished metal that returns the street, and the disc behind it is
    // somewhere between the two.
    tyre: materials.painted("tyre", new Color3(0.032, 0.032, 0.035), 0.82),
    alloy: materials.painted("wheelRim", new Color3(0.84, 0.85, 0.88), 0.14, 1),
    brake: materials.painted("brakeDisc", new Color3(0.3, 0.29, 0.3), 0.4, 0.85),
    dark: materials.painted("carTrim", new Color3(0.05, 0.05, 0.055), 0.6),
    chrome: materials.painted("carChrome", new Color3(0.88, 0.89, 0.92), 0.1, 1),
    plate: materials.painted("carPlate", new Color3(0.9, 0.9, 0.86), 0.5),
    // Lenses are coloured plastic by day and lit from behind at night, so
    // each one is a lens with a smaller emissive element inside it. A lamp
    // that is only emissive goes black when the sun comes up.
    lensRed: materials.painted("lensRed", new Color3(0.42, 0.03, 0.03), 0.18, 0.1),
    lensAmber: materials.painted("lensAmber", new Color3(0.5, 0.22, 0.02), 0.18, 0.1),
    lensClear: materials.painted("lensClear", new Color3(0.46, 0.49, 0.53), 0.08, 0.3),
    lampLit: materials.emissive("headlight", new Color3(1, 0.96, 0.88), 4.5),
    tailLit: materials.emissive("taillight", new Color3(1, 0.16, 0.12), 3),
    signLit: materials.emissive("taxiSign", new Color3(1, 0.82, 0.35), 2.6),
  };
}

/** Builds one body style, whole. */
function buildVehicle(
  scene: Scene,
  spec: VehicleSpec,
  trim: Trim,
  materials: CityMaterials,
): Mesh[] {
  const extras = spec.extras ?? {};
  const half = spec.length / 2;
  const halfWidth = spec.width / 2;
  const dashZ = half - spec.dash;
  const tailZ = -half + spec.tail;
  const finish = spec.finish ?? [0.3, 0.6];
  const bodyPaint = materials.painted(`paint.${spec.id}`, spec.paint, finish[0], finish[1]);
  const opaque: Mesh[] = [];
  const glazing: Mesh[] = [];

  const add = (mesh: Mesh, material: Material | null, glassy = false): Mesh => {
    mesh.material = material;
    (glassy ? glazing : opaque).push(mesh);
    return mesh;
  };

  /** A block placed against the body, in the car's own axes. */
  const block = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: Material | null,
    glassy = false,
  ): Mesh => {
    const mesh = CreateBox(name, size, scene);
    mesh.position.copyFrom(at);
    return add(mesh, material, glassy);
  };

  // ------------------------------------------------------------ the shell
  const shell = panel(scene, "body", spec, bodyProfile(spec), -halfWidth, halfWidth);
  add(shell, bodyPaint);

  // A box body over the rear is what makes a van a van and a bus a bus: the
  // roof carries straight on past the cab instead of dropping to a beltline.
  if (spec.cargo) {
    const boxFrom = tailZ + spec.rearRake;
    const cargo = panel(
      scene,
      "cargo",
      spec,
      [
        [boxFrom, spec.belt - 0.04],
        [boxFrom, spec.cargo.height],
        [-half + 0.06, spec.cargo.height],
        [-half, spec.cargo.height - 0.12],
        [-half, spec.belt - 0.04],
      ],
      -halfWidth,
      halfWidth,
    );
    add(cargo, bodyPaint);
  }

  // ------------------------------------------------------- the glasshouse
  if (!extras.open) {
    const cabin = panel(scene, "cabin", spec, cabinProfile(spec), -halfWidth + 0.005, halfWidth - 0.005);
    add(cabin, trim.glass, true);

    // The roof panel caps the glass, so the greenhouse reads as glazing under
    // a painted lid rather than as one glass box.
    const roofFront = dashZ - spec.screenRake;
    const roofRear = tailZ + spec.rearRake;
    if (roofRear < roofFront) {
      const lid = panel(
        scene,
        "roof",
        spec,
        [
          [roofFront + 0.02, spec.roof - 0.1],
          [roofFront - 0.03, spec.roof + 0.008],
          [roofRear + 0.03, spec.roof + 0.008],
          [roofRear - 0.02, spec.roof - 0.1],
        ],
        -halfWidth - 0.008,
        halfWidth + 0.008,
      );
      add(lid, bodyPaint);
    }

    // Pillars. Each is a narrow band of the same sculpted surface standing
    // at the flank, which is why they follow the tumblehome instead of
    // hovering off the side of a car that draws in above the shoulder.
    const pillar = (name: string, z1: number, z2: number, thickness: number): void => {
      const outline: Profile = [
        [z1 + thickness / 2, spec.belt - 0.03],
        [z2 + thickness / 2, spec.roof + 0.005],
        [z2 - thickness / 2, spec.roof + 0.005],
        [z1 - thickness / 2, spec.belt - 0.03],
      ];
      for (const side of [-1, 1] as const) {
        const inner = side * (halfWidth - 0.075);
        const outer = side * (halfWidth + 0.004);
        add(
          panel(scene, `${name}${side}`, spec, outline, Math.min(inner, outer), Math.max(inner, outer)),
          bodyPaint,
        );
      }
    };
    pillar("pillarA", dashZ, dashZ - spec.screenRake, 0.1);
    pillar("pillarC", tailZ, tailZ + spec.rearRake, 0.11);
    if (spec.doors === 4) {
      const mid = (dashZ - spec.screenRake + tailZ + spec.rearRake) / 2;
      pillar("pillarB", mid + 0.05, mid, 0.07);
    }
  } else {
    // Open: a raked windscreen in a frame, a tonneau behind the seats, and
    // two headrest humps, which is the whole silhouette of a roadster.
    const screenTop = spec.belt + 0.36;
    const screen = panel(
      scene,
      "windscreen",
      spec,
      [
        [dashZ, spec.belt - 0.02],
        [dashZ - spec.screenRake, screenTop],
        [dashZ - spec.screenRake - 0.03, screenTop],
        [dashZ - 0.03, spec.belt - 0.02],
      ],
      -halfWidth + 0.14,
      halfWidth - 0.14,
    );
    add(screen, trim.glass, true);
    for (const side of [-1, 1] as const) {
      const inner = side * (halfWidth - 0.19);
      const outer = side * (halfWidth - 0.13);
      add(
        panel(
          scene,
          `screenFrame${side}`,
          spec,
          [
            [dashZ + 0.02, spec.belt - 0.02],
            [dashZ - spec.screenRake + 0.02, screenTop + 0.03],
            [dashZ - spec.screenRake - 0.05, screenTop + 0.03],
            [dashZ - 0.05, spec.belt - 0.02],
          ],
          Math.min(inner, outer),
          Math.max(inner, outer),
        ),
        bodyPaint,
      );
    }
    const tonneau = tailZ + 0.5;
    add(
      panel(
        scene,
        "tonneau",
        spec,
        [
          [tonneau, spec.belt - 0.02],
          [tonneau - 0.1, spec.belt + 0.1],
          [tailZ + 0.05, spec.belt + 0.08],
          [tailZ, spec.belt - 0.02],
        ],
        -halfWidth + 0.05,
        halfWidth - 0.05,
      ),
      bodyPaint,
    );
    for (const side of [-1, 1] as const) {
      block(
        `headrest${side}`,
        { width: 0.3, height: 0.18, depth: 0.26 },
        new Vector3(side * 0.34, spec.belt + 0.09, tonneau + 0.02),
        bodyPaint,
      );
    }
  }

  // ----------------------------------------------------------- the wheels
  const axleFront = spec.wheelbase / 2;
  const axleRear = -spec.wheelbase / 2;
  const tyreWidth = WHEEL_WIDTH * (spec.tyreWidth ?? 1);
  const wheelParts: Mesh[] = [];
  for (const [x, z] of [
    [-spec.track / 2, axleFront],
    [spec.track / 2, axleFront],
    [-spec.track / 2, axleRear],
    [spec.track / 2, axleRear],
  ] as const) {
    wheelParts.push(
      ...roadWheel(
        scene,
        `wheel${x}${z}`,
        new Vector3(x, spec.wheelRadius, z),
        spec.wheelRadius,
        tyreWidth,
        trim.tyre,
        trim.alloy,
        trim.brake,
      ),
    );
  }

  // Wheel arches. The opening is cut through the body, so each one needs a
  // liner behind it: without one you see daylight through the car, and the
  // wheel reads as a disc in a hole rather than as a wheel in an arch.
  const archMaterial = extras.cladding ? trim.dark : bodyPaint;
  const linerRadius = spec.wheelRadius + 0.028;
  const linerHalf = Math.max(0.1, spec.track / 2 - tyreWidth / 2 - 0.035);
  for (const z of [axleFront, axleRear]) {
    const outline: [number, number][] = [[z - linerRadius, spec.ride]];
    for (let i = 0; i <= 8; i += 1) {
      const angle = Math.PI - (i / 8) * Math.PI;
      outline.push([z + linerRadius * Math.cos(angle), spec.wheelRadius + linerRadius * Math.sin(angle)]);
    }
    outline.push([z + linerRadius, spec.ride]);
    add(panel(scene, `liner${z}`, spec, outline, -linerHalf, linerHalf), trim.dark);

    for (const side of [-1, 1] as const) {
      const radius = spec.wheelRadius + (extras.cladding ? 0.1 : 0.06);
      const path: Vector3[] = [];
      for (let i = 0; i <= 10; i += 1) {
        const angle = (-0.1 + (i / 10) * 1.2) * Math.PI;
        path.push(new Vector3(0, spec.wheelRadius + radius * Math.sin(angle), z + radius * Math.cos(angle)));
      }
      const arch = pipe(scene, `arch${side}${z}`, path, extras.cladding ? 0.055 : 0.03, 6);
      arch.position.x = side * (flankX(spec, spec.sill + 0.1, z) - 0.015);
      add(arch, archMaterial);
    }
  }

  // ------------------------------------------------- nose, tail and lamps
  const bumperY = spec.bonnet - 0.24;
  const bumperMaterial = extras.chrome ? trim.chrome : bodyPaint;
  // Everything on the nose and the tail has to stand proud of the face it is
  // on. A lamp set flush with the panel is a lamp inside the bodywork.
  for (const [name, z, height] of [
    ["bumperFront", half - 0.01, bumperY],
    ["bumperRear", -half + 0.01, spec.ride + 0.34],
  ] as const) {
    const w = flankX(spec, height, z) * 2 + 0.02;
    block(
      name,
      { width: w, height: extras.chrome ? 0.17 : 0.22, depth: 0.16 },
      new Vector3(0, height, z),
      bumperMaterial,
    );
  }
  // The grille: the one feature that is different on every car ever built,
  // and a dark recess is what it is from ten metres away.
  const grilleY = spec.bonnet - 0.15;
  block(
    "grille",
    { width: flankX(spec, grilleY, half - 0.1) * 1.45, height: 0.17, depth: 0.09 },
    new Vector3(0, grilleY, half - 0.005),
    trim.dark,
  );
  block(
    "plateFront",
    { width: 0.33, height: 0.13, depth: 0.03 },
    new Vector3(0, bumperY - 0.02, half + 0.03),
    trim.plate,
  );
  block(
    "plateRear",
    { width: 0.33, height: 0.13, depth: 0.03 },
    new Vector3(0, spec.ride + 0.36, -half - 0.03),
    trim.plate,
  );

  const lampY = spec.bonnet - 0.13;
  const lampX = flankX(spec, lampY, half - 0.2) - 0.22;
  for (const side of [-1, 1] as const) {
    if (extras.chrome) {
      // Round lamps in chrome rings, which is what a car had before a
      // headlamp could be any shape a mould could be cut for.
      const bowl = revolve(
        scene,
        `lamp${side}`,
        [[0, 0], [0.09, 0], [0.095, 0.03], [0.105, 0.05], [0.09, 0.055], [0, 0.055]],
        14,
      );
      bowl.rotation.x = -Math.PI / 2;
      bowl.position.set(side * lampX, lampY, half - 0.01);
      add(bowl, trim.lensClear);
      block(
        `lampLit${side}`,
        { width: 0.11, height: 0.11, depth: 0.02 },
        new Vector3(side * lampX, lampY, half + 0.035),
        trim.lampLit,
      );
    } else {
      block(
        `lamp${side}`,
        { width: 0.34, height: 0.14, depth: 0.13 },
        new Vector3(side * lampX, lampY, half - 0.02),
        trim.lensClear,
      );
      block(
        `lampLit${side}`,
        { width: 0.28, height: 0.08, depth: 0.02 },
        new Vector3(side * lampX, lampY, half + 0.035),
        trim.lampLit,
      );
    }
    // Indicators, in the corner of the nose where they go.
    // Measured in from the corner of the nose rather than out from the lamp,
    // so it cannot hang off the side of a narrow body.
    block(
      `indicator${side}`,
      { width: 0.1, height: 0.08, depth: 0.09 },
      new Vector3(side * (flankX(spec, lampY, half - 0.06) - 0.07), lampY - 0.01, half - 0.01),
      trim.lensAmber,
    );

    const tailY = spec.belt - 0.16;
    const tailX = flankX(spec, tailY, -half + 0.2) - 0.2;
    block(
      `tail${side}`,
      { width: 0.29, height: extras.chrome ? 0.11 : 0.19, depth: 0.12 },
      new Vector3(side * tailX, tailY, -half + 0.02),
      trim.lensRed,
    );
    block(
      `tailLit${side}`,
      { width: 0.21, height: 0.07, depth: 0.02 },
      new Vector3(side * tailX, tailY, -half - 0.035),
      trim.tailLit,
    );

    // Mirrors, on the flank at the base of the A-pillar. Small, and the
    // single strongest cue that a shape is a car and not a bar of soap.
    const mirrorY = spec.belt + 0.06;
    const mirrorZ = dashZ - spec.screenRake * 0.35;
    const stalkX = flankX(spec, mirrorY, mirrorZ);
    block(
      `mirrorStalk${side}`,
      { width: 0.07, height: 0.05, depth: 0.05 },
      new Vector3(side * (stalkX + 0.03), mirrorY, mirrorZ),
      trim.dark,
    );
    block(
      `mirror${side}`,
      { width: 0.05, height: 0.11, depth: 0.19 },
      new Vector3(side * (stalkX + 0.1), mirrorY + 0.02, mirrorZ),
      trim.dark,
    );

    // Doors. A flank without a shut line on it is a pressing, not a car, and
    // this is the cheapest detail in the whole model: three dark slivers and
    // a handle, and the side of the car suddenly has doors in it.
    const doorTop = spec.belt - 0.06;
    const doorFoot = spec.sill + 0.08;
    const midZ = (dashZ + tailZ) / 2;
    const shuts = spec.doors === 4 ? [dashZ, midZ, tailZ] : [dashZ, tailZ];
    const handles = spec.doors === 4
      ? [(dashZ + midZ) / 2, (midZ + tailZ) / 2]
      : [(dashZ + tailZ) / 2];
    for (const z of shuts) {
      const at = flankX(spec, (doorTop + doorFoot) / 2, z);
      block(
        `shut${side}${z.toFixed(2)}`,
        { width: 0.02, height: doorTop - doorFoot, depth: 0.016 },
        new Vector3(side * at, (doorTop + doorFoot) / 2, z),
        trim.dark,
      );
    }
    for (const z of handles) {
      const at = flankX(spec, spec.belt - 0.16, z);
      block(
        `handle${side}${z.toFixed(2)}`,
        { width: 0.04, height: 0.045, depth: 0.16 },
        new Vector3(side * (at + 0.012), spec.belt - 0.16, z),
        extras.chrome ? trim.chrome : trim.dark,
      );
    }

    // A rubbing strip along the flanks, and the sills under the doors.
    const stripY = spec.sill + 0.16;
    const stripZ = (dashZ + tailZ) / 2;
    block(
      `sill${side}`,
      { width: 0.05, height: 0.07, depth: spec.wheelbase - 0.75 },
      new Vector3(side * (flankX(spec, spec.sill, stripZ) - 0.015), spec.sill + 0.01, stripZ),
      extras.cladding ? trim.dark : bodyPaint,
    );
    if (extras.cladding) {
      block(
        `strip${side}`,
        { width: 0.05, height: 0.09, depth: spec.wheelbase - 0.6 },
        new Vector3(side * (flankX(spec, stripY, stripZ) + 0.01), stripY, stripZ),
        trim.dark,
      );
    }
    if (extras.liveryBand) {
      const bandY = spec.belt - 0.28;
      block(
        `band${side}`,
        { width: 0.03, height: 0.2, depth: spec.length - 1.3 },
        new Vector3(side * (flankX(spec, bandY, 0) + 0.015), bandY, -0.1),
        materials.painted(`livery.${spec.id}`, extras.liveryBand, 0.35, 0.2),
      );
    }
  }

  // The exhaust, under the rear valance on one side only, as it is.
  const pipeMesh = CreateCylinder("exhaust", { diameter: 0.06, height: 0.16, tessellation: 8 }, scene);
  pipeMesh.rotation.x = Math.PI / 2;
  pipeMesh.position.set(-0.4, spec.ride + 0.08, -half + 0.02);
  add(pipeMesh, trim.chrome);

  // ----------------------------------------------------------- roof gear
  if (extras.taxiSign) {
    block(
      "signBase",
      { width: 0.4, height: 0.05, depth: 0.28 },
      new Vector3(0, spec.roof + 0.03, 0.1),
      trim.dark,
    );
    block(
      "sign",
      { width: 0.52, height: 0.14, depth: 0.2 },
      new Vector3(0, spec.roof + 0.12, 0.1),
      trim.signLit,
    );
  }
  if (extras.roofRails) {
    for (const side of [-1, 1] as const) {
      const railZ = (dashZ - spec.screenRake + tailZ + spec.rearRake) / 2;
      block(
        `rail${side}`,
        { width: 0.06, height: 0.05, depth: Math.max(0.8, spec.length * 0.42) },
        new Vector3(side * (flankX(spec, spec.roof, railZ) - 0.1), spec.roof + 0.04, railZ),
        trim.dark,
      );
    }
  }
  if (extras.spoiler) {
    const lipZ = -half + 0.2;
    block(
      "spoiler",
      { width: flankX(spec, spec.belt, lipZ) * 1.85, height: 0.05, depth: 0.22 },
      new Vector3(0, spec.belt + 0.06, lipZ),
      bodyPaint,
    );
    for (const side of [-1, 1] as const) {
      block(
        `spoilerLeg${side}`,
        { width: 0.06, height: 0.09, depth: 0.1 },
        new Vector3(side * flankX(spec, spec.belt, lipZ) * 0.62, spec.belt + 0.01, lipZ),
        bodyPaint,
      );
    }
  }
  if (extras.bed) {
    // A flat deck behind the cab with drop sides, sitting on the chassis.
    const deckZ = tailZ + spec.rearRake - 0.1;
    const deckLength = deckZ + half - 0.05;
    const deckY = spec.sill + 0.28;
    block(
      "deck",
      { width: spec.width - 0.02, height: 0.07, depth: deckLength },
      new Vector3(0, deckY, deckZ - deckLength / 2),
      trim.dark,
    );
    for (const side of [-1, 1] as const) {
      block(
        `dropSide${side}`,
        { width: 0.05, height: 0.34, depth: deckLength },
        new Vector3(side * (spec.width / 2 - 0.03), deckY + 0.2, deckZ - deckLength / 2),
        bodyPaint,
      );
    }
    block(
      "tailgate",
      { width: spec.width - 0.06, height: 0.34, depth: 0.05 },
      new Vector3(0, deckY + 0.2, deckZ - deckLength + 0.03),
      bodyPaint,
    );
    block(
      "headboard",
      { width: spec.width - 0.06, height: 0.42, depth: 0.05 },
      new Vector3(0, deckY + 0.24, deckZ - 0.02),
      bodyPaint,
    );
  }

  // One mesh per material family: they never move relative to each other,
  // and the catalog instances every part of a prefab separately.
  const result: Mesh[] = [];
  const merged = Mesh.MergeMeshes(opaque, true, true, undefined, false, true);
  if (merged) {
    merged.name = "shell";
    result.push(merged);
  }
  if (glazing.length > 0) {
    const glassMesh = Mesh.MergeMeshes(glazing, true, true, undefined, false, true);
    if (glassMesh) {
      glassMesh.name = "glass";
      result.push(glassMesh);
    }
  }
  const wheels = Mesh.MergeMeshes(wheelParts, true, true, undefined, false, true);
  if (wheels) {
    wheels.name = "wheels";
    result.push(wheels);
  }
  return result;
}

/* ------------------------------------------------------------ the street */

/**
 * Fourteen body styles, which between them are what a Tokyo street has in
 * it: a lot of small upright boxes, a few saloons, a delivery van, and the
 * occasional thing somebody bought because they wanted it.
 *
 * The numbers are the proportions those styles have — a kei class car is
 * 3.40 m long and 1.48 m wide because that is the size the class allows, and
 * everything else is measured against that. Each carries its own paint, so a
 * street with one of each in it has no two cars alike.
 */
export const VEHICLE_SPECS: readonly VehicleSpec[] = [
  {
    id: "car_kei_van",
    kind: "kei one-box van",
    length: 3.4, width: 1.475, ride: 0.17, sill: 0.34, belt: 1.06, roof: 1.9,
    bonnet: 0.86, dash: 0.42, screenRake: 0.3, tail: 0.04, rearRake: 0.06,
    wheelbase: 2.42, track: 1.23, wheelRadius: 0.275, tumblehome: 0.09, taper: 0.13,
    doors: 4, paint: new Color3(0.86, 0.87, 0.87), finish: [0.42, 0.15],
  },
  {
    id: "car_kei_truck",
    kind: "kei flatbed",
    length: 3.4, width: 1.475, ride: 0.18, sill: 0.36, belt: 1.02, roof: 1.78,
    bonnet: 0.8, dash: 0.26, screenRake: 0.24, tail: 1.5, rearRake: 0.05,
    wheelbase: 1.94, track: 1.22, wheelRadius: 0.27, tumblehome: 0.08, taper: 0.1,
    doors: 2, paint: new Color3(0.62, 0.68, 0.72), finish: [0.5, 0.1],
    extras: { bed: true },
  },
  {
    id: "car_kei_hatch",
    kind: "kei hatchback",
    length: 3.395, width: 1.475, ride: 0.16, sill: 0.32, belt: 0.98, roof: 1.6,
    bonnet: 0.82, dash: 0.6, screenRake: 0.44, tail: 0.08, rearRake: 0.3,
    wheelbase: 2.39, track: 1.28, wheelRadius: 0.28, tumblehome: 0.16, taper: 0.18,
    doors: 4, paint: new Color3(0.86, 0.62, 0.1), finish: [0.32, 0.4],
  },
  {
    id: "car_taxi",
    kind: "taxi saloon",
    length: 4.66, width: 1.7, ride: 0.17, sill: 0.33, belt: 1.02, roof: 1.52,
    bonnet: 0.86, dash: 1.0, screenRake: 0.62, tail: 0.92, rearRake: 0.42,
    wheelbase: 2.65, track: 1.43, wheelRadius: 0.315, tumblehome: 0.13, taper: 0.15,
    doors: 4, paint: new Color3(0.04, 0.1, 0.07), finish: [0.22, 0.5],
    extras: { taxiSign: true, liveryBand: new Color3(0.85, 0.72, 0.3) },
  },
  {
    id: "car_hatch",
    kind: "compact hatchback",
    length: 3.99, width: 1.695, ride: 0.16, sill: 0.31, belt: 1.0, roof: 1.48,
    bonnet: 0.84, dash: 0.8, screenRake: 0.56, tail: 0.1, rearRake: 0.34,
    wheelbase: 2.53, track: 1.46, wheelRadius: 0.3, tumblehome: 0.18, taper: 0.2,
    doors: 4, paint: new Color3(0.62, 0.06, 0.05), finish: [0.26, 0.55],
  },
  {
    id: "car_saloon",
    kind: "executive saloon",
    length: 4.75, width: 1.78, ride: 0.15, sill: 0.3, belt: 1.0, roof: 1.44,
    bonnet: 0.84, dash: 1.1, screenRake: 0.68, tail: 1.0, rearRake: 0.46,
    wheelbase: 2.8, track: 1.51, wheelRadius: 0.325, tumblehome: 0.15, taper: 0.16,
    doors: 4, paint: new Color3(0.56, 0.58, 0.61), finish: [0.24, 0.8],
  },
  {
    id: "car_wagon",
    kind: "estate",
    length: 4.8, width: 1.78, ride: 0.16, sill: 0.31, belt: 1.02, roof: 1.5,
    bonnet: 0.86, dash: 1.05, screenRake: 0.66, tail: 0.12, rearRake: 0.16,
    wheelbase: 2.75, track: 1.51, wheelRadius: 0.32, tumblehome: 0.13, taper: 0.14,
    doors: 4, paint: new Color3(0.09, 0.19, 0.14), finish: [0.28, 0.55],
    extras: { roofRails: true },
  },
  {
    id: "car_mpv",
    kind: "people carrier",
    length: 4.7, width: 1.73, ride: 0.17, sill: 0.34, belt: 1.1, roof: 1.84,
    bonnet: 0.94, dash: 0.7, screenRake: 0.52, tail: 0.06, rearRake: 0.18,
    wheelbase: 2.85, track: 1.47, wheelRadius: 0.31, tumblehome: 0.11, taper: 0.13,
    doors: 4, paint: new Color3(0.9, 0.9, 0.89), finish: [0.28, 0.35],
  },
  {
    id: "car_coupe",
    kind: "sports coupe",
    length: 4.36, width: 1.8, ride: 0.12, sill: 0.26, belt: 0.9, roof: 1.28,
    bonnet: 0.74, dash: 1.3, screenRake: 0.66, tail: 0.32, rearRake: 1.0,
    wheelbase: 2.57, track: 1.55, wheelRadius: 0.33, tyreWidth: 1.15,
    tumblehome: 0.22, taper: 0.2,
    doors: 2, paint: new Color3(0.06, 0.16, 0.42), finish: [0.2, 0.7],
    extras: { spoiler: true },
  },
  {
    id: "car_roadster",
    kind: "open two-seater",
    length: 3.96, width: 1.72, ride: 0.12, sill: 0.26, belt: 0.86, roof: 1.22,
    bonnet: 0.72, dash: 1.2, screenRake: 0.34, tail: 0.55, rearRake: 0.2,
    wheelbase: 2.27, track: 1.47, wheelRadius: 0.31, tumblehome: 0.2, taper: 0.2,
    doors: 2, paint: new Color3(0.03, 0.36, 0.36), finish: [0.2, 0.65],
    extras: { open: true },
  },
  {
    id: "car_crossover",
    kind: "crossover",
    length: 4.54, width: 1.8, ride: 0.22, sill: 0.42, belt: 1.16, roof: 1.66,
    bonnet: 1.0, dash: 0.95, screenRake: 0.6, tail: 0.14, rearRake: 0.32,
    wheelbase: 2.66, track: 1.53, wheelRadius: 0.345, tyreWidth: 1.1,
    tumblehome: 0.15, taper: 0.17,
    doors: 4, paint: new Color3(0.42, 0.31, 0.14), finish: [0.3, 0.6],
    extras: { roofRails: true, cladding: true },
  },
  {
    id: "car_box_suv",
    kind: "boxy four-wheel drive",
    length: 4.6, width: 1.79, ride: 0.26, sill: 0.46, belt: 1.22, roof: 1.88,
    bonnet: 1.1, dash: 0.78, screenRake: 0.28, tail: 0.08, rearRake: 0.06,
    wheelbase: 2.6, track: 1.49, wheelRadius: 0.37, tyreWidth: 1.25,
    tumblehome: 0.05, taper: 0.08,
    doors: 4, paint: new Color3(0.24, 0.25, 0.18), finish: [0.62, 0.1],
    extras: { cladding: true, roofRails: true },
  },
  {
    id: "car_van",
    kind: "high-roof panel van",
    length: 4.69, width: 1.69, ride: 0.18, sill: 0.36, belt: 1.14, roof: 1.95,
    bonnet: 0.94, dash: 0.5, screenRake: 0.55, tail: 2.5, rearRake: 0.06,
    cargo: { height: 1.95 },
    wheelbase: 2.93, track: 1.45, wheelRadius: 0.315, tumblehome: 0.07, taper: 0.09,
    doors: 2, paint: new Color3(0.9, 0.9, 0.91), finish: [0.42, 0.1],
    extras: { liveryBand: new Color3(0.1, 0.32, 0.55) },
  },
  {
    id: "car_classic",
    kind: "seventies coupe",
    length: 4.6, width: 1.71, ride: 0.15, sill: 0.29, belt: 1.02, roof: 1.39,
    bonnet: 0.92, dash: 1.2, screenRake: 0.52, tail: 0.8, rearRake: 0.52,
    wheelbase: 2.64, track: 1.41, wheelRadius: 0.34, tumblehome: 0.09, taper: 0.11,
    doors: 2, paint: new Color3(0.72, 0.64, 0.44), finish: [0.34, 0.35],
    extras: { chrome: true },
  },
];

/** Every body style's id, in the order they are declared. */
export const VEHICLE_IDS: readonly string[] = VEHICLE_SPECS.map((spec) => spec.id);

/** Catalog definitions for every body style. */
export function vehiclePrefabs(materials: CityMaterials): AssetDefinition[] {
  let trim: Trim | null = null;
  return VEHICLE_SPECS.map((spec) => ({
    id: spec.id,
    category: "vehicle" as const,
    collides: false,
    castsShadow: true,
    build: ({ scene }) => {
      trim ??= makeTrim(materials);
      return buildVehicle(scene, spec, trim, materials);
    },
  }));
}
