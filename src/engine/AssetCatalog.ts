/**
 * The asset catalog.
 *
 * Everything placeable in the world is addressed by an id — `aiko`,
 * `vending_machine_01`, `ramen_shop_01` — never by a file path. Each id
 * declares where its model would live and how to generate a stand-in until
 * that model exists. Dropping a `.glb` into `public/assets/` at the declared
 * path is all it takes for the game to start using it; nothing that places
 * assets changes.
 *
 * On load the catalog reports, once and loudly, exactly which ids are running
 * on generated geometry. That list is the art backlog, and it is derived from
 * the game rather than maintained by hand.
 *
 * ## Where the assets come from
 *
 * This project generates its own. The environment can reach exactly one
 * external host, and the CC0 packs available through it are stylised
 * low-poly city-builder and fantasy-character sets whose art direction is
 * nothing like a believable Tokyo street — dropping them in would look worse
 * than what we generate, not better. So the fallbacks below are not
 * placeholders in the usual sense: they are the shipping geometry until
 * commissioned art replaces them, and they are built with real modelling
 * operations (see `world/Shapes.ts`) rather than out of primitives.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetLoader } from "./AssetLoader";
import { events } from "../core/Events";

/** Where models live under the asset root, by category. */
export type AssetCategory = "prop" | "vehicle" | "building" | "character" | "interior";

export interface AssetBuildContext {
  scene: Scene;
}

export interface AssetDefinition {
  /** Stable id used everywhere in gameplay and content. */
  id: string;
  category: AssetCategory;
  /**
   * Generated stand-in, used until a model exists at the declared path.
   * Every mesh returned must be a direct child of nothing.
   */
  build: (context: AssetBuildContext) => Mesh[];
  /** Whether placed copies collide with the player. */
  collides?: boolean;
  castsShadow?: boolean;
  /**
   * Distance in metres past which placed copies stop being drawn. Street
   * clutter is invisible detail at forty metres and costs the same as detail
   * you can see.
   */
  cullAt?: number;
}

export interface SpawnOptions {
  position: Vector3;
  rotationY?: number;
  scale?: number | Vector3;
  name?: string;
  collides?: boolean;
}

export interface AssetStatus {
  id: string;
  category: AssetCategory;
  /** "model" once real art is in place; "generated" until then. */
  source: "model" | "generated";
  path: string;
}

interface Prepared {
  definition: AssetDefinition;
  templates: Mesh[];
  source: "model" | "generated";
}

/** Path a category's models are looked for under. */
const CATEGORY_DIR: Record<AssetCategory, string> = {
  prop: "props/",
  vehicle: "vehicles/",
  building: "buildings/",
  character: "characters/",
  interior: "interiors/",
};

export class AssetCatalog {
  private readonly definitions = new Map<string, AssetDefinition>();
  private readonly prepared = new Map<string, Prepared>();
  private readonly placed: AbstractMesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetLoader,
  ) {}

  define(definition: AssetDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  defineAll(definitions: readonly AssetDefinition[]): void {
    for (const definition of definitions) this.define(definition);
  }

  /** The path a given id's model is expected at. */
  pathFor(id: string): string {
    const definition = this.definitions.get(id);
    const category = definition?.category ?? "prop";
    return `${CATEGORY_DIR[category]}${id}.glb`;
  }

  /**
   * Resolves ids to templates: a loaded model where one exists, generated
   * geometry where one does not. Called once during region load, so nothing
   * is built or fetched during play.
   */
  async prepare(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (this.prepared.has(id)) continue;
      const definition = this.definitions.get(id);
      if (!definition) throw new Error(`[assets] "${id}" is not in the catalog`);

      let templates: Mesh[] = [];
      let source: Prepared["source"] = "generated";
      const path = this.pathFor(id);

      // Check before loading. A failed load leaves the scene permanently
      // "not ready", so an asset that is not there must never reach the
      // loader.
      if (await this.assets.exists(path)) {
        try {
          const container = await this.assets.container(this.scene, path);
          templates = container.meshes.filter((m): m is Mesh => "geometry" in m);
          if (templates.length > 0) source = "model";
        } catch (error) {
          console.warn(`[assets] "${id}" failed to load from ${path}; generating instead`, error);
        }
      }
      if (source === "generated") templates = definition.build({ scene: this.scene });

      for (const template of templates) {
        template.name = `asset.${id}.${template.name || "part"}`;
        template.isPickable = false;
        template.setEnabled(false);
      }
      this.prepared.set(id, { definition, templates, source });
    }
  }

  /** The templates behind an id, for registering shadow casters once. */
  templates(id: string): readonly Mesh[] {
    return this.prepared.get(id)?.templates ?? [];
  }

  spawn(id: string, options: SpawnOptions): TransformNode {
    const prepared = this.prepared.get(id);
    if (!prepared) throw new Error(`[assets] "${id}" was never prepared`);

    const root = new TransformNode(options.name ?? `${id}.${this.placed.length}`, this.scene);
    root.position.copyFrom(options.position);
    root.rotation.y = options.rotationY ?? 0;
    if (typeof options.scale === "number") root.scaling.setAll(options.scale);
    else if (options.scale) root.scaling.copyFrom(options.scale);

    const collides = options.collides ?? prepared.definition.collides ?? false;
    const cullAt = prepared.definition.cullAt;
    for (const template of prepared.templates) {
      const instance = template.createInstance(`${root.name}.${template.name}`);
      instance.parent = root;
      instance.position.copyFrom(template.position);
      instance.rotation.copyFrom(template.rotation);
      if (template.rotationQuaternion) {
        instance.rotationQuaternion = template.rotationQuaternion.clone();
      }
      instance.scaling.copyFrom(template.scaling);
      instance.checkCollisions = collides;
      instance.isPickable = collides;
      instance.receiveShadows = true;
      if (cullAt !== undefined) {
        // Instances inherit their source's LOD levels, so a single null level
        // on the template culls every copy of it past the same distance.
        instance.alwaysSelectAsActiveMesh = false;
      }
      this.placed.push(instance);
    }
    return root;
  }

  /** Applies each definition's cull distance to its templates. */
  applyLevelsOfDetail(): void {
    for (const { definition, templates } of this.prepared.values()) {
      if (definition.cullAt === undefined) continue;
      for (const template of templates) template.addLODLevel(definition.cullAt, null);
    }
  }

  /** Every prepared id and whether it is running on art or on generated geometry. */
  status(): AssetStatus[] {
    return [...this.prepared.entries()]
      .map(([id, prepared]) => ({
        id,
        category: prepared.definition.category,
        source: prepared.source,
        path: this.pathFor(id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Says plainly which ids are still waiting for art.
   *
   * Deliberately a single grouped message rather than a warning per asset:
   * a hundred separate warnings is noise, and one table is a work list.
   */
  reportMissing(regionName: string): string[] {
    const generated = this.status().filter((entry) => entry.source === "generated");
    events.emit("assets/report", {
      region: regionName,
      generated: generated.length,
      total: this.prepared.size,
    });
    if (generated.length === 0) {
      console.info(`[assets] ${regionName}: every asset is running on a model.`);
      return [];
    }
    const byCategory = new Map<AssetCategory, string[]>();
    for (const entry of generated) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry.path);
      byCategory.set(entry.category, list);
    }
    const lines = [...byCategory.entries()].map(
      ([category, paths]) => `  ${category}: ${paths.join(", ")}`,
    );
    console.info(
      `[assets] ${regionName}: ${generated.length} of ${this.prepared.size} assets are ` +
        `generated. Drop a .glb at any of these paths under public/assets/ and it is used ` +
        `automatically:\n${lines.join("\n")}`,
    );
    return generated.map((entry) => entry.path);
  }

  get placedCount(): number {
    return this.placed.length;
  }

  dispose(): void {
    for (const instance of this.placed) instance.dispose();
    this.placed.length = 0;
    for (const { templates } of this.prepared.values()) {
      for (const template of templates) template.dispose();
    }
    this.prepared.clear();
  }
}
