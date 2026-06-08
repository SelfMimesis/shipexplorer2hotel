import { COLORS } from "../constants.js";
import { clamp, drawPixelLine, rand, randInt, withAlpha } from "../utils.js";

const TYPE_COLORS = {
  normal: COLORS.cyan,
  bonus: COLORS.amber,
  unstable: COLORS.red,
};

export class ParticleSystem {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.particles = [];
    this.segments = [];
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  reset() {
    this.particles = [];
    this.segments = [];
  }

  emitPop(x, y, type = "normal", value = 0) {
    const color = TYPE_COLORS[type] ?? COLORS.cyan;
    const countBase = type === "bonus" ? 34 : type === "unstable" ? 30 : 24;
    const count = this.reducedMotion ? Math.ceil(countBase * 0.38) : countBase;
    const segmentCount = this.reducedMotion ? 5 : type === "bonus" ? 14 : 10;
    const power = type === "bonus" ? 250 : type === "unstable" ? 230 : 190;

    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(power * 0.28, power);
      const unstableJitter = type === "unstable" ? rand(-28, 28) : 0;

      this.particles.push({
        x: x + rand(-3, 3),
        y: y + rand(-3, 3),
        vx: Math.cos(angle) * speed + unstableJitter,
        vy: Math.sin(angle) * speed + rand(-12, 12),
        age: 0,
        life: rand(0.18, type === "bonus" ? 0.64 : 0.48),
        size: randInt(2, type === "bonus" ? 5 : 4),
        color: i % 5 === 0 ? COLORS.white : color,
        drag: rand(3.2, 5.8),
        jitter: type === "unstable" ? rand(0.6, 2.2) : 0,
      });
    }

    for (let i = 0; i < segmentCount; i += 1) {
      const angle = (Math.PI * 2 * i) / segmentCount + rand(-0.16, 0.16);
      const length = rand(28, type === "bonus" ? 72 : 56);
      const speed = rand(150, 250);

      this.segments.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle,
        length,
        age: 0,
        life: rand(0.16, 0.32),
        color,
        value,
      });
    }
  }

  emitBurst(x, y, color = COLORS.cyan, count = 18, power = 160) {
    const safeCount = this.reducedMotion ? Math.ceil(count * 0.4) : count;

    for (let i = 0; i < safeCount; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(power * 0.35, power);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: rand(0.18, 0.48),
        size: randInt(1, 3),
        color,
        drag: rand(3, 5),
        jitter: 0,
      });
    }
  }

  emitMiss(x, y) {
    const count = this.reducedMotion ? 4 : 10;

    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: x + rand(-8, 8),
        y: y + rand(-8, 8),
        vx: rand(-70, 70),
        vy: rand(-70, 70),
        age: 0,
        life: rand(0.16, 0.3),
        size: 2,
        color: COLORS.red,
        drag: 4.8,
        jitter: 0,
      });
    }
  }

  update(dt) {
    for (const particle of this.particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx -= particle.vx * particle.drag * dt;
      particle.vy -= particle.vy * particle.drag * dt;
    }

    for (const segment of this.segments) {
      segment.age += dt;
      segment.x += segment.vx * dt;
      segment.y += segment.vy * dt;
      segment.vx -= segment.vx * 5.2 * dt;
      segment.vy -= segment.vy * 5.2 * dt;
    }

    this.particles = this.particles.filter((particle) => particle.age < particle.life);
    this.segments = this.segments.filter((segment) => segment.age < segment.life);
  }

  render(ctx) {
    for (const segment of this.segments) {
      const progress = segment.age / segment.life;
      const alpha = clamp(1 - progress, 0, 1);
      const half = segment.length * (1 - progress * 0.3) * 0.5;
      const dx = Math.cos(segment.angle) * half;
      const dy = Math.sin(segment.angle) * half;

      drawPixelLine(ctx, segment.x - dx, segment.y - dy, segment.x + dx, segment.y + dy, segment.color, alpha, 2);
    }

    for (const particle of this.particles) {
      const progress = particle.age / particle.life;
      const alpha = clamp(1 - progress, 0, 1);
      const jitterX = particle.jitter ? Math.round(Math.sin(particle.age * 80) * particle.jitter) : 0;
      const jitterY = particle.jitter ? Math.round(Math.cos(particle.age * 63) * particle.jitter) : 0;

      ctx.fillStyle = withAlpha(particle.color, alpha);
      ctx.fillRect(Math.round(particle.x) + jitterX, Math.round(particle.y) + jitterY, particle.size, particle.size);
    }
  }

  draw(ctx) {
    this.render(ctx);
  }
}
