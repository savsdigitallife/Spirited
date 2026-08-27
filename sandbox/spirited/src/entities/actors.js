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

/**
 * An NPC with somewhere to be.
 *
 * `life` picks the behaviour: a commuter walks a route and keeps walking, a
 * shopkeeper works at a spot, a cat sleeps until it decides not to. Everyone
 * has their own pace and their own pauses, so a street reads as a street and
 * not as a screensaver.
 */
export class Npc {
  constructor(def) {
    Object.assign(this, def);
    this.homeX = def.x;
    this.homeY = def.y;
    this.walk = 0;
    this.timer = 0.5 + Math.random() * 2.5;
    this.vx = 0;
    this.vy = 0;
    this.hw = 9;
    this.hh = 7;
    this.life = def.life ?? (def.wander ? 'wander' : 'idle');
    this.speed = def.speed ?? LIFE_SPEED[this.life] ?? 34;
    this.leg = 0;
    // A route is given in tiles; walk it in order, then start again.
    this.route = (def.route ?? []).map(([tx, ty]) => ({
      x: tx * TILE_SIZE + TILE_SIZE / 2,
      y: ty * TILE_SIZE + TILE_SIZE / 2
    }));
    this.pause = 0;
  }

  get moving() {
    return Boolean(this.vx || this.vy);
  }

  update(dt, area, blockers) {
    const others = blockers.filter((b) => b.owner !== this);
    switch (this.life) {
      case 'patrol':
      case 'commute':
        this.followRoute(dt, area, others);
        break;
      case 'work':
        this.doWork(dt);
        break;
      case 'cat':
        this.beACat(dt, area, others);
        break;
      case 'peck':
      case 'graze':
        this.forage(dt, area, others);
        break;
      case 'wander':
        this.roam(dt, area, others);
        break;
      default:
        this.standAbout(dt);
        break;
    }
  }

  /* ------------------------------------------------------------ moods -- */

  standAbout(dt) {
    this.walk *= 0.86;
    this.vx = 0;
    this.vy = 0;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 2.5 + Math.random() * 5;
      // A glance somewhere else: people do not hold one pose for ever.
      if (Math.random() < 0.7) {
        this.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
      }
    }
  }

  doWork(dt) {
    this.vx = 0;
    this.vy = 0;
    // Busy hands: a small constant animation rather than a walk cycle.
    this.walk += dt * 3.4;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 3 + Math.random() * 4;
      if (Math.random() < 0.35) this.dir = Math.random() < 0.5 ? 'left' : 'right';
    }
  }

  followRoute(dt, area, blockers) {
    if (!this.route.length) return this.roam(dt, area, blockers);
    if (this.pause > 0) {
      this.pause -= dt;
      this.vx = 0;
      this.vy = 0;
      this.walk *= 0.86;
      return;
    }
    const goal = this.route[this.leg % this.route.length];
    const dx = goal.x - this.x;
    const dy = goal.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      this.leg++;
      this.pause = this.life === 'commute' ? 0.1 : 0.8 + Math.random() * 2.5;
      return;
    }
    this.vx = dx / dist;
    this.vy = dy / dist;
    this.face(this.vx, this.vy);
    this.step(dt, area, blockers, this.speed);
  }

  roam(dt, area, blockers) {
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
    this.step(dt, area, blockers, this.speed, (this.wander ?? 3) * TILE_SIZE);
  }

  forage(dt, area, blockers) {
    // Two steps, a long pause, head down. Chickens and goats both do this.
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.life === 'peck' ? 0.6 + Math.random() * 2.2 : 2 + Math.random() * 4;
      if (Math.random() < 0.55) {
        this.vx = 0;
        this.vy = 0;
        this.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
      } else {
        const a = Math.random() * Math.PI * 2;
        this.vx = Math.cos(a);
        this.vy = Math.sin(a);
        this.face(this.vx, this.vy);
      }
    }
    if (!this.vx && !this.vy) {
      this.walk *= 0.7;
      return;
    }
    this.step(dt, area, blockers, this.speed, (this.wander ?? 2) * TILE_SIZE);
  }

  beACat(dt, area, blockers) {
    this.timer -= dt;
    if (this.timer <= 0) {
      // Mostly asleep; occasionally somewhere else entirely.
      const nap = Math.random() < 0.6;
      this.timer = nap ? 5 + Math.random() * 9 : 1.5 + Math.random() * 2;
      if (nap) {
        this.vx = 0;
        this.vy = 0;
      } else {
        const a = Math.random() * Math.PI * 2;
        this.vx = Math.cos(a);
        this.vy = Math.sin(a);
        this.face(this.vx, this.vy);
      }
    }
    if (!this.vx && !this.vy) {
      this.walk *= 0.8;
      return;
    }
    this.step(dt, area, blockers, this.speed, (this.wander ?? 4) * TILE_SIZE);
  }

  /* ------------------------------------------------------------ motion -- */

  face(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx < 0 ? 'left' : 'right';
    else this.dir = dy < 0 ? 'up' : 'down';
  }

  step(dt, area, blockers, speed, leash = Infinity) {
    const nx = this.x + this.vx * speed * dt;
    const ny = this.y + this.vy * speed * dt;
    let moved = false;
    if (Math.abs(nx - this.homeX) < leash && !boxBlocked(area, nx, this.y, blockers)) {
      this.x = nx;
      moved = true;
    } else {
      this.vx = 0;
    }
    if (Math.abs(ny - this.homeY) < leash && !boxBlocked(area, this.x, ny, blockers)) {
      this.y = ny;
      moved = true;
    } else {
      this.vy = 0;
    }
    // Walked into something: pick a new idea next tick rather than shoving.
    if (!moved) this.timer = Math.min(this.timer, 0.2);
    this.walk += dt * (speed / 5);
  }

  faceTowards(target) {
    this.face(target.x - this.x, target.y - this.y);
  }
}

const LIFE_SPEED = {
  idle: 0, work: 0, wander: 34, patrol: 38, commute: 62, cat: 26, peck: 22, graze: 18
};
