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
const quality = process.env.QUALITY ?? "low";
await page.goto(`http://127.0.0.1:${PORT}/?capture=1&adaptive=0&quality=${quality}${sceneArg}`, {
  waitUntil: "load",
});
await page.waitForFunction(
  () => document.getElementById("boot")?.classList.contains("fading") === true,
  null,
  { timeout: 600_000, polling: 1000 },
);
await page.mouse.click(640, 360);
await page.waitForTimeout(Number(settle) * 1000);

// A one-off expression run after boot, for experiments whose code contains
// commas and so cannot go in the comma-separated step list.
if (process.env.SETUP) await page.evaluate(process.env.SETUP);

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
  } else if (verb === "js") {
    // Development only: run an expression in the page, for A/B experiments
    // (turn a map off, wait, read the frame rate back).
    await page.evaluate(step.slice(3));
  } else if (verb === "eye") {
    // Development only: put the camera at x:y:z looking at tx:ty:tz.
    const n = step.split(":").slice(1).map(Number);
    await page.evaluate(
      ([ex, ey, ez, tx, ty, tz]) => {
        const s = window.nagori.scenes.active.scene;
        const camera = s.activeCamera;
        s.onBeforeRenderObservable.add(() => {
          camera.position.set(ex, ey, ez);
          camera.setTarget(new (camera.position.constructor)(tx, ty, tz));
        });
      },
      n,
    );
  } else if (verb === "see") {
    // Development only: frame a named mesh from `b` metres away, slightly
    // above it. For looking at one prop without chasing it on foot.
    await page.evaluate(
      ([match, distance]) => {
        const s = window.nagori.scenes.active.scene;
        const mesh = s.meshes.find((m) => m.name.includes(match) && m.isEnabled());
        if (!mesh) throw new Error(`no enabled mesh matching ${match}`);
        const at = mesh.getAbsolutePosition().clone();
        const camera = s.activeCamera;
        const eye = { x: at.x + distance * 0.78, y: at.y + distance * 0.22, z: at.z + distance * 0.58 };
        s.onBeforeRenderObservable.add(() => {
          camera.position.set(eye.x, eye.y, eye.z);
          camera.setTarget(at);
        });
        return mesh.name;
      },
      [a, Number(b ?? 4)],
    );
  } else if (verb === "glint") {
    // Development only: park a free camera where the sun's reflection in a
    // given pane is aimed, so a glint can be looked at deliberately instead
    // of walked into by luck. `a` is a substring of the mesh's name.
    await page.evaluate(
      ([match, distance]) => {
        const s = window.nagori.scenes.active.scene;
        const key = s.getLightByName("nagori.key");
        const sun = { x: -key.direction.x, y: -key.direction.y, z: -key.direction.z };
        // Of every pane in the region, the one most squarely facing the sun.
        let pane = null;
        let n = { x: 0, y: 0, z: 1 };
        let dot = -2;
        for (const mesh of s.meshes) {
          if (!mesh.name.includes(match) || !mesh.isEnabled()) continue;
          const world = mesh.getWorldMatrix();
          const candidate = { x: world.m[8], y: world.m[9], z: world.m[10] };
          const length = Math.hypot(candidate.x, candidate.y, candidate.z);
          candidate.x /= length; candidate.y /= length; candidate.z /= length;
          for (const facing of [candidate, { x: -candidate.x, y: -candidate.y, z: -candidate.z }]) {
            const d = sun.x * facing.x + sun.y * facing.y + sun.z * facing.z;
            if (d > dot) { dot = d; pane = mesh; n = facing; }
          }
        }
        if (!pane) throw new Error(`no enabled mesh matching ${match}`);
        const at = pane.getAbsolutePosition();
        // Mirror the sun about the pane: that is where the eye has to be.
        const d = { x: sun.x - 2 * dot * n.x, y: sun.y - 2 * dot * n.y, z: sun.z - 2 * dot * n.z };
        const eye = { x: at.x - d.x * distance, y: at.y - d.y * distance, z: at.z - d.z * distance };
        // Move the game's own camera rather than swapping in another: the
        // render pipeline is bound to it, and this observer runs after the
        // controller's, so the placement is what survives to the frame.
        const camera = s.activeCamera;
        const target = at.clone();
        s.onBeforeRenderObservable.add(() => {
          camera.position.set(eye.x, eye.y, eye.z);
          camera.setTarget(target);
        });
        return { pane: pane.name, facing: dot };
      },
      [a, Number(b ?? 6)],
    );
  } else if (verb === "time") {
    // Jump the clock. Development only: for looking at a night scene in
    // daylight without waiting out a game day.
    await page.evaluate((t) => {
      window.nagori.time.timeOfDay = t;
    }, Number(a));
  } else if (verb === "at") {
    // Place the character directly. Development only; the game never does this.
    const [x, y, z] = step.split(":").slice(1).map(Number);
    await page.evaluate(
      ([px, py, pz]) => {
        const c = window.nagori.scenes.active.scene.getMeshByName("player.collider");
        c.position.set(px, py + 0.85, pz);
      },
      [x, y, z],
    );
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
        glass: s.meshes.filter((m) => m.material?.name.startsWith("city.glass") === true).length,
        meshes: s.meshes.length,
        active: s.getActiveMeshes().length,
        tris: Math.round(s.getActiveIndices() / 3),
        fps: Math.round(s.getEngine().getFps()),
        player: p ? [p.position.x, p.position.y, p.position.z].map((v) => Math.round(v * 100) / 100) : null,
        camera: Math.round((s.activeCamera?.position.x ?? 0) * 10) / 10,
      };
    }),
  ),
);

// An escape hatch for one-off questions about the live scene:
//   PROBE='window.nagori.scenes.active.scene.meshes.length' node tools/shot.mjs …
if (process.env.PROBE) {
  console.log(JSON.stringify(await page.evaluate(process.env.PROBE)));
}

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
