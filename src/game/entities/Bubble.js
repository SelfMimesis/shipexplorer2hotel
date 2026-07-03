import { COLORS, PLAYFIELD } from "../constants.js";
import { clamp, distance, drawPixelLine, drawRing, drawText, rand, randInt, withAlpha } from "../utils.js";

const GAME_BOUNDS = PLAYFIELD;
const SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const TYPE_CONFIG = {
  normal: {
    color: COLORS.cyan,
    accent: COLORS.magentaHot,
    dim: COLORS.cyanDim,
    variants: [
      { color: COLORS.cyan, accent: COLORS.magentaHot, dim: COLORS.cyanDim },
      { color: COLORS.violetBright, accent: COLORS.cyan, dim: COLORS.violet },
      { color: COLORS.teal, accent: COLORS.lime, dim: COLORS.tealDark },
    ],
    value: 100,
    lifetime: [7.5, 10.5],
    radius: [28, 44],
    speed: [24, 58],
  },
  bonus: {
    color: COLORS.orange,
    accent: COLORS.amber,
    dim: COLORS.orangeDim,
    variants: [
      { color: COLORS.orange, accent: COLORS.amber, dim: COLORS.orangeDim },
      { color: COLORS.orangeHot, accent: COLORS.lime, dim: COLORS.redDim },
      { color: COLORS.amber, accent: COLORS.orange, dim: COLORS.amberDim },
    ],
    value: 250,
    lifetime: [5.8, 8.2],
    radius: [24, 38],
    speed: [34, 72],
  },
  unstable: {
    color: COLORS.red,
    accent: COLORS.orangeHot,
    dim: COLORS.redDim,
    variants: [
      { color: COLORS.red, accent: COLORS.orangeHot, dim: COLORS.redDim },
      { color: COLORS.orangeHot, accent: COLORS.amber, dim: COLORS.orangeDim },
      { color: COLORS.amber, accent: COLORS.red, dim: COLORS.olive },
    ],
    value: 180,
    lifetime: [4.4, 6.7],
    radius: [22, 34],
    speed: [46, 92],
  },
};

const LEGACY_TYPE_MAP = {
  cyan: "normal",
  amber: "bonus",
  core: "bonus",
  red: "unstable",
};

let nextBubbleId = 1;

export class Bubble {
  constructor(configOrType = {}, x = null, y = null, level = 0) {
    const config = this.normalizeConfig(configOrType, x, y, level);
    const typeConfig = TYPE_CONFIG[config.type];
    const angle = rand(0, Math.PI * 2);
    const speed = config.speed ?? rand(typeConfig.speed[0], typeConfig.speed[1]);

    this.id = config.id ?? `bubble-${nextBubbleId++}`;
    this.x = Math.round(config.x);
    this.y = Math.round(config.y);
    this.radius = Math.round(config.radius ?? randInt(typeConfig.radius[0], typeConfig.radius[1]));
    this.vx = config.vx ?? Math.cos(angle) * speed;
    this.vy = config.vy ?? Math.sin(angle) * speed;
    this.age = 0;
    this.lifetime = config.lifetime ?? rand(typeConfig.lifetime[0], typeConfig.lifetime[1]) * Math.max(0.58, 1 - level * 0.12);
    this.type = config.type;
    this.value = config.value ?? typeConfig.value;
    this.palette = config.palette ?? this.pickPalette(typeConfig);
    this.popped = false;
    this.hoverAmount = 0;

    this.expired = false;
    this.dead = false;
    this.reported = false;
    this.points = this.value;
    this.life = this.lifetime;
    this.symbol = config.symbol ?? this.makeSymbol();
    this.phase = config.phase ?? rand(0, Math.PI * 2);
    this.oscillator = rand(0.7, 1.8);
    this.oscillation = rand(8, 18);
    this.spin = rand(-1.4, 1.4);
    this.jitterSeed = rand(0, Math.PI * 2);

    this.bounceInside(GAME_BOUNDS);
  }

  normalizeConfig(configOrType, x, y, level) {
    const defaultX = rand(GAME_BOUNDS.left + 80, GAME_BOUNDS.right - 80);
    const defaultY = rand(GAME_BOUNDS.top + 80, GAME_BOUNDS.bottom - 80);

    if (typeof configOrType === "string") {
      const type = TYPE_CONFIG[configOrType] ? configOrType : "normal";
      return { type, x: x ?? defaultX, y: y ?? defaultY };
    }

    if (configOrType?.radius && Array.isArray(configOrType.radius)) {
      const type = LEGACY_TYPE_MAP[configOrType.id] ?? "normal";
      return {
        type,
        x: x ?? defaultX,
        y: y ?? defaultY,
        radius: randInt(configOrType.radius[0], configOrType.radius[1]),
        value: configOrType.points,
        lifetime: configOrType.life ? rand(configOrType.life[0], configOrType.life[1]) * Math.max(0.58, 1 - level * 0.12) : undefined,
        speed: configOrType.speed ? rand(configOrType.speed[0], configOrType.speed[1]) : undefined,
      };
    }

    const type = TYPE_CONFIG[configOrType.type] ? configOrType.type : "normal";
    return {
      ...configOrType,
      type,
      x: configOrType.x ?? x ?? defaultX,
      y: configOrType.y ?? y ?? defaultY,
    };
  }

  pickPalette(typeConfig) {
    const variants = typeConfig.variants ?? [typeConfig];
    return variants[randInt(0, variants.length - 1)];
  }

  makeSymbol() {
    if (this.type === "bonus") return `+${randInt(1, 9)}`;
    if (this.type === "unstable") return "!";
    return SYMBOLS[randInt(0, SYMBOLS.length - 1)];
  }

  get progress() {
    return clamp(this.age / this.lifetime, 0, 1);
  }

  get isExpired() {
    return this.expired || this.age >= this.lifetime;
  }

  update(dt, bounds = GAME_BOUNDS, cursor = null) {
    if (this.popped) return;

    this.age += dt;
    this.phase += dt * this.spin;

    const hoverTarget = cursor && this.containsPoint(cursor.x, cursor.y, 58) ? 1 : 0;
    const hoverEase = 1 - Math.pow(0.0005, dt);
    this.hoverAmount += (hoverTarget - this.hoverAmount) * hoverEase;

    const oscX = Math.sin(this.age * this.oscillator + this.phase) * this.oscillation;
    const oscY = Math.cos(this.age * this.oscillator * 0.83 + this.phase) * this.oscillation * 0.62;

    this.x += (this.vx + oscX) * dt;
    this.y += (this.vy + oscY) * dt;
    this.bounceInside(bounds);

    if (this.age >= this.lifetime) {
      this.expired = true;
      this.dead = true;
    }
  }

  bounceInside(bounds = GAME_BOUNDS) {
    const minX = bounds.left + this.radius;
    const maxX = bounds.right - this.radius;
    const minY = bounds.top + this.radius;
    const maxY = bounds.bottom - this.radius;

    if (this.x < minX) {
      this.x = minX;
      this.vx = Math.abs(this.vx);
    } else if (this.x > maxX) {
      this.x = maxX;
      this.vx = -Math.abs(this.vx);
    }

    if (this.y < minY) {
      this.y = minY;
      this.vy = Math.abs(this.vy);
    } else if (this.y > maxY) {
      this.y = maxY;
      this.vy = -Math.abs(this.vy);
    }
  }

  containsPoint(x, y, extraRadius = 0) {
    if (this.popped || this.expired) return false;
    return distance(x, y, this.x, this.y) <= this.radius + extraRadius;
  }

  hitTest(x, y) {
    return this.containsPoint(x, y, 6);
  }

  pop() {
    if (this.popped) return false;
    this.popped = true;
    this.dead = true;
    return true;
  }

  draw(ctx, time = this.age) {
    if (this.popped) return;

    const palette = this.palette ?? TYPE_CONFIG[this.type];
    const danger = this.progress > 0.78;
    const unstableJitter = this.type === "unstable" ? Math.round(Math.sin(time * 48 + this.jitterSeed) * 2) : 0;
    const x = Math.round(this.x + unstableJitter);
    const y = Math.round(this.y + (this.type === "unstable" ? Math.cos(time * 37 + this.jitterSeed) * 2 : 0));
    const pulse = Math.sin(time * 5 + this.phase);
    const radius = Math.round(this.radius + pulse * 2 + this.hoverAmount * 5);
    const accent = danger ? COLORS.orangeHot : palette.accent;
    const base = palette.color;
    const hoverAlpha = 0.18 + this.hoverAmount * 0.24;

    this.drawGlow(ctx, x, y, radius, accent, hoverAlpha);
    this.drawBody(ctx, x, y, radius, base, accent, palette.dim, time);
    this.drawCardinalMarks(ctx, x, y, radius, accent);
    this.drawSymbol(ctx, x, y, accent);
    this.drawLifetimeArc(ctx, x, y, radius, danger ? COLORS.red : accent);
  }

  drawGlow(ctx, x, y, radius, color, alpha) {
    drawRing(ctx, x, y, radius + 10, color, alpha, 1);
    drawRing(ctx, x, y, radius + 22, color, alpha * 0.45, 1);
    if (this.hoverAmount > 0.02) {
      drawRing(ctx, x, y, radius + 36, color, alpha * this.hoverAmount, 1);
    }
  }

  drawBody(ctx, x, y, radius, base, accent, dim, time) {
    const innerRadius = Math.max(8, radius - 13);
    const coreRadius = Math.max(5, radius - 25);

    drawRing(ctx, x, y, radius, base, 0.92, 2);
    drawRing(ctx, x, y, innerRadius, dim, 0.78, 1);
    drawRing(ctx, x, y, coreRadius, accent, 0.34 + this.hoverAmount * 0.38, 1);

    ctx.fillStyle = withAlpha(dim, 0.12 + this.hoverAmount * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
    ctx.fill();

    const sweepStart = time * 1.8 + this.phase;
    drawRing(ctx, x, y, radius - 6, accent, 0.82, 1, sweepStart, sweepStart + Math.PI * 0.72);
    drawRing(ctx, x, y, radius + 5, base, 0.3, 1, -sweepStart * 0.7, -sweepStart * 0.7 + Math.PI * 0.44);

    if (this.type === "unstable") {
      drawPixelLine(ctx, x - radius + 8, y - radius + 7, x - radius + 24, y - radius + 7, COLORS.orangeHot, 0.9, 2);
      drawPixelLine(ctx, x + radius - 24, y + radius - 7, x + radius - 8, y + radius - 7, COLORS.orangeHot, 0.9, 2);
    }
  }

  drawCardinalMarks(ctx, x, y, radius, color) {
    const gap = 8;
    const length = 17 + Math.round(this.hoverAmount * 8);

    drawPixelLine(ctx, x - radius - length, y, x - radius - gap, y, color, 0.9);
    drawPixelLine(ctx, x + radius + gap, y, x + radius + length, y, color, 0.9);
    drawPixelLine(ctx, x, y - radius - length, x, y - radius - gap, color, 0.9);
    drawPixelLine(ctx, x, y + radius + gap, x, y + radius + length, color, 0.9);
  }

  drawSymbol(ctx, x, y, color) {
    const size = this.type === "unstable" ? 22 : 18;
    drawText(ctx, this.symbol, x, y - size * 0.48, COLORS.white, size, "center");
    drawText(ctx, String(this.value), x, y + 15, color, 10, "center");
  }

  drawLifetimeArc(ctx, x, y, radius, color) {
    const remaining = 1 - this.progress;
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * remaining;
    drawRing(ctx, x, y, radius + 15, color, 0.74, 2, start, end);
  }
}
