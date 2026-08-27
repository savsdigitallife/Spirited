/**
 * Browser smoke test for the Phase 1 foundation.
 *
 * Runs the production build in headless Chromium (SwiftShader, so the
 * WebGL2 fallback path is what gets exercised), then asserts on what the
 * page actually did: the boot overlay cleared, the renderer reported a
 * backend, frames advanced, geometry was drawn, and successive frames
 * differ — which is how we know the sun and the input rig are live rather
 * than a still image.
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

const consoleLines = [];
page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));

// capture=1 keeps the WebGL drawing buffer between frames so a screenshot
// taken mid-frame is not a blank composite.
const target = process.argv[2] ?? `http://127.0.0.1:${PORT}/?capture=1`;
await page.goto(target, { waitUntil: "load" });

// The boot overlay hides itself only after the first region is ready.
let bootCleared = false;
try {
  await page.waitForFunction(
    () => document.getElementById("boot")?.classList.contains("fading") === true,
    { timeout: 90_000 },
  );
  bootCleared = true;
} catch {
  bootCleared = false;
}
check("boot overlay clears", bootCleared, await page.textContent("#bootErr"));

const errText = (await page.textContent("#bootErr")) ?? "";
check("no fatal boot error", errText.trim() === "", errText.trim());

const backendLine = consoleLines.find((l) => l.includes("[nagori] renderer:")) ?? "";
check("renderer reported a backend", backendLine !== "", backendLine.split("\n")[0]);

const pageErrors = consoleLines.filter((l) => l.startsWith("pageerror:"));
check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));

// Turn the debug overlay on so the counters are rendered into the DOM.
await page.click("#render");
await page.keyboard.press("Backquote");
await page.waitForTimeout(4000);
const overlay = (await page.textContent("div[style*='backdrop-filter']")) ?? "";
check("debug overlay renders", overlay.includes("NAGORI"), overlay.split("\n")[0]);

const drawMatch = /draws (\d+)/.exec(overlay);
const draws = drawMatch ? Number(drawMatch[1]) : 0;
check("scene issues draw calls", draws > 0, `draws=${draws}`);

const triMatch = /tris ([\d,]+)/.exec(overlay);
const tris = triMatch ? Number(triMatch[1].replace(/,/g, "")) : 0;
check("scene renders real geometry", tris > 10_000, `tris=${tris}`);

const fpsMatch = /(\d+) fps/.exec(overlay);
check("frames are advancing", fpsMatch !== null && Number(fpsMatch[1]) > 0, overlay.split("\n")[1]);

/**
 * Reads the canvas from inside the page at the end of a completed frame.
 *
 * A Playwright screenshot composites whatever the browser happens to have
 * for the canvas at that instant; under SwiftShader, where one frame takes
 * hundreds of milliseconds, that is regularly a half-drawn buffer. Hooking
 * Babylon's after-render observable guarantees the pixels belong to a
 * frame that finished. Requires ?capture=1 so the drawing buffer survives
 * the readback.
 */
const hash = async (name) => {
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
const a = await hash("frame-a.png");
await page.keyboard.down("KeyW");
await page.waitForTimeout(1200);
await page.keyboard.up("KeyW");
const b = await hash("frame-b.png");
check("input moves the world", a !== b, `${a.slice(0, 8)} vs ${b.slice(0, 8)}`);

// Cycle to the next graphics preset and confirm it took effect.
await page.keyboard.press("F4");
await page.waitForTimeout(1200);
const after = (await page.textContent("div[style*='backdrop-filter']")) ?? "";
const presetOf = (text) => /NAGORI\s+·\s+\S+\s+·\s+(\w+)/.exec(text)?.[1] ?? "?";
const presetBefore = presetOf(overlay);
const presetAfter = presetOf(after);
check("quality preset switches live", presetBefore !== presetAfter, `${presetBefore} -> ${presetAfter}`);
await hash("frame-quality.png");

/**
 * Every preset must still render a lit, detailed scene after switching to
 * it at runtime. This is a regression guard: rebuilding the shadow
 * generator, or flipping its filter mode, used to leave the whole frame a
 * flat washed-out gradient while every counter still looked healthy. Mean
 * brightness alone would not have caught it — the broken frame was
 * *brighter* than the correct one — so the check is on contrast.
 */
const luminanceStats = async (name) => {
  await hash(name);
  return page.evaluate(() => {
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
    const n = w * h;
    for (let i = 0; i < n; i += 1) {
      const l =
        0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      sum += l;
      sumSq += l * l;
    }
    const mean = sum / n;
    return { mean, stdDev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  });
};

for (const preset of ["ultra", "low", "medium", "high"]) {
  await page.evaluate((p) => window.nagori.settings.apply(p), preset);
  await page.waitForTimeout(6000);
  const stats = await luminanceStats(`preset-${preset}.png`);
  check(
    `${preset} preset renders a detailed frame`,
    stats.stdDev > 18 && stats.mean > 8 && stats.mean < 210,
    `mean ${stats.mean.toFixed(1)}  stdDev ${stats.stdDev.toFixed(1)}`,
  );
}

// Wide shot from the free-fly camera, for eyeballing the whole region.
// Dropped to the cheapest preset first: this runs on SwiftShader, where a
// single Ultra frame takes seconds and the screenshot can catch a half-drawn
// buffer.
await page.evaluate(() => window.nagori.settings.apply("low"));
await page.waitForTimeout(4000);
await hash("frame-low-orbit.png");
await page.keyboard.press("KeyV");
await page.waitForTimeout(9000);
await hash("frame-wide.png");

const lateErrors = consoleLines.filter((l) => l.startsWith("pageerror:"));
check("no page errors during play", lateErrors.length === 0, lateErrors.join(" | "));

await writeFile(join(OUT, "console.log"), consoleLines.join("\n"));
await browser.close();
server.close();

console.log(`\nscreenshots + console log in ${OUT}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nall checks passed");
