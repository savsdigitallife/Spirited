/**
 * Engine creation: WebGPU when the browser can, WebGL2 otherwise.
 *
 * Everything that differs between the two backends is meant to be settled
 * here and reported through `EngineInfo`, so no gameplay or rendering code
 * has to ask which backend it is running on.
 *
 * WebGPU is preferred but never required. `?gfx=webgl` forces the fallback
 * path, which is how the fallback gets tested on a machine that supports
 * WebGPU.
 */

import { Engine } from "@babylonjs/core/Engines/engine";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { BackendKind } from "./Events";

export interface EngineInfo {
  engine: AbstractEngine;
  backend: BackendKind;
  /** Human-readable capability lines, shown in the debug overlay. */
  caps: readonly string[];
  /** True when the renderer can use a floating-point render target chain. */
  supportsHdrPipeline: boolean;
  maxTextureSize: number;
  maxAnisotropy: number;
}

export interface EngineRequest {
  canvas: HTMLCanvasElement;
  /** "auto" honours browser support; the others force a backend. */
  prefer?: "auto" | "webgpu" | "webgl";
  onStatus?: (message: string) => void;
}

/**
 * `?capture=1` keeps the drawing buffer alive between frames. Off by
 * default because it costs a full-screen copy every frame, but a headless
 * screenshot of a slow frame otherwise grabs whatever the compositor last
 * saw, which is usually a cleared buffer.
 */
function captureMode(): boolean {
  return new URLSearchParams(location.search).get("capture") === "1";
}

function webGlOptions() {
  return {
    antialias: false, // The post pipeline owns AA so the preset can change it.
    stencil: true,
    alpha: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance" as const,
    preserveDrawingBuffer: captureMode(),
    doNotHandleContextLost: false,
    adaptToDeviceRatio: true,
  };
}

/**
 * Asks the browser directly instead of via Babylon, so the WebGPU backend
 * module is never downloaded on a browser that cannot use it. That module
 * is roughly a third of the engine bundle.
 */
async function webGpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

function describe(engine: AbstractEngine, backend: BackendKind): EngineInfo {
  const caps = engine.getCaps();
  const lines: string[] = [
    `backend ${backend}`,
    `max texture ${caps.maxTextureSize}px`,
    `max anisotropy ${caps.maxAnisotropy}x`,
    `float textures ${caps.textureFloatRender ? "render" : caps.textureFloat ? "sample" : "no"}`,
    `half float ${caps.textureHalfFloatRender ? "render" : caps.textureHalfFloat ? "sample" : "no"}`,
    `depth texture ${caps.depthTextureExtension ? "yes" : "no"}`,
    `instancing ${caps.instancedArrays ? "yes" : "no"}`,
    `draw buffers ${caps.drawBuffersExtension ? "yes" : "no"}`,
  ];
  return {
    engine,
    backend,
    caps: lines,
    supportsHdrPipeline: Boolean(caps.textureHalfFloatRender || caps.textureFloatRender),
    maxTextureSize: caps.maxTextureSize,
    maxAnisotropy: caps.maxAnisotropy,
  };
}

function createWebGl(canvas: HTMLCanvasElement): EngineInfo {
  const engine = new Engine(canvas, false, webGlOptions(), true);
  const backend: BackendKind = engine.webGLVersion >= 2 ? "webgl2" : "webgl1";
  return describe(engine, backend);
}

export async function createEngine(request: EngineRequest): Promise<EngineInfo> {
  const { canvas, onStatus } = request;
  const urlPref = new URLSearchParams(location.search).get("gfx");
  const prefer =
    urlPref === "webgl" || urlPref === "webgpu"
      ? urlPref
      : (request.prefer ?? "auto");

  if (prefer !== "webgl") {
    onStatus?.("Checking WebGPU support…");
    const available = prefer === "webgpu" || (await webGpuAvailable());
    if (available) {
      try {
        onStatus?.("Starting WebGPU renderer…");
        const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine");
        const engine = new WebGPUEngine(canvas, {
          antialias: false,
          stencil: true,
          powerPreference: "high-performance",
          adaptToDeviceRatio: true,
        });
        await engine.initAsync();
        return describe(engine, "webgpu");
      } catch (err) {
        console.warn("[engine] WebGPU init failed, falling back to WebGL", err);
        onStatus?.("WebGPU unavailable — using WebGL.");
      }
    }
  }

  onStatus?.("Starting WebGL renderer…");
  return createWebGl(canvas);
}
