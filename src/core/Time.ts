/**
 * Frame clock, fixed-step accumulator, and in-world calendar.
 *
 * Rendering runs as fast as the display allows; simulation that must be
 * deterministic (physics, crop growth, NPC schedules) runs on a fixed step.
 * Keeping the two apart from the very first phase means later systems never
 * have to be retrofitted for frame-rate independence.
 */

/** Longest frame the simulation will accept, so a stall cannot teleport things. */
const MAX_FRAME_SECONDS = 0.1;

export interface WorldClockOptions {
  /** Real-world seconds one in-game day lasts. */
  secondsPerDay: number;
  /** Time of day the game starts at, 0..1 where 0.25 is dawn. */
  startTimeOfDay: number;
  /** Day 1 is the first day. */
  startDay: number;
}

export class Time {
  /** Seconds elapsed in the last rendered frame, clamped and scaled. */
  deltaSeconds = 0;
  /** Unscaled seconds elapsed in the last rendered frame. */
  rawDeltaSeconds = 0;
  /** Seconds since the clock started, scaled. */
  elapsedSeconds = 0;
  /** 0 pauses simulation without pausing rendering. */
  scale = 1;

  readonly fixedStep = 1 / 60;
  private accumulator = 0;

  /** 0..1 across one in-game day. 0 = midnight, 0.5 = noon. */
  timeOfDay: number;
  day: number;
  private readonly secondsPerDay: number;
  /** Multiplier on the world clock only, so time-of-day can be frozen for debug. */
  clockScale = 1;

  constructor(options: Partial<WorldClockOptions> = {}) {
    this.secondsPerDay = options.secondsPerDay ?? 20 * 60;
    this.timeOfDay = options.startTimeOfDay ?? 0.3;
    this.day = options.startDay ?? 1;
  }

  /** Called once per rendered frame with the engine's delta in milliseconds. */
  advance(deltaMs: number): void {
    const raw = Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    this.rawDeltaSeconds = raw;
    this.deltaSeconds = raw * this.scale;
    this.elapsedSeconds += this.deltaSeconds;
    this.accumulator += this.deltaSeconds;

    const before = this.timeOfDay;
    this.timeOfDay += (this.deltaSeconds * this.clockScale) / this.secondsPerDay;
    if (this.timeOfDay >= 1) {
      this.timeOfDay -= Math.floor(this.timeOfDay);
      this.day += 1;
    }
    void before;
  }

  /**
   * Drains the accumulator, invoking `step` once per elapsed fixed step.
   * Capped so a long stall costs a few catch-up steps, not a spiral of death.
   */
  consumeFixedSteps(step: (dt: number) => void, maxSteps = 5): void {
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < maxSteps) {
      step(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps += 1;
    }
    if (steps === maxSteps) this.accumulator = 0;
  }

  /** 24-hour clock reading, for UI. */
  formatTimeOfDay(): string {
    const totalMinutes = Math.floor(this.timeOfDay * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
}
