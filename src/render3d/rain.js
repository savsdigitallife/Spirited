// Rain. One static mesh of streaks living in a cell that follows the camera;
// the vertex shader scrolls them downward and wraps them, so the whole storm
// is a single draw call.

import { program } from './glcore.js';

const DROPS = 2000;
const CELL = 30;          // metres across, centred on the player
const FALL = 16;          // how far a drop falls before it wraps

const VS = `#version 300 es
in vec3 aCell;            // 0..1 position within the falling volume
in vec2 aCorner;          // -1/+1 across, 0/1 along the streak
in float aSeed;

uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform vec3 uRight;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uTime;
uniform float uLength;

out float vAlpha;

void main() {
  float speed = 18.0 + aSeed * 10.0;
  float y = FALL_HEIGHT - mod(aCell.y * FALL_HEIGHT + uTime * speed, FALL_HEIGHT);

  vec3 base = vec3(
    uCenter.x + (aCell.x - 0.5) * CELL_SIZE,
    uCenter.y + y,
    uCenter.z + (aCell.z - 0.5) * CELL_SIZE
  );
  // Slant with the wind, and more so the further it has fallen.
  base.xz += uWindDir * (FALL_HEIGHT - y) * uWindStrength * 0.5;

  vec3 along = normalize(vec3(uWindDir.x * uWindStrength * 3.0, -1.0, uWindDir.y * uWindStrength * 3.0));
  vec3 pos = base
    + uRight * aCorner.x * 0.012
    + along * aCorner.y * uLength * (0.7 + aSeed * 0.6);

  // Fade the nearest drops out so they do not smear across the lens.
  float dist = length(pos - uCenter);
  vAlpha = clamp((dist - 1.2) / 3.0, 0.0, 1.0) * (0.16 + aSeed * 0.22);

  gl_Position = uViewProj * vec4(pos, 1.0);
}
`.replace(/FALL_HEIGHT/g, FALL.toFixed(1)).replace(/CELL_SIZE/g, CELL.toFixed(1));

const FS = `#version 300 es
precision mediump float;
in float vAlpha;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, vAlpha);
}
`;

export class Rain {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, VS, FS, { aCell: 0, aCorner: 1, aSeed: 2 });

    const verts = [];
    const indices = [];
    for (let i = 0; i < DROPS; i++) {
      const cx = Math.random();
      const cy = Math.random();
      const cz = Math.random();
      const seed = Math.random();
      const base = i * 4;
      for (const [ox, oy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        verts.push(cx, cy, cz, ox, oy, seed);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const stride = 6 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = indices.length;
  }

  draw(viewProj, center, right, wind, time, color, streak) {
    const gl = this.gl;
    gl.useProgram(this.prog.prog);
    gl.uniformMatrix4fv(this.prog.uniforms.uViewProj, false, viewProj);
    gl.uniform3fv(this.prog.uniforms.uCenter, center);
    gl.uniform3fv(this.prog.uniforms.uRight, right);
    gl.uniform2fv(this.prog.uniforms.uWindDir, wind.dir);
    gl.uniform1f(this.prog.uniforms.uWindStrength, wind.strength);
    gl.uniform1f(this.prog.uniforms.uTime, time);
    gl.uniform1f(this.prog.uniforms.uLength, streak);
    gl.uniform3fv(this.prog.uniforms.uColor, color);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
