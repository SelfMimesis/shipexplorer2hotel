import { COLORS, GAME_HEIGHT, GAME_STATES, GAME_WIDTH } from "../constants.js";
import { drawPanel, drawText, setFont, wrapText } from "../utils.js";
import { ScrambleText } from "./ScrambleText.js";

export class Menu {
  constructor() {
    this.buttons = [];
    this.titleA = new ScrambleText("BUBBLE", 12);
    this.titleB = new ScrambleText("POP", 16);
    this.subtitle = new ScrambleText("FUTURE HUD ARCADE", 24);
  }

  resetTitle() {
    this.titleA.reset();
    this.titleB.reset();
    this.subtitle.reset();
  }

  update(dt) {
    this.titleA.update(dt);
    this.titleB.update(dt);
    this.subtitle.update(dt);
  }

  handlePointer(game, x, y) {
    const buttons = this.getButtons(game);
    const button = buttons.find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);

    if (!button) return false;

    button.action(game);
    return true;
  }

  getButtons(game) {
    if (game.state === GAME_STATES.TITLE) {
      return [
        { label: "START", icon: ">", x: 18, y: 482, w: 104, h: 29, action: (target) => target.startRun() },
        { label: "SETTINGS", icon: "#", x: 18, y: 520, w: 104, h: 29, action: (target) => target.openSettings(GAME_STATES.TITLE) },
      ];
    }

    if (game.state === GAME_STATES.PAUSED) {
      return [
        { label: "RESUME", icon: ">", x: 18, y: 354, w: 104, h: 29, action: (target) => target.resumeRun() },
        { label: "SETTINGS", icon: "#", x: 18, y: 392, w: 104, h: 29, action: (target) => target.openSettings(GAME_STATES.PAUSED) },
        { label: "TITLE", icon: "<", x: 18, y: 430, w: 104, h: 29, action: (target) => target.toTitle() },
      ];
    }

    if (game.state === GAME_STATES.SETTINGS) {
      return [
        { label: game.audio.muted ? "SOUND OFF" : "SOUND ON", icon: "*", x: 18, y: 338, w: 104, h: 29, action: (target) => target.audio.toggleMute() },
        { label: "VOL -", icon: "-", x: 18, y: 376, w: 49, h: 29, action: (target) => target.audio.setVolume(target.audio.volume - 0.1) },
        { label: "VOL +", icon: "+", x: 73, y: 376, w: 49, h: 29, action: (target) => target.audio.setVolume(target.audio.volume + 0.1) },
        { label: "BACK", icon: "<", x: 18, y: 426, w: 104, h: 29, action: (target) => target.closeSettings() },
      ];
    }

    if (game.state === GAME_STATES.GAME_OVER) {
      return [
        { label: "RETRY", icon: ">", x: 18, y: 473, w: 104, h: 29, action: (target) => target.startRun() },
        { label: "TITLE", icon: "<", x: 18, y: 511, w: 104, h: 29, action: (target) => target.toTitle() },
      ];
    }

    return [];
  }

  draw(ctx, game) {
    if (game.state === GAME_STATES.TITLE) this.drawTitle(ctx, game);
    if (game.state === GAME_STATES.PAUSED) this.drawPause(ctx, game);
    if (game.state === GAME_STATES.SETTINGS) this.drawSettings(ctx, game);
    if (game.state === GAME_STATES.GAME_OVER) this.drawGameOver(ctx, game);

    for (const button of this.getButtons(game)) {
      this.drawButton(ctx, button, game);
    }
  }

  drawTitle(ctx, game) {
    drawPanel(ctx, 8, 128, GAME_WIDTH - 16, 316, COLORS.cyan, "rgba(4, 16, 19, 0.76)");
    setFont(ctx, 14, "center", "top");
    ctx.fillStyle = COLORS.white;
    ctx.fillText(this.titleA.value(), GAME_WIDTH / 2, 166);
    ctx.fillStyle = COLORS.amber;
    ctx.fillText(this.titleB.value(), GAME_WIDTH / 2, 188);
    drawText(ctx, this.subtitle.value(), GAME_WIDTH / 2, 218, COLORS.cyan, 4, "center");

    this.drawMiniShip(ctx, GAME_WIDTH / 2, 316 + Math.sin(game.time * 2) * 4, game.time);
    drawText(ctx, "CLICK BUBBLES", GAME_WIDTH / 2, 376, COLORS.white, 5, "center");
    drawText(ctx, "ESC PAUSE", GAME_WIDTH / 2, 391, COLORS.muted, 4, "center");
  }

  drawPause(ctx, game) {
    this.drawOverlay(ctx);
    drawPanel(ctx, 10, 262, GAME_WIDTH - 20, 74, COLORS.amber, "rgba(4, 16, 19, 0.9)");
    drawText(ctx, "PAUSED", GAME_WIDTH / 2, 286, COLORS.amber, 10, "center");
    drawText(ctx, `SCORE ${String(game.score).padStart(6, "0")}`, GAME_WIDTH / 2, 309, COLORS.white, 4, "center");
  }

  drawSettings(ctx, game) {
    this.drawOverlay(ctx);
    drawPanel(ctx, 10, 242, GAME_WIDTH - 20, 78, COLORS.cyan, "rgba(4, 16, 19, 0.92)");
    drawText(ctx, "SETTINGS", GAME_WIDTH / 2, 263, COLORS.cyan, 8, "center");
    drawText(ctx, `VOLUME ${Math.round(game.audio.volume * 100).toString().padStart(3, "0")}`, GAME_WIDTH / 2, 289, COLORS.white, 4, "center");
  }

  drawGameOver(ctx, game) {
    this.drawOverlay(ctx);
    drawPanel(ctx, 8, 284, GAME_WIDTH - 16, 166, COLORS.red, "rgba(21, 5, 5, 0.88)");
    drawText(ctx, "GAME", GAME_WIDTH / 2, 314, COLORS.red, 12, "center");
    drawText(ctx, "OVER", GAME_WIDTH / 2, 338, COLORS.red, 12, "center");
    drawText(ctx, "FINAL SCORE", GAME_WIDTH / 2, 373, COLORS.muted, 4, "center");
    drawText(ctx, String(game.score).padStart(6, "0"), GAME_WIDTH / 2, 391, COLORS.white, 9, "center");

    const lines = wrapText(game.endReason, 18);
    lines.forEach((line, index) => drawText(ctx, line, GAME_WIDTH / 2, 421 + index * 10, COLORS.amber, 4, "center"));
  }

  drawOverlay(ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  drawButton(ctx, button, game) {
    const hover = game.pointer.x >= button.x && game.pointer.x <= button.x + button.w && game.pointer.y >= button.y && game.pointer.y <= button.y + button.h;
    const color = hover ? COLORS.amber : COLORS.cyan;

    drawPanel(ctx, button.x, button.y, button.w, button.h, color, hover ? "rgba(255, 157, 46, 0.14)" : "rgba(4, 16, 19, 0.84)");
    drawText(ctx, button.icon, button.x + 10, button.y + 9, color, 6, "center");
    drawText(ctx, button.label, button.x + button.w / 2 + 7, button.y + 9, COLORS.white, button.w < 60 ? 4 : 5, "center");
  }

  drawMiniShip(ctx, x, y, time) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.strokeStyle = COLORS.cyan;
    ctx.fillStyle = COLORS.panelDeep;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(11, 12);
    ctx.lineTo(0, 6);
    ctx.lineTo(-11, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(-2, 12, 4, 5 + Math.floor(Math.sin(time * 18) * 2));
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(-2, -5, 4, 5);
    ctx.restore();
  }
}
