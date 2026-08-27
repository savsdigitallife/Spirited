// The game itself: modes, the update/draw loop, and the glue between the
// world data, the dialogue runner and the state reducer.

import { Input } from './core/input.js';
import { Sound } from './core/audio.js';
import { startLoop } from './core/loop.js';
import { Weather } from './render/weather.js';
import { Renderer3D } from './render3d/renderer3d.js';
import { drawActor3D, drawProp3D } from './render3d/models3d.js';
import * as HUD from './render/hud.js';
import { Player, Npc } from './entities/actors.js';
import { getArea } from './world/index.js';
import { TILE_SIZE } from './world/tiles.js';
import { tileAt } from './world/mapbuilder.js';
import { groundAt } from './render3d/materials3d.js';
import { stepSurface } from './systems/surfaces.js';
import { Dialogue } from './systems/dialogue.js';
import { SCRIPTS } from './data/script.js';
import {
  createState, applyEffects, test, flag, setFlag, tickFade,
  inventoryList, hasItem, sideDone, atLeast, chapter, MAX_HEART
} from './systems/state.js';
import { saveGame, loadGame, saveInfo, clearSave, canStore } from './systems/save.js';

const W = 960;
const H = 540;
const INTERACT_RANGE = 30;

export class Game {
  constructor(canvas, hudCanvas) {
    this.canvas = canvas;
    this.hudCanvas = hudCanvas;
    this.ctx = hudCanvas.getContext('2d');
    this.ctx.textBaseline = 'alphabetic';
    this.input = new Input(window);
    this.sound = new Sound();
    this.renderer = new Renderer3D(canvas);
    this.hudW = W;
    this.hudH = H;
    this.hudScale = 1;
    this.shake = 0;
    this.weather = new Weather(W, H);
    this.state = createState();
    this.player = new Player(this.state.player.x, this.state.player.y);
    this.area = getArea('flat');
    this.npcs = [];
    this.toasts = [];
    this.dialogue = null;
    this.pages = [];
    this.pageIndex = 0;
    this.revealed = 0;
    this.choiceIndex = 0;
    this.cutsceneQueue = [];
    this.pendingTeleport = null;
    this.mode = 'title';
    this.menuIndex = 0;
    this.invIndex = 0;
    this.time = 0;
    this.portalLock = false;
    this.denyCooldown = 0;
    this.endingLines = [];
    this.endingPages = [[]];
    this.endingPage = 0;
    this.endingIsAbout = false;
    this.fps = 0;

    this.titleOptions = this.buildTitleOptions();
    this.stop = startLoop((dt, now) => this.frame(dt, now));
  }

  /* ------------------------------------------------------------- setup -- */

  buildTitleOptions() {
    const info = saveInfo('auto');
    return [
      { id: 'new', label: 'New Game' },
      { id: 'continue', label: info ? `Continue — ${info.name}, ${info.area}` : 'Continue (no save)', disabled: !info },
      { id: 'about', label: 'About' }
    ];
  }

  newGame() {
    this.state = createState();
    this.state.started = true;
    this.enterArea(this.state.player.area, this.state.player.x, this.state.player.y, 'down', true);
    this.mode = 'play';
    this.toast('Moving day. The flat is boxes and echoes.');
    this.pushJournalIntro();
  }

  pushJournalIntro() {
    this.state.journal.push('Chapter 1 — Moving Day');
  }

  continueGame() {
    const data = loadGame('auto');
    if (!data) return false;
    this.state = data;
    this.enterArea(data.player.area, data.player.x, data.player.y, data.player.dir, true);
    this.mode = 'play';
    this.toast('Loaded.');
    return true;
  }

  /* -------------------------------------------------------------- area -- */

  enterArea(id, x, y, dir, snap = false) {
    this.area = getArea(id);
    this.player.placeAt(x, y, dir);
    this.state.player = { area: id, x, y, dir: this.player.dir };
    this.state.visited[id] = (this.state.visited[id] ?? 0) + 1;
    this.refreshEntities();
    this.renderer.loadArea(this.area);
    this.weather.set(this.area.weather);
    this.sound.play(this.area.music);
    this.portalLock = true;
    saveGame(this.state, 'auto');
  }

  // NPCs and props can appear or vanish as the story moves.
  refreshEntities() {
    const visible = this.area.npcs.filter((def) => this.shows(def));
    const keep = new Map(this.npcs.map((n) => [n.id, n]));
    this.npcs = visible.map((def) => {
      const existing = keep.get(def.id);
      if (existing && existing.script === def.script) return existing;
      return new Npc(def);
    });
    this.props = this.area.props.filter((p) => this.shows(p));
  }

  shows(def) {
    if (def.showIf && !test(this.state, def.showIf)) return false;
    if (def.hideIf && test(this.state, def.hideIf)) return false;
    return true;
  }

  blockers() {
    const list = this.npcs.map((n) => ({ x: n.x, y: n.y, hw: 9, hh: 7, owner: n }));
    for (const p of this.props) {
      if (p.solid) list.push({ x: p.x, y: p.y, hw: 14, hh: 10, owner: p });
    }
    return list;
  }

  /* ------------------------------------------------------------- frame -- */

  frame(dt, now) {
    this.time = now;
    this.fps = this.fps * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1;
    if (this.input.anyKeySince > 0) this.sound.ensure();

    switch (this.mode) {
      case 'title': this.updateTitle(); break;
      case 'play': this.updatePlay(dt); break;
      case 'dialogue': this.updateDialogue(dt); break;
      case 'journal': this.updateOverlay('journal'); break;
      case 'inventory': this.updateInventory(); break;
      case 'menu': this.updateMenu(); break;
      case 'ending': this.updateEnding(); break;
      default: break;
    }

    if (this.input.pressed('BracketLeft')) this.renderer.zoom = Math.max(0.6, this.renderer.zoom - 0.15);
    if (this.input.pressed('BracketRight')) this.renderer.zoom = Math.min(1.8, this.renderer.zoom + 0.15);

    if (this.input.pressed('KeyM')) {
      const muted = this.sound.toggleMute();
      this.toast(muted ? 'Sound off' : 'Sound on');
    }

    this.weather.update(dt);
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    this.draw();
    this.input.endFrame();
  }

  /* -------------------------------------------------------------- play -- */

  updatePlay(dt) {
    this.state.stats.seconds += dt;
    const blockers = this.blockers();

    this.player.update(dt, this.input.axis(), this.area, blockers, () => {
      this.state.stats.steps++;
      // Footsteps take their sound from whatever she is standing on.
      const surface = stepSurface(tileAt(this.area,
        Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE)));
      this.sound.footstep(surface, this.area.tint === 'neon');
    });
    this.state.player = { area: this.area.id, x: this.player.x, y: this.player.y, dir: this.player.dir };

    for (const npc of this.npcs) npc.update(dt, this.area, blockers);
    this.shake = Math.max(0, this.shake - dt * 9);

    const outcome = tickFade(this.state, dt, this.area.spirit);
    if (outcome === 'thin') {
      this.toast('You are going see-through at the fingers. Eat something.');
      this.sound.sfx('dread');
    } else if (outcome === 'collapse') {
      this.collapse();
    }

    this.target = this.findTarget();
    if (this.input.confirm && this.target) this.startDialogue(this.target);

    if (this.input.pressed('KeyJ', 'Tab')) this.mode = 'journal';
    if (this.input.pressed('KeyI')) { this.mode = 'inventory'; this.invIndex = 0; }
    if (this.input.cancel) { this.mode = 'menu'; this.menuIndex = 0; }

    this.denyCooldown = Math.max(0, this.denyCooldown - dt);
    this.checkTriggers();
    this.checkPortals();
  }

  collapse() {
    this.state.heart = 2;
    this.state.fade = 0;
    this.enterArea('boiler', 35 * TILE_SIZE + 16, 16 * TILE_SIZE + 16, 'right', true);
    this.toast('You wake on the boiler floor with a blanket over you.');
    this.sound.sfx('chime');
  }

  findTarget() {
    const reach = this.player.facing(20);
    let best = null;
    let bestDist = INTERACT_RANGE;
    const consider = (entity, label, script) => {
      if (!script) return;
      const d = Math.hypot(entity.x - reach.x, entity.y - reach.y);
      if (d < bestDist) {
        bestDist = d;
        best = { entity, label, script };
      }
    };
    for (const npc of this.npcs) consider(npc, `Talk to ${npc.name}`, npc.script);
    for (const prop of this.props) consider(prop, 'Look', prop.script);
    return best;
  }

  /* ---------------------------------------------------------- dialogue -- */

  startDialogue(target, speakerOverride) {
    const build = SCRIPTS[target.script];
    if (!build) return;
    const script = build(this.state);
    if (!script) return;
    if (target.entity?.faceTowards) target.entity.faceTowards(this.player);
    if (target.entity && !this.state.talked[target.entity.id]) {
      this.state.talked[target.entity.id] = true;
      if (target.entity.kind && target.entity.kind !== 'human') this.state.stats.spiritsMet++;
    }
    this.dialogue = new Dialogue(script, this.state, { speaker: speakerOverride ?? target.entity?.name ?? '' });
    this.mode = 'dialogue';
    this.sound.sfx('blip');
    this.syncDialogue();
  }

  playCutscene(id) {
    const build = SCRIPTS[id];
    if (!build) return;
    this.dialogue = new Dialogue(build(this.state), this.state, { speaker: '' });
    this.mode = 'dialogue';
    this.syncDialogue();
  }

  // Pull the current node into the view model: effects, paged text, choices.
  syncDialogue() {
    this.handleEvents(applyEffects(this.state, this.dialogue.drain()));
    if (this.dialogue.finished) {
      this.closeDialogue();
      return;
    }
    HUD.font(this.ctx, 16);
    const lines = HUD.wrap(this.ctx, this.dialogue.text(), this.hudW - 110);
    this.pages = [];
    for (let i = 0; i < lines.length; i += 4) this.pages.push(lines.slice(i, i + 4));
    if (!this.pages.length) this.pages = [['']];
    this.pageIndex = 0;
    this.revealed = 0;
    this.choiceIndex = 0;
  }

  closeDialogue() {
    this.dialogue = null;
    this.mode = 'play';
    this.refreshEntities();
    if (this.cutsceneQueue.length) {
      const next = this.cutsceneQueue.shift();
      this.playCutscene(next);
      return;
    }
    if (this.pendingTeleport) {
      const to = this.pendingTeleport;
      this.pendingTeleport = null;
      this.enterArea(to.area, to.x, to.y, to.dir, true);
      this.sound.sfx('door');
    }
    saveGame(this.state, 'auto');
  }

  updateDialogue(dt) {
    const page = this.pages[this.pageIndex] ?? [''];
    const total = page.join('').length;
    if (this.revealed < total) {
      this.revealed += dt * 90;
      if (Math.random() < 0.4) this.sound.sfx('talk');
    }
    const complete = this.revealed >= total;
    const choices = complete && this.pageIndex === this.pages.length - 1 ? this.dialogue.choices() : null;

    if (choices) {
      const step = this.input.menuStep();
      if (step) {
        this.choiceIndex = (this.choiceIndex + step + choices.length) % choices.length;
        this.sound.sfx('blip');
      }
      if (this.input.confirm) {
        this.dialogue.choose(this.choiceIndex);
        this.sound.sfx('blip');
        this.syncDialogue();
      }
      return;
    }

    if (this.input.confirm) {
      if (!complete) {
        this.revealed = total;
        return;
      }
      if (this.pageIndex < this.pages.length - 1) {
        this.pageIndex++;
        this.revealed = 0;
        return;
      }
      this.dialogue.advance();
      this.syncDialogue();
    }
  }

  /* ----------------------------------------------------------- effects -- */

  handleEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'toast': this.toast(ev.text); break;
        case 'sfx': this.sound.sfx(ev.id); break;
        case 'music': this.sound.play(ev.id); break;
        case 'shake': this.shake = Math.max(this.shake, (ev.power ?? 6) * 0.05); break;
        case 'chapter': this.refreshEntities(); break;
        case 'rename': this.toast(`They call you ${ev.name} now.`); break;
        case 'teleport': this.pendingTeleport = ev.to; break;
        case 'cutscene': this.cutsceneQueue.push(ev.id); break;
        case 'ending': this.startEnding(); break;
        default: break;
      }
    }
    this.refreshEntities();
  }

  toast(text) {
    this.toasts.push({ text, life: 4.2 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  /* ----------------------------------------------------------- portals -- */

  checkPortals() {
    const tx = Math.floor(this.player.x / TILE_SIZE);
    const ty = Math.floor(this.player.y / TILE_SIZE);
    const inside = this.area.portals.find(
      (p) => tx >= p.tx && tx < p.tx + p.tw && ty >= p.ty && ty < p.ty + p.th
    );
    if (!inside) {
      this.portalLock = false;
      return;
    }
    if (this.portalLock) return;

    if (inside.cond && !test(this.state, inside.cond)) {
      if (this.denyCooldown <= 0 && inside.denyText) {
        this.toast(inside.denyText);
        this.sound.sfx('deny');
        this.denyCooldown = 3.5;
      }
      return;
    }
    this.sound.sfx('door');
    this.enterArea(inside.to.area, inside.to.x, inside.to.y, inside.to.dir, true);
  }

  checkTriggers() {
    const tx = Math.floor(this.player.x / TILE_SIZE);
    const ty = Math.floor(this.player.y / TILE_SIZE);
    for (const trig of this.area.triggers) {
      const key = `trig:${this.area.id}:${trig.id}`;
      if (trig.once && flag(this.state, key)) continue;
      if (tx < trig.tx || ty < trig.ty || tx >= trig.tx + trig.tw || ty >= trig.ty + trig.th) continue;
      if (trig.cond && !test(this.state, trig.cond)) continue;
      if (trig.once) setFlag(this.state, key);
      this.handleEvents(applyEffects(this.state, trig.fx ?? []));
      if (this.cutsceneQueue.length && this.mode === 'play') {
        this.playCutscene(this.cutsceneQueue.shift());
      }
    }
  }

  /* --------------------------------------------------------- overlays -- */

  updateOverlay(which) {
    if (this.input.pressed('KeyJ', 'Tab') || this.input.cancel) this.mode = 'play';
  }

  updateInventory() {
    const items = inventoryList(this.state);
    const step = this.input.menuStep();
    if (step && items.length) {
      this.invIndex = (this.invIndex + step + items.length) % items.length;
      this.sound.sfx('blip');
    }
    if (this.input.confirm && items[this.invIndex]?.heals) {
      this.handleEvents(applyEffects(this.state, [{ type: 'eat', id: items[this.invIndex].id }]));
      this.invIndex = 0;
    }
    if (this.input.pressed('KeyI') || this.input.cancel) this.mode = 'play';
  }

  menuOptions() {
    return [
      { id: 'resume', label: 'Resume' },
      { id: 'save', label: 'Save' },
      { id: 'load', label: 'Load last save', disabled: !saveInfo('auto') },
      { id: 'title', label: 'Back to title' }
    ];
  }

  updateMenu() {
    const options = this.menuOptions();
    const step = this.input.menuStep();
    if (step) {
      this.menuIndex = (this.menuIndex + step + options.length) % options.length;
      this.sound.sfx('blip');
    }
    if (this.input.cancel) this.mode = 'play';
    if (!this.input.confirm) return;
    const opt = options[this.menuIndex];
    if (opt.disabled) return;
    switch (opt.id) {
      case 'resume': this.mode = 'play'; break;
      case 'save':
        this.toast(saveGame(this.state, 'auto') ? 'Saved.' : 'This browser will not let the game save.');
        this.mode = 'play';
        break;
      case 'load':
        if (this.continueGame()) this.mode = 'play';
        break;
      case 'title':
        this.titleOptions = this.buildTitleOptions();
        this.menuIndex = 0;
        this.mode = 'title';
        this.sound.play('title');
        break;
      default: break;
    }
  }

  updateTitle() {
    const step = this.input.menuStep();
    if (step) {
      this.menuIndex = (this.menuIndex + step + this.titleOptions.length) % this.titleOptions.length;
      this.sound.sfx('blip');
    }
    this.sound.play('title');
    if (!this.input.confirm) return;
    const opt = this.titleOptions[this.menuIndex];
    if (opt.disabled) return;
    if (opt.id === 'new') this.newGame();
    else if (opt.id === 'continue') this.continueGame();
    else if (opt.id === 'about') this.showAbout();
  }

  showAbout() {
    const about = [
      { text: 'SPIRITED — The Long Way Home', dim: false },
      { text: 'An open-world adventure about a twelve-year-old named Aiko, a move she did not agree to, and a tunnel her father should not have walked into.', dim: true },
      { text: 'Arrows or WASD to walk. Space or E to talk, read and act. J opens the journal, I opens your satchel, M mutes, Esc pauses.', dim: true },
      { text: 'Talk to everything. Half the world only tells you things once.', dim: true },
      { text: 'Inspired by Hayao Miyazaki\'s Spirited Away. All characters and places here are original.', dim: true }
    ];
    this.setEnding(about, true);
  }

  /* ------------------------------------------------------------ ending -- */

  startEnding() {
    const s = this.state;
    const lines = [
      { text: 'You come out of the tunnel into ordinary August light, and the hire car is under a drift of leaves that were not there this afternoon.' },
      { text: 'Your mother is complaining about her shoes. Your father is saying "five minutes" as if he has been saying it for five minutes.' },
      { text: 'Neither of them remembers a single thing. You are not going to be the one who tells them.' }
    ];
    if (sideDone(s, 'lampLighter')) lines.push({ text: 'Nine lamps burn on a bridge you will never see again. The lamplighter has taken the night off for the first time in six hundred years.', dim: true });
    if (sideDone(s, 'cinderPay')) lines.push({ text: 'Somewhere under a bathhouse, forty cinder mites are being paid, badly and gloriously.', dim: true });
    if (sideDone(s, 'riverMemory')) lines.push({ text: 'A river that runs under a road in Tokyo remembers its own name now. When you get back to the city, you will walk that street and feel it under your feet.', dim: true });
    if (sideDone(s, 'frogLedger')) {
      lines.push(flag(s, 'sparedGansuke')
        ? { text: 'A frog keeps his job and his secret, and thinks about the human child who said nothing, and slowly stops skimming.', dim: true }
        : { text: 'A frog is counting bath fees under supervision for the next two hundred years, and blames you exactly as much as he deserves to.', dim: true });
    }
    if (sideDone(s, 'stallKeeper')) lines.push({ text: 'The market stalls are cold and clean. Nobody else will wander in hungry.', dim: true });
    if (flag(s, 'hollowFollowed')) lines.push({ text: 'In a house in a marsh, something in a white mask is learning to spin thread, badly, and being praised for it anyway.', dim: true });
    lines.push({ text: 'On the drive down the hill you put your hand in your satchel and find a hair tie, a fox coin, and two small clay hogs, still warm.' });
    lines.push({ text: `Your name is ${s.trueName}. You did not lose it.` });

    this.setEnding(lines, false);
    this.sound.play('grove');
    saveGame(this.state, 'auto');
  }

  // Epilogue paragraphs are paged, so finishing every side thread cannot
  // push the last line off the bottom of the screen.
  setEnding(lines, isAbout) {
    this.endingPages = [];
    for (let i = 0; i < lines.length; i += 4) this.endingPages.push(lines.slice(i, i + 4));
    if (!this.endingPages.length) this.endingPages = [[]];
    this.endingPage = 0;
    this.endingLines = this.endingPages[0];
    this.endingIsAbout = isAbout;
    this.mode = 'ending';
  }

  updateEnding() {
    if (!this.input.confirm) return;
    if (this.endingPage < this.endingPages.length - 1) {
      this.endingPage++;
      this.endingLines = this.endingPages[this.endingPage];
      this.sound.sfx('blip');
      return;
    }
    this.titleOptions = this.buildTitleOptions();
    this.menuIndex = 0;
    this.mode = 'title';
  }

  /* -------------------------------------------------------------- draw -- */

  /** Match both canvases to the window; the HUD keeps a 540-unit design height. */
  resize(width, height, dpr) {
    this.renderer.resize(Math.round(width * dpr), Math.round(height * dpr));
    this.hudCanvas.width = Math.round(width * dpr);
    this.hudCanvas.height = Math.round(height * dpr);
    this.hudScale = (height * dpr) / H;
    this.hudH = H;
    this.hudW = Math.round((width * dpr) / this.hudScale);
    this.weather.w = this.hudW;
    this.weather.h = this.hudH;
    this.ctx.textBaseline = 'alphabetic';
  }

  draw() {
    const ctx = this.ctx;
    const W2 = this.hudW;
    const H2 = this.hudH;

    if (this.mode !== 'title' && this.mode !== 'ending') this.drawWorld();
    else this.renderer.clearTo([0.04, 0.03, 0.07]);

    ctx.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
    ctx.clearRect(0, 0, W2, H2);

    if (this.mode === 'title') {
      HUD.drawTitle(ctx, W2, H2, this.time, this.titleOptions, this.menuIndex);
      return;
    }
    if (this.mode === 'ending') {
      HUD.drawEnding(ctx, W2, H2, this.state, this.time, this.endingLines,
        this.endingPage >= this.endingPages.length - 1);
      return;
    }

    this.weather.draw(ctx);
    HUD.drawStatus(ctx, W2, this.state, this.area, this.fps);
    HUD.drawMinimap(ctx, W2, this.area, this.player);
    HUD.drawToasts(ctx, W2, this.toasts);

    if (this.mode === 'play' && this.target) {
      HUD.drawPrompt(ctx, W2, H2, `${this.target.label}   [Space]`);
    }
    if (this.mode === 'dialogue' && this.dialogue) {
      const page = this.pages[this.pageIndex] ?? [''];
      const shown = page.join('').length;
      HUD.drawDialogue(ctx, W2, H2, {
        speaker: this.dialogue.speaker(),
        text: page.join('\n'),
        revealed: this.revealed,
        complete: this.revealed >= shown,
        more: this.pageIndex < this.pages.length - 1,
        choices: this.revealed >= shown && this.pageIndex === this.pages.length - 1
          ? this.dialogue.choices()
          : null,
        choiceIndex: this.choiceIndex
      });
    }
    if (this.mode === 'journal') HUD.drawJournal(ctx, W2, H2, this.state);
    if (this.mode === 'inventory') HUD.drawInventory(ctx, W2, H2, this.state, this.invIndex);
    if (this.mode === 'menu') HUD.drawMenu(ctx, W2, H2, this.menuOptions(), this.menuIndex);
  }

  /** Hand the world to the 3D renderer. Game coordinates are pixels; 32 to the tile. */
  /** Height of the ground under a pixel position, so nothing floats or sinks. */
  groundUnder(px, py) {
    return groundAt(tileAt(this.area, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)));
  }

  drawWorld() {
    const r = this.renderer;
    r.begin();

    for (const prop of this.props) {
      drawProp3D(r, {
        type: prop.type,
        x: prop.x / TILE_SIZE,
        z: prop.y / TILE_SIZE,
        y3d: this.groundUnder(prop.x, prop.y),
        yaw: prop.yaw ?? 0
      }, this.time);
    }

    for (const npc of this.npcs) {
      drawActor3D(r, {
        x: npc.x / TILE_SIZE,
        z: npc.y / TILE_SIZE,
        y: this.groundUnder(npc.x, npc.y),
        dir: npc.dir,
        walk: npc.walk,
        moving: Boolean(npc.vx || npc.vy),
        kind: npc.kind,
        palette: npc.palette,
        scale: npc.kind ? 1 : 1.16          // adults stand taller than Aiko
      }, this.time);
    }

    drawActor3D(r, {
      x: this.player.x / TILE_SIZE,
      z: this.player.y / TILE_SIZE,
      y: this.groundUnder(this.player.x, this.player.y),
      dir: this.player.dir,
      walk: this.player.walk,
      moving: this.player.moving,
      kind: 'human',
      palette: { skin: '#e9bd95', hair: '#241c18', cloth: '#c84a5e', trim: '#f2e8d6' },
      alpha: 1 - this.state.fade * 0.5
    }, this.time);

    const jitter = this.shake;
    const focus = {
      x: this.player.x / TILE_SIZE + (Math.random() - 0.5) * jitter,
      y: 0,
      z: this.player.y / TILE_SIZE + (Math.random() - 0.5) * jitter
    };
    r.render(this.area, focus, this.time, {
      // Indoors the near wall has to get out of the way; outdoors it rarely matters.
      cutaway: true,
      lampBoost: this.state.fade > 0.5 ? 1.3 : 1
    });
  }
}

export { W as VIEW_W, H as VIEW_H };
