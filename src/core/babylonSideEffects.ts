/**
 * Babylon side-effect registrations.
 *
 * We import Babylon through deep paths rather than the `@babylonjs/core`
 * barrel: the barrel pulls in the whole engine (~4 MB raw) and defeats
 * tree-shaking, while deep imports produced a 738 kB / 180 kB gzipped
 * bundle for the same feature set.
 *
 * The cost of deep imports is that features which register themselves onto
 * other classes at import time (scene components, engine extensions, loader
 * plugins) are dropped unless something imports them for their side effects.
 * Every such import lives here, with a note on what it enables, so that a
 * missing feature has exactly one place to look.
 */

// Shadow generators attach to the scene through a scene component.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

// SSAO2 and CSM's autoCalcDepthBounds both read the depth renderer.
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

// SSAO2 reads normals + positions from the geometry buffer.
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";

// Occlusion / timer queries used by the perf counters in the debug overlay.
import "@babylonjs/core/Engines/Extensions/engine.query";

// The glTF loader is NOT registered here: AssetLoader imports it on first
// use, so a scene built only from procedural geometry never downloads it.

export {};
