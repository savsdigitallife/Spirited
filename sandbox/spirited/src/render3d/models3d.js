// Every actor and prop, built out of boxes and spheres at draw time.
// Local space: +x is the model's right, +z is the direction it faces.

import { MATERIAL } from './textures.js';

const cache = new Map();

export function rgb(hex) {
  let v = cache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    cache.set(hex, v);
  }
  return v;
}

export const YAW = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };

/**
 * Aiko: thirty, leaving the city for a farm she has never seen.
 * Ochre canvas work jacket, cream shirt, deep green trousers, an indigo scarf
 * her grandmother wove, and a long dark braid — legible from above, which is
 * where you will mostly be looking at her from.
 */
export const HERO = {
  skin: '#e6b795',
  hair: '#221a16',
  cloth: '#c8862e',      // the jacket
  trim: '#f0e6d2',       // the shirt at the collar and cuffs
  legs: '#3c4a3a',
  boots: '#4a3527',
  scarf: '#3d5a8c',
  longHair: true,
  scale: 1.34
};

/** Draw a box positioned in the model's local frame, with `y` as its base. */
function part(r, o, lx, y, lz, sx, sy, sz, color, opts = {}) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const x = o.x + lx * c + lz * s;
  const z = o.z - lx * s + lz * c;
  r.drawBox(x, o.y + y + sy / 2, z, sx, sy, sz, color, { rot: o.yaw, ...opts });
}

function blob(r, o, lx, y, lz, sx, sy, sz, color, opts = {}) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const x = o.x + lx * c + lz * s;
  const z = o.z - lx * s + lz * c;
  r.drawSphere(x, o.y + y + sy / 2, z, sx, sy, sz, color, opts);
}

/**
 * A sphere centred on a local point, taking real radii — the unit sphere is
 * half a unit across, so they are doubled on the way through.
 */
function ball(r, o, lx, y, lz, rx, ry, rz, color, opts = {}) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  r.drawSphere(o.x + lx * c + lz * s, o.y + y, o.z - lx * s + lz * c,
    rx * 2, ry * 2, rz * 2, color, opts);
}

/**
 * One bone. Hangs from the joint at (lx, ly, lz) and swings `pitch` radians
 * about it — positive swings the far end backwards. Returns the far end in
 * local coordinates so the next bone in the chain can hang off it.
 */
function bone(r, o, lx, ly, lz, radius, length, pitch, color, opts = {}) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  r.drawLimb(o.x + lx * c + lz * s, o.y + ly, o.z - lx * s + lz * c,
    radius, length, color, { rot: o.yaw, rx: pitch, ...opts });
  return [lx, ly - length * Math.cos(pitch), lz - length * Math.sin(pitch)];
}

/* --------------------------------------------------------------- actors -- */

export function drawActor3D(r, a, time) {
  const o = { x: a.x, y: a.y ?? 0, z: a.z, yaw: YAW[a.dir ?? 'down'] ?? 0 };
  const pal = a.palette ?? {};
  const skin = rgb(pal.skin ?? '#e9bd95');
  const hair = rgb(pal.hair ?? '#241c18');
  const cloth = rgb(pal.cloth ?? '#c84a5e');
  const trim = rgb(pal.trim ?? '#f2e8d6');
  const swing = Math.sin(a.walk ?? 0) * 0.16;
  const alpha = a.alpha;
  const opts = alpha !== undefined && alpha < 1 ? { alpha } : {};

  switch (a.kind) {
    case 'cat': {
      part(r, o, 0, 0.16, 0, 0.24, 0.2, 0.52, cloth, opts);
      part(r, o, 0, 0.24, 0.3, 0.22, 0.22, 0.2, skin, opts);
      part(r, o, -0.07, 0.42, 0.34, 0.07, 0.09, 0.05, hair, opts);
      part(r, o, 0.07, 0.42, 0.34, 0.07, 0.09, 0.05, hair, opts);
      part(r, o, 0, 0.3, -0.32, 0.07, 0.07, 0.28, cloth, opts);
      for (const [lx, lz] of [[-0.09, 0.18], [0.09, 0.18], [-0.09, -0.16], [0.09, -0.16]]) {
        part(r, o, lx, 0, lz, 0.07, 0.17, 0.07, cloth, opts);
      }
      break;
    }
    case 'hen': {
      const peck = Math.max(0, Math.sin(time * 2.2 + o.x * 3)) * 0.1;
      part(r, o, 0, 0.12, 0, 0.2, 0.18, 0.28, skin, opts);
      ball(r, o, 0, 0.34 - peck, 0.12, 0.07, 0.075, 0.07, skin, opts);
      part(r, o, 0, 0.36 - peck, 0.16, 0.05, 0.06, 0.04, rgb('#c23a2a'), opts);   // comb
      part(r, o, 0, 0.3 - peck, 0.2, 0.045, 0.03, 0.05, trim, opts);             // beak
      part(r, o, 0, 0.16, -0.18, 0.12, 0.14, 0.1, hair, opts);                   // tail
      for (const lx of [-0.06, 0.06]) part(r, o, lx, 0, 0.02, 0.03, 0.12, 0.03, trim, opts);
      break;
    }
    case 'goat': {
      part(r, o, 0, 0.3, 0, 0.3, 0.28, 0.62, skin, opts);
      part(r, o, 0, 0.42, 0.36, 0.22, 0.22, 0.22, skin, opts);
      part(r, o, 0, 0.4, 0.48, 0.12, 0.1, 0.1, hair, opts);
      for (const lx of [-0.08, 0.08]) part(r, o, lx, 0.6, 0.3, 0.05, 0.14, 0.05, trim, opts);
      part(r, o, 0, 0.3, 0.46, 0.06, 0.14, 0.05, trim, opts);                    // beard
      part(r, o, 0, 0.4, -0.34, 0.08, 0.16, 0.06, skin, opts);
      for (const [lx, lz] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
        part(r, o, lx, 0, lz, 0.07, 0.3, 0.07, hair, opts);
      }
      break;
    }
    case 'hog': {
      part(r, o, 0, 0.22, 0, 0.44, 0.36, 0.72, skin, opts);
      part(r, o, 0, 0.26, 0.42, 0.32, 0.3, 0.26, skin, opts);
      part(r, o, 0, 0.34, 0.56, 0.14, 0.12, 0.06, trim, opts);
      part(r, o, -0.11, 0.5, 0.36, 0.1, 0.11, 0.05, hair, opts);
      part(r, o, 0.11, 0.5, 0.36, 0.1, 0.11, 0.05, hair, opts);
      for (const [lx, lz] of [[-0.16, 0.24], [0.16, 0.24], [-0.16, -0.24], [0.16, -0.24]]) {
        part(r, o, lx, 0, lz, 0.11, 0.24, 0.11, hair, opts);
      }
      break;
    }
    case 'frog': {
      const squat = Math.abs(Math.sin(a.walk ?? 0)) * 0.05;
      part(r, o, 0, 0, 0, 0.5, 0.44 - squat, 0.4, cloth, opts);
      part(r, o, 0, 0.44 - squat, 0.02, 0.44, 0.3, 0.42, skin, opts);
      blob(r, o, -0.14, 0.68 - squat, 0.1, 0.18, 0.18, 0.18, trim, opts);
      blob(r, o, 0.14, 0.68 - squat, 0.1, 0.18, 0.18, 0.18, trim, opts);
      part(r, o, -0.14, 0.74 - squat, 0.18, 0.07, 0.07, 0.04, [0.05, 0.05, 0.05], opts);
      part(r, o, 0.14, 0.74 - squat, 0.18, 0.07, 0.07, 0.04, [0.05, 0.05, 0.05], opts);
      for (const lx of [-0.26, 0.26]) part(r, o, lx, 0, 0.06, 0.12, 0.16, 0.3, skin, opts);
      break;
    }
    case 'shade': {
      const drift = Math.sin(time * 1.4 + o.x) * 0.05;
      const o2 = { ...o, y: o.y + 0.12 + drift };
      const ghost = { alpha: 0.66, noShadow: true };
      part(r, o2, 0, 0.3, 0, 0.42, 0.62, 0.34, cloth, ghost);
      part(r, o2, 0, 0.9, 0, 0.34, 0.3, 0.3, cloth, ghost);
      part(r, o2, -0.08, 1.0, 0.16, 0.06, 0.06, 0.03, trim, { ...ghost, emissive: 0.6 });
      part(r, o2, 0.08, 1.0, 0.16, 0.06, 0.06, 0.03, trim, { ...ghost, emissive: 0.6 });
      break;
    }
    case 'mite': {
      const hop = Math.abs(Math.sin(time * 5 + o.x * 3)) * 0.12;
      blob(r, o, 0, 0.06 + hop, 0, 0.26, 0.26, 0.26, [0.07, 0.07, 0.07], opts);
      part(r, o, -0.06, 0.2 + hop, 0.12, 0.05, 0.05, 0.03, rgb('#f0c060'), { emissive: 0.9 });
      part(r, o, 0.06, 0.2 + hop, 0.12, 0.05, 0.05, 0.03, rgb('#f0c060'), { emissive: 0.9 });
      for (const lx of [-0.14, 0.14]) {
        part(r, o, lx, 0, 0.06, 0.03, 0.12, 0.03, [0.05, 0.05, 0.05], opts);
        part(r, o, lx, 0, -0.06, 0.03, 0.12, 0.03, [0.05, 0.05, 0.05], opts);
      }
      break;
    }
    case 'boilerman': {
      part(r, o, 0, 0, 0, 0.34, 0.5, 0.3, cloth);
      part(r, o, 0, 0.5, 0, 0.62, 0.5, 0.4, cloth);
      part(r, o, 0, 1.0, 0.02, 0.34, 0.3, 0.32, skin);
      part(r, o, 0, 1.26, 0, 0.4, 0.1, 0.36, hair);
      part(r, o, 0, 1.02, 0.16, 0.3, 0.07, 0.05, hair);
      part(r, o, -0.09, 1.12, 0.17, 0.11, 0.09, 0.03, trim, { emissive: 0.2 });
      part(r, o, 0.09, 1.12, 0.17, 0.11, 0.09, 0.03, trim, { emissive: 0.2 });
      for (let i = 0; i < 3; i++) {
        const t = Math.sin(time * 3 + i) * 0.1;
        part(r, o, -0.36 - i * 0.05, 0.85 - i * 0.16 + t, 0.05, 0.4, 0.08, 0.08, skin, { rot: o.yaw });
        part(r, o, 0.36 + i * 0.05, 0.85 - i * 0.16 - t, 0.05, 0.4, 0.08, 0.08, skin, { rot: o.yaw });
      }
      break;
    }
    case 'hollow': {
      const sway = Math.sin(time * 1.1 + o.x) * 0.04;
      part(r, o, sway, 0, 0, 0.5, 1.25, 0.36, cloth, { });
      part(r, o, sway, 1.25, 0.02, 0.34, 0.38, 0.16, trim, { emissive: 0.12 });
      part(r, o, sway - 0.08, 1.44, 0.1, 0.07, 0.09, 0.04, [0.05, 0.05, 0.06]);
      part(r, o, sway + 0.08, 1.44, 0.1, 0.07, 0.09, 0.04, [0.05, 0.05, 0.06]);
      part(r, o, sway, 1.3, 0.1, 0.12, 0.04, 0.04, rgb('#9a3a4a'));
      break;
    }
    case 'radish': {
      blob(r, o, 0, 0, 0, 0.62, 1.0, 0.62, skin);
      for (const lx of [-0.16, 0, 0.16]) part(r, o, lx, 0.95, 0, 0.08, 0.28, 0.08, trim);
      part(r, o, -0.12, 0.62, 0.28, 0.07, 0.05, 0.04, [0.15, 0.12, 0.1]);
      part(r, o, 0.12, 0.62, 0.28, 0.07, 0.05, 0.04, [0.15, 0.12, 0.1]);
      part(r, o, 0, 0.45, 0.02, 0.7, 0.1, 0.66, rgb('#c04a52'));
      break;
    }
    case 'river': {
      blob(r, o, 0, 0, 0, 1.5, 0.9, 1.5, cloth, { alpha: 0.95 });
      blob(r, o, 0.3, 0.4, 0.2, 0.8, 0.6, 0.8, hair, { alpha: 0.95 });
      part(r, o, -0.5, 0.2, 0.4, 0.5, 0.08, 0.1, rgb('#6b6250'));
      part(r, o, 0.45, 0.35, -0.2, 0.4, 0.1, 0.1, rgb('#4a4640'));
      break;
    }
    case 'dragon': {
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        const t = i / (segs - 1);
        const wave = Math.sin(time * 1.8 - t * 4) * 0.5;
        const lift = Math.cos(time * 1.4 - t * 3) * 0.25;
        const s = 0.36 - t * 0.16;
        r.drawSphere(o.x - 1.6 + t * 3.2, o.y + 1.1 + lift, o.z + wave, s, s * 0.8, s, trim, { noShadow: false });
      }
      const hx = o.x + 1.6;
      const hz = o.z + Math.sin(time * 1.8 - 4) * 0.5;
      const hy = o.y + 1.1 + Math.cos(time * 1.4 - 3) * 0.25;
      r.drawBox(hx, hy, hz, 0.5, 0.3, 0.34, trim);
      r.drawBox(hx + 0.2, hy + 0.02, hz, 0.24, 0.16, 0.22, cloth);
      r.drawBox(hx - 0.16, hy + 0.22, hz, 0.18, 0.24, 0.1, cloth);
      break;
    }
    case 'heir': {
      blob(r, o, 0, 0, 0, 1.5, 1.1, 1.4, cloth);
      blob(r, o, 0, 0.9, 0.05, 1.1, 1.0, 1.0, skin);
      part(r, o, 0, 1.6, 0, 0.9, 0.16, 0.8, hair);
      part(r, o, -0.2, 1.15, 0.45, 0.12, 0.1, 0.06, [0.15, 0.12, 0.1]);
      part(r, o, 0.2, 1.15, 0.45, 0.12, 0.1, 0.06, [0.15, 0.12, 0.1]);
      part(r, o, 0, 0.95, 0.48, 0.2, 0.07, 0.05, rgb('#b04a52'));
      break;
    }
    default: {
      // People: a jointed rig rather than a stack of boxes. Hips and shoulders
      // swing, knees and elbows bend behind them, and the whole body rises and
      // falls on each step.
      const S = a.scale ?? pal.scale ?? 1;
      const walk = a.walk ?? 0;
      const speed = Math.min(1, Math.abs(a.walk ?? 0) > 0 ? (a.moving ? 1 : 0.15) : 0.15);
      const gait = Math.sin(walk) * speed;
      const gaitB = Math.sin(walk + Math.PI) * speed;
      const breathe = Math.sin(time * 1.6 + o.x) * 0.004;
      const bob = (Math.abs(Math.sin(walk)) * 0.022 - 0.011) * speed;

      const hipY = (0.52 + bob + breathe) * S;
      const shoulderY = (0.9 + bob + breathe) * S;
      const legR = 0.055 * S;
      const armR = 0.042 * S;
      const thigh = 0.27 * S;
      const shin = 0.26 * S;
      const upperArm = 0.21 * S;
      const foreArm = 0.2 * S;
      const trouser = pal.legs ? rgb(pal.legs) : [0.16, 0.15, 0.19];
      const bootColor = pal.boots ? rgb(pal.boots) : rgb('#2f2823');

      // Legs, each a thigh that swings and a shin that only ever bends back.
      for (const side of [-1, 1]) {
        const swing = side < 0 ? gait : gaitB;
        const hipX = side * 0.072 * S;
        const knee = bone(r, o, hipX, hipY, 0, legR, thigh, swing * 0.62, trouser, opts);
        const bend = Math.max(0, -Math.sin(walk + (side < 0 ? 0.9 : 0.9 + Math.PI))) * 0.95 * speed;
        const ankle = bone(r, o, knee[0], knee[1], knee[2], legR * 0.88, shin,
          swing * 0.62 + bend, trouser, opts);
        part(r, o, ankle[0], ankle[1] - 0.03 * S, ankle[2] + 0.03 * S,
          0.095 * S, 0.06 * S, 0.18 * S, bootColor, { ...opts, rot: o.yaw });
      }

      // Torso: hips, a tapered waist and a chest, so the silhouette narrows.
      part(r, o, 0, hipY - 0.085 * S, 0, 0.225 * S, 0.1 * S, 0.155 * S, cloth, opts);
      part(r, o, 0, hipY - 0.01 * S, 0, 0.205 * S, 0.19 * S, 0.145 * S, cloth, opts);
      part(r, o, 0, hipY + 0.16 * S, 0, 0.255 * S, 0.23 * S, 0.165 * S, cloth, opts);
      part(r, o, 0, shoulderY - 0.035 * S, 0, 0.2 * S, 0.035 * S, 0.15 * S, trim, opts);
      part(r, o, 0, hipY - 0.095 * S, 0, 0.235 * S, 0.03 * S, 0.165 * S, trim, opts);

      // Arms, swinging opposite the legs, elbows always bending forward.
      for (const side of [-1, 1]) {
        const swing = side < 0 ? gaitB : gait;
        const shoulderX = side * 0.135 * S;
        ball(r, o, shoulderX, shoulderY, 0, 0.048 * S, 0.048 * S, 0.048 * S, cloth, opts);
        const elbow = bone(r, o, shoulderX, shoulderY, 0, armR, upperArm, swing * 0.5, cloth, opts);
        const elbowBend = 0.22 + Math.max(0, swing) * 0.45;
        const wrist = bone(r, o, elbow[0], elbow[1], elbow[2], armR * 0.85, foreArm,
          swing * 0.5 - elbowBend, skin, opts);
        ball(r, o, wrist[0], wrist[1], wrist[2], 0.042 * S, 0.05 * S, 0.038 * S, skin, opts);
      }

      // Head: neck, skull, hair and a face that is mostly two dark eyes.
      const headY = shoulderY + 0.15 * S;
      part(r, o, 0, shoulderY - 0.02 * S, 0, 0.07 * S, 0.07 * S, 0.07 * S, skin, opts);
      ball(r, o, 0, headY, 0, 0.098 * S, 0.115 * S, 0.102 * S, skin, opts);
      ball(r, o, 0, headY + 0.03 * S, -0.012 * S, 0.108 * S, 0.108 * S, 0.112 * S, hair, opts);
      part(r, o, 0, headY - 0.1 * S, -0.085 * S, 0.17 * S, 0.2 * S, 0.06 * S, hair, opts);
      ball(r, o, -0.04 * S, headY + 0.012 * S, 0.086 * S, 0.017 * S, 0.022 * S, 0.012 * S, [0.1, 0.08, 0.07], opts);
      ball(r, o, 0.04 * S, headY + 0.012 * S, 0.086 * S, 0.017 * S, 0.022 * S, 0.012 * S, [0.1, 0.08, 0.07], opts);
      ball(r, o, 0, headY - 0.012 * S, 0.095 * S, 0.014 * S, 0.017 * S, 0.014 * S, skin, opts);

      // Long hair: a sheet down the back and a braid that swings behind her.
      if (pal.longHair) {
        const swayHair = -gait * 0.12;
        part(r, o, 0, shoulderY - 0.16 * S, -0.115 * S, 0.2 * S, 0.42 * S, 0.075 * S, hair, opts);
        part(r, o, 0, shoulderY - 0.3 * S, -0.105 * S, 0.13 * S, 0.18 * S, 0.07 * S, hair, opts);
        ball(r, o, swayHair * S, shoulderY - 0.34 * S, -0.1 * S, 0.05 * S, 0.06 * S, 0.05 * S, hair, opts);
        // A tie where the braid starts.
        part(r, o, 0, shoulderY - 0.03 * S, -0.115 * S, 0.09 * S, 0.035 * S, 0.08 * S,
          pal.scarf ? rgb(pal.scarf) : trim, opts);
      }
      // The scarf sits over the collar and lifts a little in the wind.
      if (pal.scarf) {
        const scarf = rgb(pal.scarf);
        part(r, o, 0, shoulderY - 0.06 * S, 0, 0.24 * S, 0.075 * S, 0.185 * S, scarf, opts);
        part(r, o, 0.05 * S, shoulderY - 0.24 * S, 0.09 * S, 0.07 * S, 0.2 * S, 0.05 * S, scarf, opts);
      }
      // A jacket that hangs open over the shirt.
      if (a.hero) {
        part(r, o, -0.115 * S, hipY + 0.14 * S, 0.085 * S, 0.06 * S, 0.28 * S, 0.03 * S, cloth, opts);
        part(r, o, 0.115 * S, hipY + 0.14 * S, 0.085 * S, 0.06 * S, 0.28 * S, 0.03 * S, cloth, opts);
      }
      break;
    }
  }
}

/* ---------------------------------------------------------------- props -- */

const W = MATERIAL;
const C = {
  wood: '#7a5533', darkwood: '#4f3720', paper: '#e8dfc6', red: '#a8332e',
  stone: '#8e8b84', metal: '#585349', glass: '#8ad0e0', cloth: '#c8bda0',
  gold: '#c8a860', black: '#20201c', green: '#4e8144', flame: '#ffb44a'
};

// [shape, lx, baseY, lz, sx, sy, sz, colour, opts]
const PROPS = {
  boxes: [
    ['box', 0, 0, 0, 0.8, 0.6, 0.8, '#a5824f'],
    ['box', 0, 0.6, 0, 0.62, 0.44, 0.62, '#967545'],
    ['box', 0, 0.61, 0.32, 0.5, 0.12, 0.02, C.paper]
  ],
  satchel: [
    ['box', 0, 0, 0, 0.42, 0.32, 0.22, '#c2ac82'],
    ['box', 0, 0.3, 0, 0.44, 0.1, 0.24, '#8a7550'],
    ['box', 0, 0.32, -0.12, 0.06, 0.3, 0.04, '#8a7550']
  ],
  futon: [['box', 0, 0, 0, 1.3, 0.16, 1.9, '#c8bda0'], ['box', 0, 0.16, 0.6, 0.9, 0.12, 0.5, '#e2d8c6']],
  shelf: [
    ['box', -0.42, 0, 0, 0.1, 1.5, 0.5, C.darkwood], ['box', 0.42, 0, 0, 0.1, 1.5, 0.5, C.darkwood],
    ['box', 0, 0.5, 0, 0.9, 0.08, 0.5, C.wood], ['box', 0, 1.0, 0, 0.9, 0.08, 0.5, C.wood],
    ['box', 0, 1.42, 0, 0.9, 0.08, 0.5, C.wood]
  ],
  plant: [['box', 0, 0, 0, 0.36, 0.3, 0.36, '#8a5a3a'], ['sphere', 0, 0.3, 0, 0.62, 0.6, 0.62, C.green]],
  shoes: [['box', -0.12, 0, 0, 0.18, 0.1, 0.36, '#d9718c'], ['box', 0.12, 0, 0, 0.18, 0.1, 0.36, '#b0576e']],
  vending: [
    ['box', 0, 0, 0, 0.9, 1.7, 0.6, C.red],
    ['box', 0, 0.7, 0.31, 0.7, 0.8, 0.04, '#f0e8d0', { emissive: 0.45 }],
    ['box', 0, 0.25, 0.31, 0.6, 0.3, 0.04, C.black]
  ],
  torii: [
    ['box', -0.7, 0, 0, 0.22, 2.6, 0.22, '#b03a30'], ['box', 0.7, 0, 0, 0.22, 2.6, 0.22, '#b03a30'],
    ['box', 0, 2.6, 0, 2.2, 0.22, 0.3, '#b03a30'], ['box', 0, 2.25, 0, 1.8, 0.16, 0.24, '#b03a30']
  ],
  fox: [
    ['box', 0, 0, 0, 0.4, 0.3, 0.4, C.stone], ['box', 0, 0.3, 0, 0.24, 0.5, 0.5, C.stone],
    ['box', 0, 0.8, 0.12, 0.22, 0.22, 0.26, C.stone],
    ['box', -0.07, 0.98, 0.1, 0.07, 0.14, 0.05, C.stone], ['box', 0.07, 0.98, 0.1, 0.07, 0.14, 0.05, C.stone],
    ['box', 0, 0.52, 0.2, 0.3, 0.2, 0.06, C.red]
  ],
  jizo: [
    ['box', 0, 0, 0, 0.44, 0.24, 0.44, C.stone], ['box', 0, 0.24, 0, 0.34, 0.5, 0.34, C.stone],
    ['sphere', 0, 0.74, 0, 0.34, 0.36, 0.34, C.stone], ['box', 0, 0.5, 0.06, 0.4, 0.26, 0.3, C.red]
  ],
  sign: [
    ['box', 0, 0, 0, 0.1, 1.1, 0.1, C.darkwood],
    ['box', 0, 1.0, 0.03, 0.9, 0.5, 0.08, C.cloth]
  ],
  car: [
    ['box', 0, 0.2, 0, 1.5, 0.7, 3.2, '#5a6a86'],
    ['box', 0, 0.9, -0.1, 1.35, 0.6, 1.6, '#8fa0b8', { emissive: 0.05 }],
    ['box', -0.75, 0.15, 1.05, 0.24, 0.5, 0.5, C.black], ['box', 0.75, 0.15, 1.05, 0.24, 0.5, 0.5, C.black],
    ['box', -0.75, 0.15, -1.05, 0.24, 0.5, 0.5, C.black], ['box', 0.75, 0.15, -1.05, 0.24, 0.5, 0.5, C.black],
    ['box', 0, 0.5, 1.62, 1.2, 0.2, 0.08, '#e8e0cc', { emissive: 0.3 }]
  ],
  bench: [
    ['box', -0.5, 0, 0, 0.12, 0.42, 0.36, C.darkwood], ['box', 0.5, 0, 0, 0.12, 0.42, 0.36, C.darkwood],
    ['box', 0, 0.42, 0, 1.3, 0.1, 0.44, C.wood], ['box', 0, 0.52, -0.2, 1.3, 0.4, 0.08, C.wood]
  ],
  streetlamp: [
    ['box', 0, 0, 0, 0.16, 3.2, 0.16, '#4a4038'],
    ['box', 0, 3.2, 0, 0.36, 0.3, 0.36, '#ffe6b0', { emissive: 1.1 }]
  ],
  lantern: [
    ['box', 0, 0, 0, 0.14, 1.5, 0.14, '#4a4038'],
    ['box', 0, 1.5, 0, 0.42, 0.5, 0.42, '#ffd98a', { emissive: 1.2 }],
    ['box', 0, 2.0, 0, 0.5, 0.1, 0.5, '#8a2f2c']
  ],
  lamp: [
    ['box', 0, 0, 0, 0.16, 1.7, 0.16, '#3a2f28'],
    ['box', 0, 1.7, 0, 0.46, 0.56, 0.46, '#ffd98a', { emissive: 1.2 }],
    ['box', 0, 2.26, 0, 0.6, 0.12, 0.6, '#8a2f2c']
  ],
  ticket: [
    ['box', 0, 0, 0, 0.8, 1.5, 0.5, '#3a5a4a'],
    ['box', 0, 0.95, 0.26, 0.55, 0.4, 0.04, C.glass, { emissive: 0.6 }],
    ['box', 0, 0.6, 0.26, 0.5, 0.2, 0.04, C.metal]
  ],
  kiosk: [
    ['box', 0, 0, 0, 1.5, 1.2, 0.8, '#8a5a34'],
    ['box', 0, 1.2, 0.1, 1.7, 0.14, 1.1, C.cloth]
  ],
  board: [
    ['box', -0.6, 0, 0, 0.1, 1.4, 0.1, C.metal], ['box', 0.6, 0, 0, 0.1, 1.4, 0.1, C.metal],
    ['box', 0, 1.4, 0, 1.6, 0.9, 0.1, C.black],
    ['box', 0, 1.55, 0.06, 1.3, 0.5, 0.02, '#e0c060', { emissive: 0.5 }]
  ],
  train: [
    ['box', 0, 0.3, 0, 2.6, 2.2, 13, '#8a9aa8'],
    ['box', 0, 1.2, 0, 2.7, 0.9, 12.4, '#c8e0f0', { emissive: 0.25 }],
    ['box', 0, 0.5, 0, 2.75, 0.5, 12.6, '#2a4a6a']
  ],
  strap: [['box', 0, 1.6, 0, 0.04, 0.5, 0.04, C.cloth], ['box', 0, 1.4, 0, 0.16, 0.2, 0.04, C.cloth]],
  trainwindow: [['box', 0, 0.9, 0, 2.4, 1.1, 0.06, '#a8d0e0', { emissive: 0.3, alpha: 0.55 }]],
  scarecrow: [
    ['box', 0, 0, 0, 0.12, 1.9, 0.12, C.darkwood],
    ['box', 0, 1.35, 0, 1.5, 0.1, 0.1, C.darkwood],
    ['box', 0, 1.0, 0, 0.7, 0.6, 0.3, '#3f5f8a'],
    ['sphere', 0, 1.75, 0, 0.4, 0.4, 0.4, C.cloth]
  ],
  well: [
    ['box', 0, 0, 0, 1.3, 0.7, 1.3, C.stone],
    ['box', 0, 0.7, 0, 1.1, 0.06, 1.1, '#101418'],
    ['box', -0.55, 0.7, 0, 0.14, 1.3, 0.14, C.darkwood], ['box', 0.55, 0.7, 0, 0.14, 1.3, 0.14, C.darkwood],
    ['box', 0, 2.0, 0, 1.6, 0.2, 1.0, '#8d2f2c']
  ],
  bicycle: [
    ['box', 0, 0.1, -0.5, 0.06, 0.6, 0.6, C.metal], ['box', 0, 0.1, 0.5, 0.06, 0.6, 0.6, C.metal],
    ['box', 0, 0.5, 0, 0.06, 0.1, 1.0, C.metal], ['box', 0, 0.7, 0.45, 0.5, 0.05, 0.05, C.metal]
  ],
  dust: [],
  feast: [
    ['box', 0, 0, 0, 1.4, 0.75, 0.9, '#8a5a34'],
    ['box', -0.35, 0.75, 0, 0.4, 0.12, 0.4, '#e0b060'],
    ['box', 0.15, 0.75, 0.1, 0.5, 0.2, 0.35, '#c05a4a'],
    ['box', 0.5, 0.75, -0.1, 0.3, 0.14, 0.3, '#f0e8d0']
  ],
  clock: [
    ['box', 0, 1.2, 0, 0.12, 0.9, 0.12, C.metal],
    ['box', 0, 2.1, 0, 0.9, 0.9, 0.16, '#2a2620'],
    ['box', 0, 2.15, 0.09, 0.66, 0.66, 0.03, '#d6cdb4', { emissive: 0.25 }]
  ],
  pot: [['sphere', 0, 0, 0, 0.7, 0.7, 0.7, '#3a3630'], ['box', 0, 0.55, 0, 0.5, 0.1, 0.5, C.metal]],
  chute: [
    ['box', 0, 0, 0, 0.7, 1.8, 0.5, '#8a7a4a'],
    ['box', 0, 1.1, 0.26, 0.4, 0.3, 0.06, '#3a3630']
  ],
  lift: [
    ['box', -0.7, 0, 0, 0.2, 3.0, 0.9, '#5a4030'], ['box', 0.7, 0, 0, 0.2, 3.0, 0.9, '#5a4030'],
    ['box', 0, 2.9, 0, 1.7, 0.24, 1.0, C.gold],
    ['box', 0, 0, -0.4, 1.4, 2.6, 0.12, '#20201c']
  ],
  bucket: [['box', 0, 0, 0, 0.4, 0.36, 0.4, C.wood], ['box', 0, 0.3, 0, 0.34, 0.06, 0.34, '#4a8090']],
  ledger: [
    ['box', 0, 0, 0, 0.8, 0.5, 0.5, '#8a5a34'],
    ['box', 0, 0.5, 0, 0.5, 0.06, 0.4, C.paper]
  ],
  coal: [
    ['sphere', -0.2, 0, -0.1, 0.5, 0.4, 0.5, '#141416'],
    ['sphere', 0.25, 0, 0.15, 0.6, 0.5, 0.6, '#1a1a1c'],
    ['sphere', 0.05, 0.3, -0.05, 0.45, 0.4, 0.45, '#101012']
  ],
  drawers: [
    ['box', 0, 0, 0, 1.3, 1.3, 0.6, '#6b4b31'],
    ['box', -0.35, 0.9, 0.31, 0.5, 0.3, 0.04, C.gold],
    ['box', 0.35, 0.9, 0.31, 0.5, 0.3, 0.04, C.gold],
    ['box', -0.35, 0.4, 0.31, 0.5, 0.3, 0.04, C.gold],
    ['box', 0.35, 0.4, 0.31, 0.5, 0.3, 0.04, C.gold]
  ],
  kettle: [
    ['sphere', 0, 0, 0, 1.0, 0.8, 1.0, '#3a3630'],
    ['box', 0, 0.7, 0, 0.24, 0.3, 0.24, C.metal]
  ],
  contract: [
    ['box', 0, 0, 0, 1.0, 0.55, 0.7, C.darkwood],
    ['box', 0, 0.55, 0, 0.8, 0.03, 0.55, C.paper, { emissive: 0.15 }]
  ],
  brazier: [
    ['box', 0, 0, 0, 0.7, 0.5, 0.7, '#3a3630'],
    ['sphere', 0, 0.45, 0, 0.5, 0.24, 0.5, '#ff9040', { emissive: 1.4 }]
  ],
  namebox: [
    ['box', 0, 0, 0, 0.5, 0.6, 0.5, C.metal],
    ['box', 0, 0.6, 0, 0.7, 0.4, 0.5, '#2a1a20'],
    ['box', 0, 1.0, 0, 0.75, 0.08, 0.55, C.gold, { emissive: 0.2 }]
  ],
  railcar: [
    ['box', 0, 0.2, 0, 2.4, 1.4, 5.5, '#3a4a58'],
    ['box', 0, 0.8, 0, 2.5, 0.7, 5.0, '#c8e0f0', { emissive: 0.4 }],
    ['box', 0, 1.6, 0, 2.5, 0.2, 5.4, '#20242c']
  ],
  wheel: [
    ['box', -0.4, 0, 0, 0.1, 0.7, 0.1, C.darkwood], ['box', 0.4, 0, 0, 0.1, 0.7, 0.1, C.darkwood],
    ['box', 0, 0.7, 0, 0.9, 0.06, 0.06, C.wood],
    ['box', 0, 0.7, 0, 0.06, 0.9, 0.06, C.wood]
  ],
  // A projecting shop sign: bracket, tube, and a face that glows.
  neon: [
    ['box', 0, 3.3, -0.3, 0.08, 0.08, 0.6, C.metal],
    ['box', 0, 1.4, 0, 0.09, 2.0, 0.09, C.metal],
    ['box', 0, 1.5, 0, 0.4, 1.9, 0.11, 'NEON', { emissive: 1.6 }],
    ['box', 0.13, 1.62, 0.07, 0.09, 1.65, 0.05, '#f4f0ff', { emissive: 1.3 }],
    ['box', -0.13, 1.85, 0.07, 0.07, 1.2, 0.05, '#f4f0ff', { emissive: 1.1 }]
  ],
  neonBar: [
    ['box', 0, 2.3, 0, 2.6, 0.3, 0.12, 'NEON', { emissive: 1.7 }],
    ['box', 0, 2.16, 0.05, 2.4, 0.06, 0.06, '#ffffff', { emissive: 1.4 }]
  ],
  // --- the farm ---
  gate: [
    ['box', -0.9, 0, 0, 0.18, 1.5, 0.18, C.darkwood], ['box', 0.9, 0, 0, 0.18, 1.5, 0.18, C.darkwood],
    ['box', 0, 1.1, 0, 1.9, 0.14, 0.1, C.wood], ['box', 0, 0.6, 0, 1.9, 0.12, 0.1, C.wood],
    ['box', 0, 0.85, 0.06, 0.24, 0.24, 0.06, C.metal]
  ],
  brambles: [
    ['sphere', 0, 0, 0, 1.5, 0.9, 1.4, '#4a5a34'],
    ['sphere', 0.4, 0.3, -0.3, 1.0, 0.8, 1.0, '#3d4c2b'],
    ['sphere', -0.4, 0.2, 0.3, 0.9, 0.7, 0.9, '#55663c']
  ],
  stonepile: [
    ['sphere', -0.25, 0, -0.1, 0.7, 0.5, 0.7, '#7d786c'],
    ['sphere', 0.3, 0, 0.2, 0.8, 0.6, 0.8, '#6b6659'],
    ['sphere', 0.05, 0.3, -0.05, 0.6, 0.5, 0.6, '#8f8a7c']
  ],
  brokenfence: [
    ['box', -0.5, 0, 0, 0.12, 0.9, 0.12, C.darkwood],
    ['box', 0.45, 0, 0, 0.12, 0.5, 0.12, C.darkwood],
    ['box', 0, 0.12, 0.3, 1.2, 0.1, 0.1, C.wood, { rot: 0.4 }]
  ],
  seedbed: [
    ['box', 0, 0, 0, 2.6, 0.24, 1.5, '#6a5233'],
    ['box', 0, 0.24, 0, 2.4, 0.06, 1.3, '#4f3f28']
  ],
  sluice: [
    ['box', -0.6, 0, 0, 0.2, 0.9, 0.7, C.stone], ['box', 0.6, 0, 0, 0.2, 0.9, 0.7, C.stone],
    ['box', 0, 0.4, 0, 1.1, 0.7, 0.12, C.darkwood],
    ['box', 0, 1.1, 0, 0.12, 0.5, 0.12, C.metal]
  ],
  coop: [
    ['box', 0, 0, 0, 2.2, 1.1, 1.6, C.wood],
    ['box', 0, 1.1, 0, 2.5, 0.18, 1.9, '#8d2f2c'],
    ['box', 0, 0.1, 0.82, 0.5, 0.6, 0.06, C.darkwood],
    ['box', -0.7, 0.5, 0.82, 0.5, 0.4, 0.05, '#3a3630']
  ],
  timber: [
    ['box', 0, 0, 0, 2.0, 0.16, 0.3, C.wood],
    ['box', 0, 0.16, 0.4, 2.0, 0.16, 0.3, C.wood],
    ['box', 0.3, 0.32, 0.2, 1.4, 0.14, 0.25, C.wood, { rot: 0.3 }]
  ],
  logpile: [
    ['box', 0, 0, 0, 1.8, 0.4, 0.9, C.darkwood],
    ['box', 0, 0.4, 0, 1.6, 0.38, 0.8, '#6b4b31'],
    ['box', 0, 0.78, 0, 1.2, 0.34, 0.7, C.darkwood]
  ],
  tools: [
    ['box', 0, 0, 0, 1.1, 1.4, 0.16, C.wood],
    ['box', -0.3, 0.4, 0.12, 0.08, 1.0, 0.08, C.darkwood],
    ['box', -0.3, 1.4, 0.12, 0.3, 0.1, 0.1, C.metal],
    ['box', 0.2, 0.5, 0.12, 0.08, 0.9, 0.08, C.darkwood],
    ['box', 0.2, 1.4, 0.12, 0.24, 0.16, 0.06, C.metal]
  ],
  washline: [
    ['box', -1.4, 0, 0, 0.1, 1.8, 0.1, C.darkwood], ['box', 1.4, 0, 0, 0.1, 1.8, 0.1, C.darkwood],
    ['box', 0, 1.75, 0, 2.8, 0.03, 0.03, '#cfc7b4'],
    ['box', -0.7, 1.35, 0, 0.5, 0.42, 0.03, '#e8e0cc'],
    ['box', 0.2, 1.3, 0, 0.45, 0.48, 0.03, '#8fa6c4'],
    ['box', 0.9, 1.4, 0, 0.4, 0.36, 0.03, '#d9c9a8']
  ],
  // --- rooms that look like somebody lives in them ---
  stove: [
    ['box', 0, 0, 0, 1.1, 0.9, 0.7, '#3a3a3f'],
    ['box', 0, 0.9, 0, 1.15, 0.08, 0.75, '#22242a'],
    ['sphere', -0.25, 0.94, 0, 0.34, 0.06, 0.34, '#15161a'],
    ['sphere', 0.25, 0.94, 0, 0.34, 0.06, 0.34, '#15161a'],
    ['box', 0, 0.45, 0.36, 0.7, 0.5, 0.04, '#5a5c62']
  ],
  sink: [
    ['box', 0, 0, 0, 1.0, 0.85, 0.6, '#b9b2a4'],
    ['box', 0, 0.85, 0, 1.05, 0.08, 0.65, '#8f959c'],
    ['box', 0, 0.8, 0, 0.7, 0.1, 0.4, '#6f757c'],
    ['box', 0, 0.95, -0.22, 0.06, 0.34, 0.06, C.metal],
    ['box', 0, 1.24, -0.12, 0.06, 0.06, 0.22, C.metal]
  ],
  fridge: [
    ['box', 0, 0, 0, 0.85, 1.7, 0.7, '#dfe2e4'],
    ['box', 0, 1.0, 0.36, 0.8, 0.02, 0.02, '#9aa0a6'],
    ['box', 0.3, 1.3, 0.37, 0.06, 0.5, 0.05, '#9aa0a6'],
    ['box', -0.2, 1.45, 0.37, 0.22, 0.16, 0.01, '#f0e6c0']
  ],
  table: [
    ['box', 0, 0.55, 0, 1.6, 0.12, 1.0, C.wood],
    ['box', -0.65, 0, -0.4, 0.1, 0.55, 0.1, C.darkwood],
    ['box', 0.65, 0, -0.4, 0.1, 0.55, 0.1, C.darkwood],
    ['box', -0.65, 0, 0.4, 0.1, 0.55, 0.1, C.darkwood],
    ['box', 0.65, 0, 0.4, 0.1, 0.55, 0.1, C.darkwood],
    ['box', -0.3, 0.67, 0, 0.24, 0.1, 0.24, '#e8e0cc'],
    ['box', 0.25, 0.67, 0.1, 0.16, 0.16, 0.16, '#a8543a']
  ],
  chest: [
    ['box', 0, 0, 0, 1.2, 0.9, 0.6, '#6b4b31'],
    ['box', 0, 0.35, 0.31, 1.0, 0.06, 0.04, C.gold],
    ['box', 0, 0.72, 0.31, 1.0, 0.06, 0.04, C.gold]
  ],
  hearth: [
    ['box', 0, 0, 0, 1.6, 0.35, 1.6, C.stone],
    ['box', 0, 0.35, 0, 1.2, 0.12, 1.2, '#2a241e'],
    ['sphere', 0, 0.4, 0, 0.7, 0.3, 0.7, '#ff8a34', { emissive: 1.3 }],
    ['box', 0, 1.6, 0, 0.08, 1.2, 0.08, C.metal],
    ['sphere', 0, 1.0, 0, 0.6, 0.5, 0.6, '#3a3630']
  ],
  radio: [
    ['box', 0, 0, 0, 0.6, 0.4, 0.3, '#7a5533'],
    ['box', 0, 0.15, 0.16, 0.34, 0.22, 0.02, '#3a3630'],
    ['box', 0.2, 0.42, 0, 0.03, 0.4, 0.03, C.metal]
  ],
  tub: [
    ['box', 0, 0, 0, 1.6, 0.7, 1.1, '#8a6a4a'],
    ['box', 0, 0.6, 0, 1.4, 0.12, 0.95, '#4a8090'],
    ['box', -0.9, 0.2, 0, 0.12, 0.5, 0.9, '#7a5c40']
  ],
  // --- the city ---
  ramen: [
    ['box', 0, 0, 0, 2.2, 0.95, 0.7, C.wood],                              // counter
    ['box', 0, 0.95, 0, 2.3, 0.1, 0.8, '#8a5a34'],
    ['box', 0, 2.05, -0.15, 2.4, 0.7, 0.5, '#8d2f2c'],                     // noren
    ['box', 0, 2.4, -0.2, 2.5, 0.2, 0.55, '#3a2a22'],
    ['box', 0, 1.1, -0.6, 2.2, 1.2, 0.1, '#ffd89a', { emissive: 1.5 }],    // lit interior
    ['box', -0.6, 1.02, 0.1, 0.26, 0.16, 0.26, '#e8e0cc'],                 // bowls
    ['box', 0.2, 1.02, 0.1, 0.26, 0.16, 0.26, '#e8e0cc'],
    ['box', -0.7, 0, 0.6, 0.3, 0.6, 0.3, C.darkwood],                      // stools
    ['box', 0, 0, 0.6, 0.3, 0.6, 0.3, C.darkwood],
    ['box', 0.7, 0, 0.6, 0.3, 0.6, 0.3, C.darkwood]
  ],
  konbini: [
    ['box', 0, 0, 0, 3.0, 2.6, 0.4, '#e8ecef'],
    ['box', 0, 0.4, 0.22, 2.6, 1.6, 0.06, '#dff0f8', { emissive: 1.25 }],
    ['box', 0, 2.3, 0.24, 2.8, 0.5, 0.1, '#2f7a4a', { emissive: 0.6 }],
    ['box', 0, 2.3, 0.3, 2.2, 0.24, 0.04, '#ffffff', { emissive: 0.9 }]
  ],
  koban: [
    ['box', 0, 0, 0, 2.0, 2.8, 2.0, '#dfe2e4'],
    ['box', 0, 0.6, 1.02, 1.4, 1.2, 0.06, '#bcd8e8', { emissive: 0.5 }],
    ['box', 0, 2.8, 0, 2.3, 0.24, 2.3, '#3a4a5a'],
    ['sphere', 0, 3.1, 0, 0.5, 0.5, 0.5, '#ff3a2a', { emissive: 1.4 }]
  ],
  crate: [
    ['box', 0, 0, 0, 0.8, 0.5, 0.6, '#a5824f'],
    ['box', 0, 0.5, 0.05, 0.7, 0.44, 0.5, '#96794a'],
    ['box', 0, 0.94, 0, 0.6, 0.1, 0.45, '#6b4b31']
  ],
  produce: [
    ['box', 0, 0, 0, 2.0, 0.85, 1.0, C.wood],
    ['box', 0, 0.85, 0, 2.1, 0.12, 1.1, '#8a5a34'],
    ['sphere', -0.55, 0.95, 0, 0.5, 0.3, 0.5, '#c2513a'],
    ['sphere', 0.05, 0.95, 0.1, 0.5, 0.3, 0.5, '#6f9a4a'],
    ['sphere', 0.6, 0.95, -0.05, 0.45, 0.28, 0.45, '#e0b060'],
    ['box', 0, 2.0, -0.2, 2.3, 0.16, 1.2, '#8d2f2c']
  ],
  bikeRack: [
    ['box', -0.6, 0, 0, 0.06, 0.5, 0.5, C.metal], ['box', 0, 0, 0, 0.06, 0.5, 0.5, C.metal],
    ['box', 0.6, 0, 0, 0.06, 0.5, 0.5, C.metal]
  ],
  slips: [],
  default: [['box', 0, 0, 0, 0.6, 0.6, 0.6, '#8a7550']]
};

export function drawProp3D(r, prop, time) {
  const parts = PROPS[prop.type] ?? PROPS.default;
  const o = { x: prop.x, y: prop.y3d ?? 0, z: prop.z, yaw: prop.yaw ?? 0 };
  // 'NEON' in a part's colour slot means "whatever colour this sign is".
  const tint = prop.color ? rgb(prop.color) : rgb('#ff2fa0');

  for (const [shape, lx, by, lz, sx, sy, sz, color, opts] of parts) {
    const draw = shape === 'sphere' ? blob : part;
    draw(r, o, lx, by, lz, sx, sy, sz, color === 'NEON' ? tint : rgb(color), opts ?? {});
  }

  // Signs bleed light into the rain around them.
  if (prop.type === 'neon' || prop.type === 'neonBar') {
    const flicker = prop.steady ? 1 : (Math.sin(time * 13.3 + o.x * 7) > -0.92 ? 1 : 0.25);
    const tall = prop.type === 'neon';
    for (let i = 0; i < 2; i++) {
      const rad = (tall ? 0.9 : 0.8) * (1.3 + i);
      r.drawSphere(o.x, o.y + (tall ? 2.4 : 2.4), o.z, rad, rad * (tall ? 1.5 : 0.8), rad,
        tint, { alpha: (0.2 - i * 0.09) * flicker, additive: true, emissive: 2.5, noShadow: true });
    }
  }

  // Lamps get a soft halo, so lantern light reads as light and not as paint.
  const GLOW = { lantern: [0.55, 1.9, '#ffc266'], lamp: [0.6, 2.15, '#ffc266'],
                 streetlamp: [0.75, 3.35, '#ffe0a8'], brazier: [0.5, 0.55, '#ff9040'],
                 vending: [0.5, 0.9, '#cfe6f0'], ramen: [1.0, 1.5, '#ffb861'],
                 konbini: [1.1, 1.6, '#cfe8f4'], hearth: [0.7, 0.6, '#ff9040'],
                 koban: [0.5, 3.1, '#ff6a5a'] };
  const glow = GLOW[prop.type];
  if (glow) {
    const [radius, gy, color] = glow;
    for (let i = 0; i < 2; i++) {
      const pulse = 1 + Math.sin(time * 2.2 + o.x) * 0.05;
      r.drawSphere(o.x, o.y + gy, o.z, radius * (1.6 + i) * pulse, radius * (1.6 + i) * pulse,
        radius * (1.6 + i) * pulse, rgb(color),
        { alpha: 0.16 - i * 0.07, additive: true, emissive: 2.5, noShadow: true });
    }
  }

  // A few props are mostly motion.
  if (prop.type === 'dust') {
    for (let i = 0; i < 5; i++) {
      const t = (time * 0.4 + i * 0.2) % 1;
      r.drawBox(o.x + Math.sin(time + i) * 0.6, 0.3 + t * 1.4, o.z + Math.cos(time * 0.7 + i) * 0.6,
        0.07, 0.07, 0.07, rgb('#b0a894'), { alpha: 0.5, noShadow: true, emissive: 0.2 });
    }
  }
  if (prop.type === 'slips') {
    for (let i = 0; i < 8; i++) {
      const sway = Math.sin(time * 1.2 + i) * 0.12;
      r.drawBox(o.x - 0.7 + i * 0.2 + sway, 1.2 + (i % 3) * 0.35, o.z + (i % 2) * 0.2,
        0.12, 0.26, 0.02, rgb('#efe8d4'), { emissive: 0.35, noShadow: true });
    }
  }
  if (prop.type === 'kettle' || prop.type === 'feast') {
    for (let i = 0; i < 3; i++) {
      const t = ((time * 0.5 + i * 0.33) % 1);
      r.drawBox(o.x + Math.sin(time + i) * 0.2, 0.9 + t * 1.6, o.z,
        0.18, 0.18, 0.18, [1, 1, 1], { alpha: 0.22 * (1 - t), noShadow: true });
    }
  }
}

export { PROPS };
