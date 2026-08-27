// The score. Each scene gets a key, a chord progression and a set of layers;
// `planStep` turns "which sixteenth note is it" into a list of notes to play.
// It is pure, so the music can be tested without an audio device.

export const SCALES = {
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  hira:       [0, 2, 3, 7, 8],          // in-scale: the far side of the tunnel
  insen:      [0, 1, 5, 7, 10],
  ritsu:      [0, 2, 5, 7, 9],
  phrygian:   [0, 1, 3, 5, 7, 8, 10]
};

const A1 = 55;   // A1; every octave number here is one below scientific pitch
/** Midi-ish note name to frequency: 'A2', 'C#3'. */
export function freq(name) {
  const steps = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note: ${name}`);
  const semis = steps[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const octave = Number(m[3]);
  return A1 * Math.pow(2, octave - 1 + semis / 12);
}

/** Scale degree (can be negative or beyond an octave) to a frequency. */
export function degree(root, scale, n) {
  const len = scale.length;
  const octave = Math.floor(n / len);
  const semis = scale[((n % len) + len) % len] + octave * 12;
  return root * Math.pow(2, semis / 12);
}

export const TRACKS = {
  // Tokyo, at night, in the rain.
  town: {
    root: 'D2', scale: 'minor', bpm: 84, swing: 0.12,
    progression: [0, 5, 3, 4],
    pad: { gain: 0.05, wave: 'sawtooth', detune: 7 },
    bass: { pattern: 'drive', gain: 0.1, wave: 'sawtooth' },
    arp: { pattern: 'up16', gain: 0.045, wave: 'square', octave: 2 },
    drums: 'four',
    lead: { pattern: 'sparse', gain: 0.05, wave: 'triangle', octave: 2 }
  },
  station: {
    root: 'A2', scale: 'minor', bpm: 76,
    progression: [0, 4, 2, 4],
    pad: { gain: 0.055, wave: 'sawtooth', detune: 5 },
    bass: { pattern: 'half', gain: 0.07, wave: 'triangle' },
    arp: { pattern: 'sparse', gain: 0.035, wave: 'square', octave: 2 },
    drums: 'tick'
  },
  home: {
    root: 'F2', scale: 'major', bpm: 68,
    progression: [0, 3, 4, 3],
    pad: { gain: 0.05, wave: 'triangle', detune: 4 },
    bass: { pattern: 'half', gain: 0.06, wave: 'sine' },
    lead: { pattern: 'motif', motif: [4, 2, 0, 2, 4, 5, 4, 2], gain: 0.05, wave: 'triangle', octave: 1 },
    drums: 'none'
  },
  train: {
    root: 'E2', scale: 'dorian', bpm: 96,
    progression: [0, 0, 5, 5],
    pad: { gain: 0.05, wave: 'sawtooth', detune: 6 },
    bass: { pattern: 'eighth', gain: 0.07, wave: 'triangle' },
    drums: 'rail'
  },
  country: {
    root: 'G2', scale: 'ritsu', bpm: 62,
    progression: [0, 4, 2, 4],
    pad: { gain: 0.045, wave: 'triangle', detune: 3 },
    bass: { pattern: 'half', gain: 0.05, wave: 'sine' },
    lead: { pattern: 'motif', motif: [0, 2, 4, 2, 1, 0, -1, 0], gain: 0.055, wave: 'triangle', octave: 1 },
    drums: 'none'
  },
  tunnel: {
    root: 'C2', scale: 'insen', bpm: 48,
    progression: [0, 0, 1, 0],
    pad: { gain: 0.075, wave: 'sawtooth', detune: 9 },
    bass: { pattern: 'whole', gain: 0.06, wave: 'sine' },
    lead: { pattern: 'rare', gain: 0.05, wave: 'sine', octave: 2, bell: true },
    drums: 'none'
  },
  market: {
    root: 'A2', scale: 'hira', bpm: 58,
    progression: [0, 2, 0, 4],
    pad: { gain: 0.06, wave: 'sawtooth', detune: 6 },
    bass: { pattern: 'half', gain: 0.06, wave: 'triangle' },
    lead: { pattern: 'koto', gain: 0.06, wave: 'triangle', octave: 1 },
    drums: 'none'
  },
  bridge: {
    root: 'D2', scale: 'hira', bpm: 54,
    progression: [0, 3, 0, 2],
    pad: { gain: 0.07, wave: 'sawtooth', detune: 8 },
    bass: { pattern: 'whole', gain: 0.05, wave: 'sine' },
    lead: { pattern: 'rare', gain: 0.05, wave: 'sine', octave: 2, bell: true },
    drums: 'none'
  },
  bathhouse: {
    root: 'B2', scale: 'hira', bpm: 104,
    progression: [0, 0, 3, 2],
    pad: { gain: 0.04, wave: 'sawtooth', detune: 5 },
    bass: { pattern: 'drive', gain: 0.08, wave: 'triangle' },
    lead: { pattern: 'koto', gain: 0.07, wave: 'triangle', octave: 1 },
    drums: 'taiko'
  },
  boiler: {
    root: 'D2', scale: 'phrygian', bpm: 112,
    progression: [0, 0, 1, 0],
    bass: { pattern: 'eighth', gain: 0.09, wave: 'sawtooth' },
    arp: { pattern: 'up16', gain: 0.03, wave: 'square', octave: 2 },
    drums: 'forge'
  },
  office: {
    root: 'G2', scale: 'insen', bpm: 72,
    progression: [0, 1, 0, 4],
    pad: { gain: 0.07, wave: 'sawtooth', detune: 10 },
    bass: { pattern: 'half', gain: 0.07, wave: 'sawtooth' },
    lead: { pattern: 'sparse', gain: 0.05, wave: 'square', octave: 1 },
    drums: 'none'
  },
  rail: {
    root: 'F2', scale: 'hira', bpm: 50,
    progression: [0, 2, 3, 2],
    pad: { gain: 0.07, wave: 'triangle', detune: 4 },
    bass: { pattern: 'whole', gain: 0.05, wave: 'sine' },
    lead: { pattern: 'rare', gain: 0.045, wave: 'sine', octave: 2, bell: true },
    drums: 'rail'
  },
  marsh: {
    root: 'C3', scale: 'ritsu', bpm: 56,
    progression: [0, 3, 4, 2],
    pad: { gain: 0.05, wave: 'triangle', detune: 3 },
    bass: { pattern: 'half', gain: 0.045, wave: 'sine' },
    lead: { pattern: 'motif', motif: [2, 1, 0, 1, 2, 4, 2, 1], gain: 0.05, wave: 'sine', octave: 1 },
    drums: 'none'
  },
  grove: {
    root: 'E3', scale: 'ritsu', bpm: 52,
    progression: [0, 4, 2, 3],
    pad: { gain: 0.055, wave: 'triangle', detune: 4 },
    bass: { pattern: 'whole', gain: 0.04, wave: 'sine' },
    lead: { pattern: 'koto', gain: 0.06, wave: 'sine', octave: 1, bell: true },
    drums: 'none'
  },
  title: {
    root: 'A2', scale: 'hira', bpm: 56,
    progression: [0, 2, 4, 2],
    pad: { gain: 0.07, wave: 'sawtooth', detune: 6 },
    bass: { pattern: 'whole', gain: 0.05, wave: 'sine' },
    lead: { pattern: 'koto', gain: 0.055, wave: 'triangle', octave: 1, bell: true },
    drums: 'none'
  }
};

const STEPS_PER_BAR = 16;

const BASS = {
  whole: (s) => s === 0,
  half: (s) => s === 0 || s === 8,
  eighth: (s) => s % 2 === 0,
  drive: (s) => [0, 3, 6, 8, 11, 14].includes(s)
};

const DRUMS = {
  none: () => [],
  tick: (s) => (s % 8 === 4 ? [{ instrument: 'hat', gain: 0.03 }] : []),
  four: (s) => {
    const out = [];
    if (s % 4 === 0) out.push({ instrument: 'kick', gain: 0.16 });
    if (s === 4 || s === 12) out.push({ instrument: 'snare', gain: 0.07 });
    if (s % 2 === 1) out.push({ instrument: 'hat', gain: 0.028 });
    return out;
  },
  taiko: (s) => {
    const out = [];
    if (s === 0 || s === 6 || s === 10) out.push({ instrument: 'kick', gain: 0.13 });
    if (s === 8) out.push({ instrument: 'snare', gain: 0.05 });
    return out;
  },
  rail: (s) => (s % 4 === 0 || s % 8 === 3 ? [{ instrument: 'hat', gain: 0.035 }] : []),
  forge: (s) => {
    const out = [];
    if (s % 4 === 0) out.push({ instrument: 'kick', gain: 0.14 });
    if (s === 5 || s === 13) out.push({ instrument: 'clank', gain: 0.06 });
    if (s % 2 === 1) out.push({ instrument: 'hat', gain: 0.02 });
    return out;
  }
};

/**
 * Everything that should sound on one sixteenth note.
 * `step` counts from the start of the piece and never resets.
 */
export function planStep(track, step) {
  const scale = SCALES[track.scale];
  const root = typeof track.root === 'string' ? freq(track.root) : track.root;
  const s = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const chordRoot = track.progression[bar % track.progression.length];
  const chord = [chordRoot, chordRoot + 2, chordRoot + 4];
  const out = [];

  if (track.pad && s === 0) {
    for (const n of chord) {
      out.push({
        instrument: 'pad', freq: degree(root, scale, n) * 2,
        dur: (STEPS_PER_BAR / 4) * (60 / track.bpm), gain: track.pad.gain,
        wave: track.pad.wave, detune: track.pad.detune
      });
    }
  }

  if (track.bass && BASS[track.bass.pattern]?.(s)) {
    out.push({
      instrument: 'bass', freq: degree(root, scale, chordRoot),
      dur: 0.42, gain: track.bass.gain, wave: track.bass.wave
    });
  }

  if (track.arp) {
    const play = track.arp.pattern === 'up16' ? s % 2 === 0 : [0, 6, 10].includes(s);
    if (play) {
      const idx = Math.floor(step / (track.arp.pattern === 'up16' ? 2 : 1)) % 4;
      const n = chord[idx % 3] + (idx === 3 ? 7 : 0);
      out.push({
        instrument: 'pluck', freq: degree(root, scale, n) * (track.arp.octave ?? 1),
        dur: 0.2, gain: track.arp.gain, wave: track.arp.wave
      });
    }
  }

  if (track.lead) {
    const L = track.lead;
    let n = null;
    switch (L.pattern) {
      case 'motif':
        if (s % 2 === 0) n = L.motif[(step / 2) % L.motif.length] + chordRoot;
        break;
      case 'koto':
        // A plucked phrase that leans on the chord and wanders off it.
        if ([0, 3, 6, 10, 13].includes(s)) {
          n = chord[(bar + s) % 3] + ((bar + s) % 5 === 0 ? 5 : 0);
        }
        break;
      case 'sparse':
        if (s === 2 || s === 11) n = chord[(bar + s) % 3] + 7;
        break;
      case 'rare':
        if (s === 0 && bar % 2 === 1) n = chordRoot + 7;
        break;
      default:
        break;
    }
    if (n !== null) {
      out.push({
        instrument: L.bell ? 'bell' : 'pluck',
        freq: degree(root, scale, n) * (L.octave ?? 1),
        dur: L.bell ? 2.4 : 0.5, gain: L.gain, wave: L.wave
      });
    }
  }

  for (const hit of DRUMS[track.drums ?? 'none'](s)) out.push({ ...hit, dur: 0.2 });
  return out;
}

/** Seconds per sixteenth, with a little swing on the off-beats. */
export function stepDuration(track, step) {
  const base = (60 / track.bpm) / 4;
  const swing = track.swing ?? 0;
  return step % 2 === 0 ? base * (1 + swing) : base * (1 - swing);
}
