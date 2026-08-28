/**
 * glTF / GLB asset loading with a container cache.
 *
 * Assets load into an `AssetContainer` rather than straight into the scene:
 * a container can be instantiated many times, added and removed wholesale,
 * and disposed when a region unloads — which is what region streaming in a
 * later phase needs.
 */

import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";

export interface LoadProgress {
  loaded: number;
  total: number;
  fraction: number;
}

export class AssetLoader {
  private readonly cache = new Map<string, Promise<AssetContainer>>();
  private readonly presence = new Map<string, Promise<boolean>>();
  private loaders: Promise<void> | null = null;

  /** Root the game's own assets live under, relative to the site root. */
  constructor(private readonly baseUrl = "/assets/") {}

  resolve(path: string): string {
    if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;
    return path.startsWith("/") ? path : this.baseUrl + path;
  }

  /**
   * Loads (or returns a cached) container. Containers are per-scene in
   * Babylon, so the cache key includes the scene's uid.
   */
  /**
   * Is this asset actually there?
   *
   * Ask before loading anything optional. A failed `LoadAssetContainerAsync`
   * leaves an entry in the scene's pending-data set that is never cleared,
   * and `scene.isReady()` consults that set — so one 404 on an optional
   * model wedges the whole scene in "not ready" forever, with no error to
   * show for it. A HEAD request costs nothing and avoids the trap entirely.
   */
  exists(path: string): Promise<boolean> {
    const url = this.resolve(path);
    const cached = this.presence.get(url);
    if (cached) return cached;
    const probe = fetch(url, { method: "HEAD" })
      .then((response) => response.ok)
      .catch(() => false);
    this.presence.set(url, probe);
    return probe;
  }

  /** Registers the glTF plugin once, on the first load that needs it. */
  private ensureLoaders(): Promise<void> {
    this.loaders ??= import("@babylonjs/loaders/glTF/2.0").then(() => undefined);
    return this.loaders;
  }

  container(
    scene: Scene,
    path: string,
    onProgress?: (p: LoadProgress) => void,
  ): Promise<AssetContainer> {
    const key = `${scene.uid}::${path}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const url = this.resolve(path);
    const promise = this.ensureLoaders()
      .then(() =>
        LoadAssetContainerAsync(url, scene, {
          onProgress: (event) => {
            if (!onProgress) return;
            const total = event.lengthComputable ? event.total : 0;
            onProgress({
              loaded: event.loaded,
              total,
              fraction: total > 0 ? event.loaded / total : 0,
            });
          },
        }),
      )
      .catch((err: unknown) => {
      // A failed load must not poison the cache; the next attempt retries.
        this.cache.delete(key);
        throw err;
      });

    this.cache.set(key, promise);
    return promise;
  }

  /** One-off placement of a model into the scene. */
  async instantiate(
    scene: Scene,
    path: string,
    name?: string,
  ): Promise<InstantiatedEntries> {
    const container = await this.container(scene, path);
    return container.instantiateModelsToScene(
      (source) => `${name ?? path}.${source}`,
      false,
      { doNotInstantiate: false },
    );
  }

  /** Drops cached containers for a scene that is going away. */
  forgetScene(scene: Scene): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${scene.uid}::`)) this.cache.delete(key);
    }
  }
}
