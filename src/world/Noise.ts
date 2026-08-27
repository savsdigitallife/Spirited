/**
 * Deterministic, tileable value noise.
 *
 * Shared by terrain heightfields and procedural textures so that a given
 * seed always produces the same world. Tileability matters for textures —
 * a non-tiling noise map shows a visible seam every time it repeats across
 * a large ground plane.
 */

/** Integer hash. Cheap, no allocation, good enough for lattice noise. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise on a lattice that wraps every `period` cells. */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = wrap(xi);
  const y0 = wrap(yi);
  const x1 = wrap(xi + 1);
  const y1 = wrap(yi + 1);

  const v00 = hash(x0, y0, seed);
  const v10 = hash(x1, y0, seed);
  const v01 = hash(x0, y1, seed);
  const v11 = hash(x1, y1, seed);

  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = v00 + (v10 - v00) * u;
  const b = v01 + (v11 - v01) * u;
  return a + (b - a) * v;
}

export interface FbmOptions {
  octaves?: number;
  /** Amplitude multiplier per octave. */
  gain?: number;
  /** Frequency multiplier per octave. */
  lacunarity?: number;
  /** Lattice period at the base octave; keeps the result tileable. */
  period?: number;
  seed?: number;
}

/** Fractal sum of value noise, normalised to 0..1. */
export function fbm(x: number, y: number, options: FbmOptions = {}): number {
  const octaves = options.octaves ?? 4;
  const gain = options.gain ?? 0.5;
  const lacunarity = options.lacunarity ?? 2;
  const seed = options.seed ?? 1;
  let period = options.period ?? 8;

  let amplitude = 1;
  let total = 0;
  let norm = 0;
  let fx = x;
  let fy = y;

  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(fx, fy, period, seed + i * 101) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
    period = Math.max(1, Math.round(period * lacunarity));
  }
  return total / norm;
}

/** Ridged variant; good for rock strata and mountain silhouettes. */
export function ridge(x: number, y: number, options: FbmOptions = {}): number {
  return 1 - Math.abs(fbm(x, y, options) * 2 - 1);
}

/** Small, fast, seedable PRNG for scatter placement. */
export function makeRandom(seed: number): () => number {
  let state = (seed | 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}
