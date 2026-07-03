import { COLORS, GAME_HEIGHT, GAME_STATES, GAME_WIDTH } from "../constants.js";
import { drawRect, drawText, formatPercent, formatScore, withAlpha } from "../utils.js";
import { ScrambleText } from "./ScrambleText.js";

const BUTTON_W = 260;
const BUTTON_H = 42;
const BUTTON_GAP = 14;
const PANEL_W = 560;

export class Menu {
  constructor() {
    this.scramble = new Map();
    this.lastState = null;
    this.hoveredId = null;
    this.creditsOpen = false;
  }

  update(dt, game) {
    if (game.state !== this.lastState) {
      this.lastState = game.state;
      this.creditsOpen = false;
      this.scramble.clear();
    }

    for (const text of this.scramble.values()) {
      text.update(dt);
    }

    const button = this.getButtonAt(game.pointer.x, game.pointer.y, game);
    this.hoveredId = button?.id ?? null;
  }

  handlePointer(game, x, y) {
    const button = this.getButtonAt(x, y, game);
    if (!button) return false;
    button.action(game);
    return true;
  }

  getButtonAt(x, y, game) {
    return this.getButtons(game).find((button) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) ?? null;
  }

  getButtons(game) {
    if (game.state === GAME_STATES.TITLE) {
      if (this.creditsOpen) {
        return [
          this.button("credits-back", "BACK", GAME_WIDTH / 2 - BUTTON_W / 2, 520, () => {
            this.creditsOpen = false;
            this.scramble.clear();
          }),
        ];
      }

      return [
        this.button("start", "START", GAME_WIDTH / 2 - BUTTON_W / 2, 416, (target) => target.startRun()),
        this.button("settings", "SETTINGS", GAME_WIDTH / 2 - BUTTON_W / 2, 472, (target) => target.openSettings(GAME_STATES.TITLE)),
        this.button("credits", "CREDITS", GAME_WIDTH / 2 - BUTTON_W / 2, 528, () => {
          this.creditsOpen = true;
          this.scramble.clear();
        }),
      ];
    }

    if (game.state === GAME_STATES.PAUSED) {
      return [
        this.button("resume", "RESUME", GAME_WIDTH / 2 - BUTTON_W / 2, 344, (target) => target.resumeRun()),
        this.button("restart", "RESTART", GAME_WIDTH / 2 - BUTTON_W / 2, 400, (target) => target.restartRun()),
        this.button("settings", "SETTINGS", GAME_WIDTH / 2 - BUTTON_W / 2, 456, (target) => target.openSettings(GAME_STATES.PAUSED)),
      ];
    }

    if (game.state === GAME_STATES.SETTINGS) {
      const x = GAME_WIDTH / 2 - PANEL_W / 2 + 58;
      const y = 190;
      const w = PANEL_W - 116;
      const row = 48;

      return [
        this.button("crt", `CRT SCANLINES: ${this.onOff(game.settings.crtScanlines)}`, x, y, w, 34, (target) => target.toggleSetting("crtScanlines")),
        this.button("shake", `SCREEN SHAKE: ${this.onOff(game.settings.screenShake)}`, x, y + row, w, 34, (target) => target.toggleSetting("screenShake")),
        this.button("motion", `REDUCED MOTION: ${this.onOff(game.settings.reducedMotion)}`, x, y + row * 2, w, 34, (target) => target.toggleSetting("reducedMotion")),
        this.button("contrast", `HIGH CONTRAST: ${this.onOff(game.settings.highContrast)}`, x, y + row * 3, w, 34, (target) => target.toggleSetting("highContrast")),
        this.button("audio", `AUDIO: ${this.onOff(game.settings.audio)}`, x, y + row * 4, w, 34, (target) => target.toggleSetting("audio")),
        this.button("difficulty", `DIFFICULTY: ${game.difficulty}`, x, y + row * 5, w, 34, (target) => target.cycleDifficulty()),
        this.button("back", "BACK", GAME_WIDTH / 2 - BUTTON_W / 2, y + row * 6 + 20, (target) => target.closeSettings()),
      ];
    }

    if (game.state === GAME_STATES.GAME_OVER) {
      return [
        this.button("restart", "RESTART", GAME_WIDTH / 2 - BUTTON_W - 12, 552, (target) => target.restartRun()),
        this.button("menu", "MENU", GAME_WIDTH / 2 + 12, 552, (target) => target.toTitle()),
      ];
    }

    return [];
  }

  button(id, label, x, y, w = BUTTON_W, h = BUTTON_H, action = () => {}) {
    if (typeof w === "function") {
      action = w;
      w = BUTTON_W;
      h = BUTTON_H;
    } else if (typeof h === "function") {
      action = h;
      h = BUTTON_H;
    }

    return { id, label, x: Math.round(x), y: Math.round(y), w, h, action };
  }

  onOff(value) {
    return value ? "ON" : "OFF";
  }

  render(ctx, game) {
    if (![GAME_STATES.TITLE, GAME_STATES.PAUSED, GAME_STATES.SETTINGS, GAME_STATES.GAME_OVER].includes(game.state)) return;

    if (game.state === GAME_STATES.TITLE) this.drawTitle(ctx, game);
    if (game.state === GAME_STATES.PAUSED) this.drawPaused(ctx, game);
    if (game.state === GAME_STATES.SETTINGS) this.drawSettings(ctx, game);
    if (game.state === GAME_STATES.GAME_OVER) this.drawGameOver(ctx, game);

    for (const button of this.getButtons(game)) {
      this.drawButton(ctx, button);
    }
  }

  drawTitle(ctx, game) {
    this.drawOverlay(ctx, 0.22);
    this.drawPanel(ctx, GAME_WIDTH / 2 - 360, 190, 720, this.creditsOpen ? 350 : 430, COLORS.cyan);

    if (this.creditsOpen) {
      drawText(ctx, this.text("credits-title", "CREDITS"), GAME_WIDTH / 2, 248, COLORS.white, 34, "center");
      drawText(ctx, this.text("credits-a", "DESIGN CODE AUDIO"), GAME_WIDTH / 2, 318, COLORS.cyan, 18, "center");
      drawText(ctx, this.text("credits-b", "SHIP EXPLORER HUD LAB"), GAME_WIDTH / 2, 356, COLORS.muted, 16, "center");
      drawText(ctx, this.text("credits-c", "VANILLA CANVAS SYSTEM"), GAME_WIDTH / 2, 394, COLORS.amber, 16, "center");
      return;
    }

    drawText(ctx, this.text("title", "DATA BUBBLE POP"), GAME_WIDTH / 2, 250, COLORS.white, 42, "center");
    drawText(ctx, this.text("subtitle", "CLICK TO CALIBRATE"), GAME_WIDTH / 2, 314, COLORS.cyan, 20, "center");
    drawText(ctx, this.text("difficulty", `DIFFICULTY ${game.difficulty}`), GAME_WIDTH / 2, 354, COLORS.amber, 14, "center");
  }

  drawPaused(ctx, game) {
    this.drawOverlay(ctx, 0.62);
    this.drawPanel(ctx, GAME_WIDTH / 2 - 280, 238, 560, 290, COLORS.amber);
    drawText(ctx, this.text("paused", "PAUSED"), GAME_WIDTH / 2, 286, COLORS.amber, 42, "center");
    drawText(ctx, this.text("pause-score", `SCORE ${formatScore(game.score)}`), GAME_WIDTH / 2, 324, COLORS.white, 16, "center");
  }

  drawSettings(ctx) {
    this.drawOverlay(ctx, 0.64);
    this.drawPanel(ctx, GAME_WIDTH / 2 - PANEL_W / 2, 126, PANEL_W, 470, COLORS.cyan);
    drawText(ctx, this.text("settings", "SETTINGS"), GAME_WIDTH / 2, 148, COLORS.white, 32, "center");
  }

  drawGameOver(ctx, game) {
    this.drawOverlay(ctx, 0.68);
    const color = game.victory ? COLORS.amber : COLORS.red;
    const title = game.victory ? "HAS GANADO" : "GAME OVER";
    this.drawPanel(ctx, GAME_WIDTH / 2 - 360, 190, 720, 430, color);

    drawText(ctx, this.text("gameover", title), GAME_WIDTH / 2, 236, color, 42, "center");
    drawText(ctx, "FINAL SCORE", GAME_WIDTH / 2 - 210, 316, COLORS.muted, 16);
    drawText(ctx, formatScore(game.score), GAME_WIDTH / 2 + 210, 312, COLORS.white, 24, "right");
    drawText(ctx, "ACCURACY", GAME_WIDTH / 2 - 210, 362, COLORS.muted, 16);
    drawText(ctx, formatPercent(game.accuracy), GAME_WIDTH / 2 + 210, 358, COLORS.cyan, 24, "right");
    drawText(ctx, "MAX COMBO", GAME_WIDTH / 2 - 210, 408, COLORS.muted, 16);
    drawText(ctx, String(game.maxCombo).padStart(2, "0"), GAME_WIDTH / 2 + 210, 404, COLORS.amber, 24, "right");
    drawText(ctx, "GRADE", GAME_WIDTH / 2 - 210, 454, COLORS.muted, 16);
    drawText(ctx, game.getGrade(), GAME_WIDTH / 2 + 210, 444, COLORS.white, 38, "right");
  }

  drawButton(ctx, button) {
    const hovered = this.hoveredId === button.id;
    const color = hovered ? COLORS.orange : COLORS.cyan;
    const fill = hovered ? "rgba(255, 138, 0, 0.14)" : "rgba(42, 18, 54, 0.52)";

    drawRect(ctx, button.x, button.y, button.w, button.h, color, fill, 1);
    drawText(ctx, this.text(`button-${button.id}-${button.label}`, button.label), button.x + button.w / 2, button.y + button.h / 2 - 9, hovered ? COLORS.orange : COLORS.white, button.h < 40 ? 15 : 18, "center");

    if (hovered) {
      drawRect(ctx, button.x - 4, button.y - 4, button.w + 8, button.h + 8, COLORS.orange, null, 1, 0.5);
    }
  }

  drawOverlay(ctx, alpha) {
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  drawPanel(ctx, x, y, w, h, color) {
    drawRect(ctx, x, y, w, h, color, "rgba(42, 18, 54, 0.6)", 1);
    drawRect(ctx, x + 10, y + 10, w - 20, h - 20, withAlpha(color, 0.6), null, 1);
    drawRect(ctx, x - 8, y - 8, w + 16, h + 16, withAlpha(color, 0.34), null, 1);
  }

  text(id, value) {
    if (!this.scramble.has(id)) {
      this.scramble.set(id, new ScrambleText(value));
    }

    const item = this.scramble.get(id);
    item.setText(value);
    return item.value();
  }
}
