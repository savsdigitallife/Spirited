import { Game } from './game.js';

const canvas = document.getElementById('screen');
const game = new Game(canvas);

// Keep the pixel grid crisp: scale by whole pixels where we can.
function fit() {
  const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  const chosen = scale >= 1 ? Math.max(1, Math.floor(scale * 20) / 20) : scale;
  canvas.style.width = `${canvas.width * chosen}px`;
  canvas.style.height = `${canvas.height * chosen}px`;
}

window.addEventListener('resize', fit);
fit();

// Handy for poking at the world from the console.
window.spirited = game;
