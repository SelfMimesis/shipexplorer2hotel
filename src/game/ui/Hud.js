import { COLORS, GAME_HEIGHT, GAME_STATES, GAME_WIDTH, PLAYFIELD } from "../constants.js";
import { clamp, drawBar, drawPixelLine, drawRect, drawRing, drawText, formatPercent, formatScore, formatTime, lerp, withAlpha } from "../utils.js";

const CONTROL_SIZE = 34;
const CONTROL_GAP = 5;
const LOGO_PATH =
  "M570.8,431.1c0,145.2-114.5,279.3-281.3,278.7-160.1-.6-277.7-130.2-277.4-279.4.3-150.5,119.9-277.6,277.4-278.5,161.7-.9,281.4,129.3,281.3,279.2ZM288.5,207.6c0-.2.2-.7.2-1.3,0-15.2,0-30.4.1-45.6,0-3.1-1.6-3.5-4-3.3-10.1.7-20.2,1-30.1,2.3-61.5,7.8-114.7,33.5-157.6,78C28.5,308.9,4.1,394.1,24.5,490.8c24.8,117.7,124.9,203.8,244.5,212.9,6.4.5,12.8,0,19.2,0,.1-.3.4-.5.4-.8,0-17.2,0-34.3.2-51.5,0-2.6-1.4-2.8-3.5-2.9-6.6-.4-13.2-.7-19.8-1.4-3.2-.4-5.1.1-7.1,3-6.1,8.8-16.8,12.4-27.2,9.7-10.1-2.6-17.7-10.9-18.9-21.3-.4-3.6-2-5-5.1-6.3-32.8-13.4-60.7-33.6-83.8-60.4-17.6-20.4-31-43.2-40-68.7-.7-2.1-1.2-4-4.3-4.3-14.5-1.6-24.6-10.8-27.5-24.7-2.7-13,3.4-25.8,16-32.9,2.3-1.3,3-2.7,2.9-5.3-.9-25.8,2.6-51.1,10.7-75.6,1-3,.4-4.5-2.1-6.4-15.7-11.8-20.3-32.9-11.2-50.2,9-17,29.6-25.2,47.9-18.4,4.9,1.8,7.2.6,10.4-3,32.6-36.3,72.9-59.7,120.8-69.2,13.4-2.7,27.1-3.7,41.2-5.5ZM345.7,581.2c-.8-.2-.9-.3-1.1-.2-1,.3-2,.6-3,.9-49.1,15.5-95.4,9.6-138.6-18.5-3.3-2.1-5.4-2.3-8.7-.4-7.6,4.3-17,2.7-23-3.1-6.4-6.2-8.2-15.3-4.1-23.2,1.5-2.9,1.1-4.5-.7-7-36.2-48.6-44-101.6-21.6-157.8,16.7-41.8,47.3-70.5,89.2-87.1,3.5-1.4,5-2.7,4.9-7-.7-25.3,22.6-45,47.4-40.7,18.1,3.2,30.9,16.6,33.8,35.3.3,1.7,1.1,4.3,2.2,4.7,9,2.8,18.1,5.1,27.5,7.7.5-.9,1.1-1.9,1.5-3,6.3-15.3,12.6-30.6,19-45.9,1.4-3.2.6-4.4-2.5-5.6-18.7-7-37.9-11.9-57.9-13.4-60.3-4.7-113.6,12.5-159.5,52-7.9,6.8-15,14.6-22.5,22.1,1.5,1.6,2.3,2.5,3.1,3.4,12.8,13.2,15.3,31.9,6.2,47.9-8.6,15.2-26.2,22.7-43.8,18.4-3.2-.8-4.4-.2-5.4,3-6.6,20.8-9.9,42.2-10.1,64,0,3.2,0,6.5,0,9.6,19.6,1.9,30.4,9.6,33.6,23.7,1.5,6.5,1.1,12.8-1.5,19-3.8,9.3-10.9,14.8-19.9,18.1,9.4,47,81.1,121.2,123.1,127.7,8.1-13.4,17.3-18.7,29.2-16,15.4,3.5,21.4,14.2,21.1,29.5,35.1,4.4,68.8.5,102.1-11.8-6.9-15.9-13.6-31.3-20.1-46.4ZM240.5,290.3c-1.9.7-3.7,1.3-5.5,2-19.2,7.7-36.1,19-50.9,33.6-53.5,52.8-58.8,140.5-12.1,198.7,1.8,2.2,3.1,3.2,6.3,2.1,14.8-5.2,29.4,7,26.1,22.3-1.2,5.3.9,7.2,4.5,9.4,49.8,30.3,100.9,32.5,153,6.4,11.7-5.9,22.3-13.6,32.1-23.1-13-13.5-25.8-26.7-38.5-39.9-41.6,37.1-101.1,30.9-134-5.4-33.5-36.9-33.8-91-1-127.5,16.1-17.8,36.2-28.5,60.1-30.8,34.2-3.4,62.4,9,84.8,35.1,13.1-13.5,25.9-26.6,39-40.1-22.9-25.7-50.8-41.8-84.3-48.7-5.3,19.5-17.2,31.7-37.3,33.3-20.3,1.6-33.9-8.8-42.3-27.4ZM290.2,519c47.5.4,87.6-38.5,88.1-85.3.5-49.3-38-88.9-86.8-89.3-48.2-.4-87.7,38.5-88,86.7-.3,48.3,38.4,87.5,86.7,88Z";
const LOGO_SOURCE_Y = 145;
const LOGO_SOURCE_W = 595.3;
const LOGO_SOURCE_H = 590;

export class Hud {
  constructor() {
    this.cursor = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      ring: 0,
    };
    this.dataPhase = 0;
    this.noiseSeed = 1;
    this.logoPath = null;
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
    const x = 1180;
    const y = 640;

    return [
      { id: "up", label: "^", x: x + CONTROL_SIZE + CONTROL_GAP, y, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: 0, vy: -1 },
      { id: "left", label: "<", x, y: y + CONTROL_SIZE + CONTROL_GAP, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: -1, vy: 0 },
      { id: "right", label: ">", x: x + (CONTROL_SIZE + CONTROL_GAP) * 2, y: y + CONTROL_SIZE + CONTROL_GAP, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: 1, vy: 0 },
      { id: "down", label: "V", x: x + CONTROL_SIZE + CONTROL_GAP, y: y + (CONTROL_SIZE + CONTROL_GAP) * 2, w: CONTROL_SIZE, h: CONTROL_SIZE, vx: 0, vy: 1 },
    ];
  }

  getFireButton() {
    return { id: "fire", label: "FIRE", x: 1094, y: 668, w: 58, h: 58 };
  }

  getDirectionFromPoint(x, y) {
    return this.getControlButtons().find((button) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) ?? null;
  }

  isPointInFireButton(x, y) {
    const button = this.getFireButton();
    return x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h;
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
    drawRect(ctx, PLAYFIELD.left, PLAYFIELD.top, PLAYFIELD.right - PLAYFIELD.left, PLAYFIELD.bottom - PLAYFIELD.top, COLORS.cyan, "rgba(103, 64, 128, 0.08)", 1);
    drawRect(ctx, PLAYFIELD.left - 10, PLAYFIELD.top - 10, PLAYFIELD.right - PLAYFIELD.left + 20, PLAYFIELD.bottom - PLAYFIELD.top + 20, COLORS.cyanDim, null, 1, 0.9);

    this.drawFrameGlow(ctx);
    this.drawMeasurementMarks(ctx);
    drawText(ctx, "BUBBLE FIELD // NAV MAP", PLAYFIELD.left + 20, PLAYFIELD.top - 38, COLORS.cyan, 18);
    drawText(ctx, "RX-44 ONLINE", PLAYFIELD.right - 20, PLAYFIELD.top - 38, COLORS.amber, 16, "right");
  }

  drawPanels(ctx, game) {
    this.drawLeftPanel(ctx, game);
    this.drawBottomPanel(ctx, game);
    this.drawAnimatedLogo(ctx, game);
    this.drawControlPad(ctx, game);
  }

  drawCursor(ctx, game) {
    const x = Math.round(this.cursor.x);
    const y = Math.round(this.cursor.y);
    const active = game.pointer.isDown;
    const color = active ? COLORS.orange : COLORS.cyan;
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
    ctx.fillStyle = "rgba(20, 5, 29, 0.26)";
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
        const color = proximity > 0.58 ? COLORS.orange : COLORS.cyan;

        if (alpha > 0.065) {
          drawPixelLine(ctx, x, y, x + length, y, color, alpha);
        }
      }
    }

    drawRing(ctx, ship.x, ship.y, 72 + Math.sin(t * 4) * 6, COLORS.cyan, 0.18, 1);
    drawRing(ctx, ship.x, ship.y, 112 + Math.sin(t * 2.4) * 8, COLORS.muted, 0.1, 1);
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
      ctx.fillStyle = i % 7 === 0 ? "rgba(152, 170, 57, 0.13)" : "rgba(157, 0, 255, 0.1)";
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

    drawRect(ctx, x, y, w, h, COLORS.cyanDim, "rgba(42, 18, 54, 0.58)", 1);
    drawText(ctx, "STATUS", x + 18, y + 18, COLORS.cyan, 15);

    this.drawMetricRow(ctx, "CTRL", ctrl, x + 18, y + 56);
    this.drawMetricRow(ctx, "DATA", data, x + 18, y + 116);
    this.drawMetricRow(ctx, "SYS", sys, x + 18, y + 176);

    this.drawBossBubblePenalty(ctx, game, x + 18, y + 254);

    drawText(ctx, "VECTOR", x + 18, y + 342, COLORS.muted, 11);
    drawText(ctx, "VX", x + 18, y + 366, COLORS.muted, 10);
    drawText(ctx, `${Math.round(game.ship.vx).toString().padStart(4, "0")}`, x + 110, y + 362, COLORS.white, 15, "right");
    drawText(ctx, "VY", x + 18, y + 392, COLORS.muted, 10);
    drawText(ctx, `${Math.round(game.ship.vy).toString().padStart(4, "0")}`, x + 110, y + 388, COLORS.white, 15, "right");

    drawText(ctx, "AUTO NAV", x + 18, y + 474, COLORS.amber, 13);
  }

  drawBossBubblePenalty(ctx, game, x, y) {
    const progress = game.bossBubblePenaltyProgress ?? 0;
    const limit = game.bossBubblePenaltyLimit ?? 10;
    drawText(ctx, "BOSS BUB", x, y, COLORS.muted, 10);
    drawText(ctx, `${progress}/${limit}`, x + 92, y, COLORS.white, 10, "right");

    for (let i = 0; i < limit; i += 1) {
      const px = x + (i % 5) * 18;
      const py = y + 24 + Math.floor(i / 5) * 18;
      const active = i < progress;
      drawRing(ctx, px + 6, py, 6, active ? COLORS.heart : COLORS.cyanDim, active ? 0.9 : 0.36, 1);
      if (active) {
        ctx.fillStyle = withAlpha(COLORS.heart, 0.34);
        ctx.fillRect(px + 3, py - 3, 6, 6);
      }
    }
  }

  getLogoPath() {
    if (!this.logoPath && typeof Path2D !== "undefined") {
      this.logoPath = new Path2D(LOGO_PATH);
    }

    return this.logoPath;
  }

  drawAnimatedLogo(ctx, game) {
    const path = this.getLogoPath();
    if (!path) return;

    const x = 54;
    const y = 634;
    const size = 120;
    const scale = size / LOGO_SOURCE_W;
    const t = game.totalTime;
    const reduced = game.settings?.reducedMotion;
    const centerX = x + size * 0.5;
    const centerY = y + 58;
    const proximity = 1 - clamp(Math.hypot(game.pointer.x - centerX, game.pointer.y - centerY) / 180, 0, 1);
    const pulse = reduced ? 0 : Math.sin(t * 2.7) * 0.08;
    const alpha = clamp(0.62 + pulse + proximity * 0.24, 0.3, 1);
    const sweep = reduced ? 0.48 : (t * 0.18) % 1;

    drawRect(ctx, x - 14, y - 12, size + 28, 138, COLORS.cyanDim, "rgba(42, 18, 54, 0.44)", 1, 0.72);
    drawRect(ctx, x - 8, y - 6, size + 16, 126, withAlpha(COLORS.cyan, 0.42), null, 1);
    drawPixelLine(ctx, x - 2, y + 6, x + 18, y + 6, COLORS.amber, 0.72);
    drawPixelLine(ctx, x + size - 18, y + 112, x + size + 2, y + 112, COLORS.amber, 0.62);

    if (!reduced) {
      const glitch = Math.sin(t * 17) > 0.92 ? 2 : 0;
      this.drawLogoShape(ctx, path, x + glitch, y, scale, COLORS.red, 0.12);
      this.drawLogoShape(ctx, path, x - glitch, y, scale, COLORS.amber, 0.1);
    }

    this.drawLogoShape(ctx, path, x, y, scale, COLORS.cyan, alpha);
    this.drawLogoScan(ctx, path, x, y, scale, sweep, alpha);

    drawRing(ctx, centerX, centerY, 68 + (reduced ? 0 : Math.sin(t * 3.1) * 3), COLORS.cyanDim, 0.14 + proximity * 0.08, 1);
    drawText(ctx, "RIM", x + 42, y + 126, COLORS.cyan, 12, "center");
    drawText(ctx, "PATCH", x + 76, y + 126, COLORS.amber, 12, "center");
  }

  drawLogoShape(ctx, path, x, y, scale, color, alpha) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - LOGO_SOURCE_Y * scale));
    ctx.scale(scale, scale);
    ctx.fillStyle = withAlpha(color, alpha * 0.18);
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = 8;
    ctx.fill(path);
    ctx.stroke(path);
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(COLORS.white, alpha * 0.18);
    ctx.stroke(path);
    ctx.restore();
  }

  drawLogoScan(ctx, path, x, y, scale, sweep, alpha) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - LOGO_SOURCE_Y * scale));
    ctx.scale(scale, scale);
    ctx.clip(path);
    const scanY = LOGO_SOURCE_Y + sweep * LOGO_SOURCE_H;
    ctx.fillStyle = withAlpha(COLORS.white, alpha * 0.26);
    ctx.fillRect(0, scanY - 8, LOGO_SOURCE_W, 6);
    ctx.fillStyle = withAlpha(COLORS.amber, alpha * 0.2);
    ctx.fillRect(0, scanY + 2, LOGO_SOURCE_W, 12);
    ctx.restore();
  }

  drawMetricBar(ctx, label, value, x, y) {
    drawText(ctx, label, x, y, COLORS.muted, 12);
    drawBar(ctx, x, y + 24, 92, 12, value, value > 0.78 ? COLORS.amber : COLORS.cyan);
    drawText(ctx, formatPercent(value), x, y + 46, COLORS.white, 12);
  }

  drawMetricRow(ctx, label, value, x, y) {
    drawText(ctx, label, x, y, COLORS.muted, 11);
    drawText(ctx, formatPercent(value), x + 92, y, COLORS.white, 10, "right");
    drawBar(ctx, x, y + 20, 92, 9, value, value > 0.78 ? COLORS.amber : COLORS.cyan);
  }

  drawBottomPanel(ctx, game) {
    const x = PLAYFIELD.left;
    const y = 640;
    const w = PLAYFIELD.right - PLAYFIELD.left;
    const h = 112;
    const t = game.totalTime;

    drawRect(ctx, x, y, w, h, COLORS.cyanDim, "rgba(42, 18, 54, 0.62)", 1);
    drawText(ctx, "SCORE", x + 22, y + 18, COLORS.muted, 12);
    drawText(ctx, formatScore(game.score), x + 100, y + 14, COLORS.white, 19);
    drawText(ctx, "TIME", x + 258, y + 18, COLORS.muted, 12);
    drawText(ctx, formatTime(game.timeLeft), x + 320, y + 14, COLORS.amber, 19);
    drawText(ctx, "COMBO", x + 462, y + 18, COLORS.muted, 12);
    drawText(ctx, String(game.combo).padStart(2, "0"), x + 548, y + 14, COLORS.cyan, 19);
    drawText(ctx, "ACC", x + 640, y + 18, COLORS.muted, 12);
    drawText(ctx, formatPercent(game.accuracy), x + 698, y + 14, COLORS.white, 19);
    drawText(ctx, "MAX", x + 750, y + 18, COLORS.muted, 12);
    drawText(ctx, String(game.maxCombo).padStart(2, "0"), x + 808, y + 14, COLORS.cyan, 19);

    for (let i = 0; i < 38; i += 1) {
      const blockX = x + 22 + i * 16;
      const height = 3 + Math.round((Math.sin(t * 2.4 + i * 0.62) * 0.5 + 0.5) * 14);
      const hot = (i + Math.floor(t * 8)) % 9 === 0;
      ctx.fillStyle = hot ? COLORS.amber : withAlpha(COLORS.cyan, 0.42);
      ctx.fillRect(blockX, y + 104 - height, 9, height);
    }

    this.drawLives(ctx, game, x + 22, y + 68);
    this.drawBossStatus(ctx, game, x + 250, y + 70);
    this.drawTurboStatus(ctx, game, x + 520, y + 70);
    drawText(ctx, "BUB", x + 686, y + 78, COLORS.muted, 10);
    drawText(ctx, String(game.spawn.bubbles.length).padStart(2, "0"), x + 740, y + 74, COLORS.violetBright, 16, "right");
  }

  drawLives(ctx, game, x, y) {
    drawText(ctx, "HULL", x, y, COLORS.muted, 11);
    const lives = game.shipLives ?? 0;

    for (let i = 0; i < 3; i += 1) {
      this.drawHeart(ctx, x + 58 + i * 28, y + 6, i < lives);
    }
  }

  drawHeart(ctx, x, y, active) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.fillStyle = active ? COLORS.heart : withAlpha(COLORS.violet, 0.34);
    ctx.strokeStyle = active ? withAlpha(COLORS.heart, 0.68) : withAlpha(COLORS.violet, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-18, -4, -7, -18, 0, -9);
    ctx.bezierCurveTo(7, -18, 18, -4, 0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawBossStatus(ctx, game, x, y) {
    if (!game.boss) return;
    const value = game.boss.maxHp > 0 ? game.boss.hp / game.boss.maxHp : 0;
    drawText(ctx, "CORE", x, y, COLORS.muted, 11);
    drawBar(ctx, x + 60, y + 2, 128, 9, value, value <= 0.25 ? COLORS.orangeHot : COLORS.orange, withAlpha(COLORS.violet, 0.35));
    drawText(ctx, `${String(game.boss.hp).padStart(2, "0")}/${game.boss.maxHp}`, x + 204, y - 2, COLORS.white, 12);
  }

  drawTurboStatus(ctx, game, x, y) {
    const cooldown = game.turboCooldown ?? 0;
    const active = (game.turboTimer ?? 0) > 0;
    const ready = cooldown <= 0;
    const progress = active ? 1 : ready ? 1 : clamp(1 - cooldown / 10, 0, 1);
    const color = active ? COLORS.amber : ready ? COLORS.orange : COLORS.cyanDim;

    drawText(ctx, "TURBO", x, y, COLORS.muted, 11);
    drawBar(ctx, x + 72, y + 2, 120, 9, progress, color, withAlpha(COLORS.violet, 0.35));
    drawText(ctx, active ? "ON" : ready ? "READY" : `${Math.ceil(cooldown)}S`, x + 132, y - 2, color, 12, "center");
  }

  drawControlPad(ctx, game) {
    const active = game.activeDirection?.id;

    for (const button of this.getControlButtons()) {
      const isActive = active === button.id;
      const color = isActive ? COLORS.orange : COLORS.cyan;
      this.drawControlButton(ctx, button, color, isActive);
      this.drawArrowIcon(ctx, button, color, isActive ? 0.95 : 0.72);
    }

    this.drawFireButton(ctx, game);
  }

  drawControlButton(ctx, button, color, active) {
    const x = Math.round(button.x);
    const y = Math.round(button.y);
    const w = Math.round(button.w);
    const h = Math.round(button.h);
    const cut = 7;

    ctx.save();
    ctx.fillStyle = active ? "rgba(255, 138, 0, 0.17)" : "rgba(0, 0, 0, 0.38)";
    ctx.strokeStyle = withAlpha(color, active ? 0.95 : 0.58);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + cut, y + 0.5);
    ctx.lineTo(x + w - cut, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + cut);
    ctx.lineTo(x + w - 0.5, y + h - cut);
    ctx.lineTo(x + w - cut, y + h - 0.5);
    ctx.lineTo(x + cut, y + h - 0.5);
    ctx.lineTo(x + 0.5, y + h - cut);
    ctx.lineTo(x + 0.5, y + cut);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawPixelLine(ctx, x + 6, y + 6, x + 14, y + 6, color, active ? 0.88 : 0.42);
    drawPixelLine(ctx, x + 6, y + 6, x + 6, y + 14, color, active ? 0.88 : 0.42);
    drawPixelLine(ctx, x + w - 14, y + h - 6, x + w - 6, y + h - 6, color, active ? 0.78 : 0.34);
    drawPixelLine(ctx, x + w - 6, y + h - 14, x + w - 6, y + h - 6, color, active ? 0.78 : 0.34);
  }

  drawArrowIcon(ctx, button, color, alpha) {
    const cx = Math.round(button.x + button.w / 2);
    const cy = Math.round(button.y + button.h / 2);
    const rotations = {
      up: -Math.PI / 2,
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
    };

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotations[button.id] ?? 0);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-8, -11);
    ctx.lineTo(9, 0);
    ctx.lineTo(-8, 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-16, 8);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-4, -1, 11, 2);
    ctx.globalAlpha = alpha * 0.34;
    ctx.beginPath();
    ctx.moveTo(12, -6);
    ctx.lineTo(16, 0);
    ctx.lineTo(12, 6);
    ctx.stroke();
    ctx.restore();
  }

  drawFireButton(ctx, game) {
    const button = this.getFireButton();
    const ready = game.shootCooldown <= 0;
    const color = ready ? COLORS.orange : COLORS.cyanDim;
    const fill = ready ? "rgba(255, 138, 0, 0.16)" : "rgba(42, 18, 54, 0.48)";
    const centerX = button.x + button.w / 2;
    const centerY = button.y + button.h / 2;

    drawRect(ctx, button.x, button.y, button.w, button.h, color, fill, 1);
    drawRing(ctx, centerX, centerY, 18, color, ready ? 0.82 : 0.36, 2);
    drawRing(ctx, centerX, centerY, 7, ready ? COLORS.orangeHot : COLORS.cyanDim, ready ? 0.72 : 0.3, 1);
    drawPixelLine(ctx, centerX - 24, centerY, centerX - 12, centerY, color, ready ? 0.9 : 0.36);
    drawPixelLine(ctx, centerX + 12, centerY, centerX + 24, centerY, color, ready ? 0.9 : 0.36);
    drawPixelLine(ctx, centerX, centerY - 24, centerX, centerY - 12, color, ready ? 0.9 : 0.36);
    drawPixelLine(ctx, centerX, centerY + 12, centerX, centerY + 24, color, ready ? 0.9 : 0.36);
    drawText(ctx, ready ? "FIRE" : "LOAD", centerX, button.y + button.h + 14, ready ? COLORS.orange : COLORS.cyanDim, 10, "center");
  }

  drawBoot(ctx, game) {
    const progress = clamp(game.stateTime / 0.8, 0, 1);
    drawRect(ctx, 440, 390, 520, 28, COLORS.cyan, "rgba(42, 18, 54, 0.52)", 1);
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
    const color = game.victory ? COLORS.amber : COLORS.red;
    drawText(ctx, game.victory ? "HAS GANADO" : "GAME OVER", GAME_WIDTH / 2, 300, color, 46, "center");
    drawText(ctx, game.gameOverReason, GAME_WIDTH / 2, 360, color, 22, "center");
    drawText(ctx, `FINAL SCORE ${formatScore(game.score)}`, GAME_WIDTH / 2, 414, COLORS.white, 22, "center");
    drawText(ctx, "CLICK / TAP OR R TO RESTART", GAME_WIDTH / 2, 470, COLORS.cyan, 18, "center");
  }

  drawDim(ctx, alpha) {
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}
