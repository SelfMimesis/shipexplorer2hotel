import { COLORS } from "../constants.js";
import { clamp, drawText, rand, withAlpha } from "../utils.js";

export class FloatingTextSystem {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.items = [];
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  reset() {
    this.items = [];
  }

  add(text, x, y, color = COLORS.cyan, size = 22, options = {}) {
    this.items.push({
      text,
      x,
      y,
      baseX: x,
      color,
      size,
      age: 0,
      life: options.life ?? 0.82,
      vy: this.reducedMotion ? -22 : options.vy ?? -62,
      type: options.type ?? "normal",
      glitch: options.glitch ?? false,
    });
  }

  emitPop(x, y, value, type = "normal", multiplier = 1) {
    const color = type === "bonus" ? COLORS.orange : type === "unstable" ? COLORS.orangeHot : COLORS.cyan;
    const amount = `+${Math.round(value)}`;
    const suffix = multiplier > 1 ? ` X${multiplier.toFixed(2)}` : "";

    this.add(`${amount}${suffix}`, x, y - 54, color, type === "bonus" ? 24 : 22, {
      type,
      glitch: type === "unstable",
      life: type === "bonus" ? 0.95 : 0.78,
    });
  }

  update(dt) {
    for (const item of this.items) {
      item.age += dt;
      item.y += item.vy * dt;
      if (item.glitch && !this.reducedMotion) {
        item.x = item.baseX + Math.round(Math.sin(item.age * 70) * rand(2, 8));
      }
    }

    this.items = this.items.filter((item) => item.age < item.life);
  }

  render(ctx) {
    for (const item of this.items) {
      const progress = item.age / item.life;
      const alpha = clamp(1 - progress, 0, 1);
      const y = Math.round(item.y);
      const x = Math.round(item.x);

      drawText(ctx, item.text, x + 2, y + 2, withAlpha(COLORS.black, alpha * 0.7), item.size, "center");
      drawText(ctx, item.text, x, y, withAlpha(item.color, alpha), item.size, "center");

      if (item.glitch && !this.reducedMotion && Math.floor(item.age * 40) % 2 === 0) {
        drawText(ctx, item.text, x + 8, y - 4, withAlpha(COLORS.red, alpha * 0.38), item.size, "center");
        drawText(ctx, item.text, x - 6, y + 3, withAlpha(COLORS.cyan, alpha * 0.24), item.size, "center");
      }
    }
  }

  draw(ctx) {
    this.render(ctx);
  }
}
