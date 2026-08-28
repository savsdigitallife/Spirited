/**
 * Third-person camera.
 *
 * A hand-driven spring arm rather than one of Babylon's built-in rigs: an
 * action-RPG camera needs a shoulder offset, an occlusion probe, speed-based
 * framing and its own smoothing curves, and fighting a built-in camera's
 * input handling to get those costs more than owning the maths.
 *
 * The camera orbits a pivot floating at the character's shoulder. The
 * character never steers it — the player does, and the character turns to
 * face where they are asked to move.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { InputManager } from "../input/InputManager";

export interface ThirdPersonCameraOptions {
  /** Height above the character's feet that the camera looks at. */
  pivotHeight: number;
  /** Sideways offset, so the character does not sit dead centre. */
  shoulder: number;
  minDistance: number;
  maxDistance: number;
  distance: number;
}

const DEFAULTS: ThirdPersonCameraOptions = {
  pivotHeight: 1.5,
  shoulder: 0.55,
  minDistance: 1.6,
  maxDistance: 8,
  distance: 4.4,
};

/** Radians. Stops short of straight up and straight down. */
const PITCH_MIN = -0.62;
const PITCH_MAX = 1.05;

export class ThirdPersonCamera {
  readonly camera: UniversalCamera;

  private yaw = Math.PI;
  private pitch = 0.28;
  private distance: number;
  private currentDistance: number;
  private shoulderSide = 1;
  private currentShoulder: number;
  private readonly options: ThirdPersonCameraOptions;

  private readonly pivot = new Vector3();
  private readonly smoothedPivot = new Vector3();
  private readonly desired = new Vector3();
  private readonly probe = new Ray(new Vector3(), new Vector3(), 1);
  private initialised = false;

  constructor(
    private readonly scene: Scene,
    private readonly input: InputManager,
    options: Partial<ThirdPersonCameraOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.distance = this.options.distance;
    this.currentDistance = this.distance;
    this.currentShoulder = this.options.shoulder;

    this.camera = new UniversalCamera("camera.thirdPerson", new Vector3(0, 2, -5), scene);
    this.camera.minZ = 0.15;
    this.camera.maxZ = 500;
    this.camera.fov = 0.92;
    // No input attachment: this camera is driven entirely by update().
    this.camera.inputs.clear();
  }

  /** Where the player is looking, flattened to the ground plane. */
  get forward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  get right(): Vector3 {
    return new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  get heading(): number {
    return this.yaw;
  }

  swapShoulder(): void {
    this.shoulderSide *= -1;
  }

  /** Points the camera along a compass heading, in radians. */
  setHeading(yaw: number, pitch = this.pitch): void {
    this.yaw = yaw;
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
    this.initialised = false;
  }

  /**
   * @param target  the character's feet position
   * @param speed01 0..1 of top speed, used to widen the lens a little
   */
  update(target: Vector3, speed01: number, dt: number): void {
    const look = this.input.look();
    if (look.x !== 0 || look.y !== 0) {
      this.yaw -= look.x * this.input.sensitivity;
      this.pitch += look.y * this.input.sensitivity;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    }

    const wheel = this.input.wheel();
    if (wheel !== 0) {
      this.distance = Math.max(
        this.options.minDistance,
        Math.min(this.options.maxDistance, this.distance + wheel * 0.55),
      );
    }

    // Pivot: shoulder height, offset to whichever side is active.
    const right = this.right;
    const shoulderTarget = this.options.shoulder * this.shoulderSide;
    this.currentShoulder += (shoulderTarget - this.currentShoulder) * Math.min(1, dt * 6);
    this.pivot.set(
      target.x + right.x * this.currentShoulder,
      target.y + this.options.pivotHeight,
      target.z + right.z * this.currentShoulder,
    );

    if (!this.initialised) {
      this.smoothedPivot.copyFrom(this.pivot);
      this.initialised = true;
    } else {
      // The pivot lags slightly, which is what stops the camera feeling
      // welded to the character while still tracking a sprint.
      const follow = 1 - Math.pow(0.0016, dt);
      this.smoothedPivot.x += (this.pivot.x - this.smoothedPivot.x) * follow;
      this.smoothedPivot.y += (this.pivot.y - this.smoothedPivot.y) * follow * 0.7;
      this.smoothedPivot.z += (this.pivot.z - this.smoothedPivot.z) * follow;
    }

    const cosPitch = Math.cos(this.pitch);
    const offset = new Vector3(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    );

    // Occlusion: probe from the pivot outwards and pull in on the first hit,
    // so the camera never ends up inside a wall.
    let allowed = this.distance;
    this.probe.origin.copyFrom(this.smoothedPivot);
    this.probe.direction.copyFrom(offset);
    this.probe.length = this.distance + 0.4;
    const hit = this.scene.pickWithRay(this.probe, (mesh: AbstractMesh) =>
      Boolean(mesh.checkCollisions && mesh.isEnabled() && mesh.isVisible),
    );
    if (hit?.hit && hit.distance > 0) {
      allowed = Math.max(this.options.minDistance * 0.55, hit.distance - 0.35);
    }
    // Snap in fast when something intrudes; ease back out slowly.
    const rate = allowed < this.currentDistance ? 22 : 3.2;
    this.currentDistance += (allowed - this.currentDistance) * Math.min(1, dt * rate);

    this.desired.set(
      this.smoothedPivot.x + offset.x * this.currentDistance,
      this.smoothedPivot.y + offset.y * this.currentDistance,
      this.smoothedPivot.z + offset.z * this.currentDistance,
    );
    this.camera.position.copyFrom(this.desired);
    this.camera.setTarget(this.smoothedPivot);

    // A touch of extra field of view at speed reads as effort.
    const targetFov = 0.92 + speed01 * 0.1;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
  }

  setFarPlane(far: number): void {
    this.camera.maxZ = far;
  }

  dispose(): void {
    this.camera.dispose();
  }
}
