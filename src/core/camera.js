// Follows the player with a little lag, and never shows the outside of a map
// unless the map is smaller than the screen.

import { TILE_SIZE } from '../world/tiles.js';

export class Camera {
  constructor(viewW, viewH) {
    this.w = viewW;
    this.h = viewH;
    this.x = 0;
    this.y = 0;
    this.shake = 0;
    this.offX = 0;
    this.offY = 0;
  }

  snapTo(target, area) {
    this.x = target.x - this.w / 2;
    this.y = target.y - this.h / 2;
    this.clamp(area);
  }

  follow(target, area, dt) {
    const goalX = target.x - this.w / 2;
    const goalY = target.y - this.h / 2;
    const k = Math.min(1, dt * 7);
    this.x += (goalX - this.x) * k;
    this.y += (goalY - this.y) * k;
    this.clamp(area);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 18);
      this.offX = (Math.random() - 0.5) * this.shake;
      this.offY = (Math.random() - 0.5) * this.shake;
    } else {
      this.offX = 0;
      this.offY = 0;
    }
  }

  clamp(area) {
    const maxX = area.w * TILE_SIZE - this.w;
    const maxY = area.h * TILE_SIZE - this.h;
    this.x = maxX <= 0 ? maxX / 2 : Math.max(0, Math.min(maxX, this.x));
    this.y = maxY <= 0 ? maxY / 2 : Math.max(0, Math.min(maxY, this.y));
  }

  kick(power = 6) {
    this.shake = Math.max(this.shake, power);
  }

  get left() { return Math.round(this.x + this.offX); }
  get top() { return Math.round(this.y + this.offY); }
}
