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
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    fullscreenButton.blur();
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "EXIT" : "FULL";
});

const game = new Game(canvas, context); 



const start = async () => {
  if ("fonts" in document) {
    await document.fonts.load('10px "Automatron"');
  }
  game.start();
};

start();
