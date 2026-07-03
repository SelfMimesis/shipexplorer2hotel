import { COLORS, GAME_WIDTH, PLAYFIELD } from "../constants.js";
import { clamp, drawBar, drawPixelLine, drawRing, drawText, rand, withAlpha } from "../utils.js";

const ASSET_SIZE = 360;
const CORE_X = 211.6;
const CORE_Y = 180;
const BOSS_SCALE = 0.92;
const BOSS_RADIUS = 124;
const CORE_RADIUS = 30;
const MAX_HP = 20;
const PROJECTILE_LIFE = 7.8;
const PROJECTILE_START = "#8830BF";
const PROJECTILE_END = "#FF2F55";

const LAYERS = [
  { src: "assets/boss/CorpRim4.svg", speed: 0.34, alpha: 0.9, offset: 0 },
  { src: "assets/boss/CorpRim3.svg", speed: -0.46, alpha: 0.94, offset: Math.PI * 0.12 },
  { src: "assets/boss/CorpRim2.svg", speed: 0.62, alpha: 1, offset: Math.PI * 0.24 },
  { src: "assets/boss/CorpRim1.svg", speed: 0.08, alpha: 1, offset: 0 },
];

const ORBIT_BLUEPRINTS = [
  { targetRadius: 116, angle: -2.78, size: 17, angularSpeed: 0.74, radialEase: 2.4 },
  { targetRadius: 104, angle: -2.08, size: 21, angularSpeed: 0.94, radialEase: 2.1 },
  { targetRadius: 76, angle: -1.35, size: 18, angularSpeed: 1.08, radialEase: 2.8 },
  { targetRadius: 69, angle: 2.28, size: 12, angularSpeed: 1.22, radialEase: 3 },
  { targetRadius: 118, angle: 1.58, size: 18, angularSpeed: 0.66, radialEase: 2.2 },
];

const hexToRgb = (hex) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const mixHex = (from, to, amount) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = clamp(amount, 0, 1);
  const r = Math.round(a.r + (b.r - a.r) * t).toString(16).padStart(2, "0");
  const g = Math.round(a.g + (b.g - a.g) * t).toString(16).padStart(2, "0");
  const bl = Math.round(a.b + (b.b - a.b) * t).toString(16).padStart(2, "0");
  return `#${r}${g}${bl}`;
};

const makeImage = (src) => {
  if (typeof Image === "undefined") return null;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image;
};

export class Boss {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.layers = LAYERS.map((layer) => ({ ...layer, image: makeImage(layer.src) }));
    this.onProjectileExpire = null;
    this.reset();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  setProjectileExpireHandler(callback) {
    this.onProjectileExpire = callback;
    for (const projectile of this.projectiles) {
      projectile.onExpire = callback;
    }
  }

  reset() {
    this.x = PLAYFIELD.right - 250;
    this.y = Math.round((PLAYFIELD.top + PLAYFIELD.bottom) / 2);
    this.vx = -44;
    this.vy = 32;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.radius = BOSS_RADIUS;
    this.coreRadius = CORE_RADIUS;
    this.rotation = 0;
    this.orbitPhase = 0;
    this.orbitBubbles = ORBIT_BLUEPRINTS.map((_, index) => {
      const bubble = this.createOrbitBubble(index);
      bubble.radius = bubble.targetRadius;
      return bubble;
    });
    this.launchTimer = 0.9;
    this.launchIndex = 0;
    this.projectiles = [];
    this.hitFlash = 0;
    this.defeated = false;
    this.explosionAge = 0;
    this.explosionLife = 1.45;
  }

  get active() {
    return !this.defeated;
  }

  get explosionComplete() {
    return this.defeated && this.explosionAge >= this.explosionLife;
  }

  update(dt, game) {
    this.rotation += dt * (this.reducedMotion ? 0.22 : 1);
    this.orbitPhase += dt * (this.reducedMotion ? 0.18 : 0.72);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.defeated) {
      this.explosionAge += dt;
      this.updateProjectiles(dt);
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.bounceInsideField();
    this.updateOrbitBubbles(dt);

    this.launchTimer -= dt;
    if (this.launchTimer <= 0) {
      this.launchOrbitBubble();
      this.launchTimer = this.reducedMotion ? 1.85 : rand(1.05, 1.45);
    }

    this.updateProjectiles(dt);
  }

  bounceInsideField() {
    const minX = PLAYFIELD.left + this.radius;
    const maxX = PLAYFIELD.right - this.radius;
    const minY = PLAYFIELD.top + this.radius;
    const maxY = PLAYFIELD.bottom - this.radius;

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

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.age += dt;
      projectile.phase += projectile.spin * dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.spinAngle += projectile.spin * dt;

      this.bounceProjectile(projectile);

      const distanceFromBoss = Math.hypot(projectile.x - this.x, projectile.y - this.y);
      projectile.morph = clamp((distanceFromBoss - this.radius) / 54, 0, 1);

      if (projectile.age >= projectile.life && !projectile.dead) {
        projectile.dead = true;
        projectile.escaped = true;
        projectile.onExpire?.(projectile);
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
  }

  bounceProjectile(projectile) {
    const minX = PLAYFIELD.left + projectile.radius;
    const maxX = PLAYFIELD.right - projectile.radius;
    const minY = PLAYFIELD.top + projectile.radius;
    const maxY = PLAYFIELD.bottom - projectile.radius;

    if (projectile.x < minX) {
      projectile.x = minX;
      projectile.vx = Math.abs(projectile.vx);
    } else if (projectile.x > maxX) {
      projectile.x = maxX;
      projectile.vx = -Math.abs(projectile.vx);
    }

    if (projectile.y < minY) {
      projectile.y = minY;
      projectile.vy = Math.abs(projectile.vy);
    } else if (projectile.y > maxY) {
      projectile.y = maxY;
      projectile.vy = -Math.abs(projectile.vy);
    }
  }

  createOrbitBubble(index, angleSeed = 0) {
    const blueprint = ORBIT_BLUEPRINTS[index % ORBIT_BLUEPRINTS.length];
    const targetRadius = blueprint.targetRadius + rand(-6, 7);

    return {
      index,
      targetRadius,
      radius: this.coreRadius + blueprint.size + rand(10, 22),
      angle: blueprint.angle + angleSeed + rand(-0.18, 0.18),
      size: blueprint.size,
      angularSpeed: blueprint.angularSpeed + rand(-0.08, 0.08),
      radialEase: blueprint.radialEase,
      phase: rand(0, Math.PI * 2),
    };
  }

  updateOrbitBubbles(dt) {
    const speedScale = this.reducedMotion ? 0.45 : 1;

    for (const bubble of this.orbitBubbles) {
      bubble.angle += bubble.angularSpeed * speedScale * dt;
      bubble.phase += dt * (1.4 + bubble.index * 0.18) * speedScale;

      const ease = 1 - Math.pow(0.015, dt * bubble.radialEase);
      bubble.radius += (bubble.targetRadius - bubble.radius) * ease;
    }
  }

  getOrbitBubblePosition(bubble) {
    const spiralPulse = Math.sin(this.orbitPhase * 2.1 + bubble.phase) * 3.5;
    const radius = bubble.radius + spiralPulse;

    return {
      ...bubble,
      orbitRadius: radius,
      x: this.x + Math.cos(bubble.angle) * radius,
      y: this.y + Math.sin(bubble.angle) * radius,
    };
  }

  launchOrbitBubble() {
    if (!this.orbitBubbles.length) return;

    const orbitIndex = this.launchIndex % this.orbitBubbles.length;
    const orbitBubble = this.orbitBubbles[orbitIndex];
    const node = this.getOrbitBubblePosition(orbitBubble);
    this.launchIndex += 1;

    const dx = node.x - this.x;
    const dy = node.y - this.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const outwardX = dx / length;
    const outwardY = dy / length;
    const tangentX = -outwardY;
    const tangentY = outwardX;
    const power = rand(72, 98);
    const tangentPower = node.angularSpeed * node.orbitRadius * 0.34 + rand(10, 26);

    this.projectiles.push({
      x: node.x,
      y: node.y,
      vx: outwardX * power + tangentX * tangentPower + this.vx * 0.18,
      vy: outwardY * power + tangentY * tangentPower + this.vy * 0.18,
      radius: node.size,
      age: 0,
      life: PROJECTILE_LIFE,
      phase: rand(0, Math.PI * 2),
      spin: rand(-3.2, 3.2),
      spinAngle: rand(0, Math.PI * 2),
      morph: 0,
      dead: false,
      escaped: false,
      onExpire: this.onProjectileExpire,
    });

    const replacement = this.createOrbitBubble(orbitIndex);
    replacement.angle = node.angle + Math.PI * 0.34 + rand(-0.12, 0.12);
    this.orbitBubbles[orbitIndex] = replacement;
  }

  hitCore(x, y, radius = 0) {
    if (this.defeated) return false;
    return Math.hypot(x - this.x, y - this.y) <= this.coreRadius + radius;
  }

  touchesShip(ship, shipRadius) {
    if (this.defeated) return false;
    return Math.hypot(ship.x - this.x, ship.y - this.y) <= this.radius + shipRadius;
  }

  takeHit() {
    if (this.defeated) return false;
    this.hp = Math.max(0, this.hp - 1);
    this.hitFlash = 0.18;

    if (this.hp <= 0) {
      this.defeated = true;
      this.explosionAge = 0;
      this.projectiles = [];
    }

    return true;
  }

  findProjectileAt(x, y, radius = 0) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      if (projectile.dead) continue;
      if (Math.hypot(projectile.x - x, projectile.y - y) <= projectile.radius + radius) {
        return projectile;
      }
    }

    return null;
  }

  popProjectile(projectile) {
    if (!projectile || projectile.dead) return false;
    projectile.dead = true;
    return true;
  }

  render(ctx, game) {
    if (this.defeated) {
      this.drawExplosion(ctx);
      return;
    }

    this.drawBody(ctx, game);
    this.drawOrbitBubbles(ctx);
    this.drawProjectiles(ctx);
    this.drawCoreTarget(ctx);
  }

  drawBody(ctx, game) {
    const pulse = this.hitFlash > 0 ? Math.sin(game.totalTime * 80) * 2 : 0;

    drawRing(ctx, this.x, this.y, this.radius + 10 + pulse, COLORS.orange, 0.16 + this.hitFlash, 1);
    drawRing(ctx, this.x, this.y, this.radius - 12, COLORS.cyan, 0.13, 1);

    for (const layer of this.layers) {
      const rotation = this.rotation * layer.speed + layer.offset;
      ctx.save();
      ctx.translate(Math.round(this.x), Math.round(this.y));
      ctx.rotate(rotation);
      ctx.globalAlpha = layer.alpha;

      if (layer.image?.complete && layer.image.naturalWidth > 0) {
        ctx.drawImage(layer.image, -CORE_X * BOSS_SCALE, -CORE_Y * BOSS_SCALE, ASSET_SIZE * BOSS_SCALE, ASSET_SIZE * BOSS_SCALE);
      } else {
        this.drawFallbackLayer(ctx, layer);
      }

      ctx.restore();
    }
  }

  drawFallbackLayer(ctx, layer) {
    const radius = this.radius * (0.7 + Math.abs(layer.speed) * 0.2);
    drawRing(ctx, 0, 0, radius, COLORS.cyan, 0.48, 4, -Math.PI * 0.72, Math.PI * 0.72);
    drawRing(ctx, 0, 0, radius - 24, COLORS.amber, 0.4, 3, -Math.PI * 0.48, Math.PI * 0.48);
  }

  drawOrbitBubbles(ctx) {
    for (let i = 0; i < this.orbitBubbles.length; i += 1) {
      const node = this.getOrbitBubblePosition(this.orbitBubbles[i]);
      const pulse = Math.sin(node.phase) * 1.4;
      const radius = node.size + pulse;
      const coreColor = mixHex(PROJECTILE_START, PROJECTILE_END, 0.18 + i * 0.12);

      ctx.fillStyle = COLORS.black;
      ctx.beginPath();
      ctx.arc(Math.round(node.x), Math.round(node.y), Math.round(radius + 2), 0, Math.PI * 2);
      ctx.fill();
      drawRing(ctx, node.x, node.y, radius + 6, COLORS.amber, 0.22, 1);
      drawRing(ctx, node.x, node.y, radius, COLORS.amber, 0.96, 2);
      drawRing(ctx, node.x, node.y, Math.max(4, radius * 0.56), coreColor, 0.72, 1);
      drawRing(ctx, node.x, node.y, Math.max(3, radius * 0.3), PROJECTILE_START, 0.58, 1);
      drawText(ctx, "!", node.x, node.y - 10, COLORS.amber, 16, "center");
    }
  }

  drawProjectiles(ctx) {
    for (const projectile of this.projectiles) {
      const simpleAlpha = 1 - projectile.morph;
      const bubbleAlpha = projectile.morph;
      const radius = projectile.radius + Math.sin(projectile.phase) * 1.5;
      const lifeProgress = clamp(projectile.age / projectile.life, 0, 1);
      const color = mixHex(PROJECTILE_START, PROJECTILE_END, lifeProgress);
      const accent = mixHex(COLORS.magentaHot, COLORS.heart, lifeProgress);
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * (1 - lifeProgress);

      if (simpleAlpha > 0.02) {
        ctx.fillStyle = withAlpha(COLORS.black, 0.96 * simpleAlpha);
        ctx.beginPath();
        ctx.arc(Math.round(projectile.x), Math.round(projectile.y), Math.round(radius), 0, Math.PI * 2);
        ctx.fill();
        drawRing(ctx, projectile.x, projectile.y, radius + 5, COLORS.amber, 0.18 * simpleAlpha, 1);
        drawRing(ctx, projectile.x, projectile.y, radius, COLORS.amber, 0.92 * simpleAlpha, 2);
        drawRing(ctx, projectile.x, projectile.y, Math.max(5, radius * 0.56), color, 0.66 * simpleAlpha, 1);
      }

      if (bubbleAlpha > 0.02) {
        const grown = radius + bubbleAlpha * 6;

        drawRing(ctx, projectile.x, projectile.y, grown + 13, accent, 0.22 * bubbleAlpha, 1);
        drawRing(ctx, projectile.x, projectile.y, grown, color, 0.86 * bubbleAlpha, 2);
        drawRing(ctx, projectile.x, projectile.y, grown - 9, COLORS.violetBright, 0.5 * bubbleAlpha, 1);
        drawRing(ctx, projectile.x, projectile.y, Math.max(5, grown - 21), accent, 0.42 * bubbleAlpha, 1);
        drawRing(ctx, projectile.x, projectile.y, grown + 17, COLORS.amber, 0.78 * bubbleAlpha, 2, start, end);
        drawPixelLine(ctx, projectile.x - grown - 12, projectile.y, projectile.x - grown - 4, projectile.y, accent, 0.72 * bubbleAlpha);
        drawPixelLine(ctx, projectile.x + grown + 4, projectile.y, projectile.x + grown + 12, projectile.y, accent, 0.72 * bubbleAlpha);
        drawPixelLine(ctx, projectile.x, projectile.y - grown - 12, projectile.x, projectile.y - grown - 4, accent, 0.58 * bubbleAlpha);
        drawPixelLine(ctx, projectile.x, projectile.y + grown + 4, projectile.x, projectile.y + grown + 12, accent, 0.58 * bubbleAlpha);
      }

      const timerRadius = radius + 17 + bubbleAlpha * 6;
      const warningSize = Math.max(15, Math.round(radius * 0.88));
      drawRing(ctx, projectile.x, projectile.y, timerRadius, COLORS.amber, 0.84, 2, start, end);
      drawText(ctx, "!", projectile.x + 1, projectile.y - warningSize * 0.54 + 1, COLORS.black, warningSize, "center");
      drawText(ctx, "!", projectile.x, projectile.y - warningSize * 0.54, COLORS.amber, warningSize, "center");
    }
  }

  drawCoreTarget(ctx) {
    const flash = this.hitFlash > 0 ? this.hitFlash * 3 : 0;
    if (this.hitFlash > 0) {
      ctx.fillStyle = withAlpha(COLORS.heart, clamp(this.hitFlash * 4, 0, 0.86));
      ctx.beginPath();
      ctx.arc(Math.round(this.x), Math.round(this.y), Math.round(this.coreRadius + flash), 0, Math.PI * 2);
      ctx.fill();
    }

    drawRing(ctx, this.x, this.y, this.coreRadius + 8 + flash, this.hitFlash > 0 ? COLORS.heart : COLORS.amber, 0.4 + this.hitFlash, 2);
    drawRing(ctx, this.x, this.y, this.coreRadius, COLORS.white, 0.25 + this.hitFlash * 0.4, 1);
    drawPixelLine(ctx, this.x - 44, this.y, this.x - 24, this.y, COLORS.orange, 0.72);
    drawPixelLine(ctx, this.x + 24, this.y, this.x + 44, this.y, COLORS.orange, 0.72);
    drawPixelLine(ctx, this.x, this.y - 44, this.x, this.y - 24, COLORS.orange, 0.72);
    drawPixelLine(ctx, this.x, this.y + 24, this.x, this.y + 44, COLORS.orange, 0.72);
  }

  drawHealth(ctx) {
    const x = Math.round(this.x - 70);
    const y = Math.round(this.y - this.radius - 36);
    drawText(ctx, "CORP RIM CORE", x, y - 18, COLORS.muted, 10);
    drawBar(ctx, x, y, 140, 8, this.hp / this.maxHp, this.hp <= 6 ? COLORS.orangeHot : COLORS.orange, withAlpha(COLORS.violet, 0.35));
    drawText(ctx, String(this.hp).padStart(2, "0"), x + 152, y - 3, COLORS.white, 12);
  }

  drawExplosion(ctx) {
    const progress = clamp(this.explosionAge / this.explosionLife, 0, 1);
    const alpha = 1 - progress;
    const radius = this.radius * (0.35 + progress * 1.4);

    drawRing(ctx, this.x, this.y, radius, COLORS.orange, alpha, 3);
    drawRing(ctx, this.x, this.y, radius * 0.66, COLORS.amber, alpha * 0.72, 2);
    drawRing(ctx, this.x, this.y, radius * 0.34, COLORS.cyan, alpha * 0.48, 1);

    for (let i = 0; i < 18; i += 1) {
      const angle = (Math.PI * 2 * i) / 18 + progress * 1.6;
      const inner = 28 + progress * 70;
      const outer = inner + 52 * alpha;
      drawPixelLine(
        ctx,
        this.x + Math.cos(angle) * inner,
        this.y + Math.sin(angle) * inner,
        this.x + Math.cos(angle) * outer,
        this.y + Math.sin(angle) * outer,
        i % 3 === 0 ? COLORS.amber : COLORS.orange,
        alpha,
        2
      );
    }

    if (progress < 0.55) {
      ctx.fillStyle = withAlpha(COLORS.white, (0.55 - progress) * 0.45);
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
  }
}
