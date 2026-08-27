// Procedural score. No audio files: a pentatonic sequencer plus a drone,
// re-tuned per area, and a handful of synthesised effects.

const SCALES = {
  major: [0, 2, 4, 7, 9, 12, 14, 16],
  minor: [0, 3, 5, 7, 10, 12, 15, 17],
  hira: [0, 2, 3, 7, 8, 12, 14, 15],     // in-scale, for the far side of the tunnel
  insen: [0, 1, 5, 7, 10, 12, 13, 17]
};

const TRACKS = {
  home:      { root: 261.63, scale: 'major', bpm: 78,  wave: 'triangle', drone: 0.06, density: 0.55 },
  town:      { root: 293.66, scale: 'major', bpm: 104, wave: 'triangle', drone: 0.04, density: 0.7 },
  station:   { root: 246.94, scale: 'major', bpm: 96,  wave: 'sine',     drone: 0.05, density: 0.5 },
  train:     { root: 220.00, scale: 'minor', bpm: 88,  wave: 'sine',     drone: 0.08, density: 0.45 },
  country:   { root: 196.00, scale: 'major', bpm: 68,  wave: 'triangle', drone: 0.07, density: 0.5 },
  tunnel:    { root: 130.81, scale: 'insen', bpm: 52,  wave: 'sine',     drone: 0.12, density: 0.25 },
  market:    { root: 174.61, scale: 'hira',  bpm: 60,  wave: 'triangle', drone: 0.10, density: 0.4 },
  bridge:    { root: 196.00, scale: 'hira',  bpm: 64,  wave: 'sine',     drone: 0.10, density: 0.42 },
  bathhouse: { root: 233.08, scale: 'hira',  bpm: 92,  wave: 'square',   drone: 0.05, density: 0.72 },
  boiler:    { root: 146.83, scale: 'insen', bpm: 108, wave: 'square',   drone: 0.09, density: 0.6 },
  office:    { root: 207.65, scale: 'insen', bpm: 72,  wave: 'sine',     drone: 0.11, density: 0.4 },
  rail:      { root: 164.81, scale: 'hira',  bpm: 54,  wave: 'sine',     drone: 0.13, density: 0.3 },
  marsh:     { root: 174.61, scale: 'major', bpm: 58,  wave: 'triangle', drone: 0.08, density: 0.45 },
  grove:     { root: 261.63, scale: 'hira',  bpm: 56,  wave: 'sine',     drone: 0.09, density: 0.5 },
  title:     { root: 196.00, scale: 'hira',  bpm: 60,  wave: 'sine',     drone: 0.10, density: 0.45 }
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.track = null;
    this.timer = null;
    this.step = 0;
    this.droneNodes = [];
  }

  // Browsers only allow audio after a gesture, so this is called on first input.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    if (this.track) this.play(this.track, true);
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  play(id, force = false) {
    if (!TRACKS[id]) id = 'town';
    if (this.track === id && !force) return;
    this.track = id;
    if (!this.ctx) return;
    this.stopDrone();
    clearInterval(this.timer);
    const cfg = TRACKS[id];
    this.startDrone(cfg);
    const beat = 60000 / cfg.bpm / 2;
    this.step = 0;
    this.timer = setInterval(() => this.tick(cfg), beat);
  }

  startDrone(cfg) {
    if (!this.ctx) return;
    for (const mult of [1, 1.5]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = (cfg.root / 2) * mult;
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(cfg.drone, this.ctx.currentTime, 1.2);
      osc.connect(gain).connect(this.master);
      osc.start();
      this.droneNodes.push({ osc, gain });
    }
  }

  stopDrone() {
    if (!this.ctx) return;
    for (const { osc, gain } of this.droneNodes) {
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      osc.stop(this.ctx.currentTime + 1.2);
    }
    this.droneNodes = [];
  }

  tick(cfg) {
    if (!this.ctx || this.muted) return;
    this.step++;
    const scale = SCALES[cfg.scale];
    // Phrases breathe: rests are as important as notes here.
    if (Math.random() > cfg.density) return;
    const octave = Math.random() < 0.22 ? 2 : 1;
    const degree = scale[Math.floor(Math.random() * scale.length)];
    const freq = cfg.root * octave * Math.pow(2, degree / 12);
    this.note(freq, cfg.wave, 0.9, 0.09);
    if (this.step % 8 === 0) this.note(cfg.root / 2, 'sine', 1.6, 0.07);
  }

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
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(dur = 0.3, vol = 0.08, filterHz = 900) {
    if (!this.ctx || this.muted) return;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'blip': this.note(660, 'square', 0.06, 0.05); break;
      case 'talk': this.note(520 + Math.random() * 90, 'square', 0.035, 0.028); break;
      case 'pickup':
        this.note(660, 'triangle', 0.12, 0.09);
        this.note(990, 'triangle', 0.18, 0.07, 0.08);
        break;
      case 'chime':
        [523, 659, 784].forEach((f, i) => this.note(f, 'sine', 0.6, 0.08, i * 0.09));
        break;
      case 'chapter':
        [392, 523, 659, 880].forEach((f, i) => this.note(f, 'triangle', 0.9, 0.075, i * 0.13));
        break;
      case 'dread':
        this.note(98, 'sawtooth', 1.6, 0.09);
        this.note(103, 'sawtooth', 1.6, 0.07);
        this.noise(1.2, 0.05, 400);
        break;
      case 'door': this.noise(0.35, 0.09, 700); break;
      case 'wind': this.noise(1.8, 0.06, 500); break;
      case 'step': this.noise(0.05, 0.02, 1200); break;
      case 'deny': this.note(180, 'square', 0.18, 0.05); break;
      default: break;
    }
  }
}
