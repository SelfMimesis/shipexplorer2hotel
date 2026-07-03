import {
  COLORS,
  FIXED_TIMESTEP,
  GAME_HEIGHT,
  GAME_RULES,
  GAME_STATES,
  GAME_WIDTH,
  MAX_FRAME_DELTA,
  MAX_UPDATES_PER_FRAME,
  PLAYFIELD,
} from "./constants.js";
import { clamp, drawPixelLine, drawRing, drawText, lerp, screenToCanvasPoint, withAlpha } from "./utils.js";
import { Boss } from "./entities/Boss.js";
import { BackgroundHudSystem } from "./systems/BackgroundHudSystem.js";
import { FloatingTextSystem } from "./systems/FloatingTextSystem.js";
import { ParticleSystem } from "./systems/ParticleSystem.js";
import { ShockwaveSystem } from "./systems/ShockwaveSystem.js";
import { DIFFICULTIES, SpawnSystem } from "./systems/SpawnSystem.js";
import { Hud } from "./ui/Hud.js";
import { Menu } from "./ui/Menu.js";

const SHIP_RADIUS = 24;
const SHIP_FIELD_RADIUS = 78;
const SHIP_FIELD_PULSE = 5;
const BULLET_SPEED = 520;
const BULLET_LIFE = 1.8;
const BULLET_RADIUS = 5;
const SHOOT_COOLDOWN = 0.26;

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.state = GAME_STATES.BOOT;
    this.previousState = null;
    this.stateTime = 0;
    this.totalTime = 0;
    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.frameId = 0;

    this.pointer = {
      x: Math.round(GAME_WIDTH / 2),
      y: Math.round(GAME_HEIGHT / 2),
      isDown: false,
      justPressed: false,
      justReleased: false,
    };

    this.keys = new Set();
    this.activePointers = new Map();
    this.activeDirection = null;

    this.reducedMotion = this.getReducedMotionPreference();
    this.settings = {
      crtScanlines: true,
      screenShake: true,
      reducedMotion: this.reducedMotion,
      highContrast: false,
      audio: true,
    };
    this.settingsBackState = GAME_STATES.TITLE;
    this.shakeTimer = 0;
    this.background = new BackgroundHudSystem({ reducedMotion: this.reducedMotion });
    this.hud = new Hud();
    this.menu = new Menu();
    this.difficulty = "NORMAL";
    this.spawn = new SpawnSystem(this.difficulty);
    this.boss = new Boss({ reducedMotion: this.reducedMotion });
    this.boss.setProjectileExpireHandler((projectile) => this.handleBossBubbleEscaped(projectile));
    this.particles = new ParticleSystem({ reducedMotion: this.reducedMotion });
    this.shockwaves = new ShockwaveSystem({ reducedMotion: this.reducedMotion });
    this.floatingText = new FloatingTextSystem({ reducedMotion: this.reducedMotion });
    this.ship = this.createShip();

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.accuracy = 1;
    this.multiplier = 1;
    this.hits = 0;
    this.attempts = 0;
    this.misses = 0;
    this.lastPopTime = -Infinity;
    this.unstableLeaks = 0;
    this.elapsed = 0;
    this.timeLeft = GAME_RULES.duration;
    this.gameOverReason = "RUN COMPLETE";
    this.victory = false;
    this.shipLives = GAME_RULES.lives;
    this.shipInvulnerable = 0;
    this.bullets = [];
    this.shootCooldown = 0;
    this.bossBubblePenaltyProgress = 0;
    this.bossBubblePenaltyProgress = 0;

    this.bindInput();
    this.bindMotionPreference();
  }

  getReducedMotionPreference() {
    return typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  }

  bindMotionPreference() {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => {
      this.reducedMotion = mediaQuery.matches;
      this.settings.reducedMotion = this.reducedMotion;
      this.background.setReducedMotion(this.reducedMotion);
      this.boss.setReducedMotion(this.reducedMotion);
      this.particles.setReducedMotion(this.reducedMotion);
      this.shockwaves.setReducedMotion(this.reducedMotion);
      this.floatingText.setReducedMotion(this.reducedMotion);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", applyPreference);
    }
  }

  createShip() {
    const x = PLAYFIELD.left + 160;
    const y = Math.round((PLAYFIELD.top + PLAYFIELD.bottom) / 2);

    return {
      x,
      y,
      prevX: x,
      prevY: y,
      vx: 90,
      vy: 0,
      driftX: 1,
      driftY: 0,
      angle: 0,
      speed: 185,
      autoAngle: 0.18,
      trailTimer: 0,
      trail: [],
      pulse: 0,
    };
  }

  start() {
    this.lastFrameTime = performance.now();
    this.frameId = requestAnimationFrame((time) => this.loop(time));
  }

  loop(now) {
    const rawDelta = (now - this.lastFrameTime) / 1000;
    const delta = clamp(Number.isFinite(rawDelta) ? rawDelta : 0, 0, MAX_FRAME_DELTA);
    this.lastFrameTime = now;
    this.accumulator += delta;

    let updates = 0;
    while (this.accumulator >= FIXED_TIMESTEP && updates < MAX_UPDATES_PER_FRAME) {
      this.fixedUpdate(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      updates += 1;
    }

    if (updates === MAX_UPDATES_PER_FRAME) {
      this.accumulator = 0;
    }

    this.render(this.accumulator / FIXED_TIMESTEP);
    this.frameId = requestAnimationFrame((time) => this.loop(time));
  }

  bindInput() {
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = this.updatePointerFromEvent(event);
      this.activePointers.set(event.pointerId, point);
      if (!this.pointer.isDown) this.pointer.justPressed = true;
      this.pointer.isDown = true;

      if (this.state === GAME_STATES.PLAYING && (this.hud.isPointInFireButton(point.x, point.y) || this.activePointers.size >= 2)) {
        this.requestShoot();
      }

      if (this.canvas.setPointerCapture) {
        this.canvas.setPointerCapture(event.pointerId);
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      event.preventDefault();
      const point = this.updatePointerFromEvent(event);
      if (this.activePointers.has(event.pointerId)) {
        this.activePointers.set(event.pointerId, point);
      }
    });

    this.canvas.addEventListener("pointerup", (event) => {
      event.preventDefault();
      this.updatePointerFromEvent(event);
      this.activePointers.delete(event.pointerId);
      if (this.pointer.isDown) this.pointer.justReleased = true;
      this.pointer.isDown = this.activePointers.size > 0;
      this.activeDirection = null;
    });

    this.canvas.addEventListener("pointercancel", (event) => {
      event.preventDefault();
      this.updatePointerFromEvent(event);
      this.activePointers.delete(event.pointerId);
      if (this.pointer.isDown) this.pointer.justReleased = true;
      this.pointer.isDown = this.activePointers.size > 0;
      this.activeDirection = null;
    });

    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.state === GAME_STATES.SETTINGS) {
          this.closeSettings();
        } else {
          this.togglePause();
        }
        return;
      }

      if ((event.key === "r" || event.key === "R") && this.state === GAME_STATES.GAME_OVER) {
        this.restartRun();
      }

      if ((event.key === " " || event.key === "Enter") && this.state === GAME_STATES.PLAYING) {
        event.preventDefault();
        this.requestShoot();
      }

      if (event.key === "1") this.setDifficulty("CALM");
      if (event.key === "2") this.setDifficulty("NORMAL");
      if (event.key === "3") this.setDifficulty("OVERCLOCK");

      if (this.isDirectionKey(event.key)) {
        this.keys.add(event.key.toLowerCase());
      }
    });

    window.addEventListener("keyup", (event) => {
      if (this.isDirectionKey(event.key)) {
        this.keys.delete(event.key.toLowerCase());
      }
    });
  }

  isDirectionKey(key) {
    return ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key.toLowerCase());
  }

  updatePointerFromEvent(event) {
    const point = screenToCanvasPoint(event, this.canvas, GAME_WIDTH, GAME_HEIGHT);
    this.pointer.x = point.x;
    this.pointer.y = point.y;
    return point;
  }

  changeState(nextState) {
    if (this.state === nextState) return;
    this.previousState = this.state;
    this.state = nextState;
    this.stateTime = 0;
  }

  setDifficulty(difficulty) {
    if (!DIFFICULTIES[difficulty]) return;
    this.difficulty = difficulty;
    this.spawn.difficulty = difficulty;
  }

  cycleDifficulty() {
    const order = ["CALM", "NORMAL", "OVERCLOCK"];
    const index = order.indexOf(this.difficulty);
    this.setDifficulty(order[(index + 1) % order.length]);
  }

  toggleSetting(key) {
    if (!(key in this.settings)) return;
    this.settings[key] = !this.settings[key];

    if (key === "reducedMotion") {
      this.setReducedMotion(this.settings.reducedMotion);
    }
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    this.settings.reducedMotion = this.reducedMotion;
    this.background.setReducedMotion(this.reducedMotion);
    this.boss.setReducedMotion(this.reducedMotion);
    this.particles.setReducedMotion(this.reducedMotion);
    this.shockwaves.setReducedMotion(this.reducedMotion);
    this.floatingText.setReducedMotion(this.reducedMotion);
  }

  resetRun() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.accuracy = 1;
    this.multiplier = 1;
    this.hits = 0;
    this.attempts = 0;
    this.misses = 0;
    this.lastPopTime = -Infinity;
    this.unstableLeaks = 0;
    this.elapsed = 0;
    this.timeLeft = GAME_RULES.duration;
    this.gameOverReason = "RUN COMPLETE";
    this.victory = false;
    this.shipLives = GAME_RULES.lives;
    this.shipInvulnerable = 0;
    this.bullets = [];
    this.shootCooldown = 0;
    this.activePointers.clear();
    this.pointer.isDown = false;
    this.pointer.justPressed = false;
    this.pointer.justReleased = false;
    this.ship = this.createShip();
    this.spawn.reset(this.difficulty);
    this.boss.reset();
    this.boss.setProjectileExpireHandler((projectile) => this.handleBossBubbleEscaped(projectile));
    this.background.reset();
    this.particles.reset();
    this.shockwaves.reset();
    this.floatingText.reset();
  }

  startRun() {
    this.resetRun();
    this.changeState(GAME_STATES.PLAYING);
  }

  restartRun() {
    this.startRun();
  }

  resumeRun() {
    this.changeState(GAME_STATES.PLAYING);
  }

  openSettings(backState = this.state) {
    this.settingsBackState = backState;
    this.changeState(GAME_STATES.SETTINGS);
  }

  closeSettings() {
    this.changeState(this.settingsBackState);
  }

  toTitle() {
    this.spawn.reset(this.difficulty);
    this.boss.reset();
    this.particles.reset();
    this.shockwaves.reset();
    this.floatingText.reset();
    this.changeState(GAME_STATES.TITLE);
  }

  togglePause() {
    if (this.state === GAME_STATES.PLAYING) {
      this.changeState(GAME_STATES.PAUSED);
    } else if (this.state === GAME_STATES.PAUSED) {
      this.changeState(GAME_STATES.PLAYING);
    }
  }

  endRun(reason, victory = false) {
    this.gameOverReason = reason;
    this.victory = Boolean(victory);
    this.changeState(GAME_STATES.GAME_OVER);
  }

  winRun() {
    if (this.victory) return;
    this.score += 2500;
    this.endRun("HAS GANADO", true);
  }

  fixedUpdate(dt) {
    this.totalTime += dt;
    this.stateTime += dt;
    this.ctx.imageSmoothingEnabled = false;
    this.background.update(dt, this);
    this.hud.update(dt, this);
    this.menu.update(dt, this);
    this.particles.update(dt);
    this.shockwaves.update(dt);
    this.floatingText.update(dt);
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.shipInvulnerable = Math.max(0, this.shipInvulnerable - dt);

    if (this.pointer.justPressed && this.handleMenuPointer()) {
      this.pointer.justPressed = false;
      this.pointer.justReleased = false;
      return;
    }

    if (this.state === GAME_STATES.BOOT) {
      this.updateBoot();
    } else if (this.state === GAME_STATES.TITLE) {
      this.updateTitle(dt);
    } else if (this.state === GAME_STATES.PLAYING) {
      this.updatePlaying(dt);
    } else if (this.state === GAME_STATES.GAME_OVER) {
      this.updateGameOver(dt);
    }

    this.pointer.justPressed = false;
    this.pointer.justReleased = false;
  }

  updateBoot() {
    this.updateShip(FIXED_TIMESTEP);
    if (this.stateTime >= 0.8) this.changeState(GAME_STATES.TITLE);
  }

  updateTitle(dt) {
    this.updateShip(dt);
  }

  updatePlaying(dt) {
    this.elapsed += dt;
    this.timeLeft = Math.max(0, GAME_RULES.duration - this.elapsed);
    this.updateShip(dt);
    this.boss.update(dt, this);
    this.updateBullets(dt);
    this.spawn.update(dt, this);
    this.resolveShipBubbleCollisions();
    this.resolveShipBossBubbleCollisions();
    this.resolveShipBossCollision();

    if (this.boss.explosionComplete) this.winRun();
    if (this.state === GAME_STATES.PLAYING && this.timeLeft <= 0 && this.boss.active) this.endRun("TIMEOUT");
  }

  updateGameOver(dt) {
    this.updateShip(dt * 0.45);
  }

  requestShoot() {
    if (this.state !== GAME_STATES.PLAYING || this.shootCooldown > 0) return false;

    const direction = this.getShotVector();
    const startX = this.ship.x + direction.x * 34;
    const startY = this.ship.y + direction.y * 34;

    this.bullets.push({
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      vx: direction.x * BULLET_SPEED,
      vy: direction.y * BULLET_SPEED,
      age: 0,
      dead: false,
    });

    this.shootCooldown = SHOOT_COOLDOWN;
    this.particles.emitBurst(startX, startY, COLORS.orange, 6, 92);
    return true;
  }

  getShotVector() {
    if (Math.hypot(this.ship.vx, this.ship.vy) > 4) {
      return this.normalize(this.ship.vx, this.ship.vy);
    }

    return this.normalize(Math.cos(this.ship.angle), Math.sin(this.ship.angle));
  }

  updateBullets(dt) {
    for (const bullet of this.bullets) {
      bullet.age += dt;
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      const bossBubble = this.boss.findProjectileAt(bullet.x, bullet.y, BULLET_RADIUS);
      if (bossBubble) {
        bullet.dead = true;
        this.popBossBubble(bossBubble, bullet.x, bullet.y);
        continue;
      }

      if (this.boss.hitCore(bullet.x, bullet.y, BULLET_RADIUS)) {
        bullet.dead = true;
        this.handleBossCoreHit(bullet.x, bullet.y);
      }
    }

    this.bullets = this.bullets.filter(
      (bullet) =>
        !bullet.dead &&
        bullet.age < BULLET_LIFE &&
        bullet.x >= PLAYFIELD.left - 32 &&
        bullet.x <= PLAYFIELD.right + 32 &&
        bullet.y >= PLAYFIELD.top - 32 &&
        bullet.y <= PLAYFIELD.bottom + 32
    );
  }

  popBossBubble(projectile, x = projectile.x, y = projectile.y) {
    if (!this.boss.popProjectile(projectile)) return false;

    this.score += 35;
    this.particles.emitBurst(x, y, COLORS.heart, 14, 160);
    this.shockwaves.add(x, y, COLORS.heart, 42);
    this.floatingText.add("POP", x, y - 22, COLORS.heart, 14, { life: 0.42 });
    return true;
  }

  handleBossBubbleEscaped(projectile) {
    if (this.state !== GAME_STATES.PLAYING || this.victory) return;

    this.bossBubblePenaltyProgress += 1;
    this.floatingText.add("UNPOPPED", projectile.x, projectile.y - 28, COLORS.heart, 14, { life: 0.58, glitch: true });

    if (this.bossBubblePenaltyProgress < 5) return;

    this.bossBubblePenaltyProgress = 0;
    this.shipLives = Math.max(0, this.shipLives - 1);
    this.shipInvulnerable = Math.max(this.shipInvulnerable, 0.9);
    this.addShake(0.24);
    this.shockwaves.add(this.ship.x, this.ship.y, COLORS.heart, 68);
    this.particles.emitBurst(this.ship.x, this.ship.y, COLORS.heart, 20, 190);
    this.floatingText.add("HULL -1", this.ship.x, this.ship.y - 48, COLORS.heart, 18, { life: 0.72, glitch: true });

    if (this.shipLives <= 0) {
      this.endRun("SHIP DESTROYED");
    }
  }

  handleBossCoreHit(x, y) {
    if (!this.boss.takeHit()) return;

    this.score += 80;
    this.addShake(this.boss.defeated ? 0.42 : 0.12);
    this.particles.emitBurst(x, y, this.boss.defeated ? COLORS.amber : COLORS.orange, this.boss.defeated ? 42 : 14, this.boss.defeated ? 290 : 150);
    this.shockwaves.add(x, y, this.boss.defeated ? COLORS.amber : COLORS.orange, this.boss.defeated ? 118 : 44);
    this.floatingText.add(this.boss.defeated ? "CORE BREAK" : "-1 CORE", x, y - 26, this.boss.defeated ? COLORS.amber : COLORS.orange, this.boss.defeated ? 22 : 16, {
      life: this.boss.defeated ? 0.95 : 0.48,
      glitch: this.boss.defeated,
    });
  }

  resolveShipBossCollision() {
    if (this.shipInvulnerable > 0 || !this.boss.active) return;
    if (!this.boss.touchesShip(this.ship, SHIP_RADIUS)) return;

    this.shipLives = Math.max(0, this.shipLives - 1);
    this.shipInvulnerable = 1.35;
    this.combo = 0;
    this.multiplier = 1;

    const away = this.normalize(this.ship.x - this.boss.x, this.ship.y - this.boss.y);
    const direction = away.x === 0 && away.y === 0 ? { x: -1, y: 0 } : away;
    this.ship.x = clamp(this.ship.x + direction.x * 76, PLAYFIELD.left + SHIP_RADIUS, PLAYFIELD.right - SHIP_RADIUS);
    this.ship.y = clamp(this.ship.y + direction.y * 76, PLAYFIELD.top + SHIP_RADIUS, PLAYFIELD.bottom - SHIP_RADIUS);
    this.ship.vx = direction.x * 170;
    this.ship.vy = direction.y * 170;
    this.setShipDrift(direction);

    this.addShake(0.28);
    this.shockwaves.add(this.ship.x, this.ship.y, COLORS.red, 72);
    this.particles.emitBurst(this.ship.x, this.ship.y, COLORS.red, 18, 210);
    this.floatingText.add("HULL HIT", this.ship.x, this.ship.y - 44, COLORS.red, 18, { life: 0.62, glitch: true });

    if (this.shipLives <= 0) {
      this.endRun("SHIP DESTROYED");
    }
  }

  handleMenuPointer() {
    if (![GAME_STATES.TITLE, GAME_STATES.PAUSED, GAME_STATES.SETTINGS, GAME_STATES.GAME_OVER].includes(this.state)) return false;
    return this.menu.handlePointer(this, this.pointer.x, this.pointer.y);
  }

  resolveBubbleClick(x, y) {
    const bubble = this.spawn.findAt(x, y);

    if (bubble) {
      this.popBubble(bubble);
      return;
    }

    this.attempts += 1;
    this.registerMiss();
  }

  popBubble(bubble) {
    if (!this.spawn.pop(bubble)) return;

    this.attempts += 1;
    const chain = this.elapsed - this.lastPopTime < GAME_RULES.comboWindow;
    this.combo = chain ? this.combo + 1 : 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.multiplier = this.getComboMultiplier();
    this.hits += 1;
    this.lastPopTime = this.elapsed;

    const gained = Math.round(bubble.value * this.multiplier);
    this.score += gained;
    this.updateAccuracy();
    this.emitPopFeedback(bubble, gained);
  }

  registerMiss() {
    this.misses += 1;
    this.combo = 0;
    this.multiplier = 1;
    this.updateAccuracy();
    this.particles.emitMiss(this.pointer.x, this.pointer.y);
    this.shockwaves.add(this.pointer.x, this.pointer.y, COLORS.red, 36);
    this.floatingText.add("MISS", this.pointer.x, this.pointer.y - 26, COLORS.red, 18, { life: 0.42, glitch: true });
    this.addShake(0.08);
  }

  emitPopFeedback(bubble, gained) {
    this.particles.emitPop(bubble.x, bubble.y, bubble.type, gained);
    this.shockwaves.emitPop(bubble.x, bubble.y, bubble.type);
    this.floatingText.emitPop(bubble.x, bubble.y, gained, bubble.type, this.multiplier);
    if (bubble.type === "unstable") {
      this.background.emitUnstableGlitch(1);
      this.addShake(0.18);
    } else if (bubble.type === "bonus") {
      this.addShake(0.1);
    }
  }

  getComboMultiplier() {
    return 1 + Math.floor(this.combo / 4) * 0.25 + Math.floor(this.combo / 12) * 0.25;
  }

  updateAccuracy() {
    this.accuracy = this.attempts > 0 ? clamp(this.hits / this.attempts, 0, 1) : 1;
  }

  handleBubbleExpired(bubble) {
    this.attempts += 1;
    this.misses += 1;
    this.updateAccuracy();

    if (bubble.type !== "unstable") return;

    this.unstableLeaks += 1;
    this.combo = 0;
    this.multiplier = 1;
    this.score = Math.max(0, this.score - Math.round(bubble.value * 0.6));
    this.particles.emitPop(bubble.x, bubble.y, "unstable", bubble.value);
    this.shockwaves.emitPop(bubble.x, bubble.y, "unstable");
    this.floatingText.add("LEAK", bubble.x, bubble.y - 42, COLORS.red, 20, { life: 0.7, glitch: true });
    this.background.emitUnstableGlitch(1.2);
    this.addShake(0.22);
  }

  resolveShipBubbleCollisions() {
    const radius = this.getShipFieldRadius();

    for (const bubble of [...this.spawn.bubbles]) {
      if (this.doesShipFieldTouchBubble(bubble, radius)) {
        this.popBubble(bubble);
      }
    }
  }

  resolveShipBossBubbleCollisions() {
    const radius = this.getShipFieldRadius();

    for (const projectile of [...this.boss.projectiles]) {
      if (Math.hypot(projectile.x - this.ship.x, projectile.y - this.ship.y) <= radius + projectile.radius) {
        this.popBossBubble(projectile);
      }
    }
  }

  doesShipFieldTouchBubble(bubble, shipRadius = this.getShipFieldRadius()) {
    if (!bubble || bubble.popped || bubble.expired) return false;
    const distance = Math.hypot(bubble.x - this.ship.x, bubble.y - this.ship.y);
    return distance <= shipRadius + bubble.radius;
  }

  getShipFieldRadius() {
    return SHIP_FIELD_RADIUS + Math.sin(this.ship.pulse * 5) * SHIP_FIELD_PULSE;
  }

  addShake(amount) {
    if (!this.settings.screenShake || this.reducedMotion) return;
    this.shakeTimer = Math.max(this.shakeTimer, amount);
  }

  getGrade() {
    const scoreGrade = this.score >= 8000 ? 3 : this.score >= 5200 ? 2 : this.score >= 2600 ? 1 : 0;
    const accuracyBonus = this.accuracy >= 0.92 ? 1 : 0;
    const comboBonus = this.maxCombo >= 18 ? 1 : 0;
    const grade = Math.min(3, scoreGrade + accuracyBonus + comboBonus);
    return ["C", "B", "A", "S"][grade];
  }

  getDirectionVector() {
    const keyVector = this.getKeyboardVector();
    if (keyVector.x !== 0 || keyVector.y !== 0) {
      this.activeDirection = { id: "keys", ...keyVector };
      this.setShipDrift(keyVector);
      return keyVector;
    }

    if (this.pointer.isDown) {
      const control = this.hud.getDirectionFromPoint(this.pointer.x, this.pointer.y);
      if (control) {
        const vector = { x: control.vx, y: control.vy };
        this.activeDirection = control;
        this.setShipDrift(vector);
        return vector;
      }

      if (this.hud.isPointInMainFrame(this.pointer.x, this.pointer.y)) {
        const vector = this.normalize(this.pointer.x - this.ship.x, this.pointer.y - this.ship.y);
        if (vector.x !== 0 || vector.y !== 0) {
          this.activeDirection = { id: "point", vx: vector.x, vy: vector.y };
          this.setShipDrift(vector);
          return vector;
        }
      }
    }

    this.activeDirection = null;
    return this.normalize(this.ship.driftX, this.ship.driftY);
  }

  getKeyboardVector() {
    let x = 0;
    let y = 0;

    if (this.keys.has("arrowleft") || this.keys.has("a")) x -= 1;
    if (this.keys.has("arrowright") || this.keys.has("d")) x += 1;
    if (this.keys.has("arrowup") || this.keys.has("w")) y -= 1;
    if (this.keys.has("arrowdown") || this.keys.has("s")) y += 1;

    return this.normalize(x, y);
  }

  getAutoVector() {
    const centerX = (PLAYFIELD.left + PLAYFIELD.right) / 2;
    const centerY = (PLAYFIELD.top + PLAYFIELD.bottom) / 2;
    const edgePressure =
      (this.ship.x < PLAYFIELD.left + 110 || this.ship.x > PLAYFIELD.right - 110 || this.ship.y < PLAYFIELD.top + 80 || this.ship.y > PLAYFIELD.bottom - 80) ? 0.65 : 0;
    const auto = this.normalize(Math.cos(this.ship.autoAngle), Math.sin(this.ship.autoAngle * 1.31));
    const center = this.normalize(centerX - this.ship.x, centerY - this.ship.y);

    return this.normalize(lerp(auto.x, center.x, edgePressure), lerp(auto.y, center.y, edgePressure));
  }

  normalize(x, y) {
    const length = Math.hypot(x, y);
    if (length <= 0.0001) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
  }

  setShipDrift(vector) {
    const direction = this.normalize(vector.x, vector.y);
    if (direction.x === 0 && direction.y === 0) return;
    this.ship.driftX = direction.x;
    this.ship.driftY = direction.y;
  }

  updateShip(dt) {
    const direction = this.getDirectionVector();
    const manual = Boolean(this.activeDirection);
    const targetSpeed = manual ? this.ship.speed * 1.16 : this.ship.speed * 0.96;
    const ease = 1 - Math.pow(0.0008, dt);

    this.ship.prevX = this.ship.x;
    this.ship.prevY = this.ship.y;
    this.ship.vx = lerp(this.ship.vx, direction.x * targetSpeed, ease);
    this.ship.vy = lerp(this.ship.vy, direction.y * targetSpeed, ease);
    this.ship.x += this.ship.vx * dt;
    this.ship.y += this.ship.vy * dt;
    this.ship.pulse += dt;

    this.keepShipInBounds();

    if (Math.hypot(this.ship.vx, this.ship.vy) > 2) {
      this.ship.angle = Math.atan2(this.ship.vy, this.ship.vx);
    }

    this.ship.trailTimer -= dt;
    if (this.ship.trailTimer <= 0) {
      this.ship.trail.push({ x: this.ship.x, y: this.ship.y, age: 0 });
      this.ship.trailTimer = 0.035;
    }

    for (const point of this.ship.trail) point.age += dt;
    this.ship.trail = this.ship.trail.filter((point) => point.age < 0.55);
  }

  keepShipInBounds() {
    const minX = PLAYFIELD.left + SHIP_RADIUS;
    const maxX = PLAYFIELD.right - SHIP_RADIUS;
    const minY = PLAYFIELD.top + SHIP_RADIUS;
    const maxY = PLAYFIELD.bottom - SHIP_RADIUS;
    const beforeX = this.ship.x;
    const beforeY = this.ship.y;

    this.ship.x = clamp(this.ship.x, minX, maxX);
    this.ship.y = clamp(this.ship.y, minY, maxY);

    if (this.ship.x !== beforeX) {
      this.ship.vx *= -0.28;
      this.ship.driftX *= -1;
      this.ship.autoAngle = Math.PI - this.ship.autoAngle;
    }

    if (this.ship.y !== beforeY) {
      this.ship.vy *= -0.28;
      this.ship.driftY *= -1;
      this.ship.autoAngle *= -1;
    }

    this.setShipDrift({ x: this.ship.driftX, y: this.ship.driftY });
  }

  render(interpolation = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (this.settings.screenShake && this.shakeTimer > 0) {
      const power = this.shakeTimer * 20;
      ctx.translate(Math.round(Math.sin(this.totalTime * 90) * power), Math.round(Math.cos(this.totalTime * 77) * power));
    }

    this.background.render(ctx, this);
    this.spawn.draw(ctx, this.totalTime);
    this.boss.render(ctx, this);
    this.drawBullets(ctx);
    this.shockwaves.render(ctx);
    this.particles.render(ctx);
    this.drawShip(interpolation);
    this.floatingText.render(ctx);
    this.hud.drawMainFrame(ctx, this);
    this.hud.drawPanels(ctx, this);
    this.menu.render(ctx, this);
    this.hud.drawCursor(ctx, this);

    ctx.restore();
  }

  drawBullets(ctx) {
    for (const bullet of this.bullets) {
      const alpha = clamp(1 - bullet.age / BULLET_LIFE, 0, 1);
      drawPixelLine(ctx, bullet.prevX, bullet.prevY, bullet.x, bullet.y, COLORS.orange, alpha, 3);
      drawRing(ctx, bullet.x, bullet.y, BULLET_RADIUS + 5, COLORS.amber, alpha * 0.28, 1);
      ctx.fillStyle = withAlpha(COLORS.white, alpha);
      ctx.fillRect(Math.round(bullet.x) - 2, Math.round(bullet.y) - 2, 4, 4);
    }
  }

  drawShip(interpolation) {
    const ctx = this.ctx;
    const x = Math.round(lerp(this.ship.prevX, this.ship.x, interpolation));
    const y = Math.round(lerp(this.ship.prevY, this.ship.y, interpolation));
    const shipAlpha = this.shipInvulnerable > 0 && Math.floor(this.totalTime * 18) % 2 === 0 ? 0.48 : 1;

    for (const point of this.ship.trail) {
      const alpha = 1 - point.age / 0.55;
      drawRing(ctx, point.x, point.y, 8 + point.age * 44, COLORS.cyan, alpha * 0.16, 1);
      drawPixelLine(ctx, point.x - 8, point.y, point.x + 8, point.y, COLORS.cyan, alpha * 0.28);
    }

    drawRing(ctx, x, y, 48 + Math.sin(this.ship.pulse * 8) * 4, COLORS.cyan, 0.18, 1);
    drawRing(ctx, x, y, this.getShipFieldRadius(), COLORS.orange, 0.12, 1);

    if (this.shipInvulnerable > 0) {
      drawRing(ctx, x, y, 58 + Math.sin(this.totalTime * 20) * 4, COLORS.red, 0.24, 1);
    }

    ctx.save();
    ctx.globalAlpha = shipAlpha;
    ctx.translate(x, y);
    ctx.rotate(this.ship.angle);

    ctx.fillStyle = COLORS.panelDeep;
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(-20, -16);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-20, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, -4, 12, 8);
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(-18, -21, 10, 6);
    ctx.fillRect(-18, 15, 10, 6);
    ctx.fillStyle = COLORS.orange;
    ctx.fillRect(-34, -4, 13 + Math.round(Math.sin(this.ship.pulse * 30) * 4), 8);

    ctx.restore();

    drawPixelLine(ctx, x - 34, y, x - 52, y, COLORS.cyan, 0.48);
    drawText(ctx, "NAV", x + 36, y + 24, withAlpha(COLORS.muted, 0.85), 10);
  }
}
