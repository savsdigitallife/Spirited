// Player and NPC movement. Collision is a small box around the feet so
// Aiko's head can overlap the scenery she walks behind.

import { TILE_SIZE, isSolidTile } from '../world/tiles.js';
import { tileAt, speedAtPixel } from '../world/mapbuilder.js';

const HALF_W = 8;
const FOOT_H = 6;
const WALK_SPEED = 96;

export function boxBlocked(area, x, y, blockers = []) {
  const left = x - HALF_W;
  const right = x + HALF_W - 1;
  const top = y - FOOT_H;
  const bottom = y + FOOT_H - 1;

  for (const [px, py] of [[left, top], [right, top], [left, bottom], [right, bottom], [x, bottom]]) {
    if (isSolidTile(tileAt(area, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)))) return true;
  }
  for (const b of blockers) {
    if (right >= b.x - b.hw && left <= b.x + b.hw && bottom >= b.y - b.hh && top <= b.y + b.hh) return true;
  }
  return false;
}

export class Player {
  constructor(x, y, dir = 'down') {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.walk = 0;
    this.moving = false;
    this.stepAccum = 0;
  }

  placeAt(x, y, dir) {
    this.x = x;
    this.y = y;
    if (dir) this.dir = dir;
    this.walk = 0;
    this.moving = false;
  }

  update(dt, axis, area, blockers, onStep) {
    let { x: ax, y: ay } = axis;
    this.moving = ax !== 0 || ay !== 0;
    if (!this.moving) {
      this.walk *= 0.7;
      return;
    }
    if (ax && ay) {
      const inv = Math.SQRT1_2;
      ax *= inv;
      ay *= inv;
    }
    // Face the dominant axis, preferring the newly pressed direction.
    if (Math.abs(ax) > Math.abs(ay)) this.dir = ax < 0 ? 'left' : 'right';
    else if (ay !== 0) this.dir = ay < 0 ? 'up' : 'down';

    const speed = WALK_SPEED * speedAtPixel(area, this.x, this.y);
    const nx = this.x + ax * speed * dt;
    const ny = this.y + ay * speed * dt;

    if (!boxBlocked(area, nx, this.y, blockers)) this.x = nx;
    if (!boxBlocked(area, this.x, ny, blockers)) this.y = ny;

    this.x = Math.max(HALF_W, Math.min(area.w * TILE_SIZE - HALF_W, this.x));
    this.y = Math.max(FOOT_H, Math.min(area.h * TILE_SIZE - FOOT_H, this.y));

    this.walk += dt * 9;
    this.stepAccum += dt * speed;
    if (this.stepAccum > 26) {
      this.stepAccum = 0;
      onStep?.();
    }
  }

  // The tile-ish point Aiko is reaching towards when she presses the action key.
  facing(distance = 22) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
    return { x: this.x + d[0] * distance, y: this.y + d[1] * distance };
  }
}

export class Npc {
  constructor(def) {
    Object.assign(this, def);
    this.homeX = def.x;
    this.homeY = def.y;
    this.walk = 0;
    this.timer = 1 + Math.random() * 2;
    this.vx = 0;
    this.vy = 0;
    this.hw = 9;
    this.hh = 7;
  }

  update(dt, area, blockers) {
    if (!this.wander) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.2 + Math.random() * 2.6;
      if (Math.random() < 0.45) {
        this.vx = 0;
        this.vy = 0;
      } else {
        const dir = Math.floor(Math.random() * 4);
        this.vx = [0, 0, -1, 1][dir];
        this.vy = [-1, 1, 0, 0][dir];
        this.dir = ['up', 'down', 'left', 'right'][dir];
      }
    }
    if (!this.vx && !this.vy) {
      this.walk *= 0.8;
      return;
    }
    const speed = 34;
    const nx = this.x + this.vx * speed * dt;
    const ny = this.y + this.vy * speed * dt;
    const range = this.wander * TILE_SIZE;
    const others = blockers.filter((b) => b.owner !== this);
    if (Math.abs(nx - this.homeX) < range && !boxBlocked(area, nx, this.y, others)) this.x = nx;
    else this.vx = 0;
    if (Math.abs(ny - this.homeY) < range && !boxBlocked(area, this.x, ny, others)) this.y = ny;
    else this.vy = 0;
    this.walk += dt * 7;
  }

  faceTowards(target) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx < 0 ? 'left' : 'right';
    else this.dir = dy < 0 ? 'up' : 'down';
  }
}
