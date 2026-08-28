/**
 * Character movement.
 *
 * Babylon's own collision system (`moveWithCollisions` against an ellipsoid)
 * rather than a physics engine: the player is a kinematic body, not a
 * ragdoll, and a full solver would add a dependency and a pile of tuning for
 * behaviour we would then have to fight. What a solver does not give us for
 * free — stepping onto a kerb — is fifteen lines here.
 *
 * Movement is camera-relative: the stick or the keys say "away from the
 * camera", and the body turns to face wherever that is.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { InputManager } from "../input/InputManager";
import type { AudioManager } from "../audio/AudioManager";
import { PlayerCharacter } from "./PlayerCharacter";
import type { ThirdPersonCamera } from "./ThirdPersonCamera";

export interface MovementTuning {
  walk: number;
  jog: number;
  sprint: number;
  acceleration: number;
  /** Fraction of ground acceleration available while airborne. */
  airControl: number;
  /** Radians per second the body can turn. */
  turnRate: number;
  gravity: number;
  jumpSpeed: number;
  /** How high a ledge the character will step onto without jumping. */
  stepHeight: number;
}

const TUNING: MovementTuning = {
  walk: 1.5,
  jog: 4,
  sprint: 7.2,
  acceleration: 26,
  airControl: 0.3,
  turnRate: 11,
  gravity: -22,
  jumpSpeed: 7,
  stepHeight: 0.42,
};

/** Seconds after walking off a ledge during which a jump still counts. */
const COYOTE_TIME = 0.12;
/** Seconds a jump press is remembered while falling. */
const JUMP_BUFFER = 0.16;

/**
 * Longest single collision move, in metres.
 *
 * Babylon's swept ellipsoid stops being reliable once a step approaches the
 * ellipsoid's own radius: the character ends up starting a step already
 * inside a wall, and from there it is pushed out the far side. At 60 fps a
 * sprint step is 0.12 m and this never bites, but the frame clock is allowed
 * to reach 100 ms, and on a slow machine that is 0.72 m — straight through a
 * shopfront. Splitting the move keeps every step inside the radius no matter
 * what the frame rate does.
 */
const MAX_COLLISION_STEP = 0.14;

/**
 * How far down the character reaches for the ground each frame while
 * standing.
 *
 * Pressing down with gravity's velocity is the obvious thing and it is
 * wrong: at a 100 ms frame that is a 0.37 m shove into the floor, the
 * collider resolves most but not all of it, and the few millimetres left
 * over accumulate until she is knee-deep in the road. A short fixed probe
 * can only ever leave a few millimetres, and those are undone outright.
 */
const GROUND_PROBE = 0.07;

/** Seconds of unsupported ground the animation is allowed to ignore. */
const SUPPORT_GRACE = 0.15;

/**
 * How far above an analytic ground surface the character is still considered
 * to be standing on it.
 *
 * A heightfield is sampled, not collided with, so there is no swept test to
 * catch her — she simply must never be below it, and if she is just above it
 * and descending, she is standing on it.
 */
const GROUND_SNAP = 0.45;

export interface PlayerSurface {
  /** 0 soft earth, 1 wet concrete. Chooses the footstep sound. */
  hardness: number;
}

/** Hard limits on where the character may be, independent of collision. */
export interface PlayerBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Below this the character is considered to have fallen out of the world. */
  floorY: number;
}

export class PlayerController {
  readonly character: PlayerCharacter;
  /** Invisible ellipsoid that does the colliding. */
  readonly collider: Mesh;

  private readonly tuning = TUNING;
  private velocity = new Vector3();
  private verticalSpeed = 0;
  private grounded = false;
  private sinceGrounded = 999;
  private jumpQueued = 999;
  private facing = 0;
  private turnRate = 0;
  private locked = false;

  surface: PlayerSurface = { hardness: 1 };
  private bounds: PlayerBounds | null = null;
  private lastSafe: Vector3;
  private groundHeight: ((x: number, z: number) => number) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly input: InputManager,
    private readonly camera: ThirdPersonCamera,
    private readonly audio: AudioManager,
    spawn: Vector3,
  ) {
    this.character = new PlayerCharacter(scene);

    // The collider is a capsule a little narrower than the body, so brushing
    // a wall does not stop the character dead.
    const collider = CreateCapsule(
      "player.collider",
      { radius: 0.28, height: 1.66, tessellation: 8 },
      scene,
    );
    collider.isVisible = false;
    collider.isPickable = false;
    collider.checkCollisions = true;
    collider.ellipsoid = new Vector3(0.28, 0.83, 0.28);
    collider.ellipsoidOffset = new Vector3(0, 0, 0);
    collider.position.copyFrom(spawn).addInPlace(new Vector3(0, 0.85, 0));
    this.collider = collider;

    this.character.root.position.copyFrom(spawn);
    this.lastSafe = spawn.clone();
  }

  /**
   * A backstop for the region's extent.
   *
   * Collision geometry should keep the player inside the built world, and
   * mostly does. This makes it certain: whatever a collision misses, the
   * player still cannot walk off the end of the map or fall out of it, which
   * is the difference between a bug and a bug the player sees.
   */
  setBounds(bounds: PlayerBounds): void {
    this.bounds = bounds;
  }

  /**
   * Gives the controller the region's ground as a function.
   *
   * Where a region has a heightfield, this is strictly better than colliding
   * with its mesh: it is exact at any speed, it cannot be tunnelled through,
   * and it costs two noise samples instead of a swept test against seventy
   * thousand triangles. Anything standing *on* the ground — a platform, a
   * road slab, a step — is still handled by collision; the heightfield is
   * only the floor beneath all of it.
   */
  setGroundHeight(fn: ((x: number, z: number) => number) | null): void {
    this.groundHeight = fn;
  }

  /** Feet position. */
  get position(): Vector3 {
    return new Vector3(
      this.collider.position.x,
      this.collider.position.y - 0.83,
      this.collider.position.z,
    );
  }

  get speed(): number {
    return this.velocity.length();
  }

  get speed01(): number {
    return Math.min(1, this.speed / this.tuning.sprint);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  /**
   * Grounded, or close enough for the animation to keep her feet down.
   *
   * Walking down a slope alternates between contact and free fall every
   * frame. That is correct physics and terrible animation, so the pose and
   * the footsteps read this instead.
   */
  get isSupported(): boolean {
    return this.grounded || this.sinceGrounded < SUPPORT_GRACE;
  }

  get facingAngle(): number {
    return this.facing;
  }

  /** Freezes input handling — used during cutscenes and menus. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) this.velocity.setAll(0);
  }

  teleport(to: Vector3, facing = this.facing): void {
    this.collider.position.copyFrom(to).addInPlace(new Vector3(0, 0.85, 0));
    this.character.root.position.copyFrom(to);
    this.facing = facing;
    this.velocity.setAll(0);
    this.verticalSpeed = 0;
  }

  update(dt: number): void {
    const axis = this.locked ? { x: 0, y: 0 } : this.input.moveAxis();
    const wants = Math.hypot(axis.x, axis.y) > 0.02;

    // Camera-relative desired direction.
    const forward = this.camera.forward;
    const right = this.camera.right;
    const desired = new Vector3(
      forward.x * axis.y + right.x * axis.x,
      0,
      forward.z * axis.y + right.z * axis.x,
    );
    if (desired.lengthSquared() > 1) desired.normalize();

    const topSpeed = this.input.isDown("sprint")
      ? this.tuning.sprint
      : this.input.isDown("walk")
        ? this.tuning.walk
        : this.tuning.jog;
    const target = desired.scale(topSpeed);

    const control = this.grounded ? 1 : this.tuning.airControl;
    const accel = this.tuning.acceleration * control * dt;
    const toTarget = target.subtract(this.velocity);
    if (toTarget.length() <= accel) this.velocity.copyFrom(target);
    else this.velocity.addInPlace(toTarget.normalize().scale(accel));

    // Turn toward travel. Facing is decoupled from the camera so the body
    // keeps momentum through a camera swing.
    if (wants && this.velocity.lengthSquared() > 0.04) {
      const wanted = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = wanted - this.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const step = Math.max(
        -this.tuning.turnRate * dt,
        Math.min(this.tuning.turnRate * dt, delta),
      );
      this.facing += step;
      this.turnRate = step / Math.max(dt, 0.0001);
    } else {
      this.turnRate += (0 - this.turnRate) * Math.min(1, dt * 8);
    }

    // Jump, with a little forgiveness at both ends of the timing.
    this.sinceGrounded = this.grounded ? 0 : this.sinceGrounded + dt;
    this.jumpQueued = this.input.justPressed("jump") && !this.locked
      ? 0
      : this.jumpQueued + dt;
    if (this.jumpQueued < JUMP_BUFFER && this.sinceGrounded < COYOTE_TIME) {
      this.verticalSpeed = this.tuning.jumpSpeed;
      this.grounded = false;
      this.sinceGrounded = COYOTE_TIME;
      this.jumpQueued = JUMP_BUFFER;
      this.audio.footstep(this.surface.hardness, 0.5);
    }

    this.moveHorizontally(this.velocity.scale(dt));
    this.applyGravity(dt);
    this.enforceBounds();

    // The visible body follows the collider; the collider is authoritative.
    const feet = this.position;
    this.character.root.position.copyFrom(feet);
    this.character.root.rotation.y = this.facing;

    const footfall = this.character.pose(
      {
        speed: new Vector3(this.velocity.x, 0, this.velocity.z).length(),
        runSpeed: this.tuning.jog,
        grounded: this.isSupported,
        verticalSpeed: this.verticalSpeed,
        turnRate: this.turnRate,
      },
      dt,
    );
    if (footfall) {
      this.audio.footstep(this.surface.hardness, Math.min(1, this.speed / this.tuning.jog));
    }
  }

  /** Moves in steps small enough for the collider to stay reliable. */
  private slide(displacement: Vector3): void {
    const distance = displacement.length();
    if (distance < 1e-5) return;
    const steps = Math.min(16, Math.ceil(distance / MAX_COLLISION_STEP));
    if (steps <= 1) {
      this.collider.moveWithCollisions(displacement);
      return;
    }
    const step = displacement.scale(1 / steps);
    for (let i = 0; i < steps; i += 1) this.collider.moveWithCollisions(step);
  }

  /**
   * Moves along the ground, and if that is blocked, tries again from a step
   * height up before dropping back down. That is what lets the character
   * walk onto a kerb or up a stair tread instead of stalling against it.
   */
  private moveHorizontally(displacement: Vector3): void {
    const wanted = displacement.length();
    if (wanted < 1e-5) return;

    const start = this.collider.position.clone();
    this.slide(displacement);
    const achieved = Vector3.Distance(start, this.collider.position);
    if (!this.grounded || achieved > wanted * 0.7) return;

    const stepUp = new Vector3(0, this.tuning.stepHeight, 0);
    const stepDown = new Vector3(0, -this.tuning.stepHeight - 0.02, 0);
    const blocked = this.collider.position.clone();

    this.collider.position.copyFrom(start);
    this.slide(stepUp);
    this.slide(displacement);
    this.slide(stepDown);

    // Accept the detour only if it behaved like a step: some ground gained,
    // and not much height. Without the height test, walking into a corner
    // lifts the character 0.42 m per frame and ladders her up the wall.
    const gained = Vector3.Distance(start, this.collider.position);
    const climbed = this.collider.position.y - start.y;
    if (gained < achieved || climbed > this.tuning.stepHeight * 0.75) {
      this.collider.position.copyFrom(blocked);
    }
  }

  private applyGravity(dt: number): void {
    const wasGrounded = this.grounded;
    if (wasGrounded) this.verticalSpeed = 0;
    else this.verticalSpeed = Math.max(-55, this.verticalSpeed + this.tuning.gravity * dt);

    // Standing: reach down a fixed short distance. Falling: move by however
    // far gravity got her.
    const wanted = wasGrounded ? -GROUND_PROBE : this.verticalSpeed * dt;
    const before = this.collider.position.y;
    this.slide(new Vector3(0, wanted, 0));
    const achieved = this.collider.position.y - before;

    if (wanted < 0 && achieved > wanted + 1e-4) {
      // The probe found floor. Put her back exactly where she was standing;
      // whatever the collider let slip is discarded rather than banked.
      this.grounded = true;
      this.verticalSpeed = 0;
      if (wasGrounded) this.collider.position.y = before;
      else this.depenetrate();
    } else if (wanted > 0 && achieved < wanted - 1e-4) {
      this.verticalSpeed = 0;
      this.grounded = false;
    } else {
      // Nothing under her within the probe: she has walked off something.
      this.grounded = false;
    }

    this.settleOnGround();
  }

  /**
   * Lands her *on* the floor rather than slightly in it.
   *
   * A swept collision that stops mid-surface leaves the collider a centimetre
   * or two inside, and the resting-contact rule then holds that depth for as
   * long as she stands there — so a jump costs a couple of centimetres and
   * she gradually sinks over a walk. Lifting clear and dropping again starts
   * the sweep from outside the geometry, where it resolves exactly.
   */
  private depenetrate(): void {
    const lift = 0.3;
    this.slide(new Vector3(0, lift, 0));
    this.slide(new Vector3(0, -(lift + 0.02), 0));
  }

  /** Applies the region's heightfield as an absolute floor. */
  private settleOnGround(): void {
    const height = this.groundHeight;
    if (!height) return;
    const p = this.collider.position;
    const surface = height(p.x, p.z) + 0.83;

    if (p.y < surface) {
      p.y = surface;
      this.grounded = true;
      this.verticalSpeed = 0;
      return;
    }
    if (!this.grounded && this.verticalSpeed <= 0 && p.y - surface <= GROUND_SNAP) {
      p.y = surface;
      this.grounded = true;
      this.verticalSpeed = 0;
    }
  }

  /** Clamps to the region, and recovers the character if it leaves the world. */
  private enforceBounds(): void {
    const bounds = this.bounds;
    if (!bounds) return;
    const p = this.collider.position;

    if (p.y < bounds.floorY) {
      // Fell out of the world: put her back where she last stood safely.
      this.teleport(this.lastSafe);
      return;
    }

    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, p.x));
    const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.z));
    if (clampedX !== p.x || clampedZ !== p.z) {
      p.x = clampedX;
      p.z = clampedZ;
      // Kill the outward velocity too, or she presses against the limit.
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.grounded) this.lastSafe.copyFrom(this.position);
  }

  dispose(): void {
    this.character.dispose();
    this.collider.dispose();
    void this.scene;
  }
}
