// Maps are drawn in code rather than stored as giant arrays: a Draft is a
// grid plus the handful of stamp operations every area needs.

import { T, TILE_SIZE, isSolidTile, tileSpeed } from './tiles.js';
import { makeRng } from '../core/rng.js';

export class Draft {
  constructor(w, h, fillTile = T.grass) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h).fill(fillTile);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    return this.inside(x, y) ? this.data[y * this.w + x] : T.void;
  }

  set(x, y, t) {
    if (this.inside(x, y)) this.data[y * this.w + x] = t;
    return this;
  }

  fill(x, y, w, h, t) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, t);
    return this;
  }

  outline(x, y, w, h, t) {
    for (let i = x; i < x + w; i++) { this.set(i, y, t); this.set(i, y + h - 1, t); }
    for (let j = y; j < y + h; j++) { this.set(x, j, t); this.set(x + w - 1, j, t); }
    return this;
  }

  border(t, thickness = 1) {
    for (let k = 0; k < thickness; k++) this.outline(k, k, this.w - k * 2, this.h - k * 2, t);
    return this;
  }

  hline(x1, x2, y, t, thickness = 1) {
    const [a, b] = x1 <= x2 ? [x1, x2] : [x2, x1];
    for (let i = a; i <= b; i++) for (let k = 0; k < thickness; k++) this.set(i, y + k, t);
    return this;
  }

  vline(y1, y2, x, t, thickness = 1) {
    const [a, b] = y1 <= y2 ? [y1, y2] : [y2, y1];
    for (let j = a; j <= b; j++) for (let k = 0; k < thickness; k++) this.set(x + k, j, t);
    return this;
  }

  // Scatter `n` tiles of `t` onto any of `onto`, never onto anything else.
  scatter(rng, t, n, onto, avoid = []) {
    let tries = n * 40;
    let placed = 0;
    while (placed < n && tries-- > 0) {
      const x = Math.floor(rng() * this.w);
      const y = Math.floor(rng() * this.h);
      const here = this.get(x, y);
      if (!onto.includes(here)) continue;
      if (avoid.some(([ax, ay, aw, ah]) => x >= ax && y >= ay && x < ax + aw && y < ay + ah)) continue;
      this.set(x, y, t);
      placed++;
    }
    return this;
  }

  // A soft blob, for ponds and clearings.
  blob(cx, cy, radius, t, rng) {
    for (let j = -radius - 1; j <= radius + 1; j++) {
      for (let i = -radius - 1; i <= radius + 1; i++) {
        const d = Math.hypot(i, j) + (rng() - 0.5) * 1.4;
        if (d <= radius) this.set(cx + i, cy + j, t);
      }
    }
    return this;
  }
}

/**
 * Assemble a finished area from a Draft plus its contents.
 * Everything the rest of the game needs to know about a place lives here.
 */
export function makeArea(id, cfg) {
  const rng = makeRng(`area:${id}`);
  const draft = cfg.build(new Draft(cfg.w, cfg.h, cfg.fill ?? T.grass), rng);
  return {
    id,
    name: cfg.name,
    region: cfg.region ?? 'tokyo',
    w: cfg.w,
    h: cfg.h,
    data: draft.data,
    spirit: cfg.spirit ?? false,
    indoors: cfg.indoors ?? false,
    tint: cfg.tint ?? null,
    music: cfg.music ?? 'town',
    weather: cfg.weather ?? null,
    npcs: cfg.npcs ?? [],
    props: cfg.props ?? [],
    portals: cfg.portals ?? [],
    triggers: cfg.triggers ?? [],
    onEnter: cfg.onEnter ?? null,
    edge: cfg.edge ?? '#05060a'
  };
}

/* -------------------------------------------------------------- queries -- */

export function tileAt(area, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= area.w || ty >= area.h) return T.void;
  return area.data[ty * area.w + tx];
}

export function solidAtPixel(area, px, py) {
  return isSolidTile(tileAt(area, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)));
}

export function speedAtPixel(area, px, py) {
  return tileSpeed(tileAt(area, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)));
}

// Grid helper for authoring: tile coords -> pixel centre.
export function tp(tx, ty) {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}
