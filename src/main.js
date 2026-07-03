import { Game } from "./game/Game.js";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/constants.js";

const canvas = document.querySelector("#game");
const fullscreenButton = document.querySelector("#fullscreenButton");
const context = canvas.getContext("2d", { alpha: false });

canvas.width = GAME_WIDTH;

canvas.height = GAME_HEIGHT;
context.imageSmoothingEnabled = false;

fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) return;
    await document.documentElement.requestFullscreen();
  } catch {
  } finally {
    fullscreenButton.blur();
    updateFullscreenButton();
  }
});

const updateFullscreenButton = () => {
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = "FULL";
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", active ? "Pantalla completa activa" : "Activar pantalla completa");
  fullscreenButton.disabled = active || !document.fullscreenEnabled;
};

document.addEventListener("fullscreenchange", updateFullscreenButton);
updateFullscreenButton();

const game = new Game(canvas, context); 



const start = async () => {
  if ("fonts" in document) {
    await document.fonts.load('10px "Automatron"');
  }
  game.start();
};

start();
