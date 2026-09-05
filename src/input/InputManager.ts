/**
 * Input as intent, not as hardware.
 *
 * Gameplay code asks whether the "interact" action fired; it never asks
 * about KeyE, gamepad button 0, or a mouse button. That indirection is what
 * lets the same controller code serve keyboard, mouse and gamepad, and what
 * makes rebinding a data change rather than a code change.
 */

import { events } from "../core/Events";

export type Action =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "sprint"
  | "walk"
  | "jump"
  | "interact"
  | "attack"
  | "dodge"
  | "tool"
  | "cameraToggle"
  | "pause"
  | "mute"
  | "debug"
  | "cycleQuality";

export interface Vec2 {
  x: number;
  y: number;
}

type Binding = { keys: string[]; pad?: number[] };

const DEFAULT_BINDINGS: Record<Action, Binding> = {
  moveForward: { keys: ["KeyW", "ArrowUp"] },
  moveBack: { keys: ["KeyS", "ArrowDown"] },
  moveLeft: { keys: ["KeyA", "ArrowLeft"] },
  moveRight: { keys: ["KeyD", "ArrowRight"] },
  sprint: { keys: ["ShiftLeft", "ShiftRight"], pad: [10] },
  walk: { keys: ["AltLeft"], pad: [11] },
  jump: { keys: ["Space"], pad: [0] },
  interact: { keys: ["KeyE"], pad: [2] },
  attack: { keys: ["KeyF"], pad: [7] },
  dodge: { keys: ["ControlLeft"], pad: [1] },
  tool: { keys: ["KeyQ"], pad: [3] },
  cameraToggle: { keys: ["KeyV"], pad: [9] },
  pause: { keys: ["Escape", "KeyP"], pad: [9] },
  mute: { keys: ["KeyM"] },
  debug: { keys: ["Backquote", "F3"] },
  cycleQuality: { keys: ["F4"] },
};

/** Gamepad sticks rest slightly off-centre; ignore the noise floor. */
const STICK_DEADZONE = 0.18;
const PAD_AXIS_MOVE_X = 0;
const PAD_AXIS_MOVE_Y = 1;
const PAD_AXIS_LOOK_X = 2;
const PAD_AXIS_LOOK_Y = 3;

function deadzone(value: number): number {
  if (Math.abs(value) < STICK_DEADZONE) return 0;
  const sign = Math.sign(value);
  return sign * ((Math.abs(value) - STICK_DEADZONE) / (1 - STICK_DEADZONE));
}

export class InputManager {
  private readonly bindings: Record<Action, Binding> = DEFAULT_BINDINGS;
  private readonly keysDown = new Set<string>();
  private readonly mouseDown = new Set<number>();
  private readonly held = new Set<Action>();
  private readonly pressedThisFrame = new Set<Action>();
  private readonly releasedThisFrame = new Set<Action>();

  private lookDelta: Vec2 = { x: 0, y: 0 };
  private wheelDelta = 0;
  private padIndex: number | null = null;
  private padHeld = new Set<Action>();
  private disposers: Array<() => void> = [];
  /**
   * True while a button is held on the canvas without pointer lock.
   *
   * Pointer lock is not always available: an embedded frame is only granted
   * it if the frame carries `allow="pointer-lock"`, which the Replit webview
   * and most other embeds do not. Without a fallback the camera simply never
   * moves, and the game reads as broken rather than as embedded. Dragging
   * turns the camera instead, which is what a player tries anyway.
   */
  private dragging = false;
  /** Where the cursor was last seen, for measuring a drag. */
  private lastPointer: Vec2 | null = null;

  /** Mouse sensitivity in radians per pixel, applied by whoever consumes look. */
  sensitivity = 0.0022;
  invertY = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  attach(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Let the browser keep its own shortcuts (reload, devtools, tab).
      if (e.ctrlKey || e.metaKey) return;
      if (this.isBoundKey(e.code)) e.preventDefault();
      this.keysDown.add(e.code);
      this.refreshActions();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
      this.refreshActions();
    };
    const onBlur = () => {
      this.keysDown.clear();
      this.mouseDown.clear();
      this.dragging = false;
      this.lastPointer = null;
      this.refreshActions();
    };
    // Buttons arrive as pointer events, not mouse events. The renderer calls
    // `preventDefault` on `pointerdown`, and preventing a pointer event's
    // default is what tells the browser not to synthesise the compatibility
    // mouse events behind it — so `mousedown` never fires here at all, and
    // `mousemove` only does while the pointer is locked, which is the one
    // case the browser dispatches directly.
    const onPointerDown = (e: PointerEvent) => {
      this.canvas.focus();
      this.mouseDown.add(e.button);
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.refreshActions();
    };
    const onPointerUp = (e: PointerEvent) => {
      this.mouseDown.delete(e.button);
      if (this.mouseDown.size === 0) {
        this.dragging = false;
        this.lastPointer = null;
      }
      this.refreshActions();
    };
    const onMouseMove = (e: MouseEvent) => {
      // Locked, the pointer is ours and every movement is a look.
      if (document.pointerLockElement !== this.canvas) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY * (this.invertY ? -1 : 1);
    };
    const onPointerMove = (e: PointerEvent) => {
      // The locked path above owns the pointer; this is only for when we do
      // not have it. Then only a drag counts as a look — otherwise the camera
      // would swing about whenever the cursor crossed the page — and the
      // delta is measured from where the cursor was, rather than read off
      // `movementX`, which browsers only fill in dependably under lock.
      if (document.pointerLockElement === this.canvas || !this.dragging) return;
      const last = this.lastPointer;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (!last) return;
      this.lookDelta.x += e.clientX - last.x;
      this.lookDelta.y += (e.clientY - last.y) * (this.invertY ? -1 : 1);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.wheelDelta += Math.sign(e.deltaY);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onPadConnect = (e: GamepadEvent) => {
      this.padIndex = e.gamepad.index;
    };
    const onPadDisconnect = (e: GamepadEvent) => {
      if (this.padIndex === e.gamepad.index) this.padIndex = null;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    this.canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("mousemove", onMouseMove);
    this.canvas.addEventListener("wheel", onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("gamepadconnected", onPadConnect);
    window.addEventListener("gamepaddisconnected", onPadDisconnect);

    this.disposers = [
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => window.removeEventListener("blur", onBlur),
      () => this.canvas.removeEventListener("pointerdown", onPointerDown),
      () => window.removeEventListener("pointerup", onPointerUp),
      () => window.removeEventListener("pointercancel", onPointerUp),
      () => window.removeEventListener("pointermove", onPointerMove),
      () => window.removeEventListener("mousemove", onMouseMove),
      () => this.canvas.removeEventListener("wheel", onWheel),
      () => this.canvas.removeEventListener("contextmenu", onContextMenu),
      () => window.removeEventListener("gamepadconnected", onPadConnect),
      () => window.removeEventListener("gamepaddisconnected", onPadDisconnect),
    ];
  }

  private isBoundKey(code: string): boolean {
    for (const binding of Object.values(this.bindings)) {
      if (binding.keys.includes(code)) return true;
    }
    return false;
  }

  private refreshActions(): void {
    for (const [action, binding] of Object.entries(this.bindings) as [
      Action,
      Binding,
    ][]) {
      const down =
        binding.keys.some((key) => this.keysDown.has(key)) ||
        this.padHeld.has(action) ||
        (action === "attack" && this.mouseDown.has(0)) ||
        (action === "interact" && this.mouseDown.has(2));
      this.setHeld(action, down);
    }
  }

  private setHeld(action: Action, down: boolean): void {
    const was = this.held.has(action);
    if (down === was) return;
    if (down) {
      this.held.add(action);
      this.pressedThisFrame.add(action);
    } else {
      this.held.delete(action);
      this.releasedThisFrame.add(action);
    }
    events.emit("input/action", { action, pressed: down });
  }

  /** Call once per frame before reading state. */
  poll(): void {
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    for (const candidate of pads) {
      if (candidate && candidate.connected) {
        pad = candidate;
        break;
      }
    }
    const nextPadHeld = new Set<Action>();
    if (pad) {
      this.padIndex = pad.index;
      for (const [action, binding] of Object.entries(this.bindings) as [
        Action,
        Binding,
      ][]) {
        if (!binding.pad) continue;
        for (const button of binding.pad) {
          if (pad.buttons[button]?.pressed) nextPadHeld.add(action);
        }
      }
      const lx = deadzone(pad.axes[PAD_AXIS_LOOK_X] ?? 0);
      const ly = deadzone(pad.axes[PAD_AXIS_LOOK_Y] ?? 0);
      // Stick look is a rate, not a delta; scale it to feel like mouse pixels.
      this.lookDelta.x += lx * 18;
      this.lookDelta.y += ly * 18 * (this.invertY ? -1 : 1);
    }
    this.padHeld = nextPadHeld;
    this.refreshActions();
  }

  /** Call once per frame after all reads. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    this.wheelDelta = 0;
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  justPressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  justReleased(action: Action): boolean {
    return this.releasedThisFrame.has(action);
  }

  /** Movement intent in local space: +y forward, +x right, length <= 1. */
  moveAxis(): Vec2 {
    let x = (this.isDown("moveRight") ? 1 : 0) - (this.isDown("moveLeft") ? 1 : 0);
    let y = (this.isDown("moveForward") ? 1 : 0) - (this.isDown("moveBack") ? 1 : 0);

    const pad = this.padIndex !== null ? navigator.getGamepads?.()[this.padIndex] : null;
    if (pad) {
      x += deadzone(pad.axes[PAD_AXIS_MOVE_X] ?? 0);
      y -= deadzone(pad.axes[PAD_AXIS_MOVE_Y] ?? 0);
    }

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Accumulated look delta in pixels since the last endFrame(). */
  look(): Vec2 {
    return { x: this.lookDelta.x, y: this.lookDelta.y };
  }

  /** -1, 0 or +1 per notch; used for camera zoom. */
  wheel(): number {
    return this.wheelDelta;
  }

  get hasGamepad(): boolean {
    return this.padIndex !== null;
  }

  /**
   * Asks for the pointer, and does not mind being refused.
   *
   * Browsers reject this in an embedded frame without the permission, and
   * momentarily after the player has pressed Escape. Both are ordinary, so
   * the rejection is swallowed rather than raised: `onMouseMove` falls back
   * to drag-to-look and the game stays playable either way.
   */
  requestPointerLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    const request: unknown = this.canvas.requestPointerLock();
    if (request instanceof Promise) request.catch(() => undefined);
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers = [];
    this.keysDown.clear();
    this.held.clear();
  }
}
