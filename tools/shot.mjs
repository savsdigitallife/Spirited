/**
 * One frame, from a running build.
 *
 * A development tool, not a test: boots the production bundle in headless
 * Chromium, optionally drives it, and pulls a single completed frame out of
 * the canvas. Fast enough to look at a change without running the whole
 * smoke suite.
 *
 *   node tools/shot.mjs <name> [scene] [seconds] [keys]
 *
 * `keys` is a comma-separated list of `hold:KeyW:3` (hold for 3 s),
 * `press:KeyE`, `wheel:400`, `look:340:-30` or `wait:2`.
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const [, , name = "shot", scene = "tokyo", settle = "5", script = ""] = process.argv;
const ROOT = resolve("dist");
const OUT = resolve("tools/out");
const PORT = 8141;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
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
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(PORT, done));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600_000);
page.on("pageerror", (e) => console.log("pageerror:", e.message));

const sceneArg = scene === "tokyo" ? "" : `&scene=${scene}`;
await page.goto(`http://127.0.0.1:${PORT}/?capture=1&adaptive=0&quality=low${sceneArg}`, {
  waitUntil: "load",
});
await page.waitForFunction(
  () => document.getElementById("boot")?.classList.contains("fading") === true,
  null,
  { timeout: 600_000, polling: 1000 },
);
await page.mouse.click(640, 360);
await page.waitForTimeout(Number(settle) * 1000);

for (const step of script.split(",").filter(Boolean)) {
  const [verb, a, b] = step.split(":");
  if (verb === "hold") {
    await page.keyboard.down(a);
    await page.waitForTimeout(Number(b) * 1000);
    await page.keyboard.up(a);
  } else if (verb === "press") {
    await page.keyboard.press(a);
  } else if (verb === "wheel") {
    await page.mouse.wheel(0, Number(a));
  } else if (verb === "look") {
    await page.mouse.move(640, 360);
    await page.mouse.move(640 + Number(a), 360 + Number(b), { steps: 12 });
  } else if (verb === "wait") {
    await page.waitForTimeout(Number(a) * 1000);
  }
  await page.waitForTimeout(1200);
}

console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const s = window.nagori.scenes.active.scene;
      const names = (prefix) => s.meshes.filter((m) => m.name.startsWith(prefix)).length;
      const p = s.getTransformNodeByName("aiko.root");
      return {
        interiors: names("interior."),
        buildings: names("building."),
        glass: s.meshes.filter((m) => m.material?.name === "city.glass").length,
        meshes: s.meshes.length,
        active: s.getActiveMeshes().length,
        tris: Math.round(s.getActiveIndices() / 3),
        player: p ? [p.position.x, p.position.y, p.position.z].map((v) => Math.round(v * 100) / 100) : null,
        camera: Math.round((s.activeCamera?.position.x ?? 0) * 10) / 10,
      };
    }),
  ),
);

const dataUrl = await page.evaluate(
  () =>
    new Promise((done) => {
      const s = window.nagori.scenes.active.scene;
      s.onAfterRenderObservable.addOnce(() =>
        done(s.getEngine().getRenderingCanvas().toDataURL("image/png")),
      );
    }),
);
await writeFile(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
console.log(`tools/out/${name}.png`);
await browser.close();
server.close();
