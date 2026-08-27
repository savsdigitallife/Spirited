// Procedural material textures, drawn onto canvases at load time and uploaded
// as one 2D array texture. Still no asset files — just noise, grain and grout.

import { makeRng } from '../core/rng.js';

const SIZE = 128;

function surface() {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function fill(g, color) {
  g.fillStyle = color;
  g.fillRect(0, 0, SIZE, SIZE);
}

/** Speckled grain: the base of nearly every natural material. */
function grain(g, rng, count, colors, min = 1, max = 3) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(rng() * colors.length) | 0];
    const s = min + rng() * (max - min);
    g.fillRect(rng() * SIZE, rng() * SIZE, s, s);
  }
}

/** Soft blotches, for moss, rust, damp and worn paint. */
function blotches(g, rng, count, color, radius, alpha = 0.25) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rng() * SIZE;
    const y = rng() * SIZE;
    const r = radius * (0.4 + rng());
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Horizontal boards with a dark seam and lengthwise grain. */
function planks(g, rng, base, dark, light, rows = 4) {
  fill(g, base);
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    g.fillStyle = rng() > 0.5 ? light : base;
    g.globalAlpha = 0.25;
    g.fillRect(0, y, SIZE, h);
    g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) {                 // grain lines
      g.globalAlpha = 0.05 + rng() * 0.1;
      g.fillStyle = rng() > 0.5 ? dark : light;
      const gy = y + rng() * h;
      g.fillRect(rng() * SIZE, gy, 12 + rng() * 40, 1);
    }
    g.globalAlpha = 1;
    g.fillStyle = dark;
    g.fillRect(0, y, SIZE, 1.5);
  }
}

/** A grid of slabs with grout between them. */
function slabs(g, rng, base, grout, cols = 4, rows = 4, jitter = 0.12) {
  fill(g, grout);
  const w = SIZE / cols;
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shade = 1 + (rng() - 0.5) * jitter * 2;
      g.fillStyle = shift(base, shade);
      g.fillRect(c * w + 1, r * h + 1, w - 2, h - 2);
    }
  }
}

function shift(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
  const gg = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
  return `rgb(${r},${gg},${b})`;
}

/* ------------------------------------------------------------ materials -- */
// Each entry draws one 128×128 tile that repeats seamlessly enough at a
// distance. Order defines the layer index used by the mesh builder.

const RECIPES = {
  grass(g, rng) {
    fill(g, '#4a6b39');
    blotches(g, rng, 26, '#5c8046', 22, 0.5);
    blotches(g, rng, 18, '#3d5c30', 18, 0.4);
    grain(g, rng, 2600, ['#5f8a49', '#41632f', '#6d9550', '#37522a'], 1, 3);
  },
  meadow(g, rng) {
    fill(g, '#57783f');
    blotches(g, rng, 22, '#6c9450', 24, 0.45);
    grain(g, rng, 2400, ['#78a05a', '#4a6a36', '#87ad63'], 1, 3);
  },
  moss(g, rng) {
    fill(g, '#3d5b3c');
    blotches(g, rng, 30, '#4e7148', 20, 0.5);
    grain(g, rng, 2600, ['#547a4c', '#334c33', '#5f8656'], 1, 2);
  },
  dirt(g, rng) {
    fill(g, '#7a6146');
    blotches(g, rng, 22, '#8a7052', 20, 0.4);
    blotches(g, rng, 16, '#634d38', 16, 0.4);
    grain(g, rng, 3000, ['#8d7454', '#6a543c', '#9a8060'], 1, 3);
  },
  mud(g, rng) {
    fill(g, '#4f4034');
    blotches(g, rng, 20, '#5e4c3c', 22, 0.45);
    grain(g, rng, 2000, ['#5a4839', '#42352b'], 1, 3);
  },
  gravel(g, rng) {
    fill(g, '#7d786c');
    for (let i = 0; i < 900; i++) {
      g.fillStyle = ['#8f8a7c', '#6b6659', '#9c9788', '#5d594e'][(rng() * 4) | 0];
      const s = 2 + rng() * 4;
      g.beginPath();
      g.ellipse(rng() * SIZE, rng() * SIZE, s, s * 0.75, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  ash(g, rng) {
    fill(g, '#3f3a34');
    blotches(g, rng, 24, '#4c463e', 18, 0.4);
    grain(g, rng, 2200, ['#4a443c', '#332f2a', '#575046'], 1, 3);
  },
  asphalt(g, rng) {
    fill(g, '#2f3036');
    grain(g, rng, 4000, ['#3a3b42', '#26272c', '#43444b'], 1, 2);
    blotches(g, rng, 8, '#1f2025', 26, 0.25);
  },
  crosswalk(g, rng) {
    fill(g, '#2f3036');
    grain(g, rng, 2000, ['#3a3b42', '#26272c'], 1, 2);
    g.fillStyle = '#d8d4c6';
    g.fillRect(10, 0, 34, SIZE);
    g.fillRect(74, 0, 34, SIZE);
    g.globalAlpha = 0.18;                          // worn paint
    g.fillStyle = '#2f3036';
    grain(g, rng, 900, ['#2f3036'], 1, 4);
    g.globalAlpha = 1;
  },
  concrete(g, rng) {
    slabs(g, rng, '#8b877f', '#6e6a63', 2, 2, 0.08);
    grain(g, rng, 2200, ['#949088', '#7e7a72'], 1, 2);
    blotches(g, rng, 10, '#6f6b64', 18, 0.16);
  },
  stone(g, rng) {
    slabs(g, rng, '#6c6862', '#4c4944', 3, 3, 0.14);
    grain(g, rng, 2400, ['#787369', '#5d5a54'], 1, 2);
  },
  cliff(g, rng) {
    fill(g, '#4b453d');
    for (let i = 0; i < 60; i++) {
      g.fillStyle = ['#565046', '#3e3931', '#605949'][(rng() * 3) | 0];
      g.fillRect(rng() * SIZE, rng() * SIZE, 8 + rng() * 30, 4 + rng() * 14);
    }
    grain(g, rng, 1800, ['#5b5449', '#38332c'], 1, 3);
  },
  rock(g, rng) {
    fill(g, '#615d57');
    blotches(g, rng, 18, '#6f6a63', 20, 0.4);
    grain(g, rng, 1600, ['#726d65', '#4f4b46'], 1, 3);
  },
  plaster(g, rng) {
    fill(g, '#b9b0a0');
    blotches(g, rng, 16, '#c6bdac', 22, 0.3);
    grain(g, rng, 1800, ['#c2b9a8', '#aaa192'], 1, 2);
  },
  building(g, rng) {
    fill(g, '#8d8b86');
    slabs(g, rng, '#8d8b86', '#74726d', 2, 4, 0.06);
    grain(g, rng, 1400, ['#96948e', '#807e79'], 1, 2);
  },
  windowGlass(g, rng) {
    fill(g, '#2b3440');
    g.fillStyle = '#3d4b5c';
    g.fillRect(6, 6, 50, 50);
    g.fillRect(70, 6, 50, 50);
    g.fillRect(6, 70, 50, 50);
    g.fillRect(70, 70, 50, 50);
    g.globalAlpha = 0.35;                          // sky reflected in the glass
    g.fillStyle = '#9fc0d8';
    g.fillRect(6, 6, 50, 22);
    g.fillRect(70, 6, 50, 22);
    g.fillRect(6, 70, 50, 22);
    g.fillRect(70, 70, 50, 22);
    g.globalAlpha = 1;
    grain(g, rng, 300, ['#33404e'], 1, 2);
  },
  plank(g, rng) { planks(g, rng, '#7a5533', '#4f3720', '#96693f', 4); },
  deck(g, rng) { planks(g, rng, '#8a5b3c', '#573726', '#a46f49', 5); },
  bark(g, rng) {
    fill(g, '#4a3527');
    for (let i = 0; i < 90; i++) {
      g.fillStyle = ['#573e2d', '#3b2a1e', '#634733'][(rng() * 3) | 0];
      g.fillRect(rng() * SIZE, rng() * SIZE, 2 + rng() * 5, 14 + rng() * 40);
    }
  },
  foliage(g, rng) {
    fill(g, '#39602f');
    blotches(g, rng, 40, '#47763a', 16, 0.55);
    blotches(g, rng, 26, '#2c4a25', 14, 0.5);
    grain(g, rng, 2600, ['#4e8040', '#2f5228', '#5b9049'], 2, 4);
  },
  tatami(g, rng) {
    fill(g, '#cbb173');
    for (let i = 0; i < SIZE; i += 2) {             // woven rush
      g.globalAlpha = 0.16;
      g.fillStyle = i % 4 ? '#a89561' : '#d4c28c';
      g.fillRect(0, i, SIZE, 1);
      g.globalAlpha = 1;
    }
    grain(g, rng, 1200, ['#cdbb84', '#b3a06c'], 1, 2);
    g.fillStyle = '#3f4636';                        // cloth binding
    g.fillRect(0, 0, SIZE, 5);
    g.fillRect(0, SIZE - 5, SIZE, 5);
  },
  carpet(g, rng) {
    fill(g, '#7c2733');
    blotches(g, rng, 22, '#8d2f3d', 20, 0.4);
    grain(g, rng, 3000, ['#8a2c39', '#6b1f2a', '#98343f'], 1, 2);
  },
  lacquer(g, rng) {
    fill(g, '#43202a');
    blotches(g, rng, 10, '#4f2833', 24, 0.3);
    grain(g, rng, 700, ['#4c2530', '#391a23'], 1, 2);
  },
  bathTile(g, rng) {
    slabs(g, rng, '#6d7f84', '#4d5b60', 4, 4, 0.1);
    blotches(g, rng, 14, '#7d8f94', 10, 0.25);
  },
  shoji(g, rng) {
    fill(g, '#ded3ba');
    grain(g, rng, 900, ['#e5dcc6', '#d2c7ae'], 1, 2);
    g.fillStyle = '#6f5f45';                        // lattice
    for (let i = 0; i <= 3; i++) {
      g.fillRect((i * SIZE) / 3 - 2, 0, 4, SIZE);
      g.fillRect(0, (i * SIZE) / 3 - 2, SIZE, 4);
    }
  },
  roofTile(g, rng) {
    fill(g, '#7c2b28');
    for (let r = 0; r < 5; r++) {
      const y = (r * SIZE) / 5;
      g.fillStyle = shift('#8d322e', 1 + (rng() - 0.5) * 0.14);
      g.fillRect(0, y, SIZE, SIZE / 5 - 2);
      g.fillStyle = '#511b1a';
      g.fillRect(0, y + SIZE / 5 - 3, SIZE, 3);
    }
    grain(g, rng, 800, ['#9a3a34', '#6b2422'], 1, 2);
  },
  metal(g, rng) {
    fill(g, '#4a4640');
    grain(g, rng, 2200, ['#585349', '#3c3833', '#655f53'], 1, 3);
    blotches(g, rng, 12, '#7a4a2a', 12, 0.28);      // rust
  },
  grate(g, rng) {
    fill(g, '#241d18');
    g.fillStyle = '#c2551f';
    for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 4, 0, 18, SIZE);
    g.fillStyle = '#191310';
    for (let i = 0; i < 5; i++) g.fillRect(i * 32 - 4, 0, 10, SIZE);
    grain(g, rng, 600, ['#3a2d22'], 1, 2);
  },
  water(g, rng) {
    fill(g, '#24506e');
    blotches(g, rng, 30, '#2f6489', 20, 0.4);
    blotches(g, rng, 20, '#1b3f5a', 16, 0.4);
    grain(g, rng, 1200, ['#356e94', '#1f4763'], 2, 4);
  },
  greenWater(g, rng) {
    fill(g, '#2f6b68');
    blotches(g, rng, 26, '#3d8480', 20, 0.4);
    grain(g, rng, 1000, ['#43918c', '#265854'], 2, 4);
  },
  marshWater(g, rng) {
    fill(g, '#3f5a4e');
    blotches(g, rng, 26, '#4c6b5c', 18, 0.4);
    grain(g, rng, 1200, ['#547a68', '#33493f'], 2, 4);
  },
  paddyWater(g, rng) {
    fill(g, '#48604a');
    blotches(g, rng, 22, '#57724f', 18, 0.4);
    grain(g, rng, 1400, ['#5f7c53', '#3c5040'], 2, 4);
  }
};

export const MATERIAL_NAMES = Object.keys(RECIPES);
export const MATERIAL = Object.fromEntries(MATERIAL_NAMES.map((n, i) => [n, i]));
export const TEXTURE_SIZE = SIZE;

export function buildTextureLayers() {
  return MATERIAL_NAMES.map((name) => {
    const { c, g } = surface();
    RECIPES[name](g, makeRng(`tex:${name}`));
    return g.getImageData(0, 0, SIZE, SIZE);
  });
}
