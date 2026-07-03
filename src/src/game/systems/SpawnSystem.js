import { GAME_RULES, PLAYFIELD } from "../constants.js";
import { clamp, rand, randInt } from "../utils.js";
import { Bubble } from "../entities/Bubble.js";

export const DIFFICULTIES = {
  CALM: {
    spawnEvery: 1.5,
    minSpawnEvery: 0.76,
    maxBubbles: 7,
    speedScale: 0.68,
    lifetimeScale: 1.35,
    radiusScale: 1.12,
    unstableWeight: 0.06,
    scoreScale: 0.9,
    bonusEvery: 7,
  },
  NORMAL: {
    spawnEvery: 1.12,
    minSpawnEvery: 0.52,
    maxBubbles: 10,
    speedScale: 1,
    lifetimeScale: 1,
    radiusScale: 1,
    unstableWeight: 0.16,
    scoreScale: 1,
    bonusEvery: 6,
  },
  OVERCLOCK: {
    spawnEvery: 0.84,
    minSpawnEvery: 0.34,
    maxBubbles: 15,
    speedScale: 1.28,
    lifetimeScale: 0.78,
    radiusScale: 0.88,
    unstableWeight: 0.3,
    scoreScale: 1.22,
    bonusEvery: 5,
  },
};

const BASE_VALUES = {
  normal: 100,
  bonus: 260,
  unstable: 180,
};

export class SpawnSystem {
  constructor(difficulty = "NORMAL") {
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "NORMAL";
    this.bubbles = [];
    this.timer = 0;
    this.spawned = 0;
    this.popped = 0;
    this.bonusQueued = false;
  }

  get preset() {
    return DIFFICULTIES[this.difficulty];
  }

  reset(difficulty = this.difficulty) {
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "NORMAL";
    this.bubbles = [];
    this.timer = 0.2;
    this.spawned = 0;
    this.popped = 0;
    this.bonusQueued = false;
  }

  update(dt, game) {
    this.timer -= dt;

    if (this.timer <= 0 && this.bubbles.length < this.getMaxBubbles(game.elapsed)) {
      this.spawn(game.elapsed);
      this.timer = this.getSpawnDelay(game.elapsed);
    }

    for (const bubble of this.bubbles) {
      bubble.update(dt, PLAYFIELD, game.pointer);

      if (bubble.expired && !bubble.reported) {
        bubble.reported = true;
        game.handleBubbleExpired(bubble);
      }
    }

    this.bubbles = this.bubbles.filter((bubble) => !bubble.popped && !(bubble.expired && bubble.reported));
  }

  spawn(elapsed = 0, forcedType = null) {
    const type = forcedType ?? this.pickType();
    const radius = this.getRadius(type, elapsed);
    const speed = this.getSpeed(type, elapsed);
    const angle = rand(0, Math.PI * 2);
    const bubble = new Bubble({
      type,
      x: rand(PLAYFIELD.left + radius, PLAYFIELD.right - radius),
      y: rand(PLAYFIELD.top + radius, PLAYFIELD.bottom - radius),
      radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifetime: this.getLifetime(type, elapsed),
      value: this.getValue(type, elapsed),
    });

    this.bubbles.push(bubble);
    this.spawned += 1;
    return bubble;
  }

  pickType() {
    if (this.bonusQueued) {
      this.bonusQueued = false;
      return "bonus";
    }

    const unstable = this.preset.unstableWeight;
    const bonus = 0.08;
    const roll = Math.random();

    if (roll < unstable) return "unstable";
    if (roll < unstable + bonus) return "bonus";
    return "normal";
  }

  getSpawnDelay(elapsed) {
    const stage = Math.floor(elapsed / 10);
    const progress = clamp(elapsed / GAME_RULES.duration, 0, 1);
    const base = this.preset.spawnEvery + (this.preset.minSpawnEvery - this.preset.spawnEvery) * progress;
    const stageBoost = Math.max(0.58, 1 - stage * 0.065);
    return rand(base * stageBoost * 0.82, base * stageBoost * 1.18);
  }

  getMaxBubbles(elapsed) {
    const stage = Math.floor(elapsed / 10);
    return this.preset.maxBubbles + Math.floor(stage / 3);
  }

  getRadius(type, elapsed) {
    const progress = clamp(elapsed / GAME_RULES.duration, 0, 1);
    const base = type === "bonus" ? randInt(24, 38) : type === "unstable" ? randInt(22, 34) : randInt(28, 44);
    const shrink = 1 - progress * 0.24;
    return Math.round(clamp(base * this.preset.radiusScale * shrink, 18, 52));
  }

  getSpeed(type, elapsed) {
    const progress = clamp(elapsed / GAME_RULES.duration, 0, 1);
    const typeScale = type === "unstable" ? 1.18 : type === "bonus" ? 1.04 : 1;
    return rand(28, 74) * this.preset.speedScale * typeScale * (1 + progress * 0.22);
  }

  getLifetime(type, elapsed) {
    const progress = clamp(elapsed / GAME_RULES.duration, 0, 1);
    const base = type === "unstable" ? rand(4.1, 6.4) : type === "bonus" ? rand(5.5, 8) : rand(7.4, 10.4);
    return base * this.preset.lifetimeScale * (1 - progress * 0.16);
  }

  getValue(type, elapsed) {
    const progress = clamp(elapsed / GAME_RULES.duration, 0, 1);
    const overclockPotential = 1 + progress * 0.18;
    return Math.round(BASE_VALUES[type] * this.preset.scoreScale * overclockPotential);
  }

  findAt(x, y, extraRadius = 8) {
    for (let i = this.bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = this.bubbles[i];
      if (bubble.containsPoint(x, y, extraRadius)) return bubble;
    }

    return null;
  }

  pop(bubble) {
    if (!bubble || !bubble.pop()) return false;

    bubble.reported = true;
    this.popped += 1;

    if (this.popped > 0 && this.popped % this.preset.bonusEvery === 0) {
      this.bonusQueued = true;
    }

    this.bubbles = this.bubbles.filter((item) => item !== bubble);
    return true;
  }

  draw(ctx, time) {
    for (const bubble of this.bubbles) {
      bubble.draw(ctx, time);
    }
  }
}
