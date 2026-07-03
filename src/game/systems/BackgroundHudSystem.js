import { COLORS, GAME_HEIGHT, GAME_WIDTH, PLAYFIELD } from "../constants.js";
import { clamp, drawPixelLine, drawRect, lerp, rand, randInt, withAlpha } from "../utils.js";

const DEFAULT_CONFIG = {
  fineCell: 20,
  largeCell: 100,
  fieldCell: 40,
  cursorGlowRadius: 150,
  baseGridAlpha: 0.055,
  largeGridAlpha: 0.045,
  cellGlowAlpha: 0.17,
  dataPointCount: 62,
  scanChance: 0.018,
  diagnosticEvery: 1.2,
  dataStripX: PLAYFIELD.left,
  dataStripY: 622,
  dataStripWidth: PLAYFIELD.right - PLAYFIELD.left,
  dataStripHeight: 14,
};

export class BackgroundHudSystem {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.reducedMotion = Boolean(options.reducedMotion);
    this.time = 0;
    this.scanTimer = 0;
    this.diagnosticTimer = 0;
    this.glitchTimer = 0;
    this.glitchPower = 0;
    this.noiseSeed = 1;
    this.cells = [];
    this.dataPoints = [];
    this.scanLines = [];
    this.diagnostics = this.createDiagnostics();
    this.createCells();
    this.createDataPoints();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  reset() {
    this.time = 0;
    this.scanTimer = 0;
    this.diagnosticTimer = 0;
    this.glitchTimer = 0;
    this.glitchPower = 0;
    this.noiseSeed = 1;
    this.scanLines = [];
    for (const cell of this.cells) cell.energy = 0;
    this.diagnostics = this.createDiagnostics();
  }

  emitUnstableGlitch(power = 1) {
    if (this.reducedMotion) return;
    this.glitchTimer = 0.24;
    this.glitchPower = clamp(power, 0, 1.5);
  }

  update(dt, game) {
    this.time += dt;
    this.noiseSeed = (this.noiseSeed + 1) % 8192;
    this.updateCells(dt, game.pointer);
    this.updateDataPoints(dt);
    this.updateScanLines(dt);
    this.updateDiagnostics(dt);

    if (this.glitchTimer > 0) {
      this.glitchTimer = Math.max(0, this.glitchTimer - dt);
    }
  }

  render(ctx, game) {
    this.drawBase(ctx);
    this.drawFixedGrid(ctx);
    this.drawReactiveCells(ctx);
    this.drawDataPoints(ctx);
    this.drawScanLines(ctx, game);
    this.drawDataStrips(ctx);
    this.drawGlitch(ctx, game);
  }

  draw(ctx, game) {
    this.render(ctx, game);
  }

  createCells() {
    this.cells = [];
    const cell = this.config.fieldCell;

    for (let y = PLAYFIELD.top; y < PLAYFIELD.bottom; y += cell) {
      for (let x = PLAYFIELD.left; x < PLAYFIELD.right; x += cell) {
        this.cells.push({
          x,
          y,
          w: Math.min(cell, PLAYFIELD.right - x),
          h: Math.min(cell, PLAYFIELD.bottom - y),
          cx: x + cell * 0.5,
          cy: y + cell * 0.5,
          energy: 0,
          roundness: 0,
          phase: (x * 0.013 + y * 0.017) % Math.PI,
        });
      }
    }
  }

  createDataPoints() {
    this.dataPoints = [];

    for (let i = 0; i < this.config.dataPointCount; i += 1) {
      this.dataPoints.push({
        x: randInt(PLAYFIELD.left + 20, PLAYFIELD.right - 20),
        y: randInt(PLAYFIELD.top + 20, PLAYFIELD.bottom - 20),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.55, 1.8),
        hot: i % 11 === 0,
      });
    }
  }

  createDiagnostics() {
    return [
      { label: "SIG", value: 0.62 },
      { label: "ION", value: 0.48 },
      { label: "MEM", value: 0.71 },
      { label: "ERR", value: 0.02 },
    ];
  }

  updateCells(dt, pointer) {
    const radius = this.config.cursorGlowRadius;
    const ease = 1 - Math.pow(0.001, dt);

    for (const cell of this.cells) {
      const dx = cell.cx - pointer.x;
      const dy = cell.cy - pointer.y;
      const dist = Math.hypot(dx, dy);
      const target = Math.max(0, 1 - dist / radius);
      const pulse = Math.max(0, Math.sin(this.time * 2 + cell.phase)) * 0.08;
      cell.energy = lerp(cell.energy, clamp(target + pulse, 0, 1), ease);
      cell.roundness = lerp(cell.roundness, target, ease);
    }
  }

  updateDataPoints(dt) {
    if (this.reducedMotion) return;

    for (const point of this.dataPoints) {
      point.phase += dt * point.speed;
    }
  }

  updateScanLines(dt) {
    this.scanTimer -= dt;

    if (this.scanTimer <= 0) {
      const chance = this.reducedMotion ? this.config.scanChance * 0.25 : this.config.scanChance;
      if (Math.random() < chance) {
        const horizontal = Math.random() > 0.38;
        this.scanLines.push({
          horizontal,
          pos: horizontal ? randInt(PLAYFIELD.top, PLAYFIELD.bottom) : randInt(PLAYFIELD.left, PLAYFIELD.right),
          age: 0,
          life: this.reducedMotion ? 0.32 : rand(0.34, 0.68),
          color: Math.random() > 0.18 ? COLORS.cyan : COLORS.muted,
        });
      }
      this.scanTimer = this.reducedMotion ? 0.9 : 0.18;
    }

    for (const line of this.scanLines) {
      line.age += dt;
    }

    this.scanLines = this.scanLines.filter((line) => line.age < line.life);
  }

  updateDiagnostics(dt) {
    this.diagnosticTimer -= dt;
    if (this.diagnosticTimer > 0) return;

    for (const item of this.diagnostics) {
      const drift = item.label === "ERR" ? rand(-0.01, 0.015) : rand(-0.08, 0.08);
      item.value = clamp(item.value + drift, 0, item.label === "ERR" ? 0.14 : 0.99);
    }

    this.diagnosticTimer = this.config.diagnosticEvery;
  }

  drawBase(ctx) {
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = "rgba(20, 5, 29, 0.26)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  drawFixedGrid(ctx) {
    const fine = this.config.fineCell;
    const large = this.config.largeCell;

    for (let x = 0; x <= GAME_WIDTH; x += fine) {
      drawPixelLine(ctx, x, 0, x, GAME_HEIGHT, COLORS.cyanDim, this.config.baseGridAlpha);
    }

    for (let y = 0; y <= GAME_HEIGHT; y += fine) {
      drawPixelLine(ctx, 0, y, GAME_WIDTH, y, COLORS.cyanDim, this.config.baseGridAlpha);
    }

    for (let x = 0; x <= GAME_WIDTH; x += large) {
      drawPixelLine(ctx, x, 0, x, GAME_HEIGHT, COLORS.muted, this.config.largeGridAlpha);
    }

    for (let y = 0; y <= GAME_HEIGHT; y += large) {
      drawPixelLine(ctx, 0, y, GAME_WIDTH, y, COLORS.muted, this.config.largeGridAlpha);
    }
  }

  drawReactiveCells(ctx) {
    for (const cell of this.cells) {
      if (cell.energy < 0.025) continue;

      const alpha = cell.energy * this.config.cellGlowAlpha;
      const radius = Math.min(cell.w, cell.h) * 0.48 * cell.roundness;
      this.drawReactiveCell(ctx, cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2, radius, withAlpha(COLORS.cyan, alpha));

      if (cell.energy > 0.28) {
        const tickAlpha = alpha * 2.4 * (1 - cell.roundness * 0.58);
        drawPixelLine(ctx, cell.x + 6, cell.y + 6, cell.x + 18, cell.y + 6, COLORS.cyan, tickAlpha);
        drawPixelLine(ctx, cell.x + 6, cell.y + 6, cell.x + 6, cell.y + 18, COLORS.cyan, tickAlpha);
      }
    }
  }

  drawReactiveCell(ctx, x, y, width, height, radius, fill) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(width);
    const ih = Math.round(height);
    const r = clamp(Math.round(radius), 0, Math.min(iw, ih) * 0.5);

    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(ix + r, iy);
    ctx.lineTo(ix + iw - r, iy);
    ctx.quadraticCurveTo(ix + iw, iy, ix + iw, iy + r);
    ctx.lineTo(ix + iw, iy + ih - r);
    ctx.quadraticCurveTo(ix + iw, iy + ih, ix + iw - r, iy + ih);
    ctx.lineTo(ix + r, iy + ih);
    ctx.quadraticCurveTo(ix, iy + ih, ix, iy + ih - r);
    ctx.lineTo(ix, iy + r);
    ctx.quadraticCurveTo(ix, iy, ix + r, iy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawDataPoints(ctx) {
    const pointCount = this.reducedMotion ? Math.ceil(this.dataPoints.length * 0.35) : this.dataPoints.length;

    for (let i = 0; i < pointCount; i += 1) {
      const point = this.dataPoints[i];
      const blink = this.reducedMotion ? 0.28 : Math.max(0, Math.sin(point.phase));
      const alpha = point.hot ? 0.16 + blink * 0.22 : 0.08 + blink * 0.12;
      const color = point.hot ? COLORS.orange : COLORS.cyan;

      ctx.fillStyle = withAlpha(color, alpha);
      ctx.fillRect(point.x, point.y, point.hot ? 3 : 2, 2);
    }
  }

  drawScanLines(ctx, game = null) {
    if (game?.settings?.crtScanlines === false) return;

    for (const line of this.scanLines) {
      const progress = line.age / line.life;
      const alpha = (1 - progress) * 0.28;
      const offset = Math.round(progress * (line.horizontal ? 80 : 56));

      if (line.horizontal) {
        drawPixelLine(ctx, PLAYFIELD.left, line.pos + offset, PLAYFIELD.right, line.pos + offset, line.color, alpha);
        drawPixelLine(ctx, PLAYFIELD.left, line.pos + offset + 3, PLAYFIELD.right, line.pos + offset + 3, COLORS.cyan, alpha * 0.34);
      } else {
        drawPixelLine(ctx, line.pos + offset, PLAYFIELD.top, line.pos + offset, PLAYFIELD.bottom, line.color, alpha);
        drawPixelLine(ctx, line.pos + offset + 3, PLAYFIELD.top, line.pos + offset + 3, PLAYFIELD.bottom, COLORS.cyan, alpha * 0.34);
      }
    }
  }

  drawDataStrips(ctx) {
    const x = this.config.dataStripX;
    const y = this.config.dataStripY;
    const blocks = 58;
    const step = Math.floor(this.config.dataStripWidth / blocks);
    const motion = this.reducedMotion ? 0 : this.time;

    for (let i = 0; i < blocks; i += 1) {
      const height = 2 + Math.round((Math.sin(motion * 2.2 + i * 0.61) * 0.5 + 0.5) * (this.config.dataStripHeight - 2));
      const hot = (i + Math.floor(this.time * 5)) % 17 === 0;
      const color = hot ? COLORS.orange : COLORS.cyanDim;

      ctx.fillStyle = withAlpha(color, hot ? 0.5 : 0.24);
      ctx.fillRect(x + i * step, y + this.config.dataStripHeight - height, Math.max(2, step - 4), height);
    }
  }

  drawGlitch(ctx, game) {
    if (this.glitchTimer <= 0 || this.reducedMotion) return;

    const progress = this.glitchTimer / 0.24;
    const alpha = clamp(progress * 0.24 * this.glitchPower, 0, 0.32);
    const slices = 5;
    const centerY = Math.round(game.pointer.y);

    for (let i = 0; i < slices; i += 1) {
      const y = clamp(centerY + randInt(-110, 110), PLAYFIELD.top, PLAYFIELD.bottom);
      const x = PLAYFIELD.left + randInt(0, 180);
      const width = randInt(120, 360);
      const offset = randInt(-18, 18) * this.glitchPower;

      drawPixelLine(ctx, x + offset, y, Math.min(PLAYFIELD.right, x + width + offset), y, COLORS.red, alpha, 2);
      drawPixelLine(ctx, x - offset * 0.6, y + 3, Math.min(PLAYFIELD.right, x + width - offset * 0.6), y + 3, COLORS.cyan, alpha * 0.7, 1);
    }
  }
}
