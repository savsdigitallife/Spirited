/**
 * Audio architecture.
 *
 * Web Audio directly rather than Babylon's audio module: everything the
 * prototype needs is synthesised, there are no sound files to stream yet,
 * and a thin graph of our own keeps the mixing rules explicit.
 *
 * The shape is what matters here — a master bus with music, effects and
 * ambience beneath it, a listener that follows the camera, and positional
 * emitters for things that live in the world. Replacing a synthesised
 * source with a recorded one later means changing what feeds a bus, not how
 * the game asks for sound.
 *
 * Browsers refuse to start audio before the player interacts with the page,
 * so nothing exists until `unlock()` is called from a real gesture.
 */

import { events } from "../core/Events";

export type Bus = "music" | "sfx" | "ambience";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface AudioMix {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

const DEFAULT_MIX: AudioMix = { master: 0.85, music: 0.5, sfx: 0.8, ambience: 0.65 };

/** A positioned, looping source the world owns and can retune. */
export interface Emitter {
  setPosition(position: Vec3Like): void;
  setIntensity(value: number): void;
  stop(): void;
}

/** Deterministic noise buffer, generated once and shared by every source. */
function makeNoise(context: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      // Integrating white noise gives the low rumble that reads as traffic.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private mix: AudioMix = { ...DEFAULT_MIX };
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private muted = false;
  private teardown: Array<() => void> = [];

  get ready(): boolean {
    return this.context !== null && this.context.state === "running";
  }

  /** Safe to call on every gesture; only the first one does anything. */
  async unlock(): Promise<void> {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor({ latencyHint: "interactive" });
      this.context = context;

      const master = context.createGain();
      master.gain.value = this.muted ? 0 : this.mix.master;
      master.connect(context.destination);
      this.master = master;

      for (const name of ["music", "sfx", "ambience"] as const) {
        const bus = context.createGain();
        bus.gain.value = this.mix[name];
        bus.connect(master);
        this.buses.set(name, bus);
      }

      this.white = makeNoise(context, 2, false);
      this.brown = makeNoise(context, 4, true);
    }
    if (this.context.state !== "running") {
      await this.context.resume().catch(() => undefined);
    }
    if (this.ready) events.emit("audio/unlocked", { context: "user-gesture" });
  }

  setMix(patch: Partial<AudioMix>): void {
    this.mix = { ...this.mix, ...patch };
    if (this.master) this.master.gain.value = this.muted ? 0 : this.mix.master;
    for (const [name, bus] of this.buses) bus.gain.value = this.mix[name];
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.mix.master;
    return this.muted;
  }

  /**
   * Moves the listener. Web Audio wants a forward and an up vector; we take
   * them straight from the camera so panning matches what is on screen.
   */
  setListener(position: Vec3Like, forward: Vec3Like, up: Vec3Like): void {
    const context = this.context;
    if (!context) return;
    const listener = context.listener;
    if (listener.positionX) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    } else {
      // Safari still only has the deprecated calls.
      listener.setPosition?.(position.x, position.y, position.z);
      listener.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  private busNode(bus: Bus): GainNode | null {
    return this.buses.get(bus) ?? null;
  }

  /**
   * Wide, non-positional city rumble: low traffic bed plus a breath of air
   * over it. Intensity is how busy the street feels.
   */
  startCityAmbience(): Emitter | null {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out || !this.brown || !this.white) return null;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(out);

    const rumble = context.createBufferSource();
    rumble.buffer = this.brown;
    rumble.loop = true;
    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 320;
    const rumbleGain = context.createGain();
    rumbleGain.gain.value = 0.9;
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(gain);

    const air = context.createBufferSource();
    air.buffer = this.white;
    air.loop = true;
    const airFilter = context.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = 900;
    airFilter.Q.value = 0.7;
    const airGain = context.createGain();
    airGain.gain.value = 0.035;
    air.connect(airFilter).connect(airGain).connect(gain);

    rumble.start();
    air.start();
    const stop = () => {
      rumble.stop();
      air.stop();
      gain.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: () => undefined,
      setIntensity: (value: number) => {
        gain.gain.setTargetAtTime(Math.max(0, value) * 0.5, context.currentTime, 0.6);
      },
      stop,
    };
  }

  /** Rain is a filtered hiss whose brightness rises with the downpour. */
  startRain(): Emitter | null {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out || !this.white) return null;

    const source = context.createBufferSource();
    source.buffer = this.white;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.35;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(out);
    source.start();

    const stop = () => {
      source.stop();
      gain.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: () => undefined,
      setIntensity: (value: number) => {
        const v = Math.max(0, Math.min(1, value));
        gain.gain.setTargetAtTime(v * 0.28, context.currentTime, 0.8);
        filter.frequency.setTargetAtTime(1600 + v * 1800, context.currentTime, 0.8);
      },
      stop,
    };
  }

  /**
   * Moving water, from a fixed point in the world. Narrower and higher than
   * rain, and it never changes — a river is the one sound in the valley that
   * is the same at four in the morning as it is at noon.
   */
  startWater(position: Vec3Like, reach = 34): Emitter | null {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out || !this.white) return null;

    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 6;
    panner.maxDistance = reach;
    panner.rolloffFactor = 1.1;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const source = context.createBufferSource();
    source.buffer = this.white;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1750;
    filter.Q.value = 0.55;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(panner).connect(out);
    source.start();

    const stop = () => {
      source.stop();
      panner.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: (p: Vec3Like) => {
        panner.positionX.value = p.x;
        panner.positionY.value = p.y;
        panner.positionZ.value = p.z;
      },
      setIntensity: (value: number) => {
        gain.gain.setTargetAtTime(Math.max(0, value) * 0.3, context.currentTime, 0.6);
      },
      stop,
    };
  }

  /**
   * Wind through a valley: a low bed whose filter drifts, so it swells and
   * falls instead of sitting there as hiss.
   */
  startWind(): Emitter | null {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out || !this.white) return null;

    const source = context.createBufferSource();
    source.buffer = this.white;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 480;
    filter.Q.value = 0.8;

    // A very slow oscillator on the filter is what turns noise into weather.
    const drift = context.createOscillator();
    drift.frequency.value = 0.06;
    const driftDepth = context.createGain();
    driftDepth.gain.value = 260;
    drift.connect(driftDepth).connect(filter.frequency);
    drift.start();

    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(out);
    source.start();

    const stop = () => {
      source.stop();
      drift.stop();
      gain.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: () => undefined,
      setIntensity: (value: number) => {
        gain.gain.setTargetAtTime(Math.max(0, value) * 0.16, context.currentTime, 1.2);
      },
      stop,
    };
  }

  /**
   * One bird, somewhere. Two or three descending notes with a little
   * randomness; call it on a timer and a valley sounds occupied.
   */
  birdCall(): void {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out) return;
    const base = 1500 + Math.random() * 1700;
    const notes = 2 + Math.floor(Math.random() * 3);
    const now = context.currentTime;
    for (let i = 0; i < notes; i += 1) {
      const at = now + i * (0.085 + Math.random() * 0.06);
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * (1 - i * 0.11), at);
      osc.frequency.exponentialRampToValueAtTime(base * (1 - i * 0.11) * 0.82, at + 0.07);
      const env = context.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.035, at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + 0.14);
    }
  }

  /**
   * A looping tone anchored somewhere in the world — a vending machine's
   * compressor, the hum of a shop's lights.
   */
  startHum(position: Vec3Like, frequency: number, reach = 14): Emitter | null {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out) return null;

    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.5;
    panner.maxDistance = reach;
    panner.rolloffFactor = 1.6;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const gain = context.createGain();
    gain.gain.value = 0.05;

    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency * 4;
    filter.Q.value = 3;

    osc.connect(filter).connect(gain).connect(panner).connect(out);
    osc.start();

    const stop = () => {
      osc.stop();
      panner.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: (p: Vec3Like) => {
        panner.positionX.value = p.x;
        panner.positionY.value = p.y;
        panner.positionZ.value = p.z;
      },
      setIntensity: (value: number) => {
        gain.gain.setTargetAtTime(value * 0.05, context.currentTime, 0.3);
      },
      stop,
    };
  }

  /**
   * A footstep. `hardness` picks the surface: 0 is soft earth, 1 is wet
   * concrete. Short filtered noise with a fast decay — cheap, and it reads
   * correctly against the animation.
   */
  footstep(hardness: number, effort: number): void {
    const context = this.context;
    const out = this.busNode("sfx");
    if (!context || !out || !this.white) return;

    const source = context.createBufferSource();
    source.buffer = this.white;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420 + hardness * 1500 + Math.random() * 180;
    filter.Q.value = 1.1 + hardness * 1.6;

    const gain = context.createGain();
    const now = context.currentTime;
    const peak = 0.05 + effort * 0.09;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1 + hardness * 0.05);

    source.connect(filter).connect(gain).connect(out);
    source.start(now, Math.random() * 1.5);
    source.stop(now + 0.2);
  }

  /**
   * A train, from inside it: a rumble bed under a rail joint rhythm.
   *
   * The rhythm is what makes it a train rather than a machine — four beats
   * with the third slightly early, scheduled ahead of time so the pattern
   * does not drift with the frame rate.
   */
  startTrain(): Emitter | null {
    const context = this.context;
    const out = this.busNode("ambience");
    if (!context || !out || !this.brown || !this.white) return null;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(out);

    const bed = context.createBufferSource();
    bed.buffer = this.brown;
    bed.loop = true;
    const bedFilter = context.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = 220;
    const bedGain = context.createGain();
    bedGain.gain.value = 1.5;
    bed.connect(bedFilter).connect(bedGain).connect(gain);
    bed.start();

    const white = this.white;
    const beats = [0, 0.34, 0.62, 0.98];
    const period = 1.36;
    let bar = 0;
    const scheduleBar = (index: number, at: number) => {
      for (const [i, beat] of beats.entries()) {
        const when = at + index * period + beat;
        const source = context.createBufferSource();
        source.buffer = white;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = i % 2 === 0 ? 190 : 260;
        filter.Q.value = 2.2;
        const env = context.createGain();
        env.gain.setValueAtTime(0.0001, when);
        env.gain.exponentialRampToValueAtTime(i % 2 === 0 ? 0.22 : 0.14, when + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
        source.connect(filter).connect(env).connect(gain);
        source.start(when, Math.random());
        source.stop(when + 0.2);
      }
    };
    const start = context.currentTime + 0.1;
    scheduleBar(0, start);
    scheduleBar(1, start);
    bar = 2;
    const timer = window.setInterval(() => {
      if (!this.context) return;
      const elapsed = this.context.currentTime - start;
      while (elapsed + period * 2 > bar * period) {
        scheduleBar(bar, start);
        bar += 1;
      }
    }, period * 500);

    const stop = () => {
      window.clearInterval(timer);
      bed.stop();
      gain.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: () => undefined,
      setIntensity: (value: number) => {
        gain.gain.setTargetAtTime(Math.max(0, value) * 0.5, context.currentTime, 0.5);
      },
      stop,
    };
  }

  /** A soft one-shot for interface confirmations and interactions. */
  blip(frequency = 660, seconds = 0.12): void {
    const context = this.context;
    const out = this.busNode("sfx");
    if (!context || !out) return;
    const osc = context.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  /**
   * A slow, spare cue. Original material: a four-chord loop voiced with soft
   * triangles, each note detuned a few cents against itself so it breathes.
   */
  startCue(chords: readonly (readonly number[])[], barSeconds = 6): Emitter | null {
    const context = this.context;
    const out = this.busNode("music");
    if (!context || !out) return null;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(out);

    const voices: OscillatorNode[] = [];
    const start = context.currentTime + 0.2;
    let bar = 0;
    // Schedule two loops ahead and top up as they are consumed.
    const scheduleBar = (index: number) => {
      const chord = chords[index % chords.length] ?? [];
      const at = start + index * barSeconds;
      for (const semitone of chord) {
        const frequency = 220 * Math.pow(2, semitone / 12);
        for (const detune of [-4, 4]) {
          const osc = context.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = frequency;
          osc.detune.value = detune;
          const env = context.createGain();
          env.gain.setValueAtTime(0.0001, at);
          env.gain.exponentialRampToValueAtTime(0.05, at + barSeconds * 0.35);
          env.gain.exponentialRampToValueAtTime(0.0001, at + barSeconds * 0.98);
          osc.connect(env).connect(gain);
          osc.start(at);
          osc.stop(at + barSeconds);
          voices.push(osc);
        }
      }
    };
    scheduleBar(0);
    scheduleBar(1);
    bar = 2;

    const timer = window.setInterval(() => {
      if (!this.context) return;
      const elapsed = this.context.currentTime - start;
      while (elapsed + barSeconds * 2 > bar * barSeconds) {
        scheduleBar(bar);
        bar += 1;
      }
    }, Math.max(1000, barSeconds * 500));

    const stop = () => {
      window.clearInterval(timer);
      for (const voice of voices) {
        try {
          voice.stop();
        } catch {
          // Already stopped; nothing to do.
        }
      }
      gain.disconnect();
    };
    this.teardown.push(stop);

    return {
      setPosition: () => undefined,
      setIntensity: (value: number) => {
        gain.gain.setTargetAtTime(Math.max(0, value), context.currentTime, 1.4);
      },
      stop,
    };
  }

  dispose(): void {
    for (const stop of this.teardown) {
      try {
        stop();
      } catch {
        // Best effort during teardown.
      }
    }
    this.teardown = [];
    this.buses.clear();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}
