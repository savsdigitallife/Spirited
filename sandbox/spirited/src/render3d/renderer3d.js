// The 3D renderer: a shadow pass, a sky, the extruded world, and every box and
// sphere the actors and props are built from.

import * as M from './glmath.js';
import { program, uploadMesh, disposeMesh, arrayTexture, shadowTarget } from './glcore.js';
import { WORLD_VS, WORLD_FS, DEPTH_VS, DEPTH_FS, SKY_VS, SKY_FS } from './shaders.js';
import { buildTextureLayers, TEXTURE_SIZE } from './textures.js';
import { buildAreaMesh } from './areamesh.js';
import { Geo } from './geometry.js';
import { Rain } from './rain.js';

const SHADOW_SIZE = 2048;
const LAYOUT = [['aPos', 3], ['aNrm', 3], ['aUv', 2], ['aLayer', 1], ['aAo', 1],
                ['aFlags', 1], ['aSway', 1], ['aPhase', 1]];

// Fixed attribute slots, shared by the world and shadow programs.
const SLOTS = Object.fromEntries(LAYOUT.map(([name], i) => [name, i]));

// How hard the wind blows in each kind of place, and from where.
const WIND = {
  calm: { dir: [0.7, 0.7], strength: 0.02, speed: 0.5 },
  breeze: { dir: [0.82, 0.57], strength: 0.1, speed: 1 },
  gusty: { dir: [0.9, -0.44], strength: 0.19, speed: 1.4 },
  storm: { dir: [0.96, -0.28], strength: 0.3, speed: 2.1 },
  spirit: { dir: [-0.6, 0.8], strength: 0.07, speed: 0.7 }
};

// Per-area mood: sun, sky, fog, and how far Aiko's own light reaches.
const LIGHTING = {
  morning: {
    sun: [1.0, 0.88, 0.72], sunPower: 1.05, elevation: 0.62, azimuth: 2.4,
    sky: [0.42, 0.48, 0.58], ground: [0.24, 0.22, 0.19],
    horizon: [0.78, 0.82, 0.86], zenith: [0.35, 0.52, 0.76],
    fog: [0.74, 0.79, 0.85], fogDensity: 0.011, lamp: 0
  },
  afternoon: {
    sun: [1.0, 0.96, 0.85], sunPower: 1.15, elevation: 0.95, azimuth: 2.0,
    sky: [0.44, 0.5, 0.6], ground: [0.26, 0.24, 0.2],
    horizon: [0.82, 0.86, 0.88], zenith: [0.32, 0.5, 0.78],
    fog: [0.78, 0.83, 0.87], fogDensity: 0.008, lamp: 0
  },
  dusk: {
    sun: [1.0, 0.6, 0.38], sunPower: 0.9, elevation: 0.22, azimuth: 1.2,
    sky: [0.32, 0.28, 0.4], ground: [0.16, 0.13, 0.15],
    horizon: [0.85, 0.5, 0.36], zenith: [0.18, 0.18, 0.36],
    fog: [0.55, 0.38, 0.4], fogDensity: 0.016, lamp: 0
  },
  night: {
    sun: [0.4, 0.48, 0.78], sunPower: 0.6, elevation: 0.7, azimuth: 3.6,
    sky: [0.2, 0.24, 0.4], ground: [0.09, 0.1, 0.16],
    horizon: [0.1, 0.12, 0.24], zenith: [0.03, 0.04, 0.12],
    fog: [0.08, 0.1, 0.2], fogDensity: 0.02, lamp: 0, stars: 0.8
  },
  dark: {
    sun: [0.3, 0.3, 0.36], sunPower: 0.45, elevation: 0.9, azimuth: 2.0,
    sky: [0.22, 0.21, 0.24], ground: [0.11, 0.1, 0.11],
    horizon: [0.06, 0.06, 0.08], zenith: [0.02, 0.02, 0.03],
    fog: [0.06, 0.06, 0.08], fogDensity: 0.04, lamp: 0
  },
  spiritdusk: {
    sun: [0.95, 0.62, 0.72], sunPower: 0.95, elevation: 0.3, azimuth: 1.6,
    sky: [0.4, 0.32, 0.52], ground: [0.2, 0.14, 0.24],
    horizon: [0.62, 0.36, 0.48], zenith: [0.16, 0.12, 0.32],
    fog: [0.4, 0.26, 0.4], fogDensity: 0.018, lamp: 0
  },
  lamplight: {
    sun: [1.0, 0.8, 0.55], sunPower: 0.95, elevation: 0.85, azimuth: 2.6,
    sky: [0.46, 0.38, 0.32], ground: [0.26, 0.19, 0.15],
    horizon: [0.24, 0.16, 0.12], zenith: [0.1, 0.07, 0.06],
    fog: [0.2, 0.14, 0.11], fogDensity: 0.02, lamp: 0
  },
  ember: {
    sun: [1.0, 0.6, 0.34], sunPower: 0.95, elevation: 0.8, azimuth: 1.8,
    sky: [0.42, 0.24, 0.16], ground: [0.28, 0.14, 0.08],
    horizon: [0.28, 0.12, 0.06], zenith: [0.1, 0.05, 0.04],
    fog: [0.22, 0.1, 0.06], fogDensity: 0.024, lamp: 0
  },
  gold: {
    sun: [1.0, 0.86, 0.6], sunPower: 1.1, elevation: 0.9, azimuth: 2.2,
    sky: [0.44, 0.36, 0.26], ground: [0.26, 0.2, 0.13],
    horizon: [0.3, 0.22, 0.12], zenith: [0.14, 0.1, 0.06],
    fog: [0.26, 0.19, 0.1], fogDensity: 0.018, lamp: 0
  },
  lateblue: {
    sun: [0.6, 0.7, 0.95], sunPower: 0.6, elevation: 0.4, azimuth: 3.0,
    sky: [0.24, 0.3, 0.44], ground: [0.1, 0.13, 0.17],
    horizon: [0.35, 0.42, 0.55], zenith: [0.1, 0.16, 0.34],
    fog: [0.3, 0.36, 0.48], fogDensity: 0.014, lamp: 0
  },
  // The city, after the move went wrong: sodium and neon on a wet street.
  neon: {
    sun: [0.4, 0.5, 0.86], sunPower: 0.5, elevation: 0.68, azimuth: 3.9,
    sky: [0.26, 0.25, 0.38], ground: [0.16, 0.12, 0.14],
    horizon: [0.24, 0.13, 0.3], zenith: [0.03, 0.03, 0.09],
    fog: [0.14, 0.1, 0.22], fogDensity: 0.03, lamp: 0,
    wetness: 1, rain: { color: [0.78, 0.86, 1.0], streak: 0.42 },
    neon: [0.5, 0.16, 0.55]
  },
  // Inside, on the same night.
  neonroom: {
    sun: [0.5, 0.55, 0.9], sunPower: 0.5, elevation: 0.7, azimuth: 3.9,
    sky: [0.24, 0.22, 0.32], ground: [0.13, 0.11, 0.14],
    horizon: [0.1, 0.08, 0.14], zenith: [0.04, 0.04, 0.08],
    fog: [0.09, 0.08, 0.14], fogDensity: 0.02, lamp: 0,
    neon: [0.35, 0.12, 0.4]
  },
  dawn: {
    sun: [1.0, 0.82, 0.78], sunPower: 0.95, elevation: 0.3, azimuth: 2.8,
    sky: [0.45, 0.42, 0.5], ground: [0.22, 0.2, 0.2],
    horizon: [0.92, 0.72, 0.7], zenith: [0.4, 0.5, 0.72],
    fog: [0.8, 0.68, 0.68], fogDensity: 0.013, lamp: 0
  }
};

const DEFAULT_LIGHT = LIGHTING.afternoon;

export class Renderer3D {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('This game needs WebGL2.');
    this.gl = gl;
    this.canvas = canvas;

    this.world = program(gl, WORLD_VS, WORLD_FS, SLOTS);
    this.depth = program(gl, DEPTH_VS, DEPTH_FS, SLOTS);
    this.sky = program(gl, SKY_VS, SKY_FS, { aPos: 0 });

    this.atlas = arrayTexture(gl, TEXTURE_SIZE, buildTextureLayers());
    this.shadow = shadowTarget(gl, SHADOW_SIZE);

    this.rain = new Rain(gl);
    this.cube = this.uploadUnit(makeCube());
    this.ball = this.uploadUnit(makeSphere());
    this.tube = this.uploadUnit(makeCylinder());
    this.skyQuad = this.makeSkyQuad();

    this.areaMeshes = new Map();
    this.cameraMode = 'third';
    this.eyeYaw = 0;
    this.queue = [];
    this.light = DEFAULT_LIGHT;
    this.zoom = 1.1;

    this.viewProj = M.mat4();
    this.lightViewProj = M.mat4();
    this.model = M.mat4();
    this.view = M.mat4();
    this.proj = M.mat4();
    this.eye = [0, 0, 0];

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.02, 0.02, 0.04, 1);
  }

  uploadUnit(geo) {
    return uploadMesh(this.gl, this.world, geo.data, geo.indices, LAYOUT);
  }

  makeSkyQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = this.sky.attribs.aPos;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  /* ----------------------------------------------------------- area -- */

  loadArea(area) {
    this.light = LIGHTING[area.tint] ?? DEFAULT_LIGHT;
    this.currentArea = area;
    if (this.areaMeshes.has(area.id)) return;
    const built = buildAreaMesh(area);
    this.areaMeshes.set(area.id, {
      solid: uploadMesh(this.gl, this.world, built.solid.data, built.solid.indices, LAYOUT)
    });
    // Keep a handful of areas resident; drop the oldest beyond that.
    if (this.areaMeshes.size > 6) {
      const [oldest] = this.areaMeshes.keys();
      if (oldest !== area.id) {
        disposeMesh(this.gl, this.areaMeshes.get(oldest).solid);
        this.areaMeshes.delete(oldest);
      }
    }
  }

  /* --------------------------------------------------------- objects -- */

  begin() {
    this.queue.length = 0;
  }

  drawBox(x, y, z, sx, sy, sz, color, opts = {}) {
    this.queue.push({ mesh: this.cube, x, y, z, sx, sy, sz, color, ...opts });
  }

  drawSphere(x, y, z, sx, sy, sz, color, opts = {}) {
    this.queue.push({ mesh: this.ball, x, y, z, sx, sy, sz, color, ...opts });
  }

  /**
   * A limb: a capped cylinder hanging from its top end, so a joint hinges
   * where you would expect. `radius` is a real radius — the unit mesh is
   * half a unit across, so it is doubled here.
   */
  drawLimb(x, y, z, radius, length, color, opts = {}) {
    this.queue.push({ mesh: this.tube, x, y, z, sx: radius * 2, sy: length, sz: radius * 2, color, ...opts });
  }

  /* ---------------------------------------------------------- camera -- */

  /** Where the camera sits, and what it looks at, for the current mode. */
  cameraFor(target, area, facing) {
    if (this.cameraMode === 'first') {
      // Over her shoulder is nearly her eyeline: sit at head height and look
      // the way she is walking.
      const eye = [target[0], target[1] + 0.85, target[2]];
      const look = [
        eye[0] + Math.sin(this.eyeYaw) * 4,
        eye[1] - 0.35,
        eye[2] + Math.cos(this.eyeYaw) * 4
      ];
      return { eye, look, fov: 1.25 };
    }
    const dist = (area.indoors ? 8 : 10.5) * this.zoom;
    const height = (area.indoors ? 9.6 : 8.6) * this.zoom;
    const eye = [target[0], target[1] + height, target[2] + dist];
    eye[0] = M.clamp(eye[0], -6, area.w + 6);
    eye[2] = M.clamp(eye[2], -4, area.h + 14);
    return { eye, look: target, fov: 0.66 };
  }

  /** Turn the head smoothly toward a new facing rather than snapping. */
  turnEye(yaw, dt) {
    let delta = yaw - this.eyeYaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.eyeYaw += delta * Math.min(1, dt * 9);
  }

  /* ---------------------------------------------------------- render -- */

  render(area, focus, time, opts = {}) {
    const gl = this.gl;
    const mesh = this.areaMeshes.get(area.id);
    if (!mesh) return;
    const L = this.light;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const target = [focus.x, focus.y + 0.8, focus.z];
    const shot = this.cameraFor(target, area);
    const eye = shot.eye;
    this.eye = eye;

    M.perspective(this.proj, shot.fov, w / h, 0.12, 260);
    M.lookAt(this.view, eye, shot.look);
    M.multiply(this.viewProj, this.proj, this.view);

    // Sun direction and the light's view of the world around Aiko.
    const sunDir = [
      Math.cos(L.azimuth) * Math.cos(L.elevation),
      Math.sin(L.elevation),
      Math.sin(L.azimuth) * Math.cos(L.elevation)
    ];
    const span = 22;
    const lightEye = [target[0] + sunDir[0] * 40, target[1] + sunDir[1] * 40, target[2] + sunDir[2] * 40];
    const lproj = M.mat4();
    const lview = M.mat4();
    M.ortho(lproj, -span, span, -span, span, 1, 110);
    M.lookAt(lview, lightEye, target, [0, 1, 0]);
    M.multiply(this.lightViewProj, lproj, lview);

    /* ---- shadow pass ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, this.shadow.size, this.shadow.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.depth.prog);
    gl.uniformMatrix4fv(this.depth.uniforms.uLightViewProj, false, this.lightViewProj);
    const wind = WIND[area.wind ?? (area.indoors ? 'calm' : 'breeze')] ?? WIND.breeze;
    const windTime = time * wind.speed;
    gl.uniform2fv(this.depth.uniforms.uWindDir, wind.dir);
    gl.uniform1f(this.depth.uniforms.uWindStrength, wind.strength);
    gl.uniform1f(this.depth.uniforms.uWindTime, windTime);
    gl.cullFace(gl.FRONT);                       // front-face culling kills acne
    M.identity(this.model);
    gl.uniformMatrix4fv(this.depth.uniforms.uModel, false, this.model);
    gl.bindVertexArray(mesh.solid.vao);
    gl.drawElements(gl.TRIANGLES, mesh.solid.count, gl.UNSIGNED_INT, 0);
    for (const item of this.queue) {
      if (item.noShadow) continue;
      this.modelFor(item);
      gl.uniformMatrix4fv(this.depth.uniforms.uModel, false, this.model);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES, item.mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    /* ---- sky ---- */
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.sky.prog);
    gl.depthMask(false);
    const sunScreen = this.projectDirection(sunDir);
    const indoors = area.indoors;
    const horizon = indoors ? dim(L.fog, 0.22) : L.horizon;
    const zenith = indoors ? dim(L.fog, 0.1) : L.zenith;
    gl.uniform3fv(this.sky.uniforms.uHorizon, horizon);
    gl.uniform3fv(this.sky.uniforms.uZenith, zenith);
    gl.uniform3fv(this.sky.uniforms.uSunColor, L.sun);
    gl.uniform2fv(this.sky.uniforms.uSunScreen, sunScreen);
    gl.uniform1f(this.sky.uniforms.uStars, indoors ? 0 : (L.stars ?? 0));
    gl.bindVertexArray(this.skyQuad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    /* ---- world ---- */
    const P = this.world;
    gl.useProgram(P.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.uniform1i(P.uniforms.uAtlas, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.depth);
    gl.uniform1i(P.uniforms.uShadow, 1);

    gl.uniformMatrix4fv(P.uniforms.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(P.uniforms.uLightViewProj, false, this.lightViewProj);
    gl.uniform3fv(P.uniforms.uCamera, eye);
    gl.uniform3fv(P.uniforms.uSunDir, sunDir);
    gl.uniform3f(P.uniforms.uSunColor, L.sun[0] * L.sunPower, L.sun[1] * L.sunPower, L.sun[2] * L.sunPower);
    gl.uniform3fv(P.uniforms.uSkyColor, L.sky);
    gl.uniform3fv(P.uniforms.uGroundColor, L.ground);
    gl.uniform3fv(P.uniforms.uFogColor, L.fog);
    gl.uniform1f(P.uniforms.uFogDensity, L.fogDensity);
    gl.uniform1f(P.uniforms.uTime, time);
    gl.uniform2fv(P.uniforms.uWindDir, wind.dir);
    gl.uniform1f(P.uniforms.uWindStrength, wind.strength);
    gl.uniform1f(P.uniforms.uWindTime, windTime);
    // No lamp follows Aiko around any more — dark places are lit by their own
    // lanterns and by ambient, not by a halo stuck to the player.
    gl.uniform3f(P.uniforms.uLampPos, focus.x, focus.y + 1.0, focus.z);
    gl.uniform3f(P.uniforms.uLampColor, 0, 0, 0);
    gl.uniform1f(P.uniforms.uLampRange, 1);
    gl.uniform1f(P.uniforms.uWetness, L.wetness ?? 0);
    gl.uniform3fv(P.uniforms.uNeon, L.neon ?? [0, 0, 0]);
    gl.uniform3f(P.uniforms.uCutFrom, focus.x, focus.y, focus.z);
    gl.uniform1f(P.uniforms.uCutEnabled, opts.cutaway === false || this.cameraMode === 'first' ? 0 : 1);
    gl.uniform1f(P.uniforms.uAlpha, 1);

    M.identity(this.model);
    gl.uniformMatrix4fv(P.uniforms.uModel, false, this.model);
    gl.uniform1f(P.uniforms.uUseTexture, 1);
    gl.uniform1f(P.uniforms.uLayerOverride, -1);
    gl.uniform1f(P.uniforms.uEmissive, 0);
    gl.uniform3f(P.uniforms.uTint, 1, 1, 1);
    gl.bindVertexArray(mesh.solid.vao);
    gl.drawElements(gl.TRIANGLES, mesh.solid.count, gl.UNSIGNED_INT, 0);

    /* ---- actors and props ---- */
    // Glows and ghosts go last so they blend over everything solid.
    this.queue.sort((a, b) => (a.alpha ?? 1) === (b.alpha ?? 1) ? 0 : (a.alpha ?? 1) < (b.alpha ?? 1) ? 1 : -1);
    for (const item of this.queue) {
      const useTex = item.layer !== undefined;
      gl.uniform1f(P.uniforms.uUseTexture, useTex ? 1 : 0);
      gl.uniform1f(P.uniforms.uLayerOverride, useTex ? item.layer : -1);
      this.modelFor(item);
      gl.uniformMatrix4fv(P.uniforms.uModel, false, this.model);
      gl.uniform3fv(P.uniforms.uTint, item.color);
      gl.uniform1f(P.uniforms.uEmissive, item.emissive ?? 0);
      gl.uniform1f(P.uniforms.uAlpha, item.alpha ?? 1);
      const blended = item.alpha !== undefined && item.alpha < 1;
      if (blended) {
        gl.enable(gl.BLEND);
        gl.blendFunc(item.additive ? gl.SRC_ALPHA : gl.SRC_ALPHA, item.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      }
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES, item.mesh.count, gl.UNSIGNED_INT, 0);
      if (blended) {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
    }

    /* ---- rain, last, over everything ---- */
    if (L.rain) {
      const right = [
        this.view[0], this.view[4], this.view[8]      // camera right, from the view matrix
      ];
      this.rain.draw(this.viewProj, [target[0], target[1], target[2]], right, wind, time,
        L.rain.color, L.rain.streak);
    }
    gl.bindVertexArray(null);
  }

  modelFor(item) {
    if (item.rx || item.rz) {
      M.trsEuler(this.model, item.x, item.y, item.z, item.sx, item.sy, item.sz,
        item.rx ?? 0, item.rot ?? 0, item.rz ?? 0);
    } else {
      M.trs(this.model, item.x, item.y, item.z, item.sx, item.sy, item.sz, item.rot ?? 0);
    }
    return this.model;
  }

  /** Where a world direction lands on screen, for the sun glow. */
  projectDirection(dir) {
    const p = [this.eye[0] + dir[0] * 100, this.eye[1] + dir[1] * 100, this.eye[2] + dir[2] * 100];
    const m = this.viewProj;
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (Math.abs(w) < 1e-5) return [0, 2];
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
    const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    return [x, y];
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clearTo(color) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(color[0], color[1], color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
}

function dim(color, k) {
  return [color[0] * k, color[1] * k, color[2] * k];
}

/* ------------------------------------------------------- unit meshes -- */

function makeCube() {
  const g = new Geo();
  g.box(0, -0.5, 0, 1, 1, 1, { top: 0, side: 0 }, { uvScale: 1 });
  return g.finish();
}

function makeSphere() {
  const g = new Geo();
  g.sphere(0, 0, 0, 0.5, 0.5, 0.5, 0, { segments: 14, rings: 10, uvScale: 1 });
  return g.finish();
}

/**
 * A unit cylinder hanging from the origin: it runs from y = 0 down to y = -1,
 * so scaling it by a limb's length swings that limb about its joint.
 */
function makeCylinder(segments = 12) {
  const g = new Geo();
  const r = 0.5;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    g.quad(
      [[c0 * r, -1, s0 * r], [c1 * r, -1, s1 * r], [c1 * r, 0, s1 * r], [c0 * r, 0, s0 * r]],
      [(c0 + c1) / 2, 0, (s0 + s1) / 2],
      [[i / segments, 1], [(i + 1) / segments, 1], [(i + 1) / segments, 0], [i / segments, 0]],
      0
    );
  }
  // Rounded ends, so elbows and knees read as joints rather than as pipe cuts.
  g.sphere(0, 0, 0, r, r * 0.9, r, 0, { segments, rings: 5 });
  g.sphere(0, -1, 0, r, r * 0.9, r, 0, { segments, rings: 5 });
  return g.finish();
}
