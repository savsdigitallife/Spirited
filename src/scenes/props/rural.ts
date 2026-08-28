/**
 * Rural prefabs: the valley's buildings, trees and roadside furniture.
 *
 * Same contract as the Tokyo set — a glTF path declared for each, a
 * primitive stand-in until the file exists, and real dimensions throughout.
 * The architecture is ordinary rural Japanese building: post-and-beam
 * timber, deep eaves, tiled hip roofs. Nothing here is drawn from anyone's
 * film; it is drawn from how the buildings are actually put together.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetDefinition } from "../../engine/AssetCatalog";
import type { SurfaceLibrary } from "../../world/ProceduralMaterials";


export interface RuralPalette {
  surfaces: SurfaceLibrary;
  /** Flat-colour helper shared with the rest of the region. */
  painted: (name: string, colour: Color3, roughness?: number, metallic?: number) => PBRMaterial;
  emissive: (name: string, colour: Color3, strength?: number) => PBRMaterial;
  /** Glazing, shared with the city so a pane behaves the same everywhere. */
  glass: () => PBRMaterial;
}

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
 * Two pitched slabs meeting at a ridge over a rectangular building.
 *
 * Built from the eaves inward rather than from the ridge outward: the eave
 * line is the one measurement that has to be right, because it is what sits
 * on the wall head and what the deep overhang is measured from. Get that
 * wrong and the roof floats above the building, which is exactly what the
 * first version of this did.
 *
 * @param wallTop  height of the wall head the eaves rest on
 * @param overhang how far the eaves project past the wall
 */
function hipRoof(
  scene: Scene,
  width: number,
  depth: number,
  wallTop: number,
  pitch: number,
  material: Mesh["material"],
  overhang = 0.9,
): Mesh[] {
  const run = depth / 2 + overhang;
  const slabDepth = run / Math.cos(pitch);
  const rise = run * Math.tan(pitch);
  const parts: Mesh[] = [];

  for (const side of [-1, 1] as const) {
    const slab = CreateBox(
      `roof.${side}`,
      { width: width + overhang * 2, height: 0.2, depth: slabDepth },
      scene,
    );
    slab.material = material;
    // Centre of the slab: halfway along the run, halfway up the rise.
    slab.position.set(0, wallTop + rise / 2, (side * run) / 2);
    // Positive rotation about X tips +z downward, which is the eave.
    slab.rotation.x = side * pitch;
    parts.push(slab);
  }

  const ridge = CreateBox(
    "roof.ridge",
    { width: width + overhang * 2 + 0.1, height: 0.22, depth: 0.42 },
    scene,
  );
  ridge.material = material;
  ridge.position.set(0, wallTop + rise + 0.06, 0);
  parts.push(ridge);
  return parts;
}

export function ruralPrefabs(palette: RuralPalette): AssetDefinition[] {
  const { surfaces, painted, emissive, glass } = palette;
  const timber = () => surfaces.get("timber", 3);
  // Rural walls are lime render over an earth core: warm, and a long way
  // from white. The library's plaster is a city colour and reads as a
  // billboard against a green hillside.
  const wall = () => painted("ruralWall", new Color3(0.52, 0.5, 0.45), 0.92);
  // Roof tiles are dark grey-blue, but not black — at a low sun the north
  // pitch has nothing but sky light on it and needs somewhere to go.
  const tile = () => painted("ruralTile", new Color3(0.17, 0.185, 0.21), 0.68, 0.15);
  const stone = () => surfaces.get("stone", 2.5);

  return [
    {
      id: "cedar_tree_01",
      category: "prop",
      collides: true,
      build: ({ scene }) => {
        const bark = painted("bark", new Color3(0.14, 0.1, 0.08), 0.95);
        const needle = painted("needle", new Color3(0.08, 0.15, 0.09), 0.94);
        const trunk = CreateCylinder(
          "trunk",
          { diameterTop: 0.22, diameterBottom: 0.55, height: 11, tessellation: 7 },
          scene,
        );
        trunk.position.y = 5.5;
        trunk.material = bark;
        const parts: Mesh[] = [trunk];
        // Three stacked skirts: a cedar's silhouette is stepped, not conical.
        const tiers: [number, number, number][] = [
          [3.2, 4.6, 3.4],
          [4.8, 3.4, 2.6],
          [7.4, 2.2, 2.2],
        ];
        for (const [y, diameter, height] of tiers) {
          const tier = CreateCylinder(
            `tier${y}`,
            { diameterTop: 0.15, diameterBottom: diameter, height, tessellation: 8 },
            scene,
          );
          tier.position.y = y + height / 2;
          tier.material = needle;
          parts.push(tier);
        }
        return parts;
      },
    },
    {
      id: "broadleaf_tree_01",
      category: "prop",
      collides: true,
      build: ({ scene }) => {
        const bark = painted("barkPale", new Color3(0.2, 0.16, 0.13), 0.92);
        const leaf = painted("leafSummer", new Color3(0.15, 0.26, 0.11), 0.93);
        const trunk = CreateCylinder(
          "trunk",
          { diameterTop: 0.3, diameterBottom: 0.5, height: 4.4, tessellation: 7 },
          scene,
        );
        trunk.position.y = 2.2;
        trunk.material = bark;
        const parts: Mesh[] = [trunk];
        const crowns: [number, number, number, number][] = [
          [0, 4.9, 0, 4.4],
          [-1.3, 4.2, 0.7, 3.2],
          [1.2, 4.4, -0.6, 3],
        ];
        for (const [x, y, z, d] of crowns) {
          const crown = CreateSphere(`crown${x}${z}`, { diameter: d, segments: 8 }, scene);
          crown.position.set(x, y, z);
          crown.scaling.y = 0.82;
          crown.material = leaf;
          parts.push(crown);
        }
        return parts;
      },
    },
    {
      id: "farmhouse_01",
      category: "building",
      collides: true,
      build: ({ scene }) => {
        const w = 9.5;
        const d = 7;
        const h = 2.9;
        const parts: Mesh[] = [];
        // Raised timber floor on stone footings — the whole building sits
        // clear of the ground, which is most of why it reads as this and not
        // as a cottage.
        parts.push(box(scene, "plinth", { width: w + 0.4, height: 0.5, depth: d + 0.4 }, new Vector3(0, 0.25, 0), stone()));
        parts.push(box(scene, "floor", { width: w, height: 0.22, depth: d }, new Vector3(0, 0.6, 0), timber()));
        // The back wall, built around two window openings rather than as one
        // slab with panes buried inside it. Aluminium sashes: paper screens
        // face the veranda, and the sides of a house like this were glazed
        // decades ago. They are what catches the sun coming over the ridge.
        const sashLow = 1.35;
        const sashHigh = 2.55;
        for (const [centre, width] of [[-3.975, 1.55], [0, 3.2], [3.975, 1.55]] as const) {
          parts.push(box(scene, `backPier${centre}`, { width, height: h, depth: 0.24 }, new Vector3(centre, 0.6 + h / 2, d / 2), wall()));
        }
        const sash = painted("sash", new Color3(0.72, 0.73, 0.74), 0.35, 0.6);
        for (const centre of [-2.4, 2.4]) {
          parts.push(box(scene, `backSill${centre}`, { width: 1.6, height: sashLow - 0.6, depth: 0.24 }, new Vector3(centre, (0.6 + sashLow) / 2, d / 2), wall()));
          parts.push(box(scene, `backHead${centre}`, { width: 1.6, height: 0.6 + h - sashHigh, depth: 0.24 }, new Vector3(centre, (sashHigh + 0.6 + h) / 2, d / 2), wall()));
          parts.push(box(scene, `pane${centre}`, { width: 1.52, height: sashHigh - sashLow, depth: 0.05 }, new Vector3(centre, (sashLow + sashHigh) / 2, d / 2), glass()));
          parts.push(box(scene, `sashHead${centre}`, { width: 1.66, height: 0.09, depth: 0.14 }, new Vector3(centre, sashHigh + 0.045, d / 2), sash));
          parts.push(box(scene, `sashSill${centre}`, { width: 1.74, height: 0.11, depth: 0.3 }, new Vector3(centre, sashLow - 0.055, d / 2 + 0.03), sash));
          parts.push(box(scene, `sashJamb${centre}`, { width: 0.08, height: sashHigh - sashLow, depth: 0.12 }, new Vector3(centre, (sashLow + sashHigh) / 2, d / 2), sash));
        }
        parts.push(box(scene, "left", { width: 0.24, height: h, depth: d }, new Vector3(-w / 2, 0.6 + h / 2, 0), wall()));
        parts.push(box(scene, "right", { width: 0.24, height: h, depth: d }, new Vector3(w / 2, 0.6 + h / 2, 0), wall()));
        // Front: sliding screens between posts, so the face is mostly opening.
        for (const x of [-3.6, -1.2, 1.2, 3.6]) {
          parts.push(box(scene, `post${x}`, { width: 0.16, height: h, depth: 0.16 }, new Vector3(x, 0.6 + h / 2, -d / 2), timber()));
        }
        const screen = painted("screen", new Color3(0.78, 0.74, 0.63), 0.88);
        for (const x of [-2.4, 0, 2.4]) {
          parts.push(box(scene, `screen${x}`, { width: 2.2, height: h - 0.5, depth: 0.06 }, new Vector3(x, 0.6 + (h - 0.5) / 2, -d / 2), screen));
        }
        // Veranda running the width of the front.
        parts.push(box(scene, "veranda", { width: w, height: 0.16, depth: 1.5 }, new Vector3(0, 0.62, -d / 2 - 0.75), timber()));
        for (const x of [-4, 0, 4]) {
          parts.push(box(scene, `eavePost${x}`, { width: 0.13, height: h, depth: 0.13 }, new Vector3(x, 0.6 + h / 2, -d / 2 - 1.4), timber()));
        }
        parts.push(...hipRoof(scene, w, d + 1.5, 0.6 + h, 0.38, tile(), 1.1));
        return parts;
      },
    },
    {
      id: "barn_01",
      category: "building",
      collides: true,
      build: ({ scene }) => {
        const w = 7;
        const d = 5.4;
        const h = 3.4;
        const board = painted("board", new Color3(0.19, 0.14, 0.1), 0.94);
        const parts: Mesh[] = [
          box(scene, "back", { width: w, height: h, depth: 0.2 }, new Vector3(0, h / 2, d / 2), board),
          box(scene, "left", { width: 0.2, height: h, depth: d }, new Vector3(-w / 2, h / 2, 0), board),
          box(scene, "right", { width: 0.2, height: h, depth: d }, new Vector3(w / 2, h / 2, 0), board),
          box(scene, "frontL", { width: 2.1, height: h, depth: 0.2 }, new Vector3(-2.45, h / 2, -d / 2), board),
          box(scene, "frontR", { width: 2.1, height: h, depth: 0.2 }, new Vector3(2.45, h / 2, -d / 2), board),
          box(scene, "lintel", { width: w, height: 0.6, depth: 0.2 }, new Vector3(0, h - 0.3, -d / 2), board),
        ];
        parts.push(...hipRoof(scene, w, d, h, 0.34, tile(), 0.7));
        return parts;
      },
    },
    {
      id: "shed_01",
      category: "building",
      collides: true,
      build: ({ scene }) => {
        const board = painted("shedBoard", new Color3(0.24, 0.19, 0.14), 0.95);
        const roof = painted("shedRoof", new Color3(0.24, 0.22, 0.2), 0.7, 0.5);
        const parts: Mesh[] = [
          box(scene, "body", { width: 3, height: 2.3, depth: 2.4 }, new Vector3(0, 1.15, 0), board),
        ];
        const lid = box(scene, "roof", { width: 3.5, height: 0.12, depth: 3 }, new Vector3(0, 2.42, 0), roof);
        lid.rotation.x = 0.16;
        parts.push(lid);
        return parts;
      },
    },
    {
      id: "torii_gate_01",
      category: "prop",
      collides: true,
      build: ({ scene }) => {
        const painted7 = painted("toriiWood", new Color3(0.32, 0.13, 0.11), 0.82);
        const parts: Mesh[] = [];
        for (const x of [-1.7, 1.7]) {
          const post = CreateCylinder(
            `post${x}`,
            { diameterTop: 0.26, diameterBottom: 0.32, height: 4.2, tessellation: 10 },
            scene,
          );
          post.position.set(x, 2.1, 0);
          post.material = painted7;
          parts.push(post);
        }
        const lintel = box(scene, "lintel", { width: 4.9, height: 0.3, depth: 0.42 }, new Vector3(0, 4.2, 0), painted7);
        const tie = box(scene, "tie", { width: 4.1, height: 0.2, depth: 0.28 }, new Vector3(0, 3.55, 0), painted7);
        const cap = box(scene, "cap", { width: 5.4, height: 0.16, depth: 0.5 }, new Vector3(0, 4.42, 0), painted7);
        parts.push(lintel, tie, cap);
        return parts;
      },
    },
    {
      id: "shrine_01",
      category: "building",
      collides: true,
      build: ({ scene }) => {
        const wood = painted("shrineWood", new Color3(0.26, 0.18, 0.12), 0.86);
        const parts: Mesh[] = [
          box(scene, "plinth", { width: 3.4, height: 0.7, depth: 3 }, new Vector3(0, 0.35, 0), stone()),
          box(scene, "body", { width: 2.4, height: 2, depth: 2.1 }, new Vector3(0, 1.7, 0), wood),
          box(scene, "doors", { width: 1.2, height: 1.5, depth: 0.08 }, new Vector3(0, 1.55, -1.06), painted("shrineDoor", new Color3(0.14, 0.11, 0.09), 0.7)),
        ];
        parts.push(...hipRoof(scene, 2.4, 2.1, 2.7, 0.46, tile(), 0.85));
        return parts;
      },
    },
    {
      id: "stone_lantern_01",
      category: "prop",
      collides: true,
      build: ({ scene }) => {
        const parts: Mesh[] = [
          box(scene, "base", { width: 0.7, height: 0.3, depth: 0.7 }, new Vector3(0, 0.15, 0), stone()),
        ];
        const shaft = CreateCylinder("shaft", { diameter: 0.26, height: 0.9, tessellation: 8 }, scene);
        shaft.position.y = 0.75;
        shaft.material = stone();
        parts.push(shaft);
        parts.push(box(scene, "house", { width: 0.56, height: 0.44, depth: 0.56 }, new Vector3(0, 1.42, 0), stone()));
        parts.push(box(scene, "flame", { width: 0.3, height: 0.26, depth: 0.3 }, new Vector3(0, 1.42, 0), emissive("lanternFlame", new Color3(1, 0.72, 0.36), 1.2)));
        const cap = box(scene, "cap", { width: 0.78, height: 0.16, depth: 0.78 }, new Vector3(0, 1.72, 0), stone());
        parts.push(cap);
        return parts;
      },
    },
    {
      id: "rural_pole_01",
      category: "prop",
      collides: true,
      build: ({ scene }) => {
        const wood = painted("poleWood", new Color3(0.23, 0.18, 0.14), 0.94);
        const pole = CreateCylinder(
          "pole",
          { diameterTop: 0.16, diameterBottom: 0.24, height: 8, tessellation: 7 },
          scene,
        );
        pole.position.y = 4;
        pole.material = wood;
        const arm = box(scene, "arm", { width: 1.5, height: 0.08, depth: 0.08 }, new Vector3(0, 7.2, 0), wood);
        return [pole, arm];
      },
    },
    {
      id: "fence_run_01",
      category: "prop",
      cullAt: 90,
      collides: false,
      build: ({ scene }) => {
        const wood = painted("fenceWood", new Color3(0.25, 0.2, 0.15), 0.95);
        const parts: Mesh[] = [];
        for (const z of [-1.5, 1.5]) {
          parts.push(box(scene, `post${z}`, { width: 0.11, height: 1.15, depth: 0.11 }, new Vector3(0, 0.57, z), wood));
        }
        for (const y of [0.55, 0.95]) {
          parts.push(box(scene, `rail${y}`, { width: 0.07, height: 0.07, depth: 3 }, new Vector3(0, y, 0), wood));
        }
        return parts;
      },
    },
    {
      id: "boulder_01",
      category: "prop",
      cullAt: 110,
      collides: true,
      build: ({ scene }) => {
        const rock = CreateSphere("rock", { diameter: 1, segments: 6 }, scene);
        rock.material = stone();
        rock.position.y = 0.3;
        rock.scaling.set(1, 0.65, 0.85);
        return [rock];
      },
    },
    {
      id: "signpost_01",
      category: "prop",
      collides: true,
      build: ({ scene }) => {
        const wood = painted("signWood", new Color3(0.28, 0.22, 0.16), 0.9);
        const post = box(scene, "post", { width: 0.12, height: 1.9, depth: 0.12 }, new Vector3(0, 0.95, 0), wood);
        const plate = box(scene, "plate", { width: 0.9, height: 0.24, depth: 0.05 }, new Vector3(0.3, 1.72, 0), painted("signFace", new Color3(0.74, 0.71, 0.62), 0.85));
        return [post, plate];
      },
    },
    {
      id: "rice_row_01",
      category: "prop",
      cullAt: 90,
      collides: false,
      castsShadow: false,
      build: ({ scene }) => {
        const blade = painted("riceBlade", new Color3(0.29, 0.4, 0.14), 0.95);
        const parts: Mesh[] = [];
        // A row of tufts rather than individual plants: at the density a
        // paddy needs, one row instanced fifty times is the affordable unit.
        for (let i = 0; i < 6; i += 1) {
          const tuft = CreateBox(`tuft${i}`, { width: 0.24, height: 0.5, depth: 0.24 }, scene);
          tuft.position.set(0, 0.25, -1.5 + i * 0.6);
          tuft.material = blade;
          parts.push(tuft);
        }
        return parts;
      },
    },
  ];
}
