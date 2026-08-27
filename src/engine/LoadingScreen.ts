/**
 * Boot overlay.
 *
 * Babylon can drive its own loading UI, so we implement `ILoadingScreen`
 * against the markup already in index.html. That keeps one loading surface
 * for engine-driven loads (glTF) and game-driven ones (region streaming).
 */

import type { ILoadingScreen } from "@babylonjs/core/Loading/loadingScreen";

export class BootScreen implements ILoadingScreen {
  loadingUIBackgroundColor = "#0b0d10";

  private readonly root: HTMLElement | null;
  private readonly bar: HTMLElement | null;
  private readonly msg: HTMLElement | null;
  private readonly err: HTMLElement | null;
  private text = "";

  constructor(doc: Document = document) {
    this.root = doc.getElementById("boot");
    this.bar = doc.getElementById("bootBar");
    this.msg = doc.getElementById("bootMsg");
    this.err = doc.getElementById("bootErr");
  }

  get loadingUIText(): string {
    return this.text;
  }

  set loadingUIText(value: string) {
    this.text = value;
    if (this.msg) this.msg.textContent = value;
  }

  /** 0..1; anything outside is clamped. */
  setProgress(fraction: number): void {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    if (this.bar) this.bar.style.width = `${pct}%`;
  }

  status(message: string, fraction?: number): void {
    this.loadingUIText = message;
    if (fraction !== undefined) this.setProgress(fraction);
  }

  fail(message: string): void {
    if (this.err) this.err.textContent = message;
    if (this.bar) this.bar.style.background = "#e0806a";
    this.loadingUIText = "Could not start";
    this.displayLoadingUI();
  }

  displayLoadingUI(): void {
    if (!this.root) return;
    this.root.hidden = false;
    this.root.classList.remove("fading");
  }

  hideLoadingUI(): void {
    const root = this.root;
    if (!root) return;
    this.setProgress(1);
    root.classList.add("fading");
    // Let the CSS opacity transition finish before removing it from layout.
    window.setTimeout(() => {
      root.hidden = true;
    }, 650);
  }
}
