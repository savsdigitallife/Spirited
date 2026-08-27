/**
 * Entry point. Finds the canvas, starts the game, and makes sure a failure
 * during start-up is visible on screen rather than only in the console.
 */

import { Game } from "./core/Game";

const canvas = document.getElementById("render");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('index.html must contain <canvas id="render">');
}

const game = new Game(canvas);

game.start().catch((error: unknown) => {
  game.fail(error);
});

window.addEventListener("beforeunload", () => game.dispose());

// Vite keeps the module alive across edits; without this the old engine
// would keep rendering underneath the new one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
