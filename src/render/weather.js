// Screen-space weather, drawn over the 3D scene on the HUD canvas.

const WEATHER = {
  city:    { count: 26, color: '#cfd6e0', size: 1, driftX: -14, driftY: 8, alpha: 0.25 },
  leaves:  { count: 30, color: '#c9a24a', size: 3, driftX: -22, driftY: 16, alpha: 0.75 },
  embers:  { count: 40, color: '#ffb26b', size: 2, driftX: 6, driftY: -22, alpha: 0.8 },
  petals:  { count: 44, color: '#f3cbd8', size: 3, driftX: -12, driftY: 12, alpha: 0.85 },
  rain:    { count: 120, color: '#cfe0ff', size: 1, driftX: 150, driftY: 900, alpha: 0.22, streak: 22 }
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
    if (cfg.streak) {
      // Rain close to the lens: a slanted stroke, leaning the way it falls.
      const lean = cfg.driftX / cfg.driftY;
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const b of this.bits) {
        const len = cfg.streak * b.s;
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + len * lean, b.y + len);
      }
      ctx.stroke();
    } else {
      for (const b of this.bits) {
        ctx.fillRect(b.x | 0, b.y | 0, cfg.size, cfg.size + (this.kind === 'city' ? 4 : 0));
      }
    }
    ctx.globalAlpha = 1;
  }
}
