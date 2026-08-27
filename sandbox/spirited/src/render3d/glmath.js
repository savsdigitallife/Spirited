// Just enough linear algebra for one renderer. Column-major, like GL wants.

export function mat4() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function identity(out) {
  out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return out;
}

export function multiply(out, a, b) {
  const o = out === a || out === b ? new Float32Array(16) : out;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  if (o !== out) out.set(o);
  return out;
}

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out.set([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ]);
  return out;
}

export function ortho(out, l, r, b, t, near, far) {
  out.set([
    2 / (r - l), 0, 0, 0,
    0, 2 / (t - b), 0, 0,
    0, 0, -2 / (far - near), 0,
    -(r + l) / (r - l), -(t + b) / (t - b), -(far + near) / (far - near), 1
  ]);
  return out;
}

export function lookAt(out, eye, target, up = [0, 1, 0]) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out.set([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1
  ]);
  return out;
}

/** Model matrix for an axis-aligned box: translate, scale, then spin about Y. */
export function trs(out, tx, ty, tz, sx, sy, sz, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  out.set([
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    tx, ty, tz, 1
  ]);
  return out;
}

export function normalMatrixFromTrs(out, sx, sy, sz, ry = 0) {
  // Uniform-ish scales only, which is all this renderer uses: invert the scale
  // and keep the rotation.
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const ix = 1 / (sx || 1);
  const iy = 1 / (sy || 1);
  const iz = 1 / (sz || 1);
  out.set([
    c * ix, 0, -s * ix, 0,
    0, iy, 0, 0,
    s * iz, 0, c * iz, 0,
    0, 0, 0, 1
  ]);
  return out;
}

/** Full euler transform, for limbs that have to bend at a joint. */
export function trsEuler(out, tx, ty, tz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx1 = Math.sin(rx);
  const cy = Math.cos(ry), sy1 = Math.sin(ry);
  const cz = Math.cos(rz), sz1 = Math.sin(rz);
  // R = Ry * Rx * Rz — yaw, then pitch, then roll.
  const m00 = cy * cz + sy1 * sx1 * sz1;
  const m01 = cx * sz1;
  const m02 = -sy1 * cz + cy * sx1 * sz1;
  const m10 = -cy * sz1 + sy1 * sx1 * cz;
  const m11 = cx * cz;
  const m12 = sy1 * sz1 + cy * sx1 * cz;
  const m20 = sy1 * cx;
  const m21 = -sx1;
  const m22 = cy * cx;
  out.set([
    m00 * sx, m01 * sx, m02 * sx, 0,
    m10 * sy, m11 * sy, m12 * sy, 0,
    m20 * sz, m21 * sz, m22 * sz, 0,
    tx, ty, tz, 1
  ]);
  return out;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
