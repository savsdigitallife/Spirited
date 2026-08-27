// A tiny dialogue graph runner. Scripts are plain data (see data/script.js):
//
//   { start: 'hi', nodes: { hi: { speaker, text, fx: [...], next|choices } } }
//
// The runner never touches game state directly — it hands effects back to the
// caller, which is what makes conversations testable without a canvas.

import { test } from './state.js';

export class Dialogue {
  constructor(script, state, opts = {}) {
    this.script = script;
    this.state = state;
    this.speakerName = opts.speaker ?? '';
    this.portrait = opts.portrait ?? null;
    this.nodeId = null;
    this.pending = [];
    this.finished = false;
    this.enter(script.start ?? Object.keys(script.nodes)[0]);
  }

  get node() {
    return this.nodeId ? this.script.nodes[this.nodeId] : null;
  }

  // Effects produced by entering nodes queue up here; the game loop drains them.
  drain() {
    const fx = this.pending;
    this.pending = [];
    return fx;
  }

  enter(id) {
    if (!id || id === 'end') {
      this.nodeId = null;
      this.finished = true;
      return;
    }
    const node = this.script.nodes[id];
    if (!node) throw new Error(`dialogue node not found: ${id}`);
    this.nodeId = id;
    if (node.fx) this.pending.push(...node.fx);
    // A node may be pure branching: no text, just a `goto` picked by condition.
    if (node.branch) {
      const hit = node.branch.find((b) => test(this.state, b.cond));
      this.enter(hit ? hit.next : node.next);
    }
  }

  text() {
    return fill(this.node?.text ?? '', this.state);
  }

  speaker() {
    return fill(this.node?.speaker ?? this.speakerName, this.state);
  }

  choices() {
    const list = this.node?.choices;
    if (!list) return null;
    const shown = list.filter((c) => test(this.state, c.cond));
    return shown.length ? shown.map((c) => ({ ...c, text: fill(c.text, this.state) })) : null;
  }

  // Space/Enter on a plain line.
  advance() {
    if (this.finished) return;
    if (this.choices()) return;
    this.enter(this.node?.next);
  }

  choose(index) {
    const opts = this.choices();
    if (!opts) return;
    const choice = opts[Math.max(0, Math.min(opts.length - 1, index))];
    if (choice.fx) this.pending.push(...choice.fx);
    this.enter(choice.next);
  }
}

// {name} is whatever she is being called right now — which is the point of
// most of the story. {trueName} is what she actually is.
export function fill(text, state) {
  return String(text)
    .replace(/\{name\}/g, state.calledName)
    .replace(/\{trueName\}/g, state.trueName);
}
