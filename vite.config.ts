import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * Hosts allowed to reach the dev and preview servers.
 *
 * Vite rejects a request whose Host header it does not recognise, which is
 * the right default — it is what stops a hostile page from rebinding DNS to
 * a developer's machine. But anything serving this from behind a proxy
 * arrives under a hostname Vite has never heard of, and is refused with
 * "Blocked request" and nothing else. A leading dot matches the domain and
 * every subdomain of it; localhost is always allowed and needs no entry.
 */
const PROXIED_HOSTS = [".replit.dev", ".replit.app", ".repl.co", ".janeway.replit.dev"];

/**
 * Replit serves the page over TLS on 443 and forwards to the local port, so
 * the hot-reload socket has to be told where to connect back to. Left alone
 * it dials the local port on the public hostname and never connects, and the
 * page quietly stops updating.
 */
const onReplit = Boolean(process.env.REPL_ID);
const hmr = onReplit ? { protocol: "wss" as const, clientPort: 443 } : undefined;

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 8080, host: true, allowedHosts: PROXIED_HOSTS, hmr },
  preview: { port: 8080, host: true, allowedHosts: PROXIED_HOSTS },
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
