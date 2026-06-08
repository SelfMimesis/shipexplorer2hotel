import { COLORS, GAME_HEIGHT, GAME_STATES, GAME_WIDTH, PLAYFIELD } from "../constants.js";
import { clamp, drawBar, drawPixelLine, drawRect, drawRing, drawText, formatPercent, formatScore, formatTime, lerp, withAlpha } from "../utils.js";

const CONTROL_SIZE = 48;
const CONTROL_GAP = 8;

export class Hud {
  constructor() {
    this.cursor = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      ring: 0,
    };
    this.dataPhase = 0;
    this.noiseSeed = 1;
  }

  update(dt, game) {
    const cursorEase = 1 - Math.pow(0.002, dt);
    this.cursor.x = lerp(this.cursor.x, game.pointer.x, cursorEase);
    this.cursor.y = lerp(this.cursor.y, game.pointer.y, cursorEase);
    this.cursor.ring = (this.cursor.ring + dt * 76) % 48;
    this.dataPhase += dt;
    this.noiseSeed = (this.noiseSeed + 1) % 4096;
  }

  getControlButtons() {
    const x = 1136;
    const y = 632;

    return [
      { id: "up", label: "^", x: x + CONTROL_SIZE + CONTROL_GAP, y, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: 0, vy: -1 },
      { id: "left", label: "<", x, y: y + CONTROL_SIZE + CONTROL_GAP, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: -1, vy: 0 },
      { id: "right", label: ">", x: x + (CONTROL_SIZE + CONTROL_GAP) * 2, y: y + CONTROL_SIZE + CONTROL_GAP, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: 1, vy: 0 },
      { id: "down", label: "V", x: x + CONTROL_SIZE + CONTROL_GAP, y: y + (CONTROL_SIZE + CONTROL_GAP) * 2, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: 0, vy: 1 },
    ];
  }

  getDirectionFromPoint(x, y) {
    return this.getControlButtons().find((button) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) ?? null;
  }

  isPointInMainFrame(x, y) {
    return x >= PLAYFIELD.left && x <= PLAYFIELD.right && y >= PLAYFIELD.top && y <= PLAYFIELD.bottom;
  }

  drawBackground(ctx, game) {
    this.drawBase(ctx);
    this.drawFineGrid(ctx, game);
    this.drawSecondaryGrid(ctx);
    this.drawModulatedField(ctx, game);
    this.drawScanlines(ctx, game);
    this.drawNoise(ctx);
  }

  drawMainFrame(ctx, game) {
    drawRect(ctx, PLAYFIELD.left, PLAYFIELD.top, PLAYFIELD.right - PLAYFIELD.left, PLAYFIELD.bottom - PLAYFIELD.top, COLORS.cyan, "rgba(24, 27, 28, 0.42)", 1);
    drawRect(ctx, PLAYFIELD.left - 10, PLAYFIELD.top - 10, PLAYFIELD.right - PLAYFIELD.left + 20, PLAYFIELD.bottom - PLAYFIELD.top + 20, COLORS.cyanDim, null, 1, 0.9);

    this.drawFrameGlow(ctx);
    this.drawMeasurementMarks(ctx);
    drawText(ctx, "BUBBLE FIELD // NAV MAP", PLAYFIELD.left + 20, PLAYFIELD.top - 38, COLORS.cyan, 18);
    drawText(ctx, "RX-44 ONLINE", PLAYFIELD.right - 20, PLAYFIELD.top - 38, COLORS.amber, 16, "right");
  }

  drawPanels(ctx, game) {
    this.drawLeftPanel(ctx, game);
    this.drawBottomPanel(ctx, game);
    this.drawControlPad(ctx, game);
  }

  drawCursor(ctx, game) {
    const x = Math.round(this.cursor.x);
    const y = Math.round(this.cursor.y);
    const active = game.pointer.isDown;
    const color = active ? COLORS.amber : COLORS.cyan;
    const radius = 26 + Math.round(Math.sin(this.dataPhase * 6) * 2);

    drawRing(ctx, x, y, radius, color, 0.72, 1);
    drawRing(ctx, x, y, radius + this.cursor.ring * 0.45, color, 0.22, 1);
    drawRing(ctx, x, y, 8, COLORS.cyan, 0.68, 1);

    drawPixelLine(ctx, x - 36, y, x - 14, y, color, 0.88);
    drawPixelLine(ctx, x + 14, y, x + 36, y, color, 0.88);
    drawPixelLine(ctx, x, y - 36, x, y - 14, color, 0.88);
    drawPixelLine(ctx, x, y + 14, x, y + 36, color, 0.88);

    for (let i = 0; i < 4; i += 1) {
      const angle = this.dataPhase * 2 + i * Math.PI * 0.5;
      const ax = x + Math.cos(angle) * 44;
      const ay = y + Math.sin(angle) * 44;
      drawPixelLine(ctx, ax - 8, ay, ax + 8, ay, COLORS.cyan, 0.36);
    }

    drawText(ctx, `${x.toString().padStart(4, "0")} ${y.toString().padStart(3, "0")}`, x + 42, y + 22, COLORS.muted, 10);
  }

  drawOverlay(ctx, game) {
    if (game.state === GAME_STATES.BOOT) this.drawBoot(ctx, game);
    if (game.state === GAME_STATES.TITLE) this.drawTitle(ctx, game);
    if (game.state === GAME_STATES.PAUSED) this.drawPause(ctx);
    if (game.state === GAME_STATES.SETTINGS) this.drawSettings(ctx);
    if (game.state === GAME_STATES.GAME_OVER) this.drawGameOver(ctx, game);
  }

  drawBase(ctx) {
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = "rgba(24, 27, 28, 0.5)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  drawFineGrid(ctx, game) {
    const ship = game.ship;
    const cell = 20;

    for (let x = 0; x <= GAME_WIDTH; x += cell) {
      const proximity = 1 - clamp(Math.abs(x - ship.x) / 240, 0, 1);
      drawPixelLine(ctx, x, 0, x, GAME_HEIGHT, COLORS.cyanDim, 0.07 + proximity * 0.15);
    }

    for (let y = 0; y <= GAME_HEIGHT; y += cell) {
      const proximity = 1 - clamp(Math.abs(y - ship.y) / 180, 0, 1);
      drawPixelLine(ctx, 0, y, GAME_WIDTH, y, COLORS.cyanDim, 0.07 + proximity * 0.13);
    }
  }

  drawSecondaryGrid(ctx) {
    for (let x = 0; x <= GAME_WIDTH; x += 100) {
      drawPixelLine(ctx, x, 0, x, GAME_HEIGHT, COLORS.muted, 0.06);
    }

    for (let y = 0; y <= GAME_HEIGHT; y += 100) {
      drawPixelLine(ctx, 0, y, GAME_WIDTH, y, COLORS.muted, 0.06);
    }
  }

  drawModulatedField(ctx, game) {
    const ship = game.ship;
    const t = game.totalTime;

    for (let y = PLAYFIELD.top + 20; y < PLAYFIELD.bottom; y += 18) {
      for (let x = PLAYFIELD.left + 20; x < PLAYFIELD.right; x += 28) {
        const dx = x - ship.x;
        const dy = y - ship.y;
        const dist = Math.hypot(dx, dy);
        const proximity = 1 - clamp(dist / 190, 0, 1);
        const wave = Math.sin(t * 3.2 + x * 0.015 + y * 0.021 + proximity * 3);
        const alpha = 0.05 + proximity * 0.38 + Math.max(0, wave) * 0.05;
        const length = 5 + Math.round(proximity * 12);
        const color = proximity > 0.58 ? COLORS.amber : COLORS.cyan;

        if (alpha > 0.065) {
          drawPixelLine(ctx, x, y, x + length, y, color, alpha);
        }
      }
    }

    drawRing(ctx, ship.x, ship.y, 72 + Math.sin(t * 4) * 6, COLORS.cyan, 0.18, 1);
    drawRing(ctx, ship.x, ship.y, 112 + Math.sin(t * 2.4) * 8, COLORS.amber, 0.1, 1);
  }

  drawScanlines(ctx, game) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    for (let y = Math.round(game.totalTime * 24) % 6; y < GAME_HEIGHT; y += 6) {
      ctx.fillRect(0, y, GAME_WIDTH, 1);
    }
  }

  drawNoise(ctx) {
    for (let i = 0; i < 90; i += 1) {
      const x = (this.noiseSeed * 37 + i * 83) % GAME_WIDTH;
      const y = (this.noiseSeed * 53 + i * 41) % GAME_HEIGHT;
      ctx.fillStyle = i % 7 === 0 ? "rgba(255, 122, 22, 0.12)" : "rgba(215, 227, 223, 0.08)";
      ctx.fillRect(x, y, 1, 1);
    }
  }

  drawFrameGlow(ctx) {
    drawRect(ctx, PLAYFIELD.left - 4, PLAYFIELD.top - 4, PLAYFIELD.right - PLAYFIELD.left + 8, PLAYFIELD.bottom - PLAYFIELD.top + 8, COLORS.cyan, null, 1, 0.34);
    drawRect(ctx, PLAYFIELD.left - 18, PLAYFIELD.top - 18, PLAYFIELD.right - PLAYFIELD.left + 36, PLAYFIELD.bottom - PLAYFIELD.top + 36, COLORS.cyanDim, null, 1, 0.18);
  }

  drawMeasurementMarks(ctx) {
    const left = PLAYFIELD.left;
    const right = PLAYFIELD.right;
    const top = PLAYFIELD.top;
    const bottom = PLAYFIELD.bottom;

    for (let x = left; x <= right; x += 20) {
      const long = x % 100 === 16;
      const length = long ? 16 : 8;
      drawPixelLine(ctx, x, top, x, top + length, COLORS.cyan, long ? 0.72 : 0.4);
      drawPixelLine(ctx, x, bottom, x, bottom - length, COLORS.cyan, long ? 0.72 : 0.4);
    }

    for (let y = top; y <= bottom; y += 20) {
      const long = y % 100 === 12;
      const length = long ? 16 : 8;
      drawPixelLine(ctx, left, y, left + length, y, COLORS.cyan, long ? 0.72 : 0.4);
      drawPixelLine(ctx, right, y, right - length, y, COLORS.cyan, long ? 0.72 : 0.4);
    }
  }

  drawLeftPanel(ctx, game) {
    const x = 40;
    const y = PLAYFIELD.top;
    const w = 144;
    const h = PLAYFIELD.bottom - PLAYFIELD.top;
    const t = game.totalTime;
    const ctrl = 0.62 + Math.sin(t * 0.9) * 0.16;
    const data = 0.5 + Math.sin(t * 0.53 + 1.4) * 0.22;
    const sys = 0.72 + Math.sin(t * 0.37 + 2.2) * 0.12;

    drawRect(ctx, x, y, w, h, COLORS.cyanDim, "rgba(17, 19, 20, 0.74)", 1);
    drawText(ctx, "STATUS", x + 18, y + 22, COLORS.cyan, 16);

    this.drawMetricBar(ctx, "CTRL", ctrl, x + 18, y + 80);
    this.drawMetricBar(ctx, "DATA", data, x + 18, y + 158);
    this.drawMetricBar(ctx, "SYS", sys, x + 18, y + 236);

    drawText(ctx, "VECTOR", x + 18, y + 330, COLORS.muted, 12);
    drawText(ctx, `${Math.round(game.ship.vx).toString().padStart(4, "0")}`, x + 18, y + 354, COLORS.white, 16);
    drawText(ctx, `${Math.round(game.ship.vy).toString().padStart(4, "0")}`, x + 18, y + 382, COLORS.white, 16);

    drawText(ctx, "AUTO NAV", x + 18, y + 450, COLORS.amber, 14);
  }

  drawMetricBar(ctx, label, value, x, y) {
    drawText(ctx, label, x, y, COLORS.muted, 12);
    drawBar(ctx, x, y + 24, 92, 12, value, value > 0.78 ? COLORS.amber : COLORS.cyan);
    drawText(ctx, formatPercent(value), x, y + 46, COLORS.white, 12);
  }

  drawBottomPanel(ctx, game) {
    const x = PLAYFIELD.left;
    const y = 640;
    const w = PLAYFIELD.right - PLAYFIELD.left;
    const h = 112;
    const t = game.totalTime;

    drawRect(ctx, x, y, w, h, COLORS.cyanDim, "rgba(17, 19, 20, 0.78)", 1);
    drawText(ctx, "SCORE", x + 22, y + 20, COLORS.muted, 13);
    drawText(ctx, formatScore(game.score), x + 102, y + 16, COLORS.white, 20);
    drawText(ctx, "TIME", x + 280, y + 20, COLORS.muted, 13);
    drawText(ctx, formatTime(game.timeLeft), x + 346, y + 16, COLORS.amber, 20);
    drawText(ctx, "COMBO", x + 510, y + 20, COLORS.muted, 13);
    drawText(ctx, String(game.combo).padStart(2, "0"), x + 598, y + 16, COLORS.cyan, 20);
    drawText(ctx, "ACC", x + 700, y + 20, COLORS.muted, 13);
    drawText(ctx, formatPercent(game.accuracy), x + 760, y + 16, COLORS.white, 20);
    drawText(ctx, "MAX", x + 880, y + 20, COLORS.muted, 13);
    drawText(ctx, String(game.maxCombo).padStart(2, "0"), x + 942, y + 16, COLORS.cyan, 20);
    drawText(ctx, "BUB", x + 1018, y + 20, COLORS.muted, 13);
    drawText(ctx, String(game.spawn.bubbles.length).padStart(2, "0"), x + 1078, y + 16, COLORS.white, 20);

    for (let i = 0; i < 34; i += 1) {
      const blockX = x + 22 + i * 22;
      const height = 8 + Math.round((Math.sin(t * 2.4 + i * 0.62) * 0.5 + 0.5) * 32);
      const hot = (i + Math.floor(t * 8)) % 9 === 0;
      ctx.fillStyle = hot ? COLORS.amber : withAlpha(COLORS.cyan, 0.42);
      ctx.fillRect(blockX, y + 82 - height, 12, height);
    }

    drawText(ctx, `DIFF ${game.spawn.difficulty}`, x + 870, y + 70, COLORS.muted, 11);
    drawText(ctx, `LEAK ${String(game.unstableLeaks).padStart(2, "0")}`, x + 1018, y + 70, game.unstableLeaks > 0 ? COLORS.red : COLORS.muted, 11);
  }

  drawControlPad(ctx, game) {
    const active = game.activeDirection?.id;

    for (const button of this.getControlButtons()) {
      const isActive = active === button.id;
      drawRect(ctx, button.x, button.y, button.w, button.h, isActive ? COLORS.amber : COLORS.cyanDim, isActive ? "rgba(255, 122, 22, 0.16)" : "rgba(17, 19, 20, 0.72)", 1);
      drawText(ctx, button.label, button.x + button.w / 2, button.y + 15, isActive ? COLORS.amber : COLORS.cyan, 18, "center");
    }
  }

  drawBoot(ctx, game) {
    const progress = clamp(game.stateTime / 0.8, 0, 1);
    drawRect(ctx, 440, 390, 520, 28, COLORS.cyan, "rgba(17, 19, 20, 0.72)", 1);
    drawBar(ctx, 446, 398, 508, 12, progress, COLORS.cyan);
    drawText(ctx, "BOOT SEQUENCE", GAME_WIDTH / 2, 336, COLORS.cyan, 34, "center");
  }

  drawTitle(ctx, game) {
    this.drawDim(ctx, 0.18);
    drawText(ctx, "BUBBLE POP CORE", GAME_WIDTH / 2, 294, COLORS.white, 44, "center");
    drawText(ctx, "CLICK / TAP TO START", GAME_WIDTH / 2, 360, COLORS.cyan, 22, "center");
    drawText(ctx, `DIFFICULTY ${game.difficulty}`, GAME_WIDTH / 2, 402, COLORS.amber, 16, "center");
    drawText(ctx, "1 CALM  2 NORMAL  3 OVERCLOCK", GAME_WIDTH / 2, 434, COLORS.muted, 14, "center");
  }

  drawPause(ctx) {
    this.drawDim(ctx, 0.52);
    drawText(ctx, "PAUSED", GAME_WIDTH / 2, 338, COLORS.amber, 48, "center");
    drawText(ctx, "ESC TO RESUME", GAME_WIDTH / 2, 402, COLORS.cyan, 20, "center");
  }

  drawSettings(ctx) {
    this.drawDim(ctx, 0.5);
    drawText(ctx, "SETTINGS", GAME_WIDTH / 2, 352, COLORS.cyan, 42, "center");
    drawText(ctx, "HUD PROFILE // TECH DARK", GAME_WIDTH / 2, 410, COLORS.muted, 18, "center");
  }

  drawGameOver(ctx, game) {
    this.drawDim(ctx, 0.58);
    drawText(ctx, "GAME OVER", GAME_WIDTH / 2, 300, COLORS.red, 46, "center");
    drawText(ctx, game.gameOverReason, GAME_WIDTH / 2, 360, COLORS.amber, 22, "center");
    drawText(ctx, `FINAL SCORE ${formatScore(game.score)}`, GAME_WIDTH / 2, 414, COLORS.white, 22, "center");
    drawText(ctx, "CLICK / TAP OR R TO RESTART", GAME_WIDTH / 2, 470, COLORS.cyan, 18, "center");
  }

  drawDim(ctx, alpha) {
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}
