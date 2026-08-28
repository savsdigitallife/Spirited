/**
 * What you see through the window.
 *
 * A shallow room behind each shopfront: floor, back wall, a lit ceiling, the
 * fittings that trade uses, and one or two people in it. It is not enterable
 * and it is not meant to be — it is the difference between a street of
 * businesses and a street of pictures of businesses, and it costs a few
 * merged meshes each.
 *
 * The rule is that the fittings have to say what the trade is without a sign:
 * a counter with stools along it is a ramen shop, a wall of cold cabinets is
 * a convenience store, low tables and a bottle shelf are an izakaya. If you
 * can tell with the sign covered, the interior is doing its job.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import type { CityMaterials } from "./CityMaterials";
import type { BusinessKind } from "./Facades";
import { makeRandom } from "./Noise";

export interface InteriorBay {
  /** Centre of the bay, on the floor. */
  centre: Vector3;
  /** Across the frontage. */
  width: number;
  /** Back from the glass. */
  depth: number;
  height: number;
  /** Which way the frontage faces: -1 toward -x, +1 toward +x. */
  out: number;
}

const OCCUPANT_COLOURS = [
  new Color3(0.14, 0.15, 0.19),
  new Color3(0.26, 0.19, 0.15),
  new Color3(0.1, 0.17, 0.2),
  new Color3(0.3, 0.28, 0.26),
];

export class ShopInteriors {
  private readonly built: Mesh[] = [];
  private readonly cache = new Map<string, Material>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: CityMaterials,
  ) {}

  /**
   * A surface inside a lit room.
   *
   * Carries its own emissive term rather than relying on scene lights. Every
   * light in the street is outside; a room behind glass gets none of them and
   * renders as a black box, which is worse than having no interior at all.
   * Baking the room's own light into its materials costs nothing per frame
   * and is what a shipped game would do here anyway.
   */
  private colour(name: string, c: Color3, roughness = 0.8, metallic = 0): Material {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const material = new PBRMaterial(`int.${name}`, this.scene);
    material.albedoColor = c;
    material.roughness = roughness;
    material.metallic = metallic;
    // Close to full albedo: the room is lit, and the only light it has is
    // the one baked here. At 0.55 the fittings were technically visible and
    // practically black behind glass.
    material.emissiveColor = c.scale(1.05);
    material.emissiveIntensity = 1;
    this.cache.set(name, material);
    return material;
  }

  private glow(name: string, c: Color3, strength: number): Material {
    return this.materials.emissive(`int.${name}`, c, strength);
  }

  /** Builds one bay and returns the meshes, already merged. */
  add(business: BusinessKind, bay: InteriorBay, seed: number): Mesh[] {
    const parts: Mesh[] = [];
    const random = makeRandom(seed);
    const put = (
      name: string,
      size: { width: number; height: number; depth: number },
      at: Vector3,
      material: Material,
      rotationY = 0,
    ): Mesh => {
      const mesh = CreateBox(`interior.${name}`, size, this.scene);
      mesh.position.copyFrom(at);
      mesh.rotation.y = rotationY;
      mesh.material = material;
      parts.push(mesh);
      return mesh;
    };

    const { centre, width, depth, height, out } = bay;
    // `inward` is deeper into the shop; `across` runs along the frontage.
    const inward = -out;
    const backX = centre.x + inward * depth;

    put("floor", { width: depth, height: 0.06, depth: width }, new Vector3(centre.x + inward * depth * 0.5, 0.03, centre.z), this.colour("floor", new Color3(0.16, 0.15, 0.14), 0.6));
    put("back", { width: 0.12, height, depth: width }, new Vector3(backX, height / 2, centre.z), this.colour("wall", new Color3(0.3, 0.28, 0.25), 0.85));
    for (const sign of [-1, 1] as const) {
      put(`side${sign}`, { width: depth, height, depth: 0.1 }, new Vector3(centre.x + inward * depth * 0.5, height / 2, centre.z + sign * width * 0.5), this.colour("wall", new Color3(0.3, 0.28, 0.25), 0.85));
    }

    // Ceiling light. Warm for food, cold for retail — the single strongest
    // cue about what kind of place it is, before any of the fittings.
    const warm = business === "konbini" || business === "laundry" ? new Color3(0.88, 0.94, 1) : new Color3(1, 0.79, 0.52);
    put("ceilingLight", { width: depth * 0.8, height: 0.06, depth: width * 0.7 }, new Vector3(centre.x + inward * depth * 0.5, height - 0.12, centre.z), this.glow(business === "konbini" ? "coolTube" : "warmTube", warm, business === "konbini" ? 1.6 : 1.15));

    const occupant = (x: number, z: number, seated: boolean, facing: number): void => {
      const tone = OCCUPANT_COLOURS[Math.floor(random() * OCCUPANT_COLOURS.length)] ?? OCCUPANT_COLOURS[0]!;
      const bodyHeight = seated ? 0.62 : 0.9;
      const y = seated ? 0.72 : 0.98;
      const body = CreateCapsule(`interior.person`, { radius: 0.17, height: bodyHeight, tessellation: 8 }, this.scene);
      body.position.set(x, y, z);
      body.rotation.y = facing;
      body.material = this.colour(`coat${tone.r.toFixed(2)}`, tone, 0.88);
      parts.push(body);
      const head = CreateSphere(`interior.head`, { diameter: 0.2, segments: 8 }, this.scene);
      head.position.set(x, y + bodyHeight * 0.5 + 0.14, z);
      head.material = this.colour("skin", new Color3(0.66, 0.53, 0.45), 0.65);
      parts.push(head);
    };

    switch (business) {
      case "ramen": {
        // A counter across the room with stools facing it, and a kitchen
        // strip behind, which is the whole plan of a ramen shop.
        const counterX = centre.x + inward * depth * 0.5;
        put("counter", { width: 0.75, height: 0.06, depth: width - 0.5 }, new Vector3(counterX, 1.02, centre.z), this.colour("counterTop", new Color3(0.34, 0.22, 0.13), 0.4));
        put("counterFront", { width: 0.1, height: 1, depth: width - 0.5 }, new Vector3(counterX - inward * 0.35, 0.5, centre.z), this.colour("counterSide", new Color3(0.22, 0.15, 0.1), 0.75));
        put("kitchen", { width: 0.6, height: 0.9, depth: width - 0.4 }, new Vector3(backX - inward * 0.45, 0.45, centre.z), this.colour("steel", new Color3(0.5, 0.51, 0.53), 0.35, 0.8));
        put("hood", { width: 0.7, height: 0.4, depth: width - 0.4 }, new Vector3(backX - inward * 0.45, height - 0.55, centre.z), this.colour("steel", new Color3(0.5, 0.51, 0.53), 0.35, 0.8));
        for (let i = 0; i < 3; i += 1) {
          const pot = CreateCylinder(`interior.pot${i}`, { diameter: 0.34, height: 0.3, tessellation: 10 }, this.scene);
          pot.position.set(backX - inward * 0.45, 1.05, centre.z - 0.8 + i * 0.8);
          pot.material = this.colour("steel", new Color3(0.5, 0.51, 0.53), 0.35, 0.8);
          parts.push(pot);
        }
        const stools = Math.max(3, Math.round((width - 0.8) / 0.62));
        for (let i = 0; i < stools; i += 1) {
          const z = centre.z - (width - 1.1) / 2 + (i / Math.max(1, stools - 1)) * (width - 1.1);
          const stool = CreateCylinder(`interior.stool${i}`, { diameter: 0.32, height: 0.06, tessellation: 10 }, this.scene);
          stool.position.set(counterX - inward * 0.85, 0.66, z);
          stool.material = this.colour("stool", new Color3(0.4, 0.12, 0.1), 0.7);
          parts.push(stool);
          put(`stoolLeg${i}`, { width: 0.07, height: 0.63, depth: 0.07 }, new Vector3(counterX - inward * 0.85, 0.32, z), this.colour("steel", new Color3(0.5, 0.51, 0.53), 0.35, 0.8));
          if (random() < 0.55) {
            occupant(counterX - inward * 0.85, z, true, out > 0 ? -Math.PI / 2 : Math.PI / 2);
            // A bowl in front of whoever is sitting there.
            const bowl = CreateCylinder(`interior.bowl${i}`, { diameter: 0.24, height: 0.11, tessellation: 10 }, this.scene);
            bowl.position.set(counterX, 1.1, z);
            bowl.material = this.colour("bowl", new Color3(0.82, 0.8, 0.74), 0.4);
            parts.push(bowl);
          }
        }
        // The cook, behind the counter.
        occupant(counterX + inward * 0.5, centre.z + (random() - 0.5) * width * 0.4, false, out > 0 ? Math.PI / 2 : -Math.PI / 2);
        // Menu strips on the back wall.
        for (let i = 0; i < 6; i += 1) {
          put(`menuStrip${i}`, { width: 0.04, height: 0.5, depth: 0.14 }, new Vector3(backX - inward * 0.1, height - 0.75, centre.z - width * 0.35 + i * (width * 0.7) / 5), this.glow("menuStrip", new Color3(1, 0.93, 0.7), 0.8));
        }
        break;
      }

      case "konbini": {
        // Cold cabinets across the back, gondola shelving in front, a till by
        // the door and a cash machine in the corner.
        put("fridgeWall", { width: 0.5, height: 2.1, depth: width - 0.4 }, new Vector3(backX - inward * 0.35, 1.05, centre.z), this.colour("fridgeFrame", new Color3(0.22, 0.23, 0.25), 0.5, 0.5));
        put("fridgeGlow", { width: 0.06, height: 1.75, depth: width - 0.7 }, new Vector3(backX - inward * 0.62, 1.05, centre.z), this.glow("fridge", new Color3(0.78, 0.92, 1), 1.5));
        for (let i = 0; i < 3; i += 1) {
          const x = centre.x + inward * (depth * 0.3 + i * 0.5);
          put(`gondola${i}`, { width: 0.42, height: 1.35, depth: width - 1.2 }, new Vector3(x, 0.68, centre.z), this.colour("shelfUnit", new Color3(0.55, 0.55, 0.53), 0.7));
          for (let shelf = 0; shelf < 3; shelf += 1) {
            put(`stock${i}.${shelf}`, { width: 0.36, height: 0.22, depth: width - 1.4 }, new Vector3(x, 0.42 + shelf * 0.42, centre.z), this.colour(`stock${shelf}`, new Color3(0.6 - shelf * 0.14, 0.4 + shelf * 0.12, 0.28 + shelf * 0.2), 0.8));
          }
        }
        put("till", { width: 0.55, height: 0.95, depth: 1.5 }, new Vector3(centre.x + inward * 0.6, 0.48, centre.z + width * 0.32), this.colour("tillUnit", new Color3(0.6, 0.6, 0.58), 0.6));
        put("tillTop", { width: 0.6, height: 0.06, depth: 1.55 }, new Vector3(centre.x + inward * 0.6, 0.98, centre.z + width * 0.32), this.colour("counterTop", new Color3(0.34, 0.22, 0.13), 0.4));
        put("atm", { width: 0.42, height: 1.6, depth: 0.7 }, new Vector3(backX - inward * 0.4, 0.8, centre.z - width * 0.36), this.colour("atm", new Color3(0.16, 0.18, 0.22), 0.5, 0.4));
        put("atmScreen", { width: 0.05, height: 0.34, depth: 0.42 }, new Vector3(backX - inward * 0.64, 1.24, centre.z - width * 0.36), this.glow("atmScreen", new Color3(0.5, 0.8, 1), 1.2));
        occupant(centre.x + inward * 0.95, centre.z + width * 0.32, false, out > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (random() < 0.8) occupant(centre.x + inward * (depth * 0.55), centre.z - width * 0.2, false, random() * Math.PI * 2);
        break;
      }

      case "cafe": {
        put("bar", { width: 0.6, height: 1.05, depth: width * 0.5 }, new Vector3(backX - inward * 0.4, 0.52, centre.z - width * 0.2), this.colour("barWood", new Color3(0.28, 0.18, 0.12), 0.55));
        put("barTop", { width: 0.68, height: 0.06, depth: width * 0.52 }, new Vector3(backX - inward * 0.4, 1.06, centre.z - width * 0.2), this.colour("counterTop", new Color3(0.34, 0.22, 0.13), 0.4));
        put("displayCase", { width: 0.5, height: 0.5, depth: width * 0.28 }, new Vector3(backX - inward * 0.4, 1.32, centre.z + width * 0.18), this.glow("caseGlow", new Color3(1, 0.86, 0.6), 0.9));
        put("bottleShelf", { width: 0.22, height: 0.75, depth: width * 0.5 }, new Vector3(backX - inward * 0.06, height - 0.9, centre.z - width * 0.2), this.colour("shelfWood", new Color3(0.24, 0.16, 0.11), 0.7));
        for (let i = 0; i < 2; i += 1) {
          const z = centre.z - width * 0.22 + i * width * 0.42;
          const table = CreateCylinder(`interior.table${i}`, { diameter: 0.62, height: 0.06, tessellation: 12 }, this.scene);
          table.position.set(centre.x + inward * (depth * 0.35), 0.73, z);
          table.material = this.colour("tableTop", new Color3(0.3, 0.2, 0.14), 0.5);
          parts.push(table);
          put(`tableLeg${i}`, { width: 0.08, height: 0.7, depth: 0.08 }, new Vector3(centre.x + inward * (depth * 0.35), 0.35, z), this.colour("steel", new Color3(0.5, 0.51, 0.53), 0.35, 0.8));
          for (const side of [-1, 1] as const) {
            put(`chair${i}${side}`, { width: 0.36, height: 0.05, depth: 0.36 }, new Vector3(centre.x + inward * (depth * 0.35) + side * 0.5, 0.45, z), this.colour("chair", new Color3(0.22, 0.15, 0.11), 0.7));
            if (random() < 0.5) occupant(centre.x + inward * (depth * 0.35) + side * 0.5, z, true, side > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
        }
        occupant(backX - inward * 0.75, centre.z - width * 0.2, false, out > 0 ? Math.PI / 2 : -Math.PI / 2);
        break;
      }

      case "izakaya": {
        put("bottleShelf", { width: 0.28, height: 1.5, depth: width - 0.6 }, new Vector3(backX - inward * 0.15, height - 1.2, centre.z), this.colour("shelfWood", new Color3(0.2, 0.13, 0.09), 0.7));
        for (let i = 0; i < 10; i += 1) {
          const bottle = CreateCylinder(`interior.bottle${i}`, { diameter: 0.09, height: 0.3, tessellation: 8 }, this.scene);
          bottle.position.set(backX - inward * 0.32, height - 0.85, centre.z - width * 0.4 + (i / 9) * width * 0.8);
          bottle.material = this.colour(i % 2 ? "bottleGreen" : "bottleAmber", i % 2 ? new Color3(0.1, 0.25, 0.14) : new Color3(0.42, 0.26, 0.08), 0.3);
          parts.push(bottle);
        }
        for (let i = 0; i < 2; i += 1) {
          const z = centre.z - width * 0.24 + i * width * 0.46;
          put(`lowTable${i}`, { width: 0.8, height: 0.06, depth: 0.75 }, new Vector3(centre.x + inward * (depth * 0.4), 0.62, z), this.colour("tableTop", new Color3(0.3, 0.2, 0.14), 0.5));
          if (random() < 0.75) occupant(centre.x + inward * (depth * 0.4) - 0.55, z, true, out > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
        break;
      }

      case "laundry": {
        for (let i = 0; i < 5; i += 1) {
          const z = centre.z - width * 0.38 + (i / 4) * width * 0.76;
          put(`machine${i}`, { width: 0.62, height: 0.95, depth: 0.62 }, new Vector3(backX - inward * 0.4, 0.48, z), this.colour("machine", new Color3(0.72, 0.72, 0.7), 0.55, 0.3));
          const door = CreateCylinder(`interior.drum${i}`, { diameter: 0.34, height: 0.06, tessellation: 12 }, this.scene);
          door.rotation.z = Math.PI / 2;
          door.position.set(backX - inward * 0.72, 0.58, z);
          door.material = this.colour("drum", new Color3(0.2, 0.22, 0.24), 0.3, 0.6);
          parts.push(door);
        }
        put("bench", { width: 0.4, height: 0.06, depth: width * 0.6 }, new Vector3(centre.x + inward * 0.7, 0.45, centre.z), this.colour("chair", new Color3(0.22, 0.15, 0.11), 0.7));
        if (random() < 0.6) occupant(centre.x + inward * 0.7, centre.z + width * 0.15, true, out > 0 ? Math.PI / 2 : -Math.PI / 2);
        break;
      }

      default: {
        // Bookshop, salon, lobby and anything else: shelving and a person.
        for (let i = 0; i < 3; i += 1) {
          put(`shelf${i}`, { width: 0.34, height: 1.9, depth: width - 0.8 }, new Vector3(centre.x + inward * (depth * 0.35 + i * 0.55), 0.95, centre.z), this.colour("shelfWood", new Color3(0.26, 0.19, 0.13), 0.75));
        }
        occupant(centre.x + inward * depth * 0.6, centre.z + (random() - 0.5) * width * 0.5, false, random() * Math.PI * 2);
        break;
      }
    }

    for (const mesh of parts) {
      mesh.isPickable = false;
      mesh.receiveShadows = false;
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    const result = merged ? [merged] : parts;
    for (const mesh of result) {
      mesh.name = `interior.${business}.${Math.round(centre.z)}`;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      this.built.push(mesh);
    }
    return result;
  }

  get meshes(): readonly Mesh[] {
    return this.built;
  }

  dispose(): void {
    for (const mesh of this.built) mesh.dispose();
    this.built.length = 0;
    this.cache.clear();
  }
}
