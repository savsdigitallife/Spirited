/**
 * Browser smoke test.
 *
 * Builds are verified by driving the real bundle in headless Chromium under
 * SwiftShader, so the WebGL2 fallback path is what runs. Everything asserted
 * here is read back out of the running game, not inferred.
 *
 * Screenshots are pulled from inside the page at the end of a completed
 * frame: a compositor screenshot of a software-rendered canvas regularly
 * catches a half-drawn buffer.
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve("dist");
const OUT = resolve("tools/out");
const PORT = 8123;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(ROOT, path === "/" ? "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((done) => server.listen(PORT, done));
await mkdir(OUT, { recursive: true });

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Software rendering makes every step slow; the default 30 s is not enough
// for shader compilation on a scene this size.
page.setDefaultTimeout(900_000);
page.setDefaultNavigationTimeout(900_000);

const consoleLines = [];
page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));

// capture=1 keeps the drawing buffer and exposes the debug handle; the low
// preset and a pinned resolution keep a software rasterizer inside its
// timeout budget.
const base = `http://127.0.0.1:${PORT}/?capture=1&adaptive=0&quality=low`;

const bootedAt = Date.now();
await page.goto(base, { waitUntil: "load" });

let bootCleared = false;
let bootError = "";
try {
  await page.waitForFunction(
    () => document.getElementById("boot")?.classList.contains("fading") === true,
    null,
    { timeout: 900_000, polling: 1000 },
  );
  bootCleared = true;
} catch (err) {
  bootCleared = false;
  bootError = err instanceof Error ? err.message.split("\n")[0] : String(err);
  try {
    bootError += `  |  overlay: ${await page.textContent("#bootMsg")}`;
  } catch {
    bootError += "  |  page unreachable";
  }
}
check(
  "Tokyo boots",
  bootCleared,
  `${((Date.now() - bootedAt) / 1000).toFixed(1)}s  ${bootError}`,
);
if (!bootCleared) {
  await writeFile(join(OUT, "console.log"), consoleLines.join("\n"));
  await browser.close();
  server.close();
  console.error("\nboot failed; see tools/out/console.log");
  process.exit(1);
}

check(
  "renderer reported a backend",
  consoleLines.some((l) => l.includes("[nagori] renderer:")),
  consoleLines.find((l) => l.includes("[nagori] renderer:"))?.split("\n")[0] ?? "",
);
check(
  "no uncaught errors at boot",
  consoleLines.filter((l) => l.startsWith("pageerror:")).length === 0,
  consoleLines.filter((l) => l.startsWith("pageerror:")).join(" | "),
);

const grab = async (name) => {
  const dataUrl = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const scene = window.nagori.scenes.active.scene;
        scene.onAfterRenderObservable.addOnce(() => {
          resolve(scene.getEngine().getRenderingCanvas().toDataURL("image/png"));
        });
      }),
  );
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  await writeFile(join(OUT, name), buffer);
  return createHash("sha1").update(buffer).digest("hex");
};

/** Mean and contrast of the rendered frame, sampled inside the page. */
const frameStats = () =>
  page.evaluate(() => {
    const scene = window.nagori.scenes.active.scene;
    const source = scene.getEngine().getRenderingCanvas();
    const w = 160;
    const h = Math.max(1, Math.round((source.height / source.width) * w));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < w * h; i += 1) {
      const l =
        0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      sum += l;
      sumSq += l * l;
    }
    const mean = sum / (w * h);
    return { mean, stdDev: Math.sqrt(Math.max(0, sumSq / (w * h) - mean * mean)) };
  });

const worldStats = () =>
  page.evaluate(() => {
    const scene = window.nagori.scenes.active.scene;
    const sae = scene.getTransformNodeByName("sae");
    return {
      region: window.nagori.scenes.active.id,
      camera: scene.activeCamera?.name ?? null,
      meshes: scene.meshes.length,
      activeMeshes: scene.getActiveMeshes().length,
      indices: scene.getActiveIndices(),
      lights: scene.lights.length,
      materials: scene.materials.length,
      particles: scene.particleSystems.length,
      player: sae ? [sae.position.x, sae.position.y, sae.position.z] : null,
      walkers: scene.transformNodes.filter((n) => n.name.startsWith("walker.")).length,
      cars: scene.transformNodes.filter((n) => n.name.startsWith("car.")).length,
    };
  });

await page.mouse.click(640, 360);
await page.waitForTimeout(4000);

const before = await worldStats();
check("region is the Tokyo street", before.region === "tokyoStreet", before.region);
check("third-person camera is live", before.camera === "camera.thirdPerson", String(before.camera));
check("player character is in the scene", before.player !== null, JSON.stringify(before.player));
check("street has geometry", before.indices / 3 > 8_000, `${Math.round(before.indices / 3)} tris`);
check("pedestrians exist", before.walkers >= 8, `${before.walkers} walkers`);
check("traffic exists", before.cars >= 4, `${before.cars} cars`);
check("rain particle system exists", before.particles >= 1, `${before.particles} systems`);
check("street lighting is set up", before.lights >= 4, `${before.lights} lights`);

const first = await frameStats();
check(
  "frame is lit and detailed",
  first.stdDev > 12 && first.mean > 4 && first.mean < 220,
  `mean ${first.mean.toFixed(1)}  stdDev ${first.stdDev.toFixed(1)}`,
);
await grab("tokyo-spawn.png");

// Walk. The character must actually move through the world.
await page.keyboard.down("KeyW");
await page.waitForTimeout(6000);
await page.keyboard.up("KeyW");
await page.waitForTimeout(600);
const after = await worldStats();
const travelled = Math.hypot(
  (after.player?.[0] ?? 0) - (before.player?.[0] ?? 0),
  (after.player?.[2] ?? 0) - (before.player?.[2] ?? 0),
);
check("walking moves the character", travelled > 2, `${travelled.toFixed(2)} m`);
check(
  "character stays on the pavement",
  Math.abs((after.player?.[1] ?? -1) - 0.16) < 0.35,
  `y = ${(after.player?.[1] ?? 0).toFixed(2)}`,
);
await grab("tokyo-walk.png");

// Sprint and jump must not throw or fall through the world.
await page.keyboard.down("ShiftLeft");
await page.keyboard.down("KeyW");
await page.waitForTimeout(2500);
await page.keyboard.press("Space");
await page.waitForTimeout(2500);
await page.keyboard.up("KeyW");
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(1500);
const sprinted = await worldStats();
check(
  "sprint and jump keep the character in the world",
  (sprinted.player?.[1] ?? -99) > -1 && (sprinted.player?.[1] ?? 99) < 6,
  `y = ${(sprinted.player?.[1] ?? 0).toFixed(2)}`,
);
await grab("tokyo-sprint.png");

// Camera look.
const beforeLook = await page.evaluate(() => {
  const c = window.nagori.scenes.active.scene.activeCamera;
  return [c.position.x, c.position.y, c.position.z];
});
await page.mouse.move(640, 360);
await page.mouse.move(980, 330, { steps: 12 });
await page.waitForTimeout(2000);
const afterLook = await page.evaluate(() => {
  const c = window.nagori.scenes.active.scene.activeCamera;
  return [c.position.x, c.position.y, c.position.z];
});
check(
  "camera orbits with the mouse",
  Math.hypot(afterLook[0] - beforeLook[0], afterLook[2] - beforeLook[2]) > 0.2,
  `moved ${Math.hypot(afterLook[0] - beforeLook[0], afterLook[2] - beforeLook[2]).toFixed(2)} m`,
);

// Walk up to the shop and the crossing, and photograph what is there.
await page.keyboard.down("KeyW");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(9000);
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(4000);
await page.keyboard.up("KeyW");
await page.waitForTimeout(1200);
const arrived = await worldStats();
check(
  "the player stays inside the block",
  Math.abs(arrived.player?.[2] ?? 999) < 78 &&
    Math.abs(arrived.player?.[0] ?? 999) < 22 &&
    (arrived.player?.[1] ?? -99) > -4,
  `at ${(arrived.player ?? []).map((v) => v.toFixed(1)).join(", ")}`,
);
// Back off and widen out for a clean look down the street.
await page.keyboard.down("KeyS");
await page.waitForTimeout(2500);
await page.keyboard.up("KeyS");
await page.mouse.wheel(0, 600);
await page.waitForTimeout(2500);
await grab("tokyo-konbini.png");

check(
  "no uncaught errors during play",
  consoleLines.filter((l) => l.startsWith("pageerror:")).length === 0,
  consoleLines.filter((l) => l.startsWith("pageerror:")).join(" | "),
);

// The Phase 1 proving ground must still load.
await page.goto(`${base}&scene=proving`, { waitUntil: "load" });
let provingOk = false;
try {
  await page.waitForFunction(
    () => document.getElementById("boot")?.classList.contains("fading") === true,
    null,
    { timeout: 180_000, polling: 500 },
  );
  provingOk = true;
} catch {
  provingOk = false;
}
await page.waitForTimeout(2500);
const proving = provingOk ? await worldStats() : { region: "n/a" };
check("proving ground still loads", provingOk && proving.region === "provingGround", proving.region);

await writeFile(join(OUT, "console.log"), consoleLines.join("\n"));
await browser.close();
server.close();

console.log(`\nscreenshots + console log in ${OUT}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nall checks passed");
