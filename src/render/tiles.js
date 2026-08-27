// Tile painting. Every tile gets a flat base plus a few deterministic
// details, so the world has texture without any image assets.

import { TILE_SIZE, TILES } from '../world/tiles.js';
import { tileNoise } from '../core/rng.js';

const S = TILE_SIZE;

export function drawMap(ctx, area, cam, time) {
  const x0 = Math.max(0, Math.floor(cam.left / S));
  const y0 = Math.max(0, Math.floor(cam.top / S));
  const x1 = Math.min(area.w - 1, Math.ceil((cam.left + cam.w) / S));
  const y1 = Math.min(area.h - 1, Math.ceil((cam.top + cam.h) / S));

  ctx.fillStyle = area.edge;
  ctx.fillRect(0, 0, cam.w, cam.h);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const def = TILES[area.data[ty * area.w + tx]] ?? TILES[0];
      const px = tx * S - cam.left;
      const py = ty * S - cam.top;
      ctx.fillStyle = def.base;
      ctx.fillRect(px, py, S, S);
      // A whisper of per-tile shading; without it, big floors read as one flat fill.
      const v = tileNoise(tx, ty, 3);
      ctx.globalAlpha = 0.015 + v * 0.03;
      ctx.fillStyle = v > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(px, py, S, S);
      ctx.globalAlpha = 1;
      detail(ctx, def, px, py, tx, ty, time);
      // Give walls and buildings a lit top and a shadowed base wherever they
      // meet something else, so a block of solid tiles reads as a volume.
      if (def.solid && def.kind !== 'tree' && def.kind !== 'bush' && def.kind !== 'rock') {
        const above = ty > 0 ? area.data[(ty - 1) * area.w + tx] : -1;
        const below = ty < area.h - 1 ? area.data[(ty + 1) * area.w + tx] : -1;
        if (above !== def.id) {
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(px, py, S, 3);
        }
        if (below !== def.id) {
          ctx.fillStyle = 'rgba(0,0,0,0.42)';
          ctx.fillRect(px, py + S - 6, S, 6);
        }
      }
    }
  }
}

function detail(ctx, def, px, py, tx, ty, time) {
  const n = tileNoise(tx, ty);
  const m = tileNoise(tx, ty, 7);
  ctx.fillStyle = def.accent ?? def.base;

  switch (def.kind) {
    case 'grass':
      for (let i = 0; i < 3; i++) {
        const gx = px + ((n * 97 + i * 31) % 28) + 2;
        const gy = py + ((m * 89 + i * 17) % 28) + 2;
        ctx.fillRect(gx, gy, 2, 3);
      }
      break;
    case 'tall': {
      const sway = Math.sin(time * 1.6 + tx * 0.7 + ty * 0.3) * 1.6;
      for (let i = 0; i < 5; i++) {
        const gx = px + ((n * 131 + i * 23) % 28) + 2;
        ctx.fillRect(gx + sway * (i % 2 ? 1 : -1), py + 6 + (i % 3) * 4, 2, 12 - (i % 3) * 2);
      }
      break;
    }
    case 'flowers':
      for (let i = 0; i < 4; i++) {
        const gx = px + ((n * 71 + i * 29) % 26) + 3;
        const gy = py + ((m * 53 + i * 19) % 26) + 3;
        ctx.fillStyle = i % 2 ? def.accent : '#e8f0e0';
        ctx.fillRect(gx, gy, 3, 3);
      }
      break;
    case 'grit':
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.5;
        ctx.fillRect(px + ((n * 113 + i * 37) % 30), py + ((m * 79 + i * 41) % 30), 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    case 'road':
      ctx.globalAlpha = 0.35;
      ctx.fillRect(px, py + (n * 30 | 0), S, 1);
      ctx.globalAlpha = 1;
      break;
    case 'stripe':
      ctx.fillRect(px + 4, py, 10, S);
      ctx.fillRect(px + 20, py, 10, S);
      break;
    case 'panel':
      ctx.globalAlpha = 0.5;
      ctx.fillRect(px, py, S, 1);
      ctx.fillRect(px, py, 1, S);
      ctx.globalAlpha = 1;
      break;
    case 'plank':
      ctx.globalAlpha = 0.45;
      ctx.fillRect(px, py + 10, S, 2);
      ctx.fillRect(px, py + 22, S, 2);
      ctx.globalAlpha = 1;
      break;
    case 'tatami':
      ctx.globalAlpha = 0.4;
      ctx.fillRect(px + 1, py + 1, S - 2, 2);
      ctx.fillRect(px + 1, py + S - 3, S - 2, 2);
      ctx.globalAlpha = 1;
      break;
    case 'water': {
      const w = Math.sin(time * 1.4 + tx * 0.8 + ty * 0.5);
      ctx.globalAlpha = 0.35 + w * 0.15;
      ctx.fillRect(px + 3, py + 8 + w * 2, 12, 2);
      ctx.fillRect(px + 17, py + 20 - w * 2, 10, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case 'wall':
      ctx.globalAlpha = 0.6;
      ctx.fillRect(px, py + 15, S, 2);
      ctx.fillRect(px + (ty % 2 ? 8 : 22), py, 2, 15);
      ctx.globalAlpha = 1;
      break;
    case 'facade':
      ctx.globalAlpha = 0.55;
      ctx.fillRect(px + 2, py + 2, S - 4, S - 4);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#0d1018';
      ctx.fillRect(px, py + 16, S, 2);
      ctx.fillRect(px + (tx % 2 ? 6 : 20), py, 2, S);
      ctx.globalAlpha = 1;
      break;
    case 'window': {
      const lit = n > 0.45;
      ctx.fillStyle = lit ? def.accent : '#2f3648';
      ctx.fillRect(px + 5, py + 6, S - 10, S - 12);
      ctx.fillStyle = '#1b1f2b';
      ctx.fillRect(px + 5, py + 15, S - 10, 2);
      break;
    }
    case 'tree': {
      const sway = Math.sin(time * 0.9 + tx) * 1.5;
      ctx.fillStyle = '#3b2a1e';
      ctx.fillRect(px + 14, py + 18, 5, 14);
      ctx.fillStyle = def.accent;
      ctx.beginPath();
      ctx.ellipse(px + 16 + sway, py + 14, 15, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.base;
      ctx.beginPath();
      ctx.ellipse(px + 13 + sway, py + 11, 9, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bush':
      ctx.beginPath();
      ctx.ellipse(px + 16, py + 20, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rock':
      ctx.beginPath();
      ctx.moveTo(px + 6, py + 26);
      ctx.lineTo(px + 12, py + 8);
      ctx.lineTo(px + 24, py + 12);
      ctx.lineTo(px + 27, py + 26);
      ctx.closePath();
      ctx.fill();
      break;
    case 'paddy': {
      const w = Math.sin(time * 1.1 + tx * 0.6) * 1.2;
      ctx.fillStyle = def.accent;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          ctx.fillRect(px + 4 + i * 8 + w, py + 4 + j * 8, 2, 6);
        }
      }
      break;
    }
    case 'rail':
      ctx.fillStyle = '#5a5348';
      ctx.fillRect(px, py + 6, S, 4);
      ctx.fillRect(px, py + 22, S, 4);
      ctx.fillStyle = def.accent;
      ctx.fillRect(px + 4, py + 4, 3, 24);
      ctx.fillRect(px + 24, py + 4, 3, 24);
      break;
    case 'roof':
      ctx.fillRect(px, py, S, 12);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#2a1418';
      ctx.fillRect(px, py + 12, S, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = def.accent;
      for (let i = 0; i < 4; i++) ctx.fillRect(px + i * 8, py + 15, 6, 6);   // fringe
      ctx.fillStyle = '#f0e0c0';
      ctx.fillRect(px + 6, py + 3, 20, 5);                                   // paper strip
      break;
    case 'grate': {
      const glow = 0.4 + Math.sin(time * 3 + tx) * 0.25;
      ctx.fillStyle = def.accent;
      ctx.globalAlpha = glow;
      ctx.fillRect(px + 2, py + 2, S - 4, S - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#221c16';
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 2 + i * 8, py + 2, 3, S - 4);
      break;
    }
    case 'fence':
      ctx.fillRect(px + 3, py + 8, 3, 20);
      ctx.fillRect(px + 24, py + 8, 3, 20);
      ctx.fillRect(px, py + 12, S, 3);
      break;
    case 'shoji':
      ctx.fillStyle = def.accent;
      ctx.fillRect(px, py, S, 2);
      ctx.fillRect(px + 15, py, 2, S);
      ctx.fillRect(px, py + 15, S, 2);
      break;
    case 'cliff':
      ctx.globalAlpha = 0.7;
      ctx.fillRect(px, py, S, 3);
      ctx.fillRect(px + (n * 20 | 0), py + 6, 8, 20);
      ctx.globalAlpha = 1;
      break;
    default:
      break;
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------ lighting -- */

const TINTS = {
  morning:    ['rgba(255, 214, 150, 0.16)', 0],
  afternoon:  ['rgba(255, 236, 176, 0.10)', 0],
  dusk:       ['rgba(120, 82, 150, 0.24)', 0.25],
  night:      ['rgba(28, 34, 88, 0.42)', 0.45],
  dark:       ['rgba(6, 6, 12, 0.70)', 0.85],
  spiritdusk: ['rgba(90, 44, 120, 0.24)', 0.22],
  lamplight:  ['rgba(255, 168, 74, 0.16)', 0.18],
  ember:      ['rgba(255, 110, 40, 0.20)', 0.30],
  gold:       ['rgba(255, 196, 92, 0.20)', 0.22],
  lateblue:   ['rgba(60, 92, 150, 0.30)', 0.30],
  dawn:       ['rgba(255, 190, 190, 0.18)', 0.10]
};

export function drawTint(ctx, area, cam, focus) {
  const tint = TINTS[area.tint];
  if (!tint) return;
  const [color, vignette] = tint;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cam.w, cam.h);
  if (!vignette) return;

  // A soft pool of light around Aiko so dark places stay playable.
  const cx = focus.x - cam.left;
  const cy = focus.y - cam.top;
  const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(cam.w, cam.h) * 0.62);
  grad.addColorStop(0, `rgba(0,0,0,0)`);
  grad.addColorStop(1, `rgba(0,0,0,${vignette})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cam.w, cam.h);
}

/* ------------------------------------------------------------- weather -- */

const WEATHER = {
  city:    { count: 26, color: '#cfd6e0', size: 1, driftX: -14, driftY: 8, alpha: 0.25 },
  leaves:  { count: 30, color: '#c9a24a', size: 3, driftX: -22, driftY: 16, alpha: 0.75 },
  embers:  { count: 40, color: '#ffb26b', size: 2, driftX: 6, driftY: -22, alpha: 0.8 },
  petals:  { count: 44, color: '#f3cbd8', size: 3, driftX: -12, driftY: 12, alpha: 0.85 }
};

export class Weather {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.kind = null;
    this.bits = [];
  }

  set(kind) {
    if (this.kind === kind) return;
    this.kind = kind;
    const cfg = WEATHER[kind];
    this.bits = [];
    if (!cfg) return;
    for (let i = 0; i < cfg.count; i++) {
      this.bits.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        p: Math.random() * Math.PI * 2,
        s: 0.6 + Math.random() * 0.9
      });
    }
  }

  update(dt) {
    const cfg = WEATHER[this.kind];
    if (!cfg) return;
    for (const b of this.bits) {
      b.p += dt * 2;
      b.x += (cfg.driftX + Math.sin(b.p) * 10) * dt * b.s;
      b.y += cfg.driftY * dt * b.s;
      if (b.x < -10) b.x = this.w + 10;
      if (b.x > this.w + 10) b.x = -10;
      if (b.y < -10) b.y = this.h + 10;
      if (b.y > this.h + 10) b.y = -10;
    }
  }

  draw(ctx) {
    const cfg = WEATHER[this.kind];
    if (!cfg) return;
    ctx.globalAlpha = cfg.alpha;
    ctx.fillStyle = cfg.color;
    for (const b of this.bits) {
      ctx.fillRect(b.x | 0, b.y | 0, cfg.size, cfg.size + (this.kind === 'city' ? 4 : 0));
    }
    ctx.globalAlpha = 1;
  }
}
