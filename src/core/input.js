// Keyboard + on-screen buttons, normalised into a tiny polling API.
// `pressed` is edge-triggered and consumed once per frame by the game.

const MOVE = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right'
};

export class Input {
  constructor(target = window) {
    this.held = new Set();
    this.edge = new Set();
    this.anyKeySince = 0;

    const down = (code) => {
      if (!this.held.has(code)) this.edge.add(code);
      this.held.add(code);
      this.anyKeySince++;
    };
    const up = (code) => this.held.delete(code);

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Stop the browser scrolling the page out from under the canvas.
      if (MOVE[e.code] || ['Space', 'Enter', 'Escape', 'Tab'].includes(e.code)) e.preventDefault();
      down(e.code);
    });
    target.addEventListener('keyup', (e) => up(e.code));
    target.addEventListener('blur', () => this.held.clear());

    for (const btn of document.querySelectorAll('#touch button')) {
      const code = btn.dataset.key;
      const press = (e) => { e.preventDefault(); down(code); };
      const release = (e) => { e.preventDefault(); up(code); };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    }
  }

  isDown(...codes) {
    return codes.some((c) => this.held.has(c));
  }

  // True once per physical press.
  pressed(...codes) {
    for (const c of codes) {
      if (this.edge.has(c)) {
        this.edge.delete(c);
        return true;
      }
    }
    return false;
  }

  get confirm() {
    return this.pressed('Space', 'Enter', 'KeyE');
  }

  get cancel() {
    return this.pressed('Escape', 'KeyX', 'Backspace');
  }

  // Current movement vector from whatever is held.
  axis() {
    let x = 0;
    let y = 0;
    if (this.isDown('ArrowLeft', 'KeyA')) x -= 1;
    if (this.isDown('ArrowRight', 'KeyD')) x += 1;
    if (this.isDown('ArrowUp', 'KeyW')) y -= 1;
    if (this.isDown('ArrowDown', 'KeyS')) y += 1;
    return { x, y };
  }

  // Menu movement: edge-triggered, so a held key doesn't fly through a list.
  menuStep() {
    if (this.pressed('ArrowUp', 'KeyW')) return -1;
    if (this.pressed('ArrowDown', 'KeyS')) return 1;
    return 0;
  }

  endFrame() {
    this.edge.clear();
  }
}

export { MOVE };
