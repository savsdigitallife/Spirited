import { Game } from './game.js';

const canvas = document.getElementById('screen');
const hud = document.getElementById('hud');

let game;
try {
  game = new Game(canvas, hud);
} catch (err) {
  document.body.innerHTML =
    `<p style="padding:2rem;font:16px ui-monospace,monospace;color:#e8e2d4">` +
    `Spirited needs WebGL2, which this browser did not provide.<br><br>${err.message}</p>`;
  throw err;
}

function fit() {
  // Cap the pixel ratio: a 4K display does not need 4K shadows to look right.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.resize(window.innerWidth, window.innerHeight, dpr);
}

window.addEventListener('resize', fit);
fit();

// Handy for poking at the world from the console.
window.spirited = game;
