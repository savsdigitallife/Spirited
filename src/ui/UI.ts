/**
 * Interface layer.
 *
 * DOM, deliberately. The world is rendered; the interface is chrome over it.
 * Keeping the two apart means text stays crisp at any resolution scale, the
 * HUD survives a broken render pipeline (which is exactly when you want to
 * read it), and none of it costs a draw call.
 *
 * Everything is driven through events, so a system can raise a prompt or a
 * caption without holding a reference to the HUD.
 */

import { events } from "../core/Events";

const CSS = `
.nag-ui { position: fixed; inset: 0; z-index: 5; pointer-events: none;
  font: 400 15px/1.6 "Hiragino Mincho ProN", Georgia, "Times New Roman", serif;
  color: #f2efe8; text-shadow: 0 2px 10px rgba(0,0,0,.85); }
.nag-ui * { box-sizing: border-box; }

.nag-prompt { position: absolute; left: 50%; bottom: 13%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; padding: 8px 16px;
  background: rgba(10,12,16,.5); border: 1px solid rgba(255,255,255,.16);
  border-radius: 999px; backdrop-filter: blur(8px); opacity: 0;
  transition: opacity .18s ease, transform .18s ease; font-size: 14px; }
.nag-prompt.on { opacity: 1; transform: translateX(-50%) translateY(-4px); }
.nag-key { font: 600 11px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .08em;
  padding: 5px 8px; border-radius: 5px; background: #e8e3d8; color: #14171c; }

.nag-caption { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%);
  max-width: min(46ch, 78vw); text-align: center; font-size: 17px; line-height: 1.7;
  opacity: 0; transition: opacity .5s ease; }
.nag-caption.on { opacity: 1; }

.nag-objective { position: absolute; right: 22px; top: 20px; max-width: 30ch; text-align: right;
  font-size: 13.5px; letter-spacing: .02em; color: #e4dcc8; opacity: 0;
  transition: opacity .6s ease; }
.nag-objective.on { opacity: .92; }
.nag-objective::before { content: ""; display: block; width: 26px; height: 1px;
  background: #d6b368; margin: 0 0 7px auto; }

.nag-fade { position: absolute; inset: 0; background: #05070a; opacity: 0;
  transition: opacity .8s ease; }

.nag-pause { position: absolute; inset: 0; display: none; place-content: center;
  justify-items: center; gap: 18px; background: rgba(5,7,10,.72);
  backdrop-filter: blur(10px); pointer-events: auto; }
.nag-pause.on { display: grid; }
.nag-pause h2 { margin: 0; font-size: 30px; letter-spacing: .3em; text-indent: .3em;
  font-weight: 400; }
.nag-keys { font: 400 13px/2 ui-monospace, Menlo, Consolas, monospace; color: #c8cfcb;
  display: grid; grid-template-columns: auto auto; gap: 2px 20px; text-align: left; }
.nag-keys b { font-weight: 600; color: #e8e3d8; }
.nag-hint { font-size: 12px; color: #93a09b; letter-spacing: .06em; }
`;

export interface PromptRequest {
  /** The key cap to show, e.g. "E". */
  key: string;
  /** What pressing it does, e.g. "Enter the station". */
  label: string;
}

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ["W A S D", "move"],
  ["Shift", "run"],
  ["Alt", "walk"],
  ["Space", "jump"],
  ["Mouse", "look — click to capture, Esc to release"],
  ["Wheel", "zoom"],
  ["E", "interact"],
  ["V", "shoulder swap"],
  ["M", "mute"],
  ["F4", "graphics preset"],
  ["`", "debug overlay"],
];

export class UI {
  private readonly root: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly promptKey: HTMLSpanElement;
  private readonly promptLabel: HTMLSpanElement;
  private readonly caption: HTMLDivElement;
  private readonly objective: HTMLDivElement;
  private readonly fadeLayer: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private captionTimer = 0;
  private unsubscribe: Array<() => void> = [];

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.className = "nag-ui";
    this.root.innerHTML = `
      <div class="nag-fade"></div>
      <div class="nag-objective"></div>
      <div class="nag-prompt"><span class="nag-key"></span><span class="nag-label"></span></div>
      <div class="nag-caption"></div>
      <div class="nag-pause">
        <h2>NAGORI</h2>
        <div class="nag-keys">${CONTROLS.map(
          ([key, what]) => `<b>${key}</b><span>${what}</span>`,
        ).join("")}</div>
        <div class="nag-hint">Esc or P to resume</div>
      </div>`;
    document.body.appendChild(this.root);

    this.fadeLayer = this.root.querySelector(".nag-fade") as HTMLDivElement;
    this.objective = this.root.querySelector(".nag-objective") as HTMLDivElement;
    this.prompt = this.root.querySelector(".nag-prompt") as HTMLDivElement;
    this.promptKey = this.root.querySelector(".nag-key") as HTMLSpanElement;
    this.promptLabel = this.root.querySelector(".nag-label") as HTMLSpanElement;
    this.caption = this.root.querySelector(".nag-caption") as HTMLDivElement;
    this.pause = this.root.querySelector(".nag-pause") as HTMLDivElement;

    this.unsubscribe = [
      events.on("ui/prompt", ({ text }) => {
        if (text === null) this.hidePrompt();
      }),
      events.on("ui/caption", ({ text, seconds }) => this.say(text, seconds)),
      events.on("ui/objective", ({ text }) => this.setObjective(text)),
    ];
  }

  showPrompt(request: PromptRequest): void {
    this.promptKey.textContent = request.key;
    this.promptLabel.textContent = request.label;
    this.prompt.classList.add("on");
  }

  hidePrompt(): void {
    this.prompt.classList.remove("on");
  }

  /** A line of narration or dialogue, cleared automatically. */
  say(text: string, seconds = 4): void {
    this.caption.textContent = text;
    this.caption.classList.add("on");
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      this.caption.classList.remove("on");
    }, seconds * 1000);
  }

  setObjective(text: string | null): void {
    if (!text) {
      this.objective.classList.remove("on");
      return;
    }
    this.objective.textContent = text;
    this.objective.classList.add("on");
  }

  /** Fades the screen. Resolves when the transition has finished. */
  fade(to: number, seconds = 0.8): Promise<void> {
    this.fadeLayer.style.transition = `opacity ${seconds}s ease`;
    // Force a reflow so a fade started in the same frame as a previous one
    // still animates instead of snapping.
    void this.fadeLayer.offsetHeight;
    this.fadeLayer.style.opacity = String(Math.max(0, Math.min(1, to)));
    return new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle("on", paused);
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    window.clearTimeout(this.captionTimer);
    this.root.remove();
  }
}
