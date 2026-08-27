// All the art. Everything is rectangles and ellipses drawn at runtime — no
// spritesheets, so the whole game stays one folder of text.

function shadow(ctx, x, y, w = 16, a = 0.28) {
  ctx.globalAlpha = a;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y + 9, w / 2, w / 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------- characters -- */

export function drawActor(ctx, a, time) {
  const dir = a.dir ?? 'down';
  const step = a.walk ?? 0;
  const bob = a.float ? Math.sin(time * 2 + a.x * 0.05) * 2.5 : 0;
  const y = a.y + bob;
  ctx.save();
  if (a.alpha !== undefined) ctx.globalAlpha = a.alpha;

  switch (a.kind) {
    case 'cat': drawCat(ctx, a.x, y, a.palette, dir, step); break;
    case 'hog': drawHog(ctx, a.x, y, a.palette, dir); break;
    case 'frog': drawFrog(ctx, a.x, y, a.palette, dir, step); break;
    case 'shade': drawShade(ctx, a.x, y, a.palette, time); break;
    case 'mite': drawMite(ctx, a.x, y, time); break;
    case 'boilerman': drawBoilerman(ctx, a.x, y, a.palette, time); break;
    case 'hollow': drawHollow(ctx, a.x, y, a.palette, time); break;
    case 'radish': drawRadish(ctx, a.x, y, a.palette); break;
    case 'river': drawRiverGuest(ctx, a.x, y, a.palette, time); break;
    case 'dragon': drawDragon(ctx, a.x, y, a.palette, time); break;
    case 'heir': drawHeir(ctx, a.x, y, a.palette); break;
    default: drawHuman(ctx, a.x, y, a.palette, dir, step, a.scale ?? 1);
  }
  ctx.restore();
}

function drawHuman(ctx, x, y, pal, dir, step, scale = 1) {
  const p = pal ?? { skin: '#e9bd95', hair: '#241c18', cloth: '#c84a5e', trim: '#f2e8d6' };
  const s = scale;
  shadow(ctx, x, y, 16 * s);
  const swing = Math.sin(step) * 3;
  const lift = Math.abs(Math.sin(step)) * 1.5;

  // legs
  ctx.fillStyle = '#3a3038';
  ctx.fillRect(x - 5 * s, y - 2 - lift, 4 * s, 10 * s);
  ctx.fillRect(x + 1 * s, y - 2 + lift, 4 * s, 10 * s);
  // body
  ctx.fillStyle = p.cloth;
  ctx.fillRect(x - 7 * s, y - 15 * s, 14 * s, 14 * s);
  ctx.fillStyle = p.trim;
  ctx.fillRect(x - 7 * s, y - 5 * s, 14 * s, 2 * s);
  // arms
  ctx.fillStyle = p.cloth;
  ctx.fillRect(x - 9 * s, y - 14 * s + swing, 3 * s, 10 * s);
  ctx.fillRect(x + 6 * s, y - 14 * s - swing, 3 * s, 10 * s);
  ctx.fillStyle = p.skin;
  ctx.fillRect(x - 9 * s, y - 5 * s + swing, 3 * s, 3 * s);
  ctx.fillRect(x + 6 * s, y - 5 * s - swing, 3 * s, 3 * s);
  // head
  ctx.fillStyle = p.skin;
  ctx.fillRect(x - 6 * s, y - 26 * s, 12 * s, 12 * s);
  // hair
  ctx.fillStyle = p.hair;
  ctx.fillRect(x - 7 * s, y - 28 * s, 14 * s, 6 * s);
  if (dir === 'down') {
    ctx.fillRect(x - 7 * s, y - 24 * s, 3 * s, 7 * s);
    ctx.fillRect(x + 4 * s, y - 24 * s, 3 * s, 7 * s);
  } else if (dir === 'up') {
    ctx.fillRect(x - 7 * s, y - 26 * s, 14 * s, 12 * s);
  } else {
    const side = dir === 'left' ? -1 : 1;
    ctx.fillRect(x + (side === 1 ? -7 : 4) * s, y - 25 * s, 3 * s, 9 * s);
  }
  // face
  if (dir !== 'up') {
    ctx.fillStyle = '#2a2018';
    if (dir === 'down') {
      ctx.fillRect(x - 4 * s, y - 20 * s, 2 * s, 2 * s);
      ctx.fillRect(x + 2 * s, y - 20 * s, 2 * s, 2 * s);
    } else {
      const side = dir === 'left' ? -4 : 2;
      ctx.fillRect(x + side * s, y - 20 * s, 2 * s, 2 * s);
    }
  }
}

function drawCat(ctx, x, y, pal, dir, step) {
  shadow(ctx, x, y, 14);
  const bob = Math.sin(step) * 1.2;
  ctx.fillStyle = pal.skin;
  ctx.fillRect(x - 9, y - 8 + bob, 18, 8);
  ctx.fillRect(x + (dir === 'left' ? -13 : 5), y - 13 + bob, 9, 8);   // head
  ctx.fillRect(x - 9, y - 1, 3, 4);
  ctx.fillRect(x + 6, y - 1, 3, 4);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x + (dir === 'left' ? -12 : 9), y - 11 + bob, 2, 2);   // eye
  ctx.fillStyle = pal.cloth;
  ctx.fillRect(x + (dir === 'left' ? 8 : -11), y - 12 + bob, 4, 5);   // tail
}

function drawHog(ctx, x, y, pal) {
  shadow(ctx, x, y, 22);
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 8, y - 12, 10, 9);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x + 16, y - 9, 3, 4);            // snout
  ctx.fillStyle = '#241c18';
  ctx.fillRect(x + 12, y - 10, 2, 2);           // eye
  ctx.fillStyle = pal.hair;
  for (const dx of [-9, -3, 3, 8]) ctx.fillRect(x + dx, y - 1, 3, 5);
}

function drawFrog(ctx, x, y, pal, dir, step) {
  shadow(ctx, x, y, 18);
  const squat = Math.abs(Math.sin(step)) * 2;
  ctx.fillStyle = pal.cloth;
  ctx.fillRect(x - 9, y - 14 + squat, 18, 14 - squat);
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.ellipse(x, y - 19 + squat, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f0e0';
  ctx.fillRect(x - 7, y - 24 + squat, 5, 5);
  ctx.fillRect(x + 2, y - 24 + squat, 5, 5);
  ctx.fillStyle = '#101010';
  ctx.fillRect(x - 6, y - 23 + squat, 2, 3);
  ctx.fillRect(x + 3, y - 23 + squat, 2, 3);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x - 9, y - 6, 18, 2);
}

function drawShade(ctx, x, y, pal, time) {
  const wobble = Math.sin(time * 1.6 + x * 0.1) * 2;
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = pal.cloth;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 4);
  ctx.quadraticCurveTo(x - 10 + wobble, y - 20, x, y - 28);
  ctx.quadraticCurveTo(x + 10 + wobble, y - 20, x + 8, y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x - 4, y - 22, 2, 2);
  ctx.fillRect(x + 2, y - 22, 2, 2);
  ctx.globalAlpha = 1;
}

function drawMite(ctx, x, y, time) {
  const hop = Math.abs(Math.sin(time * 6 + x)) * 3;
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(x, y - 6 - hop, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 2, y - 4 - hop);
    ctx.lineTo(x + i * 4, y + 2 - hop);
    ctx.stroke();
  }
  ctx.fillStyle = '#f0c060';
  ctx.fillRect(x - 3, y - 8 - hop, 2, 2);
  ctx.fillRect(x + 1, y - 8 - hop, 2, 2);
}

function drawBoilerman(ctx, x, y, pal, time) {
  shadow(ctx, x, y, 30);
  ctx.fillStyle = pal.cloth;
  ctx.fillRect(x - 14, y - 22, 28, 22);
  // six arms, working
  ctx.fillStyle = pal.skin;
  for (let i = 0; i < 3; i++) {
    const t = Math.sin(time * 3 + i) * 4;
    ctx.fillRect(x - 22 - i * 2, y - 20 + i * 6 + t, 10, 3);
    ctx.fillRect(x + 12 + i * 2, y - 20 + i * 6 - t, 10, 3);
  }
  ctx.fillStyle = pal.skin;
  ctx.fillRect(x - 8, y - 34, 16, 12);
  ctx.fillStyle = pal.hair;
  ctx.fillRect(x - 9, y - 36, 18, 5);
  ctx.fillRect(x - 6, y - 24, 12, 4);          // moustache
  ctx.fillStyle = '#101010';
  ctx.fillRect(x - 5, y - 30, 3, 2);
  ctx.fillRect(x + 2, y - 30, 3, 2);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x - 10, y - 31, 20, 2);         // spectacles
}

function drawHollow(ctx, x, y, pal, time) {
  const sway = Math.sin(time * 1.2 + x * 0.05) * 2;
  shadow(ctx, x, y, 18, 0.35);
  ctx.fillStyle = pal.cloth;
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 4);
  ctx.quadraticCurveTo(x - 12 + sway, y - 26, x, y - 36);
  ctx.quadraticCurveTo(x + 12 + sway, y - 26, x + 10, y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.skin;                    // the mask
  ctx.beginPath();
  ctx.ellipse(x + sway * 0.4, y - 32, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20202a';
  ctx.fillRect(x - 4 + sway * 0.4, y - 35, 3, 4);
  ctx.fillRect(x + 1 + sway * 0.4, y - 35, 3, 4);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x - 3 + sway * 0.4, y - 28, 6, 2);
}

function drawRadish(ctx, x, y, pal) {
  shadow(ctx, x, y, 24);
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.ellipse(x, y - 16, 13, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.trim;
  for (const dx of [-8, 0, 8]) ctx.fillRect(x + dx - 1, y - 38, 3, 8);
  ctx.fillStyle = '#3a3028';
  ctx.fillRect(x - 5, y - 20, 3, 2);
  ctx.fillRect(x + 3, y - 20, 3, 2);
  ctx.fillStyle = '#c04a52';
  ctx.fillRect(x - 12, y - 10, 24, 3);
}

function drawRiverGuest(ctx, x, y, pal, time) {
  shadow(ctx, x, y, 34, 0.4);
  ctx.fillStyle = pal.cloth;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 18 + Math.sin(time * 2 + i) * 3;
    const px = x + Math.cos(a) * r;
    const py = y - 14 + Math.sin(a) * r * 0.7;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x - 8, y - 20, 4, 3);
  ctx.fillRect(x + 4, y - 20, 4, 3);
  ctx.fillStyle = '#6b6250';
  ctx.fillRect(x - 14, y - 6, 8, 3);           // things sticking out of it
  ctx.fillRect(x + 8, y - 10, 9, 3);
}

function drawDragon(ctx, x, y, pal, time) {
  ctx.strokeStyle = '#dfeef0';
  ctx.lineWidth = 9;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const px = x - 40 + t * 80;
    const py = y - 20 + Math.sin(time * 2 + t * 6) * 12;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = pal.cloth;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = 1;
  const hx = x + 40;
  const hy = y - 20 + Math.sin(time * 2 + 6) * 12;
  ctx.fillStyle = '#eff8f8';
  ctx.fillRect(hx - 8, hy - 8, 18, 14);
  ctx.fillStyle = pal.skin;
  ctx.fillRect(hx - 6, hy - 6, 14, 10);
  ctx.fillStyle = '#2a3a44';
  ctx.fillRect(hx + 3, hy - 3, 3, 2);
  ctx.fillStyle = pal.trim;
  ctx.fillRect(hx - 8, hy - 10, 5, 6);
}

function drawHeir(ctx, x, y, pal) {
  shadow(ctx, x, y, 46, 0.3);
  ctx.fillStyle = pal.cloth;
  ctx.beginPath();
  ctx.ellipse(x, y - 18, 24, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.ellipse(x, y - 44, 20, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.hair;
  ctx.fillRect(x - 14, y - 60, 28, 8);
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(x - 8, y - 46, 4, 3);
  ctx.fillRect(x + 5, y - 46, 4, 3);
  ctx.fillStyle = '#b04a52';
  ctx.fillRect(x - 4, y - 38, 8, 3);
}

/* --------------------------------------------------------------- props -- */

export function drawProp(ctx, p, time) {
  const { x, y } = p;
  switch (p.type) {
    case 'boxes':
      shadow(ctx, x, y, 26);
      ctx.fillStyle = '#a5824f';
      ctx.fillRect(x - 13, y - 18, 26, 20);
      ctx.fillStyle = '#8a6a3e';
      ctx.fillRect(x - 13, y - 8, 26, 3);
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(x - 8, y - 15, 16, 4);
      break;
    case 'satchel':
      shadow(ctx, x, y, 18);
      ctx.strokeStyle = '#8a7550';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 14, 9, Math.PI, 0);          // the strap, stitched twice
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#c2ac82';
      ctx.fillRect(x - 9, y - 13, 18, 14);
      ctx.fillStyle = '#a08d68';
      ctx.fillRect(x - 9, y - 13, 18, 5);
      ctx.fillStyle = '#6f5c3c';
      ctx.fillRect(x - 2, y - 9, 4, 3);
      break;
    case 'futon':
      ctx.fillStyle = '#c8bda0';
      ctx.fillRect(x - 20, y - 12, 40, 24);
      ctx.fillStyle = '#a89a7d';
      ctx.fillRect(x - 20, y - 4, 40, 3);
      break;
    case 'shelf':
      shadow(ctx, x, y, 26);
      ctx.fillStyle = '#7c5a3c';
      ctx.fillRect(x - 14, y - 26, 28, 28);
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x - 14, y - 16, 28, 3);
      ctx.fillRect(x - 14, y - 6, 28, 3);
      break;
    case 'plant':
      shadow(ctx, x, y, 16);
      ctx.fillStyle = '#8a5a3a';
      ctx.fillRect(x - 7, y - 8, 14, 10);
      ctx.fillStyle = '#4e8144';
      ctx.beginPath();
      ctx.ellipse(x, y - 16, 11, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'shoes':
      ctx.fillStyle = '#d9718c';
      ctx.fillRect(x - 9, y - 5, 8, 6);
      ctx.fillStyle = '#b0576e';
      ctx.fillRect(x + 1, y - 5, 8, 6);
      break;
    case 'vending':
      shadow(ctx, x, y, 26);
      ctx.fillStyle = '#c23a3a';
      ctx.fillRect(x - 13, y - 34, 26, 36);
      ctx.fillStyle = '#f0e8d0';
      ctx.fillRect(x - 10, y - 31, 20, 16);
      ctx.fillStyle = '#3a6ea5';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 9 + i * 7, y - 29, 5, 12);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x - 10, y - 12, 20, 8);
      break;
    case 'torii':
      ctx.fillStyle = '#b03a30';
      ctx.fillRect(x - 20, y - 44, 40, 6);
      ctx.fillRect(x - 16, y - 34, 32, 4);
      ctx.fillRect(x - 14, y - 44, 6, 46);
      ctx.fillRect(x + 8, y - 44, 6, 46);
      break;
    case 'fox':
      shadow(ctx, x, y, 16);
      ctx.fillStyle = '#8e8b84';
      ctx.fillRect(x - 7, y - 16, 14, 18);
      ctx.fillRect(x - 5, y - 24, 10, 9);
      ctx.fillStyle = '#77746d';
      ctx.fillRect(x - 5, y - 28, 3, 5);
      ctx.fillRect(x + 2, y - 28, 3, 5);
      ctx.fillStyle = '#c23a3a';
      ctx.fillRect(x - 7, y - 15, 14, 4);
      break;
    case 'jizo':
      shadow(ctx, x, y, 14);
      ctx.fillStyle = '#8e8b84';
      ctx.beginPath();
      ctx.ellipse(x, y - 18, 7, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 6, y - 12, 12, 14);
      ctx.fillStyle = '#c23a3a';
      ctx.fillRect(x - 7, y - 12, 14, 6);
      break;
    case 'sign':
      shadow(ctx, x, y, 14);
      ctx.fillStyle = '#6b5638';
      ctx.fillRect(x - 2, y - 20, 4, 22);
      ctx.fillStyle = '#c8bda0';
      ctx.fillRect(x - 14, y - 32, 28, 14);
      ctx.fillStyle = '#5c5040';
      ctx.fillRect(x - 10, y - 28, 20, 2);
      ctx.fillRect(x - 10, y - 24, 14, 2);
      break;
    case 'car':
      shadow(ctx, x, y, 44);
      ctx.fillStyle = '#5a6a86';
      ctx.fillRect(x - 24, y - 18, 48, 18);
      ctx.fillStyle = '#7f8ea8';
      ctx.fillRect(x - 16, y - 28, 30, 11);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(x - 18, y - 2, 10, 6);
      ctx.fillRect(x + 8, y - 2, 10, 6);
      break;
    case 'bench':
      shadow(ctx, x, y, 30);
      ctx.fillStyle = '#7c5a3c';
      ctx.fillRect(x - 16, y - 12, 32, 5);
      ctx.fillRect(x - 16, y - 22, 32, 5);
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x - 14, y - 7, 4, 8);
      ctx.fillRect(x + 10, y - 7, 4, 8);
      break;
    case 'streetlamp':
    case 'lantern':
    case 'lamp': {
      const lit = p.unlit !== true;
      const glow = lit ? 0.5 + Math.sin(time * 2 + x * 0.1) * 0.15 : 0;
      shadow(ctx, x, y, 12);
      ctx.fillStyle = '#4a4038';
      ctx.fillRect(x - 2, y - 26, 4, 28);
      if (lit) {
        ctx.globalAlpha = glow * 0.5;
        ctx.fillStyle = '#ffb44a';
        ctx.beginPath();
        ctx.arc(x, y - 32, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = lit ? '#ffd98a' : '#5a5248';
      ctx.fillRect(x - 7, y - 40, 14, 14);
      ctx.fillStyle = '#8a2f2c';
      ctx.fillRect(x - 8, y - 42, 16, 3);
      ctx.fillRect(x - 8, y - 27, 16, 3);
      break;
    }
    case 'ticket':
      shadow(ctx, x, y, 24);
      ctx.fillStyle = '#3a5a4a';
      ctx.fillRect(x - 12, y - 32, 24, 34);
      ctx.fillStyle = '#8ad0e0';
      ctx.fillRect(x - 9, y - 28, 18, 12);
      ctx.fillStyle = '#e8e0cc';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 9 + i * 7, y - 13, 5, 5);
      break;
    case 'kiosk':
      shadow(ctx, x, y, 30);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - 16, y - 26, 32, 28);
      ctx.fillStyle = '#c8bda0';
      ctx.fillRect(x - 16, y - 32, 32, 7);
      break;
    case 'board':
      ctx.fillStyle = '#20242c';
      ctx.fillRect(x - 22, y - 30, 44, 26);
      ctx.fillStyle = '#e0c060';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 18, y - 26 + i * 6, 30 - i * 4, 3);
      break;
    case 'train':
      ctx.fillStyle = '#8a9aa8';
      ctx.fillRect(x - 200, y - 26, 400, 40);
      ctx.fillStyle = '#2a4a6a';
      ctx.fillRect(x - 200, y - 20, 400, 10);
      ctx.fillStyle = '#c8e0f0';
      for (let i = -180; i < 200; i += 40) ctx.fillRect(x + i, y - 16, 24, 12);
      break;
    case 'strap':
      ctx.fillStyle = '#8a7550';
      ctx.fillRect(x - 1, y - 30, 2, 14);
      ctx.strokeStyle = '#c8bda0';
      ctx.strokeRect(x - 5, y - 17, 10, 8);
      break;
    case 'trainwindow':
      ctx.fillStyle = 'rgba(160,200,220,0.25)';
      ctx.fillRect(x - 40, y - 10, 80, 20);
      break;
    case 'scarecrow':
      shadow(ctx, x, y, 16);
      ctx.fillStyle = '#6b5638';
      ctx.fillRect(x - 2, y - 34, 4, 36);
      ctx.fillRect(x - 16, y - 26, 32, 4);
      ctx.fillStyle = '#3f5f8a';
      ctx.fillRect(x - 12, y - 26, 24, 16);
      ctx.fillStyle = '#c8bda0';
      ctx.beginPath();
      ctx.arc(x, y - 34, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'well':
      shadow(ctx, x, y, 30);
      ctx.fillStyle = '#6c6a65';
      ctx.fillRect(x - 15, y - 14, 30, 16);
      ctx.fillStyle = '#101418';
      ctx.beginPath();
      ctx.ellipse(x, y - 14, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b5638';
      ctx.fillRect(x - 14, y - 40, 3, 26);
      ctx.fillRect(x + 11, y - 40, 3, 26);
      ctx.fillStyle = '#8d2f2c';
      ctx.fillRect(x - 18, y - 44, 36, 6);
      break;
    case 'bicycle':
      shadow(ctx, x, y, 26);
      ctx.strokeStyle = '#7a6a58';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - 9, y - 6, 7, 0, Math.PI * 2);
      ctx.arc(x + 9, y - 6, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 6); ctx.lineTo(x, y - 18); ctx.lineTo(x + 9, y - 6);
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    case 'dust':
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#8a8578';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(x - 20 + i * 8, y - 4 + Math.sin(time + i) * 3, 3, 3);
      }
      ctx.globalAlpha = 1;
      break;
    case 'feast': {
      shadow(ctx, x, y, 44);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - 24, y - 14, 48, 14);
      ctx.fillStyle = '#e0b060';
      ctx.fillRect(x - 18, y - 20, 12, 7);
      ctx.fillStyle = '#c05a4a';
      ctx.fillRect(x - 2, y - 22, 14, 9);
      ctx.fillStyle = '#f0e8d0';
      ctx.fillRect(x + 14, y - 19, 8, 6);
      ctx.globalAlpha = 0.35;                    // steam
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const t = (time * 22 + i * 30) % 40;
        ctx.fillRect(x - 12 + i * 12, y - 24 - t, 3, 6);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'clock':
      ctx.fillStyle = '#2a2620';
      ctx.beginPath();
      ctx.arc(x, y - 20, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d6cdb4';
      ctx.beginPath();
      ctx.arc(x, y - 20, 11, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'pot':
      shadow(ctx, x, y, 20);
      ctx.fillStyle = '#3a3630';
      ctx.beginPath();
      ctx.ellipse(x, y - 10, 11, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'chute':
      ctx.fillStyle = '#8a7a4a';
      ctx.fillRect(x - 12, y - 30, 24, 30);
      ctx.fillStyle = '#3a3630';
      ctx.fillRect(x - 6, y - 24, 12, 6);
      break;
    case 'lift':
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(x - 20, y - 46, 40, 48);
      ctx.fillStyle = '#20201c';
      ctx.fillRect(x - 14, y - 40, 28, 40);
      ctx.fillStyle = '#c8a860';
      ctx.fillRect(x - 20, y - 50, 40, 5);
      break;
    case 'bucket':
      shadow(ctx, x, y, 14);
      ctx.fillStyle = '#7c5a3c';
      ctx.fillRect(x - 7, y - 12, 14, 12);
      ctx.fillStyle = '#4a8090';
      ctx.fillRect(x - 6, y - 11, 12, 3);
      break;
    case 'ledger':
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - 14, y - 8, 28, 8);
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(x - 10, y - 14, 20, 7);
      break;
    case 'coal':
      shadow(ctx, x, y, 30);
      ctx.fillStyle = '#1a1a1c';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 10, y - 6 + Math.sin(a) * 5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'drawers':
      ctx.fillStyle = '#6b4b31';
      ctx.fillRect(x - 16, y - 26, 32, 28);
      ctx.fillStyle = '#c8a860';
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) ctx.fillRect(x - 13 + c * 10, y - 23 + r * 9, 8, 7);
      }
      break;
    case 'kettle':
      shadow(ctx, x, y, 28);
      ctx.fillStyle = '#3a3630';
      ctx.beginPath();
      ctx.ellipse(x, y - 12, 15, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 4, y - 30, 8, 8);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 2, y - 34 - ((time * 20 + i * 14) % 30), 4, 6);
      ctx.globalAlpha = 1;
      break;
    case 'contract':
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(x - 12, y - 20, 24, 22);
      ctx.fillStyle = '#4a4038';
      for (let i = 0; i < 5; i++) ctx.fillRect(x - 8 + i * 4, y - 16, 2, 14);
      break;
    case 'brazier':
      shadow(ctx, x, y, 24);
      ctx.fillStyle = '#3a3630';
      ctx.fillRect(x - 12, y - 12, 24, 12);
      ctx.fillStyle = '#ff9040';
      ctx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.2;
      ctx.beginPath();
      ctx.ellipse(x, y - 14, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'namebox':
      shadow(ctx, x, y, 22);
      ctx.fillStyle = '#2a1a20';
      ctx.fillRect(x - 12, y - 14, 24, 14);
      ctx.fillStyle = '#c8a860';
      ctx.fillRect(x - 12, y - 17, 24, 4);
      break;
    case 'railcar':
      shadow(ctx, x, y, 60);
      ctx.fillStyle = '#3a4a58';
      ctx.fillRect(x - 40, y - 30, 80, 32);
      ctx.fillStyle = '#c8e0f0';
      for (let i = -34; i < 40; i += 18) ctx.fillRect(x + i, y - 24, 12, 14);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(x - 40, y - 4, 80, 5);
      break;
    case 'wheel':
      shadow(ctx, x, y, 26);
      ctx.strokeStyle = '#7c5a3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 14, 13, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = time * 1.5 + (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + Math.cos(a) * 13, y - 14 + Math.sin(a) * 13);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      break;
    case 'slips':
      for (let i = 0; i < 7; i++) {
        const sway = Math.sin(time * 1.4 + i) * 2;
        ctx.fillStyle = '#efe8d4';
        ctx.fillRect(x - 18 + i * 6 + sway, y - 28 + (i % 3) * 9, 4, 9);
      }
      break;
    default:
      shadow(ctx, x, y, 18);
      ctx.fillStyle = '#8a7550';
      ctx.fillRect(x - 9, y - 14, 18, 16);
      break;
  }
  ctx.globalAlpha = 1;
}
