// Screen furniture: dialogue, menus, journal, title and ending cards.
// Everything is drawn in the canvas so the game is one surface.

import { inventoryList, MAX_HEART, chapter } from '../systems/state.js';
import { SIDE_QUESTS } from '../data/quests.js';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';
const INK = '#f2ece0';
const DIM = '#a79f8e';
const GOLD = '#e8c46a';

export function font(ctx, size, weight = '') {
  ctx.font = `${weight} ${size}px ${FONT}`.trim();
}

export function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function panel(ctx, x, y, w, h, alpha = 0.88) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#14121f';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#5c5270';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------ dialogue -- */

export function drawDialogue(ctx, W, H, view) {
  const boxH = 150;
  const y = H - boxH - 12;
  panel(ctx, 24, y, W - 48, boxH);

  if (view.speaker) {
    font(ctx, 15, 'bold');
    const w = ctx.measureText(view.speaker).width + 24;
    ctx.fillStyle = '#14121f';
    ctx.fillRect(36, y - 15, w, 26);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(37, y - 14, w - 2, 24);
    ctx.fillStyle = GOLD;
    ctx.fillText(view.speaker, 48, y + 3);
  }

  font(ctx, 16);
  ctx.fillStyle = INK;
  const lines = wrap(ctx, view.text, W - 110);
  let shown = view.revealed ?? Infinity;
  let ty = y + 40;
  for (const line of lines.slice(0, 4)) {
    const cut = Math.max(0, Math.min(line.length, shown));
    ctx.fillText(line.slice(0, cut), 48, ty);
    shown -= line.length;
    ty += 24;
    if (shown <= 0) break;
  }

  if (view.choices) {
    const cy = y + 40 + Math.min(4, lines.length) * 24 + 6;
    font(ctx, 15);
    view.choices.forEach((choice, i) => {
      const sel = i === view.choiceIndex;
      ctx.fillStyle = sel ? GOLD : DIM;
      ctx.fillText(`${sel ? '▸' : ' '} ${choice.text}`, 56, cy + i * 21);
    });
  } else if (view.complete) {
    font(ctx, 13);
    ctx.fillStyle = DIM;
    const hint = view.more ? '▾ more' : '▾ close';
    ctx.fillText(hint, W - 110, y + boxH - 16);
  }
}

/* --------------------------------------------------------------- toast -- */

export function drawToasts(ctx, W, toasts) {
  // Top left, clear of the minimap and of wherever Aiko happens to be standing.
  font(ctx, 14);
  toasts.forEach((t, i) => {
    const alpha = Math.min(1, t.life / 0.6);
    const lines = wrap(ctx, t.text, W * 0.52);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28;
    const h = 10 + lines.length * 19;
    const y = 86 + i * (h + 8);
    ctx.globalAlpha = 0.85 * alpha;
    ctx.fillStyle = '#14121f';
    ctx.fillRect(16, y, w, h);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.strokeRect(16, y, w, h);
    ctx.fillStyle = INK;
    lines.forEach((line, j) => ctx.fillText(line, 30, y + 20 + j * 19));
    ctx.globalAlpha = 1;
  });
}

/* ----------------------------------------------------------------- hud -- */

export function drawStatus(ctx, W, state, area, fps) {
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#14121f';
  ctx.fillRect(0, 0, W, 58);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3a3550';
  ctx.fillRect(0, 57, W, 1);

  font(ctx, 15, 'bold');
  ctx.fillStyle = GOLD;
  ctx.fillText(state.calledName, 18, 24);

  font(ctx, 12);
  ctx.fillStyle = DIM;
  ctx.fillText(area.name, 18, 44);

  // Hearts, and how far Aiko has faded.
  for (let i = 0; i < MAX_HEART; i++) {
    const on = i < state.heart;
    ctx.fillStyle = on ? '#d0566e' : '#3a3448';
    const hx = 150 + i * 18;
    ctx.fillRect(hx, 14, 6, 6);
    ctx.fillRect(hx + 8, 14, 6, 6);
    ctx.fillRect(hx, 20, 14, 5);
    ctx.fillRect(hx + 3, 25, 8, 4);
  }

  const ch = chapter(state);
  font(ctx, 13, 'bold');
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.fillText(ch.title, W - 18, 24);
  font(ctx, 12);
  ctx.fillStyle = DIM;
  // The objective is the one thing that must always be readable, so it gets
  // room for three lines and the bar is sized to hold them.
  wrap(ctx, ch.objective, Math.min(560, W * 0.56)).slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, W - 18, 40 + i * 15);
  });
  ctx.textAlign = 'left';

  if (fps) {
    font(ctx, 10);
    ctx.fillStyle = '#4a4458';
    ctx.fillText(`${fps | 0}`, W - 8, 56);
  }
}

export function drawPrompt(ctx, W, H, text) {
  font(ctx, 14);
  const w = ctx.measureText(text).width + 28;
  const x = (W - w) / 2;
  const y = H - 42;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#14121f';
  ctx.fillRect(x, y, w, 28);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, 28);
  ctx.fillStyle = INK;
  ctx.fillText(text, x + 14, y + 19);
}

/* ------------------------------------------------------------- journal -- */

export function drawJournal(ctx, W, H, state) {
  panel(ctx, 60, 70, W - 120, H - 140, 0.94);
  font(ctx, 18, 'bold');
  ctx.fillStyle = GOLD;
  ctx.fillText('Journal', 92, 108);

  const ch = chapter(state);
  font(ctx, 14, 'bold');
  ctx.fillStyle = INK;
  ctx.fillText(ch.title, 92, 140);
  font(ctx, 13);
  ctx.fillStyle = DIM;
  wrap(ctx, ch.objective, W - 260).forEach((l, i) => ctx.fillText(l, 92, 160 + i * 18));
  ctx.fillStyle = '#6a6280';
  ctx.fillText(ch.where, 92, 202);

  font(ctx, 13, 'bold');
  ctx.fillStyle = GOLD;
  ctx.fillText('Threads', 92, 236);
  font(ctx, 12);
  let y = 258;
  for (const [id, q] of Object.entries(SIDE_QUESTS)) {
    const prog = state.side[id] ?? 0;
    if (prog === 0 && !state.flags[`hint_${id}`]) continue;
    const done = prog >= q.steps;
    ctx.fillStyle = done ? '#8fc08a' : INK;
    ctx.fillText(`${done ? '✓' : '·'} ${q.name} (${prog}/${q.steps})`, 92, y);
    y += 18;
  }
  if (y === 258) {
    ctx.fillStyle = DIM;
    ctx.fillText('Nothing yet.', 92, y);
  }

  font(ctx, 13, 'bold');
  ctx.fillStyle = GOLD;
  ctx.fillText('What happened', W / 2 + 20, 236);
  font(ctx, 12);
  ctx.fillStyle = DIM;
  const recent = state.journal.slice(-11);
  recent.forEach((line, i) => {
    const l = wrap(ctx, line, W / 2 - 100)[0];
    ctx.fillText(`· ${l}`, W / 2 + 20, 258 + i * 18);
  });

  font(ctx, 12);
  ctx.fillStyle = '#6a6280';
  ctx.fillText('J or Esc to close', 92, H - 92);
}

/* ----------------------------------------------------------- inventory -- */

export function drawInventory(ctx, W, H, state, index) {
  panel(ctx, 120, 80, W - 240, H - 160, 0.94);
  font(ctx, 18, 'bold');
  ctx.fillStyle = GOLD;
  ctx.fillText('Satchel', 152, 118);

  const items = inventoryList(state);
  if (!items.length) {
    font(ctx, 14);
    ctx.fillStyle = DIM;
    ctx.fillText('Empty. Even the lining.', 152, 156);
    return items;
  }

  font(ctx, 14);
  items.slice(0, 12).forEach((item, i) => {
    const sel = i === index;
    ctx.fillStyle = sel ? GOLD : INK;
    const qty = item.qty > 1 ? ` ×${item.qty}` : '';
    ctx.fillText(`${sel ? '▸' : ' '} ${item.name}${qty}`, 152, 152 + i * 22);
  });

  const sel = items[Math.min(index, items.length - 1)];
  if (sel) {
    font(ctx, 13);
    ctx.fillStyle = DIM;
    wrap(ctx, sel.desc, W / 2 - 90).forEach((l, i) => ctx.fillText(l, W / 2 + 20, 152 + i * 20));
    if (sel.heals) {
      ctx.fillStyle = '#8fc08a';
      ctx.fillText('[Enter] eat', W / 2 + 20, H - 132);
    }
  }
  font(ctx, 12);
  ctx.fillStyle = '#6a6280';
  ctx.fillText('I or Esc to close', 152, H - 108);
  return items;
}

/* --------------------------------------------------------------- title -- */

export function drawTitle(ctx, W, H, time, options, index) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1330');
  g.addColorStop(0.55, '#2a1d3c');
  g.addColorStop(1, '#0b0d14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Lanterns drifting up behind the title.
  for (let i = 0; i < 22; i++) {
    const t = (time * 0.16 + i * 0.37) % 1;
    const x = ((i * 137) % W) + Math.sin(time * 0.6 + i) * 18;
    const y = H - t * (H + 60);
    ctx.globalAlpha = 0.16 + (1 - t) * 0.5;
    ctx.fillStyle = '#ffb44a';
    ctx.fillRect(x, y, 5, 7);
    ctx.globalAlpha = 0.09;
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  font(ctx, 58, 'bold');
  ctx.fillStyle = '#f6efe0';
  ctx.fillText('SPIRITED', W / 2, H / 2 - 60);
  font(ctx, 18);
  ctx.fillStyle = GOLD;
  ctx.fillText('The Long Way Home', W / 2, H / 2 - 28);
  font(ctx, 13);
  ctx.fillStyle = DIM;
  ctx.fillText('Leave the city. Take on a ruin. Grow something.', W / 2, H / 2 + 2);

  font(ctx, 16);
  options.forEach((opt, i) => {
    const sel = i === index;
    ctx.fillStyle = opt.disabled ? '#4a4458' : sel ? GOLD : INK;
    ctx.fillText(`${sel ? '▸ ' : ''}${opt.label}`, W / 2, H / 2 + 62 + i * 30);
  });

  font(ctx, 11);
  ctx.fillStyle = '#5a5470';
  ctx.fillText('Arrows / WASD move · Space acts · J journal · I bag · V camera · M mute · Esc menu', W / 2, H - 28);
  ctx.textAlign = 'left';
}

/* -------------------------------------------------------------- ending -- */

export function drawEnding(ctx, W, H, state, time, lines, isLast = true) {
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, 'rgba(255, 214, 150, 0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  font(ctx, 30, 'bold');
  ctx.fillStyle = '#f6efe0';
  ctx.fillText('The Long Way Home', W / 2, 92);

  font(ctx, 14);
  let y = 150;
  for (const line of lines) {
    ctx.fillStyle = line.dim ? DIM : INK;
    for (const l of wrap(ctx, line.text, W - 260)) {
      ctx.fillText(l, W / 2, y);
      y += 22;
    }
    y += 8;
  }

  font(ctx, 12);
  ctx.fillStyle = '#6a6280';
  const mins = Math.floor(state.stats.seconds / 60);
  ctx.fillText(`${mins} minutes · ${state.stats.steps} steps · ${state.stats.spiritsMet} spirits spoken to`, W / 2, H - 62);
  ctx.fillStyle = GOLD;
  ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.35;
  ctx.fillText(isLast ? 'Press Space' : 'Press Space  ▾', W / 2, H - 32);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/* ---------------------------------------------------------------- menu -- */

export function drawMenu(ctx, W, H, options, index, title = 'Paused') {
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  panel(ctx, W / 2 - 150, H / 2 - 120, 300, 240);
  ctx.textAlign = 'center';
  font(ctx, 20, 'bold');
  ctx.fillStyle = GOLD;
  ctx.fillText(title, W / 2, H / 2 - 76);
  font(ctx, 15);
  options.forEach((opt, i) => {
    ctx.fillStyle = i === index ? GOLD : opt.disabled ? '#4a4458' : INK;
    ctx.fillText(`${i === index ? '▸ ' : ''}${opt.label}`, W / 2, H / 2 - 30 + i * 30);
  });
  ctx.textAlign = 'left';
}

/* ------------------------------------------------------------- minimap -- */

export function drawMinimap(ctx, W, area, player, scale = 2) {
  const mw = Math.min(150, area.w * scale);
  const mh = Math.min(110, area.h * scale);
  const x = W - mw - 16;
  const y = 84;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#0d0b16';
  ctx.fillRect(x, y, mw, mh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#4a4458';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, mw, mh);

  const sx = mw / area.w;
  const sy = mh / area.h;
  ctx.fillStyle = '#6f6a8a';
  for (const portal of area.portals) {
    ctx.fillRect(x + portal.tx * sx, y + portal.ty * sy, Math.max(2, portal.tw * sx), Math.max(2, portal.th * sy));
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(x + (player.x / 32) * sx - 1, y + (player.y / 32) * sy - 1, 3, 3);
}
