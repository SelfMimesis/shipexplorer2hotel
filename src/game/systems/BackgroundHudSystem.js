import { COLORS, GAME_HEIGHT, GAME_WIDTH, PLAYFIELD } from "../constants.js";
import { drawBracket, drawText } from "../utils.js";

export class BackgroundHudSystem {
  constructor() {
    this.scan = 0;
    this.noiseSeed = 0;
  }

  reset() {
    this.scan = 0;
  }

  update(dt) {
    this.scan = (this.scan + dt * 42) % GAME_HEIGHT;
    this.noiseSeed = (this.noiseSeed + 1) % 1000;
  }

  draw(ctx, game) {
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.drawGlowColumns(ctx);
    this.drawGrid(ctx, game.time);
    this.drawPlayfield(ctx);
    this.drawDataRails(ctx, game);
    this.drawScanline(ctx);
  }

  drawGlowColumns(ctx) {
    ctx.fillStyle = "rgba(15, 183, 163, 0.11)";
    ctx.fillRect(9, 0, 1, GAME_HEIGHT);
    ctx.fillRect(GAME_WIDTH - 10, 0, 1, GAME_HEIGHT);
    ctx.fillStyle = "rgba(255, 63, 54, 0.08)";
    ctx.fillRect(2, 0, 1, GAME_HEIGHT);
    ctx.fillRect(GAME_WIDTH - 3, 0, 1, GAME_HEIGHT);
  }

  drawGrid(ctx, time) {
    const offset = Math.floor((time * 12) % 20);

    ctx.strokeStyle = "rgba(56, 245, 231, 0.13)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= GAME_WIDTH; x += 10) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, GAME_HEIGHT);
    }
    for (let y = -20; y <= GAME_HEIGHT + 20; y += 20) {
      ctx.moveTo(0, y + offset + 0.5);
      ctx.lineTo(GAME_WIDTH, y + offset + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 157, 46, 0.12)";
    ctx.beginPath();
    for (let y = 164; y < GAME_HEIGHT; y += 96) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(GAME_WIDTH, y - 18.5);
    }
    ctx.stroke();
  }

  drawPlayfield(ctx) {
    ctx.fillStyle = "rgba(4, 16, 19, 0.56)";
    ctx.fillRect(PLAYFIELD.left, PLAYFIELD.top, PLAYFIELD.right - PLAYFIELD.left, PLAYFIELD.bottom - PLAYFIELD.top);

    ctx.strokeStyle = COLORS.teal;
    ctx.lineWidth = 1;
    ctx.strokeRect(PLAYFIELD.left + 0.5, PLAYFIELD.top + 0.5, PLAYFIELD.right - PLAYFIELD.left, PLAYFIELD.bottom - PLAYFIELD.top);

    drawBracket(ctx, PLAYFIELD.left - 4, PLAYFIELD.top - 4, PLAYFIELD.right - PLAYFIELD.left + 8, PLAYFIELD.bottom - PLAYFIELD.top + 8, COLORS.cyan);

    ctx.strokeStyle = "rgba(56, 245, 231, 0.24)";
    ctx.beginPath();
    ctx.moveTo(PLAYFIELD.left + 18, PLAYFIELD.top);
    ctx.lineTo(PLAYFIELD.left + 5, PLAYFIELD.bottom);
    ctx.moveTo(PLAYFIELD.right - 18, PLAYFIELD.top);
    ctx.lineTo(PLAYFIELD.right - 5, PLAYFIELD.bottom);
    ctx.stroke();
  }

  drawDataRails(ctx, game) {
    const tick = Math.floor(game.time * 10) % 16;

    for (let y = 115; y < 690; y += 16) {
      const hot = (y + tick) % 48 === 0;
      ctx.fillStyle = hot ? COLORS.amber : COLORS.cyanDim;
      ctx.fillRect(5, y, hot ? 4 : 2, 1);
      ctx.fillRect(GAME_WIDTH - 9, y + 8, hot ? 4 : 2, 1);
    }

    ctx.fillStyle = "rgba(56, 245, 231, 0.18)";
    for (let i = 0; i < 11; i += 1) {
      const height = ((i * 7 + tick) % 18) + 2;
      ctx.fillRect(16 + i * 10, 732 - height, 4, height);
    }

    drawText(ctx, "SCAN", 6, 706, COLORS.muted, 4);
    drawText(ctx, "LINK", 114, 706, COLORS.muted, 4);
  }

  drawScanline(ctx) {
    const y = Math.round(this.scan);
    ctx.fillStyle = "rgba(56, 245, 231, 0.23)";
    ctx.fillRect(0, y, GAME_WIDTH, 1);

    if (this.noiseSeed % 4 === 0) {
      ctx.fillStyle = "rgba(200, 255, 249, 0.2)";
      for (let i = 0; i < 8; i += 1) {
        const x = (this.noiseSeed * 17 + i * 23) % GAME_WIDTH;
        const ny = (this.noiseSeed * 31 + i * 61) % GAME_HEIGHT;
        ctx.fillRect(x, ny, 1, 1);
      }
    }
  }
}
