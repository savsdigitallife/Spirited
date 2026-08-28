/**
 * Character animation.
 *
 * States name a pose; the controller blends toward it. Locomotion states
 * build their pose from a stride phase, so walking and running are the same
 * code with different amplitudes and timings, and one-shots (interact, open
 * a door, pick something up) blend in over their own attack and release.
 *
 * The important part is the shape, not the content: every state is
 * `(phase, weight) → joint angles`, which is precisely what a glTF animation
 * clip is. Replacing procedural clips with authored ones means changing what
 * fills the pose, not how anything asks for it.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { HumanRig, JointName } from "./rig/HumanRig";

export type AnimationState =
  | "idle"
  | "walk"
  | "run"
  | "sprint"
  | "jump"
  | "fall"
  | "land"
  | "interact"
  | "sit"
  | "eat"
  | "phone"
  | "openDoor"
  | "pickUp";

export interface LocomotionInput {
  /** Metres per second across the ground. */
  speed: number;
  /** Speed at which the run cycle is fully in. */
  runSpeed: number;
  grounded: boolean;
  verticalSpeed: number;
  /** Radians per second the body is turning. */
  turnRate: number;
}

type Pose = Partial<Record<JointName, Vector3>>;

/** Metres per full two-step cycle at a walk. Scales with speed. */
const WALK_STRIDE = 1.35;
const RUN_STRIDE = 2.1;

/** One-shot states, and how long each runs for. */
const ONE_SHOTS: Partial<Record<AnimationState, number>> = {
  interact: 0.85,
  openDoor: 1.1,
  pickUp: 1.2,
  land: 0.35,
};

/** States that hold until something clears them. */
const HELD: ReadonlySet<AnimationState> = new Set(["sit", "eat", "phone"]);

function v(x = 0, y = 0, z = 0): Vector3 {
  return new Vector3(x, y, z);
}

export class AnimationController {
  private readonly current = new Map<JointName, Vector3>();
  private readonly target: Pose = {};
  private state: AnimationState = "idle";
  private stateTime = 0;
  private phase = 0;
  private bob = 0;
  private lean = 0;
  private blend = 14;

  constructor(private readonly rig: HumanRig) {
    for (const name of Object.keys(rig.joints) as JointName[]) {
      this.current.set(name, v());
    }
  }

  get active(): AnimationState {
    return this.state;
  }

  /** 0..2π. Footfalls happen as it crosses 0 and π. */
  get cyclePhase(): number {
    return this.phase;
  }

  /** Plays a one-shot, or enters a held state. Ignored if already running. */
  play(state: AnimationState): void {
    if (this.state === state) return;
    if (ONE_SHOTS[this.state] !== undefined && this.stateTime < (ONE_SHOTS[this.state] ?? 0)) {
      // A one-shot in progress is not interrupted by another request.
      return;
    }
    this.state = state;
    this.stateTime = 0;
  }

  /** Leaves a held state. */
  release(): void {
    if (HELD.has(this.state)) {
      this.state = "idle";
      this.stateTime = 0;
    }
  }

  get isBusy(): boolean {
    return HELD.has(this.state) || ONE_SHOTS[this.state] !== undefined;
  }

  /**
   * Advances the animation and writes it to the rig.
   * @returns true on frames where a foot lands.
   */
  update(dt: number, input: LocomotionInput): boolean {
    this.stateTime += dt;

    // A one-shot that has run its course hands control back to locomotion.
    const duration = ONE_SHOTS[this.state];
    if (duration !== undefined && this.stateTime >= duration) {
      this.state = "idle";
      this.stateTime = 0;
    }

    const locomotion = !HELD.has(this.state) && ONE_SHOTS[this.state] === undefined;
    if (locomotion) {
      this.state = this.pickLocomotion(input);
    }

    const footfall = this.advancePhase(dt, input);
    this.buildPose(input);
    this.applyPose(dt);
    return footfall;
  }

  private pickLocomotion(input: LocomotionInput): AnimationState {
    if (!input.grounded) return input.verticalSpeed > 0.4 ? "jump" : "fall";
    if (input.speed < 0.12) return "idle";
    if (input.speed > input.runSpeed * 1.45) return "sprint";
    if (input.speed > input.runSpeed * 0.55) return "run";
    return "walk";
  }

  private advancePhase(dt: number, input: LocomotionInput): boolean {
    if (!input.grounded || input.speed < 0.12 || this.isBusy) {
      // Ease back to a neutral stance rather than freezing mid-stride.
      this.phase += (0 - Math.sin(this.phase)) * Math.min(1, dt * 5) * 0.5;
      return false;
    }
    const stride =
      this.state === "walk"
        ? WALK_STRIDE
        : WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * Math.min(1, input.speed / input.runSpeed);
    const before = this.phase;
    this.phase = (this.phase + (input.speed / stride) * Math.PI * 2 * dt) % (Math.PI * 2);
    return Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI) || this.phase < before;
  }

  private set(joint: JointName, x: number, y = 0, z = 0): void {
    const existing = this.target[joint];
    if (existing) existing.set(x, y, z);
    else this.target[joint] = v(x, y, z);
  }

  private buildPose(input: LocomotionInput): void {
    for (const value of Object.values(this.target)) value.setAll(0);
    this.blend = 14;

    switch (this.state) {
      case "idle":
        this.poseIdle();
        break;
      case "walk":
      case "run":
      case "sprint":
        this.poseLocomotion(input);
        break;
      case "jump":
      case "fall":
        this.poseAirborne(input);
        break;
      case "land":
        this.poseLand();
        break;
      case "interact":
      case "openDoor":
        this.poseReach(this.state === "openDoor" ? 1 : 0.7);
        break;
      case "pickUp":
        this.posePickUp();
        break;
      case "sit":
        this.poseSit();
        break;
      case "eat":
        this.poseEat();
        break;
      case "phone":
        this.posePhone();
        break;
    }

    // Turning leans the spine into the corner, whatever else is happening.
    const targetLean = Math.max(-0.26, Math.min(0.26, -input.turnRate * 0.1));
    this.lean += (targetLean - this.lean) * 0.12;
    const spine = this.target.spine ?? v();
    spine.z += this.lean;
    this.target.spine = spine;
  }

  private breathe(): number {
    return Math.sin(performance.now() / 1100) * 0.012;
  }

  private poseIdle(): void {
    const b = this.breathe();
    this.set("spine", 0.02 + b, 0, 0);
    this.set("chest", -0.01 - b, 0, 0);
    this.set("head", 0.02, Math.sin(performance.now() / 3300) * 0.06, 0);
    // Arms hang slightly out from the body and slightly bent; perfectly
    // straight arms at the side are the single clearest mannequin tell.
    this.set("shoulderL", 0.04, 0, 0.09);
    this.set("shoulderR", 0.04, 0, -0.09);
    this.set("elbowL", -0.22, 0, 0.06);
    this.set("elbowR", -0.22, 0, -0.06);
    this.set("thighL", 0.02, 0, 0.02);
    this.set("thighR", 0.02, 0, -0.02);
    this.bob = 0;
  }

  private poseLocomotion(input: LocomotionInput): void {
    const run = Math.min(1.3, input.speed / Math.max(0.001, input.runSpeed));
    const swing = Math.sin(this.phase);
    const counter = Math.sin(this.phase + Math.PI);
    const amplitude = 0.3 + run * 0.42;

    this.set("thighL", swing * amplitude, 0, 0.02);
    this.set("thighR", counter * amplitude, 0, -0.02);
    // Knees bend only backwards, and hardest on the trailing half.
    this.set("kneeL", Math.max(0, -swing) * amplitude * 1.6 + run * 0.1);
    this.set("kneeR", Math.max(0, -counter) * amplitude * 1.6 + run * 0.1);
    // Ankles roll: toe-off at the back, heel-strike at the front.
    this.set("ankleL", -swing * 0.28 * amplitude);
    this.set("ankleR", -counter * 0.28 * amplitude);

    this.set("shoulderL", counter * amplitude * 0.62, 0, 0.07 - run * 0.02);
    this.set("shoulderR", swing * amplitude * 0.62, 0, -0.07 + run * 0.02);
    this.set("elbowL", -0.3 - run * 0.55 - Math.max(0, counter) * 0.35);
    this.set("elbowR", -0.3 - run * 0.55 - Math.max(0, swing) * 0.35);

    // The pelvis rolls and the chest counter-rotates. This is what separates
    // a walk from a pair of scissors opening and closing.
    this.set("hips", 0, swing * 0.09 * amplitude, Math.cos(this.phase) * 0.04);
    this.set("spine", 0.05 + run * 0.16, -swing * 0.07, 0);
    this.set("chest", 0.02, swing * 0.12 * amplitude, 0);
    this.set("head", -run * 0.06, -swing * 0.03, 0);

    this.bob = Math.abs(Math.cos(this.phase)) * (0.02 + run * 0.03);
    this.blend = 18;
  }

  private poseAirborne(input: LocomotionInput): void {
    const rising = Math.max(0, Math.min(1, input.verticalSpeed / 5));
    const falling = Math.max(0, Math.min(1, -input.verticalSpeed / 7));
    this.set("thighL", -0.95 * rising + 0.3 * falling);
    this.set("thighR", -0.55 * rising + 0.45 * falling);
    this.set("kneeL", 1.35 * rising + 0.25 * falling);
    this.set("kneeR", 0.95 * rising + 0.12 * falling);
    this.set("shoulderL", -0.8 - falling * 0.7, 0, 0.5);
    this.set("shoulderR", -0.8 - falling * 0.7, 0, -0.5);
    this.set("elbowL", -0.5);
    this.set("elbowR", -0.5);
    this.set("spine", 0.12 - falling * 0.2);
    this.bob = 0;
    this.blend = 11;
  }

  private poseLand(): void {
    // A quick compression and recovery, which is the entire read on weight.
    const t = Math.min(1, this.stateTime / (ONE_SHOTS.land ?? 0.35));
    const dip = Math.sin(t * Math.PI) * 0.55;
    this.set("thighL", dip * 0.5, 0, 0.05);
    this.set("thighR", dip * 0.5, 0, -0.05);
    this.set("kneeL", dip);
    this.set("kneeR", dip);
    this.set("ankleL", -dip * 0.45);
    this.set("ankleR", -dip * 0.45);
    this.set("spine", dip * 0.3);
    this.set("shoulderL", -dip * 0.5, 0, 0.2);
    this.set("shoulderR", -dip * 0.5, 0, -0.2);
    this.bob = -dip * 0.06;
    this.blend = 22;
  }

  private poseReach(strength: number): void {
    const t = Math.min(1, this.stateTime / (ONE_SHOTS[this.state] ?? 1));
    const reach = Math.sin(t * Math.PI) * strength;
    this.set("shoulderR", -1.15 * reach, 0.2 * reach, -0.25 * reach);
    this.set("elbowR", -0.45 * reach);
    this.set("wristR", -0.3 * reach);
    this.set("shoulderL", 0.05, 0, 0.1);
    this.set("elbowL", -0.28);
    this.set("chest", 0.05 * reach, -0.16 * reach, 0);
    this.set("head", 0.08 * reach, -0.12 * reach, 0);
    this.blend = 12;
  }

  private posePickUp(): void {
    const t = Math.min(1, this.stateTime / (ONE_SHOTS.pickUp ?? 1.2));
    const down = Math.sin(t * Math.PI);
    this.set("spine", 0.85 * down);
    this.set("hips", 0.1 * down);
    this.set("thighL", -0.35 * down, 0, 0.04);
    this.set("thighR", -0.3 * down, 0, -0.04);
    this.set("kneeL", 0.7 * down);
    this.set("kneeR", 0.62 * down);
    this.set("shoulderR", -0.55 * down, 0, -0.15);
    this.set("elbowR", -0.5 * down);
    this.set("shoulderL", 0.1, 0, 0.14);
    this.set("head", -0.35 * down);
    this.blend = 10;
  }

  private poseSit(): void {
    this.set("hips", 0.02);
    this.set("thighL", -1.48, 0, 0.05);
    this.set("thighR", -1.42, 0, -0.05);
    this.set("kneeL", 1.44);
    this.set("kneeR", 1.38);
    this.set("ankleL", 0.1);
    this.set("ankleR", 0.1);
    this.set("shoulderL", 0.12, 0, 0.12);
    this.set("shoulderR", 0.16, 0, -0.12);
    this.set("elbowL", -1.2);
    this.set("elbowR", -1.26);
    this.set("spine", 0.06 + this.breathe());
    this.blend = 7;
  }

  private poseEat(): void {
    this.poseSit();
    const t = (performance.now() / 1000) % 3;
    const lift = t < 1.4 ? Math.sin((t / 1.4) * Math.PI) : 0;
    this.set("shoulderR", 0.16 - lift * 0.5, 0, -0.12);
    this.set("elbowR", -1.26 - lift * 0.75);
    this.set("head", 0.1 + lift * 0.12);
    this.blend = 9;
  }

  private posePhone(): void {
    const drift = Math.sin(performance.now() / 1700) * 0.03;
    this.set("shoulderL", -0.55, 0.18, 0.22);
    this.set("elbowL", -1.5 + drift);
    this.set("shoulderR", 0.05, 0, -0.12);
    this.set("elbowR", -0.35);
    this.set("chest", 0.1, 0.05, 0);
    this.set("head", 0.42 + drift, 0.02, 0);
    this.set("spine", 0.06);
    this.blend = 8;
  }

  /** Eases the live pose toward the target and writes it to the joints. */
  private applyPose(dt: number): void {
    const k = Math.min(1, dt * this.blend);
    for (const name of Object.keys(this.rig.joints) as JointName[]) {
      const live = this.current.get(name);
      const joint = this.rig.joints[name];
      if (!live) continue;
      const wanted = this.target[name];
      live.x += ((wanted?.x ?? 0) - live.x) * k;
      live.y += ((wanted?.y ?? 0) - live.y) * k;
      live.z += ((wanted?.z ?? 0) - live.z) * k;
      joint.rotation.set(live.x, live.y, live.z);
    }
    // The hips carry the vertical bob; everything else hangs off them.
    this.rig.joints.hips.position.y = this.rig.hipHeight + this.bob;
  }
}
