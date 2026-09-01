/**
 * The lane behind the shops, and the pocket park at the end of it.
 *
 * Two streets back from the neon, Tokyo goes quiet very suddenly: a lane
 * barely wide enough for one car, two-storey houses hard against it with no
 * front garden to speak of, a bicycle and three pot plants at every door,
 * poles carrying more cable than the buildings look worth, and a park the
 * size of a tennis court with a slide, a swing and a tap.
 *
 * It is the other half of the district — the half that makes the main street
 * read as a main street. You reach it through the alley.
 *
 * Everything static here is merged down to a handful of meshes: this is a
 * place you pass through, not one you stand in, and it should not cost what
 * the shopfronts cost.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { CityMaterials, NEON } from "./CityMaterials";
import { CONCRETE_TILE } from "./Concrete";
import { PAVING_TILE } from "./Paving";
import { boxUv, extrude, planarUv, pipe, railingRun, revolve } from "./Shapes";
import { makeRandom } from "./Noise";
import type { LampSite } from "./LampPool";

export interface ResidentialSpec {
  /** The wall the alley comes through, and where its opening is. */
  gateX: number;
  gateZ: number;
  /** Centre line of the lane, and how far it runs. */
  laneX: number;
  from: number;
  to: number;
  /** The park takes the far end of the lane, beyond this. */
  parkFrom: number;
  seed: number;
}

export interface BuiltResidential {
  lamps: LampSite[];
  /** Walls and house fronts, for the camera to keep out of. */
  shell: Mesh[];
  contains(point: Vector3): boolean;
  dispose(): void;
}

const LANE_HALF = 2.6;

export function buildResidential(
  scene: Scene,
  materials: CityMaterials,
  spawnProp: (id: string, at: Vector3, rotationY?: number) => void,
  spec: ResidentialSpec,
): BuiltResidential {
  const random = makeRandom(spec.seed);
  const collidable: Mesh[] = [];
  const dressing: Mesh[] = [];
  const shell: Mesh[] = [];

  const concrete = materials.concrete();
  const paving = materials.paving("concrete");
  const asphalt = materials.road();
  const plasterA = materials.painted("houseWallA", new Color3(0.72, 0.7, 0.66), 0.85);
  const plasterB = materials.painted("houseWallB", new Color3(0.62, 0.6, 0.58), 0.85);
  const siding = materials.painted("houseSiding", new Color3(0.44, 0.42, 0.4), 0.8);
  const tile = materials.painted("houseRoof", new Color3(0.17, 0.18, 0.2), 0.6, 0.2);
  const timber = materials.painted("houseTimber", new Color3(0.26, 0.19, 0.13), 0.8);
  const metal = materials.painted("houseMetal", new Color3(0.36, 0.37, 0.38), 0.45, 0.7);
  const glass = materials.glass("shopfront");
  // What is behind a pane: a room with the light off, so the glass has
  // something dark to sit against and its reflection reads.
  const dim = materials.painted("houseReveal", new Color3(0.05, 0.05, 0.06), 0.95);

  const box = (
    name: string,
    size: { width: number; height: number; depth: number },
    at: Vector3,
    material: Material,
    collides = false,
  ): Mesh => {
    const mesh = CreateBox(`lane.${name}`, size, scene);
    mesh.position.copyFrom(at);
    mesh.material = material;
    mesh.isPickable = false;
    (collides ? collidable : dressing).push(mesh);
    return mesh;
  };

  // ------------------------------------------------------------- the lane
  const laneLength = spec.to - spec.from;
  const surface = box(
    "surface",
    { width: LANE_HALF * 2, height: 0.12, depth: laneLength },
    new Vector3(spec.laneX, -0.05, (spec.from + spec.to) / 2),
    asphalt,
    true,
  );
  planarUv(surface, 8);
  // A gutter each side, which in a lane this narrow is the whole drainage.
  for (const side of [-1, 1] as const) {
    const gutter = box(
      `gutter${side}`,
      { width: 0.5, height: 0.14, depth: laneLength },
      new Vector3(spec.laneX + side * (LANE_HALF - 0.25), -0.04, (spec.from + spec.to) / 2),
      paving,
    );
    planarUv(gutter, PAVING_TILE);
  }
  // The strip of ground between the lane and the backs of the shops.
  const backStrip = box(
    "backStrip",
    { width: Math.abs(spec.gateX - (spec.laneX + LANE_HALF)) + 0.4, height: 0.12, depth: laneLength },
    new Vector3((spec.gateX + spec.laneX + LANE_HALF) / 2, -0.05, (spec.from + spec.to) / 2),
    paving,
    true,
  );
  planarUv(backStrip, PAVING_TILE);

  /** One two-storey house, its wall to the lane. */
  const house = (z: number, depth: number, index: number): void => {
    const width = 5.4 + random() * 1.6;
    const height = 5.4 + random() * 1.2;
    const faceX = spec.laneX - LANE_HALF - 0.7;
    const centreX = faceX - depth / 2;
    const wall = index % 3 === 0 ? siding : index % 3 === 1 ? plasterA : plasterB;

    const mass = box(`house${index}`, { width: depth, height, depth: width }, new Vector3(centreX, height / 2, z), wall, true);
    shell.push(mass);
    // The roof as one extruded prism rather than two tilted slabs: a slab
    // roof is two planes that intersect each other in the middle and poke
    // out at the eaves, and it reads as sheets laid over the house. A prism
    // has a ridge, two clean slopes and real gable ends.
    const roofTile = index % 2 === 0 ? tile : materials.painted("houseRoofBlue", new Color3(0.2, 0.24, 0.3), 0.6, 0.2);
    const eave = 0.45;
    const rise = 0.85;
    const roof = extrude(
      scene,
      `lane.roof${index}`,
      [
        [-depth / 2 - eave, 0],
        [-depth / 2 - eave, 0.14],
        [0, rise],
        [depth / 2 + eave, 0.14],
        [depth / 2 + eave, 0],
      ],
      [new Vector3(0, 0, -width / 2 - 0.3), new Vector3(0, 0, width / 2 + 0.3)],
      { cap: true },
    );
    roof.position.set(centreX, height, z);
    roof.material = roofTile;
    roof.isPickable = false;
    dressing.push(roof);

    // Windows: an aluminium sash on each floor, and a balcony on the upper.
    // The glass is set back into the reveal and the frame closes it on all
    // four sides; a bar laid over the face of the wall reads as a shelf.
    for (let floor = 0; floor < 2; floor += 1) {
      const y = floor === 0 ? 1.55 : 4.2;
      const open = width * 0.5;
      const half = open / 2;
      // The wall is a solid box, so the opening is faked in front of it: a
      // dark reveal for the room behind, the glass over that, and the frame
      // over both. Set the glass back into the wall instead and it vanishes
      // inside the mass.
      box(`reveal${index}.${floor}`, { width: 0.02, height: 1.24, depth: open - 0.12 }, new Vector3(faceX + 0.012, y, z), dim);
      box(`pane${index}.${floor}`, { width: 0.03, height: 1.24, depth: open - 0.12 }, new Vector3(faceX + 0.04, y, z), glass);
      box(`sashHead${index}.${floor}`, { width: 0.09, height: 0.08, depth: open }, new Vector3(faceX + 0.05, y + 0.65, z), metal);
      box(`sashSill${index}.${floor}`, { width: 0.17, height: 0.07, depth: open + 0.1 }, new Vector3(faceX + 0.08, y - 0.65, z), metal);
      for (const side of [-1, 1] as const) {
        box(`sashJamb${index}.${floor}.${side}`, { width: 0.09, height: 1.3, depth: 0.07 }, new Vector3(faceX + 0.05, y, z + side * (half - 0.035)), metal);
      }
      box(`sashMull${index}.${floor}`, { width: 0.08, height: 1.24, depth: 0.06 }, new Vector3(faceX + 0.045, y, z), metal);
    }
    // The balcony, its railing, and the pole everyone dries washing on. Its
    // deck sits just under the upper sill, the way these are always built.
    box(`balcony${index}`, { width: 0.95, height: 0.12, depth: width * 0.62 }, new Vector3(faceX + 0.5, 3.42, z), concrete);
    const rail = railingRun(scene, `lane.balconyRail${index}`, width * 0.62, 0.95, 0.5, metal);
    if (rail) {
      rail.position.set(faceX + 0.92, 3.48, z);
      rail.isPickable = false;
      dressing.push(rail);
    }
    box(`dryPole${index}`, { width: 0.05, height: 0.05, depth: width * 0.55 }, new Vector3(faceX + 0.75, 4.25, z), metal);

    // The door, its canopy, the meter box and the mailbox: the four things
    // that are outside every one of these houses.
    const doorZ = z + (random() < 0.5 ? -1 : 1) * (width * 0.28);
    box(`door${index}`, { width: 0.1, height: 2, depth: 0.9 }, new Vector3(faceX - 0.03, 1, doorZ), timber);
    box(`canopy${index}`, { width: 0.8, height: 0.09, depth: 1.4 }, new Vector3(faceX + 0.42, 2.25, doorZ), metal);
    box(`meter${index}`, { width: 0.16, height: 0.42, depth: 0.3 }, new Vector3(faceX + 0.1, 1.5, doorZ + 0.9), metal);
    box(`post${index}`, { width: 0.24, height: 0.3, depth: 0.4 }, new Vector3(faceX + 0.55, 1.05, doorZ - 0.85), metal);
    box(`postLeg${index}`, { width: 0.07, height: 0.9, depth: 0.07 }, new Vector3(faceX + 0.55, 0.45, doorZ - 0.85), metal);

    // A low boundary wall with a gap for the door, and what stands on it.
    box(`fence${index}`, { width: 0.16, height: 0.62, depth: width * 0.5 }, new Vector3(faceX + 1.5, 0.31, z + width * 0.24), concrete, true);
    for (let i = 0; i < 3; i += 1) {
      const potZ = z - width * 0.3 + i * 0.42;
      const pot = revolve(
        scene,
        `lane.pot${index}.${i}`,
        [[0, 0], [0.13, 0], [0.15, 0.05], [0.16, 0.22], [0.17, 0.24], [0.13, 0.25], [0, 0.24]],
        10,
      );
      pot.position.set(faceX + 0.4, 0, potZ);
      pot.material = materials.painted("planterClay", new Color3(0.42, 0.24, 0.16), 0.8);
      pot.isPickable = false;
      dressing.push(pot);
      const bush = CreateSphere(`lane.bush${index}.${i}`, { diameter: 0.34 + random() * 0.16, segments: 6 }, scene);
      bush.position.set(faceX + 0.4, 0.38, potZ);
      bush.scaling.y = 0.8;
      bush.material = materials.painted("planterLeaf", new Color3(0.16, 0.3, 0.14), 0.9);
      bush.isPickable = false;
      dressing.push(bush);
    }
  };

  let z = spec.from + 3;
  let index = 0;
  while (z < spec.parkFrom - 4) {
    house(z, 6.5 + random() * 1.5, index);
    z += 7.2 + random() * 1.4;
    index += 1;
  }

  // The backs of the shops on the other side: blank concrete, a fire escape,
  // stacked crates and the condensers that all face this way and not the
  // street.
  for (let i = 0; i < 6; i += 1) {
    const at = spec.from + 4 + i * ((spec.parkFrom - spec.from - 6) / 5);
    box(`backAc${i}`, { width: 0.75, height: 0.62, depth: 0.9 }, new Vector3(spec.gateX - 0.55, 1.1 + (i % 3) * 1.4, at), metal);
    if (i % 2 === 0) {
      box(`backCrate${i}`, { width: 0.6, height: 0.42, depth: 0.6 }, new Vector3(spec.gateX - 0.7, 0.21, at + 1.1), timber, true);
    }
  }

  // Poles down one side, and the cables between them. Nothing says a
  // Japanese back lane like the amount of wire over it.
  const poleTops: Vector3[] = [];
  for (let i = 0; i * 11 < spec.to - spec.from; i += 1) {
    const at = spec.from + 5 + i * 11;
    if (at > spec.to - 2) break;
    spawnProp("utility_pole_01", new Vector3(spec.laneX + LANE_HALF - 0.35, 0, at));
    poleTops.push(new Vector3(spec.laneX + LANE_HALF - 0.35, 7.6, at));
  }
  for (let i = 1; i < poleTops.length; i += 1) {
    const a = poleTops[i - 1]!;
    const b = poleTops[i]!;
    for (let strand = 0; strand < 3; strand += 1) {
      const sag = 0.5 + strand * 0.22;
      const y = a.y - strand * 0.34;
      const cable = pipe(
        scene,
        `lane.cable${i}.${strand}`,
        [
          new Vector3(a.x, y, a.z),
          new Vector3((a.x + b.x) / 2, y - sag, (a.z + b.z) / 2),
          new Vector3(b.x, y, b.z),
        ],
        0.025,
        5,
      );
      cable.material = materials.painted("cableBlack", new Color3(0.06, 0.06, 0.07), 0.9);
      cable.isPickable = false;
      dressing.push(cable);
    }
  }

  // ------------------------------------------------------------- the park
  const parkCentre = (spec.parkFrom + spec.to) / 2;
  const parkDepth = spec.to - spec.parkFrom;
  const parkWidth = LANE_HALF * 2 + 4;
  const parkX = spec.laneX - 1;
  const ground = box(
    "parkGround",
    { width: parkWidth, height: 0.12, depth: parkDepth },
    new Vector3(parkX, -0.05, parkCentre),
    materials.paving("block"),
    true,
  );
  planarUv(ground, PAVING_TILE);
  // A low wall and hedge round it, with the gap that is its entrance.
  for (const side of [-1, 1] as const) {
    box(`parkWall${side}`, { width: parkWidth, height: 0.5, depth: 0.2 }, new Vector3(parkX, 0.25, parkCentre + side * (parkDepth / 2 - 0.1)), concrete, true);
  }
  box("parkWallBack", { width: 0.2, height: 0.5, depth: parkDepth }, new Vector3(parkX - parkWidth / 2, 0.25, parkCentre), concrete, true);

  // Sand, a slide, a swing frame, a bench, a tap and a bin: a park this size
  // has room for exactly that and no more.
  const sand = box("sandpit", { width: 3.4, height: 0.1, depth: 3.4 }, new Vector3(parkX - 1.4, 0.02, parkCentre + parkDepth * 0.18), materials.painted("parkSand", new Color3(0.62, 0.56, 0.42), 0.95), false);
  planarUv(sand, PAVING_TILE);
  for (const side of [-1, 1] as const) {
    box(`sandKerb${side}`, { width: 3.6, height: 0.16, depth: 0.18 }, new Vector3(parkX - 1.4, 0.08, parkCentre + parkDepth * 0.18 + side * 1.7), timber);
    box(`sandKerbX${side}`, { width: 0.18, height: 0.16, depth: 3.6 }, new Vector3(parkX - 1.4 + side * 1.7, 0.08, parkCentre + parkDepth * 0.18), timber);
  }

  const swingAt = new Vector3(parkX + 1.4, 0, parkCentre - parkDepth * 0.2);
  for (const side of [-1, 1] as const) {
    for (const lean of [-1, 1] as const) {
      const leg = CreateCylinder(`lane.swingLeg${side}${lean}`, { diameter: 0.09, height: 2.4, tessellation: 8 }, scene);
      leg.position.set(swingAt.x + lean * 0.55, 1.2, swingAt.z + side * 1.35);
      leg.rotation.z = -lean * 0.22;
      leg.material = metal;
      leg.isPickable = false;
      dressing.push(leg);
    }
  }
  box("swingBeam", { width: 0.09, height: 0.09, depth: 3, }, new Vector3(swingAt.x, 2.36, swingAt.z), metal);
  for (const offset of [-0.55, 0.55]) {
    for (const rope of [-0.16, 0.16]) {
      box(`swingRope${offset}${rope}`, { width: 0.03, height: 1.75, depth: 0.03 }, new Vector3(swingAt.x + rope, 1.45, swingAt.z + offset), metal);
    }
    box(`swingSeat${offset}`, { width: 0.42, height: 0.05, depth: 0.22 }, new Vector3(swingAt.x, 0.56, swingAt.z + offset), timber);
  }

  // The slide: a ladder, a platform and a chute.
  const slideAt = new Vector3(parkX - 1.2, 0, parkCentre - parkDepth * 0.3);
  box("slidePlatform", { width: 0.9, height: 0.1, depth: 0.9 }, new Vector3(slideAt.x, 1.3, slideAt.z), metal);
  for (const dx of [-0.38, 0.38]) {
    for (const dz of [-0.38, 0.38]) {
      box(`slideLeg${dx}${dz}`, { width: 0.07, height: 1.3, depth: 0.07 }, new Vector3(slideAt.x + dx, 0.65, slideAt.z + dz), metal);
    }
  }
  const chute = box("slideChute", { width: 2, height: 0.08, depth: 0.6 }, new Vector3(slideAt.x + 1.1, 0.78, slideAt.z), metal);
  chute.rotation.z = 0.5;
  for (let i = 0; i < 4; i += 1) {
    box(`slideRung${i}`, { width: 0.5, height: 0.05, depth: 0.05 }, new Vector3(slideAt.x - 0.5, 0.3 + i * 0.32, slideAt.z), metal);
  }

  // A tap on a post, which every one of these parks has, and a bench.
  box("tapPost", { width: 0.22, height: 0.9, depth: 0.22 }, new Vector3(parkX + 2.1, 0.45, parkCentre + parkDepth * 0.3), concrete, true);
  box("tapBasin", { width: 0.5, height: 0.14, depth: 0.5 }, new Vector3(parkX + 2.1, 0.95, parkCentre + parkDepth * 0.3), concrete);
  const spout = pipe(
    scene,
    "lane.tapSpout",
    [
      new Vector3(parkX + 2.1, 1.02, parkCentre + parkDepth * 0.3),
      new Vector3(parkX + 2.1, 1.32, parkCentre + parkDepth * 0.3),
      new Vector3(parkX + 1.95, 1.32, parkCentre + parkDepth * 0.3),
    ],
    0.035,
    6,
  );
  spout.material = metal;
  spout.isPickable = false;
  dressing.push(spout);
  spawnProp("bench_01", new Vector3(parkX + 2.2, 0, parkCentre - parkDepth * 0.05), Math.PI / 2);
  spawnProp("trash_bin_01", new Vector3(parkX + 2.3, 0, parkCentre + parkDepth * 0.12));

  /** A tree: a tapered trunk, a couple of limbs, and three masses of leaf. */
  const tree = (at: Vector3, scale: number, name: string): void => {
    const trunk = revolve(
      scene,
      `lane.trunk.${name}`,
      [[0, 0], [0.17, 0.05], [0.13, 1.1], [0.1, 2], [0.07, 2.9], [0, 3.1]],
      8,
    );
    trunk.position.copyFrom(at);
    trunk.scaling.setAll(scale);
    trunk.material = materials.painted("treeBark", new Color3(0.2, 0.16, 0.13), 0.92);
    trunk.isPickable = false;
    dressing.push(trunk);
    for (let i = 0; i < 3; i += 1) {
      const leaf = CreateSphere(`lane.leaf.${name}.${i}`, { diameter: 2.1 + random() * 0.9, segments: 6 }, scene);
      leaf.position.set(
        at.x + (random() - 0.5) * 1.3,
        at.y + (2.5 + i * 0.55) * scale,
        at.z + (random() - 0.5) * 1.3,
      );
      leaf.scaling.set(scale, scale * 0.78, scale);
      leaf.material = materials.painted(`treeLeaf${i % 2}`, i % 2 ? new Color3(0.12, 0.24, 0.12) : new Color3(0.15, 0.29, 0.14), 0.95);
      leaf.isPickable = false;
      dressing.push(leaf);
    }
  };
  tree(new Vector3(parkX - 2.4, 0, parkCentre - parkDepth * 0.34), 1.15, "a");
  tree(new Vector3(parkX - 2.1, 0, parkCentre + parkDepth * 0.34), 0.95, "b");
  tree(new Vector3(parkX + 2.4, 0, parkCentre + parkDepth * 0.42), 0.85, "c");

  // The park's name board, on two legs by the entrance.
  const boardAt = new Vector3(parkX + parkWidth / 2 - 0.6, 1.15, parkCentre - parkDepth / 2 + 1.2);
  box("parkSignBoard", { width: 0.09, height: 0.5, depth: 1.5 }, boardAt, materials.sign("park.hasumi", ["羽澄第二公園"], NEON.ice, 1.5 / 0.5, "tenant"));
  for (const dz of [-0.55, 0.55]) {
    box(`parkSignLeg${dz}`, { width: 0.08, height: 1.2, depth: 0.08 }, new Vector3(boardAt.x, 0.6, boardAt.z + dz), metal);
  }

  // A vending machine at the lane end, because there is always one.
  spawnProp("vending_machine_01", new Vector3(spec.laneX + LANE_HALF - 0.75, 0, spec.parkFrom - 2.4), -Math.PI / 2);
  spawnProp("bicycle_01", new Vector3(spec.laneX - LANE_HALF + 0.6, 0, spec.from + 6), 0.2);
  spawnProp("bicycle_01", new Vector3(spec.laneX - LANE_HALF + 0.6, 0, spec.from + 6.7), -0.1);
  spawnProp("planter_01", new Vector3(spec.laneX - LANE_HALF + 0.5, 0, spec.parkFrom - 6));

  // ------------------------------------------------------------- assembly
  for (const mesh of [...collidable, ...dressing]) {
    if (mesh.material === concrete) boxUv(mesh, CONCRETE_TILE);
    mesh.receiveShadows = true;
  }
  const merged: Mesh[] = [];
  const fold = (group: Mesh[], name: string, collides: boolean): void => {
    if (group.length === 0) return;
    const mesh = Mesh.MergeMeshes(group, true, true, undefined, false, true);
    if (!mesh) return;
    mesh.name = `lane.${name}`;
    mesh.checkCollisions = collides;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    merged.push(mesh);
  };
  fold(collidable, "shell", true);
  fold(dressing, "dressing", false);

  const lamps: LampSite[] = [
    {
      position: new Vector3(spec.laneX + LANE_HALF - 0.5, 4.6, spec.from + 9),
      colour: new Color3(1, 0.92, 0.78),
      intensity: 13,
      range: 13,
    },
    {
      position: new Vector3(parkX + 1, 4.2, parkCentre),
      colour: new Color3(0.96, 0.95, 0.9),
      intensity: 15,
      range: 14,
    },
  ];
  // The lamps themselves, so the light has something to come from.
  for (const [i, lamp] of lamps.entries()) {
    const head = CreateBox(`lane.lampHead${i}`, { width: 0.44, height: 0.14, depth: 0.3 }, scene);
    head.position.copyFrom(lamp.position);
    head.material = materials.emissive("laneLamp", new Color3(1, 0.94, 0.82), 1.3);
    head.isPickable = false;
    head.freezeWorldMatrix();
    merged.push(head);
    const column = CreateCylinder(`lane.lampColumn${i}`, { diameter: 0.12, height: lamp.position.y, tessellation: 8 }, scene);
    column.position.set(lamp.position.x + 0.2, lamp.position.y / 2, lamp.position.z);
    column.material = metal;
    column.isPickable = false;
    column.freezeWorldMatrix();
    merged.push(column);
  }

  const minX = Math.min(spec.laneX - parkWidth, spec.laneX - LANE_HALF - 9);
  const maxX = spec.gateX;

  return {
    lamps,
    shell: merged.filter((mesh) => mesh.checkCollisions),
    contains(point: Vector3): boolean {
      return point.x > minX && point.x < maxX && point.z > spec.from - 1 && point.z < spec.to + 1;
    },
    dispose(): void {
      for (const mesh of merged) mesh.dispose();
    },
  };
}
