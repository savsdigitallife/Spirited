// The score is data, so it can be checked without an audio device.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, SCALES, planStep, stepDuration, freq, degree } from '../src/data/music.js';
import { stepSurface, SURFACES } from '../src/systems/surfaces.js';
import { Sound } from '../src/core/audio.js';
import { areaList } from '../src/world/index.js';
import { TILES } from '../src/world/tiles.js';

test('note names resolve to the right pitches', () => {
  assert.equal(Math.round(freq('A2')), 110);
  assert.equal(Math.round(freq('A3')), 220);
  assert.equal(Math.round(freq('C3')), 131);
  assert.ok(freq('C#3') > freq('C3'));
  assert.throws(() => freq('H4'));
});

test('scale degrees walk up and wrap into the next octave', () => {
  const root = freq('A2');
  assert.equal(Math.round(degree(root, SCALES.minor, 0)), 110);
  assert.equal(Math.round(degree(root, SCALES.minor, 7)), 220, 'seven degrees of a 7-note scale is an octave');
  assert.ok(degree(root, SCALES.minor, -7) < root);
});

test('every area asks for a track that exists', () => {
  const missing = areaList().filter((a) => !TRACKS[a.music]).map((a) => `${a.id}:${a.music}`);
  assert.deepEqual(missing, []);
});

test('every track plays something audible, and nothing subsonic', () => {
  for (const [id, track] of Object.entries(TRACKS)) {
    let events = 0;
    for (let step = 0; step < 64; step++) {
      for (const note of planStep(track, step)) {
        events++;
        assert.ok(note.instrument, `${id} produced a note with no instrument`);
        if (note.freq !== undefined) {
          assert.ok(note.freq > 40 && note.freq < 4000, `${id} played ${note.freq}Hz, outside a musical range`);
        }
        assert.ok(note.gain > 0 && note.gain < 0.4, `${id} has a note at gain ${note.gain}`);
      }
    }
    assert.ok(events > 12, `${id} is nearly silent (${events} events in four bars)`);
  }
});

test('the sequencer keeps time, with swing where it is asked for', () => {
  const swung = TRACKS.town;
  const even = TRACKS.grove;
  const bar = (t) => Array.from({ length: 16 }, (_, i) => stepDuration(t, i)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(bar(swung) - (60 / swung.bpm) * 4) < 1e-9, 'swing must not change the length of a bar');
  assert.ok(stepDuration(swung, 0) > stepDuration(swung, 1), 'swung eighths are long-short');
  assert.equal(stepDuration(even, 0), stepDuration(even, 1), 'no swing means straight time');
});

test('the progression actually moves between bars', () => {
  const chordsIn = (track, bars) => {
    const roots = new Set();
    for (let b = 0; b < bars; b++) {
      const notes = planStep(track, b * 16).filter((n) => n.instrument === 'bass' || n.instrument === 'pad');
      for (const n of notes) roots.add(Math.round(n.freq));
    }
    return roots.size;
  };
  assert.ok(chordsIn(TRACKS.town, 4) > 3, 'the city track should change chord');
  assert.ok(chordsIn(TRACKS.country, 4) > 2);
});

test('every tile has a footstep sound', () => {
  for (const tile of TILES) {
    const surface = stepSurface(tile.id);
    assert.ok(Sound.FOOT[surface], `tile "${tile.name}" maps to unknown surface "${surface}"`);
  }
  assert.equal(stepSurface(999), 'stone', 'an unknown tile still makes a noise');
});

test('surfaces are distinguishable, not all one sound', () => {
  const kinds = new Set(Object.values(SURFACES));
  assert.ok(kinds.size >= 9, `only ${kinds.size} distinct footstep surfaces`);
  assert.notEqual(Sound.FOOT.grass.hz, Sound.FOOT.stone.hz);
  assert.ok(Sound.FOOT.splash.dur > Sound.FOOT.stone.dur, 'a splash rings longer than a footfall on stone');
});
