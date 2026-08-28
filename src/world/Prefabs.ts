/**
 * Prop registry.
 *
 * A scene never builds a vending machine; it asks the registry for one. Each
 * prefab declares an optional glTF path and a primitive fallback, and the
 * registry prefers the model when it loads. That is the whole point: when
 * art arrives, a prefab definition gains a `model` line and every scene that
 * places one gets the model, with no scene code touched.
 *
 * Primitive prefabs are spawned as GPU instances of a hidden template, so a
 * street with sixty street lights costs one draw call for street lights.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetLoader } from "../engine/AssetLoader";

export interface PrefabBuildContext {
  scene: Scene;
}

export interface PrefabDefinition {
  id: string;
  /**
   * Path to a glTF/GLB under the asset root. When it loads, it replaces the
   * primitive build entirely.
   */
  model?: string;
  /** Primitive stand-in. Every mesh must be a direct child of no parent. */
  build: (context: PrefabBuildContext) => Mesh[];
  /** Whether spawned copies collide with the player. */
  collides?: boolean;
  /** Whether spawned copies cast shadows. */
  castsShadow?: boolean;
}

export interface SpawnOptions {
  position: Vector3;
  rotationY?: number;
  scale?: number | Vector3;
  name?: string;
  /** Overrides the prefab default. */
  collides?: boolean;
}

interface PreparedPrefab {
  definition: PrefabDefinition;
  /** Hidden originals. Instances reference these. */
  templates: Mesh[];
  /** Set when the prefab resolved to a loaded model instead of primitives. */
  modelLoaded: boolean;
}

export class PrefabRegistry {
  private readonly definitions = new Map<string, PrefabDefinition>();
  private readonly prepared = new Map<string, PreparedPrefab>();
  private readonly spawned: AbstractMesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetLoader,
  ) {}

  define(definition: PrefabDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  defineAll(definitions: readonly PrefabDefinition[]): void {
    for (const definition of definitions) this.define(definition);
  }

  /**
   * Builds (or loads) the templates. Called once during region load so no
   * geometry is created during play.
   */
  async prepare(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (this.prepared.has(id)) continue;
      const definition = this.definitions.get(id);
      if (!definition) throw new Error(`[prefabs] "${id}" was never defined`);

      let templates: Mesh[] = [];
      let modelLoaded = false;
      // Check before loading: an asset that is not there must never reach the
      // loader, because a failed load leaves the scene permanently "not
      // ready". During the prototype every one of these is absent.
      if (definition.model && (await this.assets.exists(definition.model))) {
        try {
          const container = await this.assets.container(this.scene, definition.model);
          templates = container.meshes.filter((m): m is Mesh => "geometry" in m);
          modelLoaded = templates.length > 0;
        } catch (err) {
          console.warn(`[prefabs] "${id}" model failed to load; using primitives`, err);
          modelLoaded = false;
        }
      }
      if (!modelLoaded) templates = definition.build({ scene: this.scene });

      for (const template of templates) {
        template.name = `prefab.${id}.${template.name || "part"}`;
        template.isPickable = false;
        template.setEnabled(false);
      }
      this.prepared.set(id, { definition, templates, modelLoaded });
    }
  }

  /** The hidden originals, for registering shadow casters once per prefab. */
  templates(id: string): readonly Mesh[] {
    return this.prepared.get(id)?.templates ?? [];
  }

  castsShadow(id: string): boolean {
    return this.prepared.get(id)?.definition.castsShadow ?? true;
  }

  ids(): readonly string[] {
    return [...this.prepared.keys()];
  }

  spawn(id: string, options: SpawnOptions): TransformNode {
    const prepared = this.prepared.get(id);
    if (!prepared) throw new Error(`[prefabs] "${id}" was not prepared`);

    const root = new TransformNode(options.name ?? `${id}.${this.spawned.length}`, this.scene);
    root.position.copyFrom(options.position);
    root.rotation.y = options.rotationY ?? 0;
    if (typeof options.scale === "number") root.scaling.setAll(options.scale);
    else if (options.scale) root.scaling.copyFrom(options.scale);

    const collides = options.collides ?? prepared.definition.collides ?? false;
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
      this.spawned.push(instance);
    }
    return root;
  }

  /** Total instances placed, for the debug overlay. */
  get instanceCount(): number {
    return this.spawned.length;
  }

  dispose(): void {
    for (const instance of this.spawned) instance.dispose();
    this.spawned.length = 0;
    for (const { templates } of this.prepared.values()) {
      for (const template of templates) template.dispose();
    }
    this.prepared.clear();
  }
}
