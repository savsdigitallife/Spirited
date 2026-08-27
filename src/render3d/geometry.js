// A tiny geometry buffer. Everything the world is made of gets pushed through
// these four calls: quad, box, sphere and crossed billboards.
//
// Vertex layout (11 floats): position, normal, uv, texture layer, AO, flags.

export const FLAG_WATER = 1;
export const FLAG_EMISSIVE = 2;
export const FLAG_SHORT = 8;      // low geometry, never hidden by the cutaway

export const VERTEX_FLOATS = 11;

export class Geo {
  constructor() {
    this.v = [];
    this.i = [];
    this.count = 0;
  }

  vertex(x, y, z, nx, ny, nz, u, vv, layer, ao, flags) {
    this.v.push(x, y, z, nx, ny, nz, u, vv, layer, ao, flags);
    return this.count++;
  }

  /** Four corners in counter-clockwise order, with per-corner AO. */
  quad(p, n, uv, layer, ao = [1, 1, 1, 1], flags = 0) {
    const base = this.count;
    for (let k = 0; k < 4; k++) {
      this.vertex(p[k][0], p[k][1], p[k][2], n[0], n[1], n[2], uv[k][0], uv[k][1], layer, ao[k], flags);
    }
    // Flip the split so the AO gradient doesn't crease the wrong way.
    if (ao[0] + ao[2] > ao[1] + ao[3]) {
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }

  /**
   * Axis-aligned box. `x`/`z` are the centre, `y` the base.
   * `faces` lets the caller skip sides that are buried in neighbours.
   */
  box(x, y, z, sx, sy, sz, layers, opts = {}) {
    const { faces = 0b111111, ao = 1, flags = 0, uvScale = 1, rot = 0 } = opts;
    const top = layers.top ?? layers.side;
    const side = layers.side ?? layers.top;
    const hx = sx / 2;
    const hz = sz / 2;
    const y0 = y;
    const y1 = y + sy;

    // Corner helper so a box can be spun about its own centre.
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const P = (dx, yy, dz) => [x + dx * c - dz * s, yy, z + dx * s + dz * c];
    const A = (nx, nz) => [nx * c - nz * s, 0, nx * s + nz * c];

    const w = sx * uvScale;
    const d = sz * uvScale;
    const h = sy * uvScale;
    const aos = [ao, ao, ao, ao];

    if (faces & 0b000001) { // top
      this.quad([P(-hx, y1, -hz), P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz)],
        [0, 1, 0], [[0, 0], [0, d], [w, d], [w, 0]], top, aos, flags);
    }
    if (faces & 0b000010) { // bottom
      this.quad([P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz)],
        [0, -1, 0], [[0, 0], [w, 0], [w, d], [0, d]], top, aos, flags);
    }
    if (faces & 0b000100) { // +z (south, toward camera)
      const n = A(0, 1);
      this.quad([P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz)],
        [n[0], 0, n[2]], [[0, h], [w, h], [w, 0], [0, 0]], side, aos, flags);
    }
    if (faces & 0b001000) { // -z (north)
      const n = A(0, -1);
      this.quad([P(hx, y0, -hz), P(-hx, y0, -hz), P(-hx, y1, -hz), P(hx, y1, -hz)],
        [n[0], 0, n[2]], [[0, h], [w, h], [w, 0], [0, 0]], side, aos, flags);
    }
    if (faces & 0b010000) { // +x (east)
      const n = A(1, 0);
      this.quad([P(hx, y0, hz), P(hx, y0, -hz), P(hx, y1, -hz), P(hx, y1, hz)],
        [n[0], 0, n[2]], [[0, h], [d, h], [d, 0], [0, 0]], side, aos, flags);
    }
    if (faces & 0b100000) { // -x (west)
      const n = A(-1, 0);
      this.quad([P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz)],
        [n[0], 0, n[2]], [[0, h], [d, h], [d, 0], [0, 0]], side, aos, flags);
    }
  }

  /** Low-poly sphere, for foliage and boulders. */
  sphere(x, y, z, rx, ry, rz, layer, opts = {}) {
    const { segments = 9, rings = 6, ao = 1, flags = 0, uvScale = 0.7 } = opts;
    const base = this.count;
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI;
      for (let s = 0; s <= segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        this.vertex(
          x + nx * rx, y + ny * ry, z + nz * rz,
          nx, ny, nz,
          (s / segments) * Math.PI * 2 * rx * uvScale, (r / rings) * Math.PI * ry * uvScale,
          layer, ao, flags
        );
      }
    }
    const stride = segments + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = base + r * stride + s;
        this.i.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      }
    }
  }

  finish() {
    return {
      data: new Float32Array(this.v),
      indices: new Uint32Array(this.i),
      vertices: this.count,
      triangles: this.i.length / 3
    };
  }
}
