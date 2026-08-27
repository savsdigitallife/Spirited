// Small deterministic PRNG (mulberry32) + string hashing.
// Determinism matters: world decoration is generated at load time, and a
// re-entered area must look exactly the way the player left it.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

// Stable per-tile noise, used for grass tufts, road cracks, etc.
export function tileNoise(x, y, salt = 0) {
  let h = hashString(`${x},${y},${salt}`);
  return (h >>> 8) / 16777216;
}
