import { COLORS, GAME_WIDTH } from "../constants.js";
import { clamp, drawPixelLine, drawRect, drawRing, rand, withAlpha } from "../utils.js";

const TYPE_COLORS = {
  normal: COLORS.cyan,
  bonus: COLORS.amber,
  unstable: COLORS.red,
};

export class ShockwaveSystem {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.waves = [];
    this.flashes = [];
    this.glitches = [];
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  reset() {
    this.waves = [];
    this.flashes = [];
    this.glitches = [];
  }

  emitPop(x, y, type = "normal") {
    const color = TYPE_COLORS[type] ?? COLORS.cyan;

    this.waves.push({
      x,
      y,
      type,
      color,
      age: 0,
      life: this.reducedMotion ? 0.24 : type === "bonus" ? 0.5 : 0.38,
      radius: type === "bonus" ? 112 : type === "unstable" ? 92 : 76,
      width: type === "bonus" ? 3 : 2,
    });

    this.flashes.push({
      x,
      y,
      color,
      age: 0,
      life: this.reducedMotion ? 0.08 : 0.14,
      radius: type === "bonus" ? 86 : 64,
    });

    if (type === "unstable" && !this.reducedMotion) {
      for (let i = 0; i < 8; i += 1) {
        this.glitches.push({
          x,
          y: y + rand(-42, 42),
          age: 0,
          life: rand(0.08, 0.18),
          length: rand(48, 120),
          offset: rand(-24, 24),
          color: i % 2 === 0 ? COLORS.red : COLORS.cyan,
        });
      }
    }
  }

  add(x, y, color = COLORS.cyan, radius = 76) {
    this.waves.push({ x, y, color, radius, age: 0, life: 0.34, width: 1, type: "normal" });
  }

  update(dt) {
    for (const wave of this.waves) wave.age += dt;
    for (const flash of this.flashes) flash.age += dt;
    for (const glitch of this.glitches) glitch.age += dt;

    this.waves = this.waves.filter((wave) => wave.age < wave.life);
    this.flashes = this.flashes.filter((flash) => flash.age < flash.life);
    this.glitches = this.glitches.filter((glitch) => glitch.age < glitch.life);
  }

  render(ctx) {
    for (const flash of this.flashes) {
      const progress = flash.age / flash.life;
      const alpha = (1 - progress) * 0.2;
      const radius = flash.radius * (0.45 + progress * 0.55);

      ctx.fillStyle = withAlpha(flash.color, alpha);
      ctx.beginPath();
      ctx.arc(Math.round(flash.x), Math.round(flash.y), Math.round(radius), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const wave of this.waves) {
      const progress = wave.age / wave.life;
      const alpha = clamp(1 - progress, 0, 1);
      const radius = Math.max(2, wave.radius * progress);
      const x = Math.round(wave.x);
      const y = Math.round(wave.y);

      drawRing(ctx, x, y, radius, wave.color, alpha, wave.width);
      drawRing(ctx, x, y, radius * 0.62, wave.color, alpha * 0.28, 1, progress * Math.PI, progress * Math.PI + Math.PI * 1.45);

      drawPixelLine(ctx, x - radius - 12, y, x - radius + 18, y, wave.color, alpha * 0.8);
      drawPixelLine(ctx, x + radius - 18, y, x + radius + 12, y, wave.color, alpha * 0.8);
      drawPixelLine(ctx, x, y - radius - 12, x, y - radius + 18, wave.color, alpha * 0.8);
      drawPixelLine(ctx, x, y + radius - 18, x, y + radius + 12, wave.color, alpha * 0.8);
    }

    for (const glitch of this.glitches) {
      const progress = glitch.age / glitch.life;
      const alpha = clamp(1 - progress, 0, 1);
      const x = Math.round(glitch.x + glitch.offset * (1 - progress));
      const y = Math.round(glitch.y);

      drawPixelLine(ctx, x - glitch.length * 0.5, y, x + glitch.length * 0.5, y, glitch.color, alpha, 2);
      drawRect(ctx, clamp(x - glitch.length * 0.32, 0, GAME_WIDTH), y + 4, glitch.length * 0.28, 3, null, withAlpha(glitch.color, alpha * 0.34), 1);
    }
  }

  draw(ctx) {
    this.render(ctx);
  }
}
