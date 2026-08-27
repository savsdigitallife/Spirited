import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 8080, host: true },
  preview: { port: 8080, host: true },
  build: {
    target: "es2022",
    sourcemap: true,
    // Babylon is large and stable; splitting it out means game-code changes
    // do not force players to re-download the engine.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Kept out of the shared chunk on purpose: both are imported
          // dynamically (WebGPU only when the browser has it, the glTF
          // plugin only on the first model load), so they must stay in
          // their own async chunks rather than being merged back in.
          if (id.includes("webgpu") || id.includes("@babylonjs/loaders")) {
            return undefined;
          }
          if (id.includes("node_modules/@babylonjs")) return "babylon";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
