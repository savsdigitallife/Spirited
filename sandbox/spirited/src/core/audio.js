// The whole soundtrack, synthesised. A sixteenth-note scheduler plays the
// score in src/data/music.js; everything else is one-shot synthesis.

import { TRACKS, planStep, stepDuration } from '../data/music.js';

const LOOKAHEAD = 0.25;      // seconds of notes queued in advance
const TICK = 40;             // ms between scheduler wake-ups

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.muted = false;
    this.trackId = null;
    this.track = null;
    this.step = 0;
    this.nextNoteAt = 0;
    this.timer = null;
    this.lastFoot = 0;
  }

  /** Browsers only allow audio after a gesture, so this is called on first input. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    // A gentle limiter, so a loud chord and a footstep together do not clip.
    const squash = this.ctx.createDynamicsCompressor();
    squash.threshold.value = -14;
    squash.ratio.value = 6;
    squash.attack.value = 0.004;
    squash.release.value = 0.2;
    this.master.connect(squash).connect(this.ctx.destination);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.85;
    this.musicBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    // A short reverb, shared by everything, so rooms have a size.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.0);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb).connect(this.master);

    if (this.trackId) this.play(this.trackId, true);
    return true;
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /* ---------------------------------------------------------- sequencer -- */

  play(id, force = false) {
    if (!TRACKS[id]) id = 'town';
    if (this.trackId === id && !force) return;
    this.trackId = id;
    this.track = TRACKS[id];
    if (!this.ctx) return;

    clearInterval(this.timer);
    // Cross-fade rather than cut: the old track's tail rings out under the new.
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
    setTimeout(() => {
      if (!this.ctx) return;
      this.musicBus.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.4);
    }, 260);

    this.step = 0;
    this.nextNoteAt = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.schedule(), TICK);
  }

  schedule() {
    if (!this.ctx || !this.track || this.muted) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (this.nextNoteAt < horizon && guard++ < 64) {
      for (const note of planStep(this.track, this.step)) {
        this.voice(note, this.nextNoteAt);
      }
      this.nextNoteAt += stepDuration(this.track, this.step);
      this.step++;
    }
  }

  /* ------------------------------------------------------------ voices -- */

  voice(note, when) {
    switch (note.instrument) {
      case 'pad': return this.pad(note, when);
      case 'bass': return this.bass(note, when);
      case 'pluck': return this.pluck(note, when);
      case 'bell': return this.bell(note, when);
      case 'kick': return this.kick(when, note.gain);
      case 'snare': return this.snare(when, note.gain);
      case 'hat': return this.hat(when, note.gain);
      case 'clank': return this.clank(when, note.gain);
      default: return undefined;
    }
  }

  chain(when, dur, gain, reverb = 0.25) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.musicBus);
    if (reverb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverb;
      g.connect(send).connect(this.reverbSend);
    }
    return g;
  }

  pad({ freq, dur, gain, wave, detune = 6 }, when) {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, when);
    filter.frequency.linearRampToValueAtTime(640, when + dur * 0.6);
    const g = this.chain(when, dur, gain, 0.5);
    filter.connect(g);
    g.gain.setValueAtTime(0.0001, when);
    // Slow in, slow out: a pad should arrive without anyone noticing.
    g.gain.linearRampToValueAtTime(gain, when + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, when + dur * 1.15);
    for (const cents of [-detune, detune]) {
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start(when);
      osc.stop(when + dur * 1.2 + 0.1);
    }
  }

  bass({ freq, dur, gain, wave }, when) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, when);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, when);
    filter.frequency.exponentialRampToValueAtTime(120, when + dur);
    const g = this.chain(when, dur, gain, 0.05);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter).connect(g);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  pluck({ freq, dur, gain, wave }, when) {
    const osc = this.ctx.createOscillator();
    osc.type = wave ?? 'triangle';
    osc.frequency.setValueAtTime(freq * 1.01, when);
    osc.frequency.exponentialRampToValueAtTime(freq, when + 0.04);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, when);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.3, when + dur);
    const g = this.chain(when, dur, gain, 0.3);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter).connect(g);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  bell({ freq, dur, gain }, when) {
    const g = this.chain(when, dur, gain, 0.7);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    // A fundamental plus an inharmonic partial: that is what makes it a bell.
    for (const [mult, level] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const og = this.ctx.createGain();
      og.gain.value = level;
      osc.connect(og).connect(g);
      osc.start(when);
      osc.stop(when + dur + 0.1);
    }
  }

  kick(when, gain = 0.15) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.11);
    const g = this.chain(when, 0.2, gain, 0);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(g);
    osc.start(when);
    osc.stop(when + 0.3);
  }

  snare(when, gain = 0.07) {
    const src = this.noiseSource(0.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 0.8;
    const g = this.chain(when, 0.2, gain, 0.3);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    src.connect(filter).connect(g);
    src.start(when);
  }

  hat(when, gain = 0.03) {
    const src = this.noiseSource(0.06);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = this.chain(when, 0.06, gain, 0.1);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(filter).connect(g);
    src.start(when);
  }

  clank(when, gain = 0.06) {
    const g = this.chain(when, 0.4, gain, 0.6);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    for (const f of [520, 913, 1471]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = 0.3;
      osc.connect(og).connect(g);
      osc.start(when);
      osc.stop(when + 0.4);
    }
  }

  noiseSource(seconds) {
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /* --------------------------------------------------------- footsteps -- */
  // Each surface is a filtered noise burst with its own colour, plus a body
  // thump for the ones that have one. Every step is detuned a little so a walk
  // never sounds like a metronome.

  static FOOT = {
    grass:  { hz: 2600, q: 0.7, dur: 0.1,  gain: 0.055, type: 'highpass', body: 0 },
    dirt:   { hz: 900,  q: 0.9, dur: 0.09, gain: 0.06,  type: 'bandpass', body: 90 },
    gravel: { hz: 3200, q: 1.4, dur: 0.11, gain: 0.075, type: 'bandpass', body: 0 },
    ash:    { hz: 1500, q: 0.8, dur: 0.13, gain: 0.05,  type: 'lowpass',  body: 70 },
    stone:  { hz: 2200, q: 2.6, dur: 0.06, gain: 0.07,  type: 'bandpass', body: 150 },
    tile:   { hz: 3400, q: 3.2, dur: 0.05, gain: 0.065, type: 'bandpass', body: 220 },
    wood:   { hz: 1200, q: 1.6, dur: 0.08, gain: 0.075, type: 'bandpass', body: 110 },
    tatami: { hz: 800,  q: 0.9, dur: 0.09, gain: 0.05,  type: 'lowpass',  body: 80 },
    carpet: { hz: 600,  q: 0.7, dur: 0.1,  gain: 0.04,  type: 'lowpass',  body: 60 },
    splash: { hz: 1400, q: 0.5, dur: 0.26, gain: 0.09,  type: 'bandpass', body: 0 },
    metal:  { hz: 4200, q: 4.0, dur: 0.14, gain: 0.06,  type: 'bandpass', body: 320 }
  };

  footstep(surface = 'stone', wet = false) {
    if (!this.ctx || this.muted) return;
    const cfg = Sound.FOOT[surface] ?? Sound.FOOT.stone;
    const when = this.ctx.currentTime;
    // Alternate feet: one a touch softer and lower than the other.
    this.lastFoot = 1 - this.lastFoot;
    const lean = this.lastFoot ? 1 : 0.86;
    const jitter = 0.9 + Math.random() * 0.25;

    const src = this.noiseSource(cfg.dur + 0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = cfg.type;
    filter.frequency.value = cfg.hz * jitter;
    filter.Q.value = cfg.q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(cfg.gain * lean, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + cfg.dur);
    src.connect(filter).connect(g).connect(this.sfxBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.18;
    g.connect(send).connect(this.reverbSend);
    src.start(when);

    if (cfg.body) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(cfg.body * jitter, when);
      osc.frequency.exponentialRampToValueAtTime(cfg.body * 0.6, when + 0.06);
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(cfg.gain * 0.7 * lean, when);
      bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
      osc.connect(bg).connect(this.sfxBus);
      osc.start(when);
      osc.stop(when + 0.12);
    }

    // Rain leaves a film on everything: every step picks up a little splash.
    if (wet && surface !== 'splash') {
      const s2 = this.noiseSource(0.12);
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 2600;
      f2.Q.value = 0.6;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.03 * lean, when);
      g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
      s2.connect(f2).connect(g2).connect(this.sfxBus);
      s2.start(when);
    }
  }

  /* ------------------------------------------------------------- one-shots -- */

  note(freq, wave = 'sine', dur = 0.5, vol = 0.1, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.sfxBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.2;
    gain.connect(send).connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(dur = 0.3, vol = 0.08, filterHz = 900) {
    if (!this.ctx || this.muted) return;
    const src = this.noiseSource(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start();
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'blip': this.note(660, 'square', 0.06, 0.05); break;
      case 'talk': this.note(520 + Math.random() * 90, 'square', 0.035, 0.022); break;
      case 'pickup':
        this.note(660, 'triangle', 0.12, 0.09);
        this.note(990, 'triangle', 0.18, 0.07, 0.08);
        break;
      case 'chime':
        [523, 659, 784].forEach((f, i) => this.note(f, 'sine', 0.6, 0.07, i * 0.09));
        break;
      case 'chapter':
        [392, 523, 659, 880].forEach((f, i) => this.note(f, 'triangle', 0.9, 0.065, i * 0.13));
        break;
      case 'dread':
        this.note(98, 'sawtooth', 1.6, 0.08);
        this.note(103, 'sawtooth', 1.6, 0.06);
        this.noise(1.2, 0.05, 400);
        break;
      case 'door': this.noise(0.35, 0.08, 700); break;
      case 'wind': this.noise(1.8, 0.05, 500); break;
      case 'deny': this.note(180, 'square', 0.18, 0.05); break;
      default: break;
    }
  }
}
