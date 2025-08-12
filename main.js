(() => {
  "use strict";

  // ---------- Utility ----------
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const degToRad = (deg) => (deg * Math.PI) / 180;
  const randRange = (min, max) => min + Math.random() * (max - min);
  // slope helper for terrain-aware spawns (pixels per pixel)
  const terrainSlopeAt = (terrain, x, sample = 4) => {
    const h1 = terrain.getHeightAt(x - sample);
    const h2 = terrain.getHeightAt(x + sample);
    return (h2 - h1) / (sample * 2);
  };

  // Path helper for rounded rectangles
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  // ---------- Constants ----------
  const MAX_SCORE = 10;
  const GRAVITY_PX_PER_S2 = 850;
  const DIRECT_HIT_EXPLOSION_MS = 2000;
  const GROUND_EXPLOSION_MS = 600;
  const POWER_MIN = 10;
  const POWER_MAX = 160; // vyšší max síla
  const ANGLE_MIN = 0;   // 0–90°
  const ANGLE_MAX = 90;
  const POWER_ADJUST_PER_S = 110; // maximální rychlost
  const ANGLE_ADJUST_PER_S = 120; // maximální rychlost
  const POWER_ADJUST_START = 20;  // jemný začátek
  const ANGLE_ADJUST_START = 18;  // jemný začátek
  const ADJUST_ACCEL_TIME_S = 0.9; // do této doby plynule zrychlí
  const PROJECTILE_RADIUS = 3.5;
  const EXPLOSION_RADIUS = 40;
  const TANK_RADIUS = 20;
  const BARREL_LENGTH = 32;
  const SPEED_PER_POWER = 10.8; // rychlejší střela / delší dostřel
  const PIP_SPAWN_INTERVAL_MS = 160;
  const PIP_TTL_MS = 1200;
  const IMPACT_MARKS_PER_COLOR = 3;
  const GROUND_HIT_AWARD_RADIUS = 14; // menší tolerance pro bod po dopadu do země pod tankem
  // Global scaler to reduce the rate of visual flair spawns
  const FLAIR_RATE_MULT = 0.55; // <1 => méně spawnů celkově

  // ---------- Input ----------
  const KEY = {
    W: "KeyW",
    A: "KeyA",
    S: "KeyS",
    D: "KeyD",
    UP: "ArrowUp",
    DOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    SPACE: "Space",
    R: "KeyR",
  };

  class InputManager {
    constructor() {
      this.down = new Set();
      this.justPressed = new Set();
      this.holdTime = new Map(); // code -> seconds held
      window.addEventListener("keydown", (e) => {
        // Prevent page scroll for arrows and space
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
          e.preventDefault();
        }
        if (!this.down.has(e.code)) this.justPressed.add(e.code);
        this.down.add(e.code);
      });
      window.addEventListener("keyup", (e) => {
        this.down.delete(e.code);
        this.justPressed.delete(e.code);
        this.holdTime.delete(e.code);
      });
    }
    consume(code) {
      const had = this.justPressed.has(code);
      this.justPressed.delete(code);
      return had;
    }
    isDown(code) { return this.down.has(code); }
    tick(dt) {
      for (const code of this.down) {
        this.holdTime.set(code, (this.holdTime.get(code) || 0) + dt);
      }
    }
    heldFor(code) { return this.holdTime.get(code) || 0; }
  }

  // ---------- Bot Controller ----------
  class BotController {
    constructor(difficulty, sideKey) {
      this.difficulty = difficulty; // 'easy' | 'medium' | 'hard'
      this.sideKey = sideKey; // 'red' | 'blue'
      this.targetAngleDeg = null;
      this.targetPower = null;
      this.planReady = false;
      this.reactionTimer = 0;
      this.settleTimer = 0;
      this.justFired = false;
      // internal hold timers for acceleration-like behavior
      this.holdAngleUp = 0;
      this.holdAngleDown = 0;
      this.holdPowerUp = 0;
      this.holdPowerDown = 0;
    }

    resetForNewTurn() {
      this.targetAngleDeg = null;
      this.targetPower = null;
      this.planReady = false;
      this.reactionTimer = 0;
      this.settleTimer = 0;
      this.justFired = false;
      this.holdAngleUp = this.holdAngleDown = this.holdPowerUp = this.holdPowerDown = 0;
    }

    _easeAccel(t) {
      const cl = Math.min(ADJUST_ACCEL_TIME_S, Math.max(0, t));
      const k = cl / ADJUST_ACCEL_TIME_S; // 0..1
      return k * k;
    }

    _adjustTowards(tank, dt) {
      if (this.targetAngleDeg == null || this.targetPower == null) return false;
      const angleDiff = this.targetAngleDeg - tank.angleDeg;
      const powerDiff = this.targetPower - tank.power;

      // angle
      if (Math.abs(angleDiff) > 0.01) {
        if (angleDiff > 0) {
          this.holdAngleUp += dt; this.holdAngleDown = 0;
          const speed = (ANGLE_ADJUST_START + (ANGLE_ADJUST_PER_S - ANGLE_ADJUST_START) * this._easeAccel(this.holdAngleUp)) * this._speedFactorAngle();
          tank.angleDeg += speed * dt;
        } else {
          this.holdAngleDown += dt; this.holdAngleUp = 0;
          const speed = (ANGLE_ADJUST_START + (ANGLE_ADJUST_PER_S - ANGLE_ADJUST_START) * this._easeAccel(this.holdAngleDown)) * this._speedFactorAngle();
          tank.angleDeg -= speed * dt;
        }
      } else {
        this.holdAngleUp = this.holdAngleDown = 0;
      }
      tank.angleDeg = clamp(tank.angleDeg, ANGLE_MIN, ANGLE_MAX);

      // power
      if (Math.abs(powerDiff) > 0.01) {
        if (powerDiff > 0) {
          this.holdPowerUp += dt; this.holdPowerDown = 0;
          const speed = (POWER_ADJUST_START + (POWER_ADJUST_PER_S - POWER_ADJUST_START) * this._easeAccel(this.holdPowerUp)) * this._speedFactorPower();
          tank.power += speed * dt;
        } else {
          this.holdPowerDown += dt; this.holdPowerUp = 0;
          const speed = (POWER_ADJUST_START + (POWER_ADJUST_PER_S - POWER_ADJUST_START) * this._easeAccel(this.holdPowerDown)) * this._speedFactorPower();
          tank.power -= speed * dt;
        }
      } else {
        this.holdPowerUp = this.holdPowerDown = 0;
      }
      tank.power = clamp(tank.power, POWER_MIN, POWER_MAX);

      const closeAngle = Math.abs(this.targetAngleDeg - tank.angleDeg) < 0.5;
      const closePower = Math.abs(this.targetPower - tank.power) < 0.8;
      return closeAngle && closePower;
    }

    _rng(n) { return Math.random() * n; }

    _computePlan(game) {
      const me = game.tanks[this.sideKey];
      const enemyKey = this.sideKey === "red" ? "blue" : "red";
      const enemy = game.tanks[enemyKey];
      const start = me.getCannonTip();
      const target = { x: enemy.x, y: enemy.y - enemy.hullHeight * 0.5 };

      // Initial guess: 45° angle, power from flat-ground range formula (ignores height)
      const g = GRAVITY_PX_PER_S2;
      const dx = (target.x - start.x);
      const dy = (target.y - start.y);
      const baseAngle = 45;
      const baseAngleRad = degToRad(baseAngle);
      const desiredRange = Math.abs(dx);
      const sin2 = Math.sin(2 * baseAngleRad);
      let baseV = Math.sqrt(Math.max(10, desiredRange * g / Math.max(0.1, sin2)));
      let basePower = clamp(baseV / SPEED_PER_POWER, POWER_MIN, POWER_MAX);

      // Sample candidates around multiple anchor angles
      const anchors = this.difficulty === 'hard' ? [35, 45, 55] : this.difficulty === 'medium' ? [32, 50] : [40];
      const samples = this.difficulty === 'hard' ? 60 : this.difficulty === 'medium' ? 24 : 16;
      const cands = [];

      const evaluate = (angleDeg, power) => {
        const res = this._simulate(game, me, enemy, start, angleDeg, power);
        // difficulty weights
        const hitW = this.difficulty === 'hard' ? -10000 : this.difficulty === 'medium' ? -3500 : -1500;
        const nearW = this.difficulty === 'hard' ? -5000 : this.difficulty === 'medium' ? -300 : 0;
        const earlyPenalty = this.difficulty === 'hard' ? 200 : this.difficulty === 'medium' ? 700 : 1200;
        let score = res.hit ? hitW : res.nearMiss ? nearW : res.minDist;
        if (res.blockedEarly) score += earlyPenalty;
        // add random noise to discourage perfection
        const noise = (this.difficulty === 'hard' ? 0 : this.difficulty === 'medium' ? this._rng(80) : this._rng(120));
        score += noise;
        cands.push({ angle: clamp(angleDeg, ANGLE_MIN, ANGLE_MAX), power: clamp(power, POWER_MIN, POWER_MAX), score, hit: res.hit });
      };

      for (const a of anchors) {
        for (let i = 0; i < samples; i++) {
          const angleJit = (this._rng(1) - 0.5) * (this.difficulty === 'hard' ? 10 : this.difficulty === 'medium' ? 24 : 36);
          const powJit = (this._rng(1) - 0.5) * (this.difficulty === 'hard' ? 24 : this.difficulty === 'medium' ? 48 : 56);
          evaluate(a + angleJit, basePower + powJit);
        }
      }

      if (cands.length === 0) {
        for (let angle = 20; angle <= 75; angle += 8) {
          for (let power = POWER_MIN; power <= POWER_MAX; power += 18) {
            evaluate(angle, power);
          }
        }
      }

      cands.sort((a, b) => a.score - b.score);
      let chosen = cands[0] || null;
      if (cands.length > 1) {
        if (this.difficulty === 'medium') {
          let idx;
          if (cands.length > 5) {
            idx = 2 + Math.floor(Math.random() * 4); // 2..5
          } else {
            idx = Math.min(cands.length - 1, 2);
          }
          chosen = cands[idx];
        } else if (this.difficulty === 'easy') {
          const low = Math.floor(cands.length * 0.25);
          const high = Math.floor(cands.length * 0.7);
          const idx = Math.floor(low + Math.random() * Math.max(1, high - low));
          chosen = cands[idx];
        }
      }

      if (chosen) {
        const polishA = (this._rng(1) - 0.5) * (this.difficulty === 'hard' ? 0.9 : this.difficulty === 'medium' ? 3.2 : 5.0);
        const polishP = (this._rng(1) - 0.5) * (this.difficulty === 'hard' ? 1.5 : this.difficulty === 'medium' ? 8.0 : 14.0);
        this.targetAngleDeg = clamp(chosen.angle + polishA, ANGLE_MIN, ANGLE_MAX);
        this.targetPower = clamp(chosen.power + polishP, POWER_MIN, POWER_MAX);
      } else {
        this.targetAngleDeg = clamp(baseAngle, ANGLE_MIN, ANGLE_MAX);
        this.targetPower = clamp(basePower, POWER_MIN, POWER_MAX);
      }

      // reaction delay (feels human, slower for easier)
      const baseReact = this.difficulty === 'hard' ? 0.28 : this.difficulty === 'medium' ? 0.45 : 0.7;
      const reactJit = (this._rng(1) - 0.5) * 0.25;
      this.reactionTimer = Math.max(0, baseReact + reactJit);
      this.planReady = true;
    }

    _simulate(game, me, enemy, start, angleDeg, power) {
      const angle = degToRad(angleDeg);
      const speed = power * SPEED_PER_POWER;
      let vx = Math.cos(angle) * me.facing * speed;
      let vy = -Math.sin(angle) * speed;
      let x = start.x;
      let y = start.y;
      const dt = 1 / 90;
      const maxSeconds = 6;
      const enemyCenterY = enemy.y - enemy.hullHeight * 0.5;
      let minDist = Infinity;
      let blockedEarly = false;

      for (let t = 0; t < maxSeconds; t += dt) {
        // offscreen
        if (x < -20 || x > cssW + 20 || y > cssH + 20) break;
        // tank hit?
        const dx = x - enemy.x;
        const dy = y - enemyCenterY;
        const d2 = dx * dx + dy * dy;
        const hitRadius = (TANK_RADIUS + PROJECTILE_RADIUS);
        if (d2 <= hitRadius * hitRadius) {
          return { hit: true, nearMiss: true, minDist: 0, blockedEarly: false };
        }
        const d = Math.hypot(dx, dy);
        if (d < minDist) minDist = d;
        const gy = game.terrain.getHeightAt(x);
        if (y + PROJECTILE_RADIUS >= gy) {
          // ground impact
          const groundD = Math.hypot(enemy.x - x, enemyCenterY - gy);
          const thresh = TANK_RADIUS + GROUND_HIT_AWARD_RADIUS;
          const nearMiss = groundD <= thresh;
          blockedEarly = groundD > thresh && ((me.facing === 1 && x < enemy.x) || (me.facing === -1 && x > enemy.x));
          return { hit: nearMiss, nearMiss, minDist: Math.min(minDist, groundD), blockedEarly };
        }
        // integrate
        vy += GRAVITY_PX_PER_S2 * dt;
        x += vx * dt;
        y += vy * dt;
      }
      return { hit: false, nearMiss: false, minDist, blockedEarly };
    }

    update(game, dt) {
      // Only act on own turn, when no projectile is flying and game is not resolving
      if (game.isGameOver) return;
      if (game.active !== this.sideKey) return;
      if (game.projectile || game.isResolvingShot) return;

      const tank = game.tanks[this.sideKey];
      if (!this.planReady) {
        this._computePlan(game);
        return;
      }

      if (this.reactionTimer > 0) { this.reactionTimer -= dt; return; }

      const close = this._adjustTowards(tank, dt);
      if (close) {
        if (this.settleTimer <= 0) {
          // start settle window
          const baseSettle = this.difficulty === 'hard' ? 0.12 : this.difficulty === 'medium' ? 0.22 : 0.38;
          this.settleTimer = baseSettle + (Math.random() - 0.5) * 0.12;
          return;
        }
        this.settleTimer -= dt;
        if (this.settleTimer <= 0 && !this.justFired) {
          game.fire();
          this.justFired = true;
        }
      }
    }

    _speedFactorAngle() {
      return this.difficulty === 'hard' ? 0.9 : this.difficulty === 'medium' ? 0.7 : 0.5;
    }
    _speedFactorPower() {
      return this.difficulty === 'hard' ? 0.9 : this.difficulty === 'medium' ? 0.7 : 0.5;
    }
  }

  // ---------- Sound ----------
  class SoundEngine {
    constructor() {
      this.ctx = null;
    }
    _ensure() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
      }
      return this.ctx;
    }
    playShoot(power = 60) {
      const ctx = this._ensure();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const freqStart = 220 + Math.min(280, power * 2);
      const freqEnd = 120;
      osc.type = "square";
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    }
    playExplosion() {
      const ctx = this._ensure();
      const now = ctx.currentTime;
      // noise burst (boomy)
      const bufferSize = 1 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(120, now);
      filter.Q.setValueAtTime(0.7, now);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(800, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.9, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      src.connect(filter).connect(lowpass).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.9);
    }
    playHit() {
      const ctx = this._ensure();
      const now = ctx.currentTime;
      // hit: krátký kovový prásk + noise pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.7, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.exponentialRampToValueAtTime(0.4, now + 0.01);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      noise.connect(nGain).connect(ctx.destination);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      noise.start(now);
      osc.stop(now + 0.2);
      noise.stop(now + 0.12);
    }
    playHitLong() {
      const ctx = this._ensure();
      const now = ctx.currentTime;
      // layered shattery burst with crackling
      const noiseDur = 1.6;
      const crackCount = 5;
      // base noise tail
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseDur, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(240, now);
      bp.Q.setValueAtTime(0.7, now);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1200, now);
      lp.frequency.exponentialRampToValueAtTime(400, now + noiseDur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(0.8, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
      noise.connect(bp).connect(lp).connect(g).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + noiseDur);
      // cracks
      for (let i = 0; i < crackCount; i++) {
        const t = now + 0.1 + i * 0.25;
        const osc = ctx.createOscillator();
        const gg = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(600 + i * 80, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
        gg.gain.setValueAtTime(0.001, t);
        gg.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
        gg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gg).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      }
    }
  }

  // ---------- Canvas / DPI ----------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  let cssW = 0, cssH = 0, dpr = 1;
  const resizeCanvas = () => {
    dpr = window.devicePixelRatio || 1;
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr); // draw in CSS pixels
  };
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // ---------- Terrain ----------
  class Terrain {
    constructor(width, height) {
      this.width = Math.max(1, Math.floor(width));
      this.height = Math.max(1, Math.floor(height));
      this.baseLine = Math.floor(height * 0.72);
      this.heights = new Float32Array(this.width);
      this.generate();
    }

    generate() {
      const w = this.width;
      const h = this.height;
      const baseline = this.baseLine;
      const rand = (seed) => {
        // simple deterministic PRNG based on seed string
        let s = 0;
        for (let i = 0; i < seed.length; i++) s = (s * 131 + seed.charCodeAt(i)) >>> 0;
        return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
      };
      const r = rand(Date.now().toString());

      const a1 = lerp(40, 80, r());
      const a2 = lerp(18, 36, r());
      const a3 = lerp(6, 16, r());
      const f1 = lerp(0.5, 1.2, r());
      const f2 = lerp(1.8, 3.0, r());
      const f3 = lerp(4.0, 7.5, r());
      const p1 = r() * Math.PI * 2;
      const p2 = r() * Math.PI * 2;
      const p3 = r() * Math.PI * 2;

      // generate raw
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const y =
          a1 * Math.sin(t * Math.PI * 2 * f1 + p1) +
          a2 * Math.sin(t * Math.PI * 2 * f2 + p2) +
          a3 * Math.sin(t * Math.PI * 2 * f3 + p3);
        this.heights[x] = baseline + y;
      }

      // edge lift so tanks are above sea level near edges
      for (let x = 0; x < w; x++) {
        const edge = Math.min(x / (w * 0.15), (w - 1 - x) / (w * 0.15), 1);
        const lift = (1 - edge) * 90; // lift edges
        this.heights[x] = Math.min(h - 30, this.heights[x] - lift);
      }

      // smooth
      const smooth = new Float32Array(w);
      const k = 3; // radius
      for (let x = 0; x < w; x++) {
        let sum = 0, cnt = 0;
        for (let i = -k; i <= k; i++) {
          const xi = clamp(x + i, 0, w - 1);
          sum += this.heights[xi];
          cnt++;
        }
        smooth[x] = sum / cnt;
      }
      this.heights = smooth;
    }

    getHeightAt(x) {
      const xi = clamp(Math.floor(x), 0, this.width - 1);
      return this.heights[xi];
    }

    draw(ctx) {
      // ground fill
      const grd = ctx.createLinearGradient(0, this.baseLine - 120, 0, cssH);
      grd.addColorStop(0, "#2e8f3c");
      grd.addColorStop(1, "#1d5f28");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, cssH);
      ctx.lineTo(0, this.getHeightAt(0));
      for (let x = 1; x < this.width; x++) {
        ctx.lineTo(x, this.heights[x]);
      }
      ctx.lineTo(cssW, cssH);
      ctx.closePath();
      ctx.fill();

      // subtle hill highlight
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < this.width; x += 4) {
        ctx.lineTo(x, this.heights[x] - 1);
      }
      ctx.stroke();
    }
  }

  // ---------- Visual helpers ----------
  function drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, "#0a0f1f");
    g.addColorStop(1, "#04060c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    // few dim stars
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 80; i++) {
      const x = (i * 137.5) % cssW;
      const y = ((i * 97.3) % (cssH * 0.5));
      const r = (i % 7 === 0) ? 1.3 : 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Tank ----------
  class Tank {
    constructor(opts) {
      this.x = opts.x;
      this.color = opts.color; // CSS
      this.facing = opts.facing; // 1 (right) or -1 (left)
      this.hullWidth = 52;
      this.hullHeight = 26;
      this.barrelLength = BARREL_LENGTH;
      this.turretRadius = 14;
      this.angleDeg = 45; // relative above horizontal
      this.power = 60;
      this.y = 0; // will be set from terrain
      this.muzzleFlashMs = 0;
    }

    get cannonBase() {
      return { x: this.x, y: this.y - this.hullHeight }; // top center of hull
    }

    getCannonTip() {
      const a = degToRad(this.angleDeg);
      const dirX = Math.cos(a) * this.facing;
      const dirY = -Math.sin(a);
      const base = this.cannonBase;
      return { x: base.x + dirX * this.barrelLength, y: base.y + dirY * this.barrelLength };
    }

    draw(ctx, isActive) {
      // aura if active
      if (isActive) {
        const grd = ctx.createRadialGradient(this.x, this.y - this.hullHeight * 0.5, 8, this.x, this.y - this.hullHeight * 0.5, 74);
        grd.addColorStop(0, "rgba(255,255,255,0.1)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(this.x, this.y - this.hullHeight * 0.5, 74, 0, Math.PI * 2);
        ctx.fill();
      }

      // tracks with tread detail and subtle shading
      const left = this.x - this.hullWidth / 2;
      const top = this.y - this.hullHeight;
      const trackY = top + this.hullHeight - 7;
      const trackH = 12;
      const trackW = this.hullWidth + 10;
      // base rounded rect
      const trackGrad = ctx.createLinearGradient(0, trackY, 0, trackY + trackH);
      trackGrad.addColorStop(0, "#2a2a2a");
      trackGrad.addColorStop(0.5, "#1e1e1e");
      trackGrad.addColorStop(1, "#101010");
      ctx.fillStyle = trackGrad;
      roundRect(ctx, left - 5, trackY, trackW, trackH, 4);
      ctx.fill();
      // tread ridges
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const x = left - 5 + (i / 10) * trackW;
        ctx.beginPath();
        ctx.moveTo(x, trackY + 2);
        ctx.lineTo(x, trackY + trackH - 2);
        ctx.stroke();
      }
      // outer outline
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 2;
      roundRect(ctx, left - 5, trackY, trackW, trackH, 4);
      ctx.stroke();
      // wheels
      ctx.fillStyle = "#3a3a3a";
      for (let i = 0; i < 6; i++) {
        const wx = left - 3 + (i + 0.5) * (this.hullWidth + 6) / 6;
        const wy = trackY + trackH - 4;
        ctx.beginPath();
        ctx.arc(wx, wy, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // hull rounded + gloss + outline
      ctx.fillStyle = this.color;
      roundRect(ctx, left, top, this.hullWidth, this.hullHeight, 7);
      ctx.fill();
      ctx.save();
      roundRect(ctx, left, top, this.hullWidth, this.hullHeight, 7);
      ctx.clip();
      const gHull = ctx.createLinearGradient(0, top, 0, top + this.hullHeight);
      gHull.addColorStop(0, "rgba(255,255,255,0.18)");
      gHull.addColorStop(0.5, "rgba(255,255,255,0.06)");
      gHull.addColorStop(1, "rgba(0,0,0,0.08)");
      ctx.fillStyle = gHull;
      ctx.fillRect(left, top, this.hullWidth, this.hullHeight);
      ctx.restore();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      roundRect(ctx, left, top, this.hullWidth, this.hullHeight, 7);
      ctx.stroke();

      // turret
      ctx.fillStyle = "#262626";
      ctx.beginPath();
      ctx.arc(this.x, top, this.turretRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, top, this.turretRadius - 2, 0, Math.PI * 2);
      ctx.stroke();
      const gTur = ctx.createRadialGradient(this.x - 4, top - 4, 2, this.x, top, this.turretRadius + 4);
      gTur.addColorStop(0, "rgba(255,255,255,0.25)");
      gTur.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gTur;
      ctx.beginPath();
      ctx.arc(this.x, top, this.turretRadius + 2, 0, Math.PI * 2);
      ctx.fill();

      // barrel
      const a = degToRad(this.angleDeg);
      const dirX = Math.cos(a) * this.facing;
      const dirY = -Math.sin(a);
      const base = this.cannonBase;
      ctx.strokeStyle = "#dcdcdc";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + dirX * this.barrelLength, base.y + dirY * this.barrelLength);
      ctx.stroke();
      // barrel highlight
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + dirX * (this.barrelLength - 2), base.y + dirY * (this.barrelLength - 2));
      ctx.stroke();

      // muzzle flash (short burst)
      if (this.muzzleFlashMs > 0) {
        const t = Math.min(1, this.muzzleFlashMs / 120);
        const tipX = base.x + dirX * this.barrelLength;
        const tipY = base.y + dirY * this.barrelLength;
        const r = 6 + 16 * (1 - t);
        const g = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, r);
        g.addColorStop(0, `rgba(255,240,180, ${0.7 * (1 - t)})`);
        g.addColorStop(1, `rgba(255,120,20, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tipX, tipY, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- Projectile ----------
  class Projectile {
    constructor(x, y, vx, vy) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.active = true;
      this.timeAlive = 0;
    }
    update(dt) {
      if (!this.active) return;
      this.vy += GRAVITY_PX_PER_S2 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.timeAlive += dt;
    }
    draw(ctx) {
      if (!this.active) return;
      ctx.fillStyle = "#ffd54a";
      ctx.beginPath();
      ctx.arc(this.x, this.y, PROJECTILE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Explosion Effect ----------
  class ExplosionEffect {
    constructor(x, y, isDirectHit) {
      this.x = x;
      this.y = y;
      this.isDirectHit = isDirectHit;
      this.elapsedMs = 0;
      this.totalMs = isDirectHit ? DIRECT_HIT_EXPLOSION_MS : GROUND_EXPLOSION_MS;
      this.sparks = new Array(isDirectHit ? 60 : 24).fill(0).map(() => ({
        x, y,
        vx: Math.cos(randRange(0, Math.PI * 2)) * randRange(60, isDirectHit ? 280 : 220),
        vy: Math.sin(randRange(0, Math.PI * 2)) * randRange(60, isDirectHit ? 280 : 220),
        life: randRange(400, isDirectHit ? 1600 : 700),
      }));
      this.smoke = new Array(isDirectHit ? 22 : 8).fill(0).map(() => ({
        x, y,
        r: randRange(8, 18),
        a: randRange(0.4, 0.8),
        vx: randRange(-20, 20),
        vy: randRange(-10, -40),
        life: randRange(900, isDirectHit ? 2000 : 900),
      }));
      this.shakeDur = isDirectHit ? 450 : 220;
      this.shakeMag = isDirectHit ? 6 : 3;
    }
    update(dt) {
      const ms = dt * 1000;
      this.elapsedMs += ms;
      // sparks
      for (const s of this.sparks) {
        if (s.life <= 0) continue;
        const step = Math.min(s.life, ms);
        s.life -= step;
        const sec = step / 1000;
        s.vy += GRAVITY_PX_PER_S2 * 0.25 * sec;
        s.x += s.vx * sec;
        s.y += s.vy * sec;
      }
      // smoke
      for (const m of this.smoke) {
        if (m.life <= 0) continue;
        const step = Math.min(m.life, ms);
        m.life -= step;
        const sec = step / 1000;
        m.x += m.vx * sec;
        m.y += m.vy * sec;
        m.r += 6 * sec;
      }
    }
    draw(ctx) {
      const x = this.x;
      const y = this.y;
      const elapsed = this.elapsedMs;
      const r = lerp(10, EXPLOSION_RADIUS, Math.min(1, elapsed / 480));
      const a = 1 - Math.min(1, elapsed / 480);
      ctx.save();
      // draw with light additive blend as overlay
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 240, 160, ${0.7 * a})`);
      g.addColorStop(0.6, `rgba(255, 160, 60, ${0.35 * a})`);
      g.addColorStop(1, `rgba(255, 90, 20, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // sparks
      for (const s of this.sparks) {
        if (s.life <= 0) continue;
        const alpha = Math.max(0, s.life / (this.isDirectHit ? 1600 : 700));
        ctx.fillStyle = `rgba(255, 200, 60, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // smoke
      for (const m of this.smoke) {
        if (m.life <= 0) continue;
        const alpha = Math.max(0, (m.life / (this.isDirectHit ? 2000 : 900)) * m.a);
        ctx.fillStyle = `rgba(180, 180, 180, ${alpha})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    isAlive() {
      return this.elapsedMs <= this.totalMs;
    }
  }

  // ---------- Aim pips ----------
  class AimPips {
    constructor() {
      this.pips = [];
      this.timeSinceSpawn = 0;
    }
    clear() { this.pips.length = 0; }
    update(dt, tank) {
      this.timeSinceSpawn += dt * 1000;
      // spawn groups at intervals when tank is aiming
      if (this.timeSinceSpawn >= PIP_SPAWN_INTERVAL_MS) {
        this.timeSinceSpawn = 0;
        this.spawnGroup(tank);
      }
      // fade
      for (let i = this.pips.length - 1; i >= 0; i--) {
        const p = this.pips[i];
        p.ttl -= dt * 1000;
        if (p.ttl <= 0) this.pips.splice(i, 1);
      }
    }
    spawnGroup(tank) {
      const a = degToRad(tank.angleDeg);
      const base = tank.cannonBase;
      // longer, starting further from barrel tip
      const reach = tank.power * 1.6; // delší stopa
      const startOffset = 0.6; // nezačíná u hlavně
      const fractions = [startOffset, 0.8, 1.05, 1.3, 1.55];
      for (const f of fractions) {
        const jitterA = (Math.random() - 0.5) * 0.14;
        const jitterR = (Math.random() - 0.5) * 16;
        const ca = Math.cos(a + jitterA) * tank.facing;
        const sa = -Math.sin(a + jitterA);
        const dist = f * reach + jitterR;
        const x = base.x + ca * dist;
        const y = base.y + sa * dist;
        const r = 4 + Math.random() * 7;
        this.pips.push({ x, y, r, ttl: PIP_TTL_MS });
      }
    }
    draw(ctx) {
      for (const p of this.pips) {
        const alpha = clamp(p.ttl / PIP_TTL_MS, 0, 1) * 0.6; // fade
        ctx.fillStyle = `rgba(255, 213, 74, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- Flair / Easter Eggs (Sky & Ground, purely visual) ----------
  class FlairManager {
    constructor() {
      this.background = []; // sky layer: drawn after sky, before terrain
      this.midground = []; // ground layer: drawn after terrain, before tanks/marks
      this.spawnCooldown = 0; // to avoid bursts every frame
    }

    clear() {
      this.background.length = 0;
      this.midground.length = 0;
      this.spawnCooldown = 0;
    }

    update(dt, game) {
      // Update existing
      for (let i = this.background.length - 1; i >= 0; i--) {
        const e = this.background[i];
        e.update(dt, game);
        if (!e.isAlive()) this.background.splice(i, 1);
      }
      for (let i = this.midground.length - 1; i >= 0; i--) {
        const e = this.midground[i];
        e.update(dt, game);
        if (!e.isAlive()) this.midground.splice(i, 1);
      }

      // Probabilistic spawns (skip heavy spawning while resolving a shot)
      if (this.spawnCooldown > 0) this.spawnCooldown -= dt;
      const canSpawn = this.spawnCooldown <= 0;
      const skipForShot = game.isResolvingShot; // keep visuals subtle during resolution

      if (canSpawn) {
        let spawnedBg = 0;
        let spawnedMg = 0;
        const capPerTick = 2;
        // Sky events (caps)
        if (this.background.length < 10 && !skipForShot) {
          if (spawnedBg < capPerTick && FlairManager._chance(0.18 * FLAIR_RATE_MULT, dt)) { this.background.push(new ShootingStar()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.05 * FLAIR_RATE_MULT, dt)) { this.background.push(new Comet()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.03 * FLAIR_RATE_MULT, dt)) { this.background.push(new UFO()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.08 * FLAIR_RATE_MULT, dt)) { this.background.push(new Satellite()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) { this.background.push(BirdsFlock.spawn()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.04 * FLAIR_RATE_MULT, dt)) { this.background.push(new Airplane()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.02 * FLAIR_RATE_MULT, dt)) { this.background.push(new Balloon()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.05 * FLAIR_RATE_MULT, dt)) { this.background.push(BatsFlock.spawn()); spawnedBg++; }
          if (spawnedBg < capPerTick && !this._hasType(this.background, MeteorShower) && FlairManager._chance(0.008 * FLAIR_RATE_MULT, dt)) { this.background.push(MeteorShower.spawn()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) { this.background.push(new CloudWisp()); spawnedBg++; }
          if (spawnedBg < capPerTick && !this._hasType(this.background, StarlinkTrain) && FlairManager._chance(0.012 * FLAIR_RATE_MULT, dt)) { this.background.push(StarlinkTrain.spawn()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.02 * FLAIR_RATE_MULT, dt)) { this.background.push(new Blimp()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.015 * FLAIR_RATE_MULT, dt)) { this.background.push(new Moon()); spawnedBg++; }
          if (spawnedBg < capPerTick && !this._hasType(this.background, DistantLightning) && FlairManager._chance(0.01 * FLAIR_RATE_MULT, dt)) { this.background.push(new DistantLightning()); spawnedBg++; }
          if (spawnedBg < capPerTick && !this._hasType(this.background, AuroraCurtain) && FlairManager._chance(0.008 * FLAIR_RATE_MULT, dt)) { this.background.push(new AuroraCurtain()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.02 * FLAIR_RATE_MULT, dt)) { this.background.push(new Kite()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.02 * FLAIR_RATE_MULT, dt)) { this.background.push(new Paraglider()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.02 * FLAIR_RATE_MULT, dt)) { this.background.push(new Helicopter()); spawnedBg++; }
          if (spawnedBg < capPerTick && FlairManager._chance(0.015 * FLAIR_RATE_MULT, dt)) { const rl = RocketLaunch.trySpawn(game); if (rl) { this.background.push(rl); spawnedBg++; } }
          if (spawnedBg < capPerTick && FlairManager._chance(0.012 * FLAIR_RATE_MULT, dt)) { this.background.push(new RainbowArc()); spawnedBg++; }
        }
        // Ground events (caps)
        if (this.midground.length < 10 && !skipForShot) {
          if (FlairManager._chance(0.07 * FLAIR_RATE_MULT, dt)) {
            const mole = Mole.trySpawn(game);
            if (mole && spawnedMg < capPerTick) { this.midground.push(mole); spawnedMg++; }
          }
          if (FlairManager._chance(0.10 * FLAIR_RATE_MULT, dt)) {
            const ff = FireflyCluster.trySpawn(game);
            if (ff && spawnedMg < capPerTick) { this.midground.push(ff); spawnedMg++; }
          }
          if (FlairManager._chance(0.08 * FLAIR_RATE_MULT, dt)) {
            const h = Hedgehog.trySpawn(game);
            if (h && spawnedMg < capPerTick) { this.midground.push(h); spawnedMg++; }
          }
          if (FlairManager._chance(0.12 * FLAIR_RATE_MULT, dt)) {
            const r = Rabbit.trySpawn(game);
            if (r && spawnedMg < capPerTick) { this.midground.push(r); spawnedMg++; }
          }
          if (FlairManager._chance(0.05 * FLAIR_RATE_MULT, dt)) {
            const f = Fox.trySpawn(game);
            if (f && spawnedMg < capPerTick) { this.midground.push(f); spawnedMg++; }
          }
          if (FlairManager._chance(0.10 * FLAIR_RATE_MULT, dt)) {
            const d = DustPuff.trySpawn(game);
            if (d && spawnedMg < capPerTick) { this.midground.push(d); spawnedMg++; }
          }
          if (FlairManager._chance(0.10 * FLAIR_RATE_MULT, dt)) {
            const b = Butterflies.trySpawn(game);
            if (b && spawnedMg < capPerTick) { this.midground.push(b); spawnedMg++; }
          }
          if (FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) {
            const s = Snail.trySpawn(game);
            if (s && spawnedMg < capPerTick) { this.midground.push(s); spawnedMg++; }
          }
          if (FlairManager._chance(0.08 * FLAIR_RATE_MULT, dt)) {
            const tw = Tumbleweed.trySpawn(game);
            if (tw && spawnedMg < capPerTick) { this.midground.push(tw); spawnedMg++; }
          }
          if (FlairManager._chance(0.08 * FLAIR_RATE_MULT, dt)) {
            const lf = LeafFall.trySpawn(game);
            if (lf && spawnedMg < capPerTick) { this.midground.push(lf); spawnedMg++; }
          }
          if (FlairManager._chance(0.08 * FLAIR_RATE_MULT, dt)) {
            const ds = DandelionSeeds.trySpawn(game);
            if (ds && spawnedMg < capPerTick) { this.midground.push(ds); spawnedMg++; }
          }
          if (FlairManager._chance(0.10 * FLAIR_RATE_MULT, dt)) {
            const dr = DragonflySwarm.trySpawn(game);
            if (dr && spawnedMg < capPerTick) { this.midground.push(dr); spawnedMg++; }
          }
          if (FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) {
            const cat = CatSilhouette.trySpawn(game);
            if (cat && spawnedMg < capPerTick) { this.midground.push(cat); spawnedMg++; }
          }
          if (FlairManager._chance(0.05 * FLAIR_RATE_MULT, dt)) {
            const deer = DeerSilhouette.trySpawn(game);
            if (deer && spawnedMg < capPerTick) { this.midground.push(deer); spawnedMg++; }
          }
          if (FlairManager._chance(0.05 * FLAIR_RATE_MULT, dt)) {
            const owl = OwlPerch.trySpawn(game);
            if (owl && spawnedMg < capPerTick) { this.midground.push(owl); spawnedMg++; }
          }
          if (FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) {
            const sq = Squirrel.trySpawn(game);
            if (sq && spawnedMg < capPerTick) { this.midground.push(sq); spawnedMg++; }
          }
          if (FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) {
            const rc = Raccoon.trySpawn(game);
            if (rc && spawnedMg < capPerTick) { this.midground.push(rc); spawnedMg++; }
          }
          if (FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) {
            const sn = Snake.trySpawn(game);
            if (sn && spawnedMg < capPerTick) { this.midground.push(sn); spawnedMg++; }
          }
          if (FlairManager._chance(0.08 * FLAIR_RATE_MULT, dt)) {
            const gb = GroundBird.trySpawn(game);
            if (gb && spawnedMg < capPerTick) { this.midground.push(gb); spawnedMg++; }
          }
          if (FlairManager._chance(0.06 * FLAIR_RATE_MULT, dt)) {
            const wh = WindHat.trySpawn(game);
            if (wh && spawnedMg < capPerTick) { this.midground.push(wh); spawnedMg++; }
          }
          if (FlairManager._chance(0.05 * FLAIR_RATE_MULT, dt)) {
            const lr = LanternRelease.trySpawn(game);
            if (lr && spawnedMg < capPerTick) { this.midground.push(lr); spawnedMg++; }
          }
        }
        // small global cooldown between spawns to avoid overwhelming visuals
        if (this.background.length + this.midground.length > 0) {
          this.spawnCooldown = 0.22;
        }
      }
    }

    drawBackground(ctx) {
      for (const e of this.background) e.draw(ctx);
    }
    drawMidground(ctx) {
      for (const e of this.midground) e.draw(ctx);
    }

    static _chance(ratePerSecond, dt) {
      // Poisson process: probability of >=1 event in dt
      const p = 1 - Math.exp(-ratePerSecond * dt);
      return Math.random() < p;
    }
    _hasType(list, TypeCtor) {
      return list.some((e) => e instanceof TypeCtor);
    }
  }

  // --- SKY: Shooting Star ---
  class ShootingStar {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.speed = randRange(680, 980);
      this.tailLen = randRange(80, 120);
      this.x = leftToRight ? -80 : cssW + 80;
      this.y = randRange(40, Math.min(cssH * 0.38, 260));
      const down = randRange(120, 220);
      this.vx = leftToRight ? this.speed : -this.speed;
      this.vy = down;
      this.ttl = randRange(0.9, 1.6);
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ttl -= dt;
    }
    isAlive() {
      return this.ttl > 0 && this.x > -200 && this.x < cssW + 200 && this.y > -200 && this.y < cssH + 200;
    }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 0.3));
      const dx = this.vx, dy = this.vy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const tailX = this.x - ux * this.tailLen;
      const tailY = this.y - uy * this.tailLen;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- SKY: Comet ---
  class Comet {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      const speed = randRange(180, 300);
      const angle = (Math.random() - 0.5) * 0.35; // ~±10°
      this.x = leftToRight ? -120 : cssW + 120;
      this.y = randRange(60, Math.min(cssH * 0.45, 320));
      this.vx = Math.cos(angle) * speed * (leftToRight ? 1 : -1);
      this.vy = Math.sin(angle) * speed * (leftToRight ? 1 : -1);
      this.ttl = randRange(2.6, 4.2);
      this.maxTtl = this.ttl;
      this.tailLen = randRange(220, 320);
      this.coreR = randRange(3.0, 4.2);
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ttl -= dt;
    }
    isAlive() {
      return this.ttl > 0 && this.x > -240 && this.x < cssW + 240 && this.y > -240 && this.y < cssH + 240;
    }
    draw(ctx) {
      const life = Math.max(0.0001, this.ttl);
      const fade = Math.min(1, Math.max(0, life / (this.maxTtl * 0.5)));
      const dx = this.vx, dy = this.vy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const tailX = this.x - ux * this.tailLen;
      const tailY = this.y - uy * this.tailLen;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // Tail
      const g = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
      g.addColorStop(0, `rgba(255,230,160,${0.95 * fade})`);
      g.addColorStop(0.3, `rgba(255,180,80,${0.5 * fade})`);
      g.addColorStop(1, "rgba(255,120,20,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      // Core glow
      const rg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.coreR * 3);
      rg.addColorStop(0, `rgba(255,240,200,${0.9 * fade})`);
      rg.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreR * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,250,240,${0.9 * fade})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- SKY: UFO ---
  class UFO {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -120 : cssW + 120;
      this.y = randRange(80, Math.min(cssH * 0.40, 260));
      this.vx = (leftToRight ? 1 : -1) * randRange(60, 120);
      this.dir = leftToRight ? 1 : -1;
      this.elapsed = 0;
      this.maxLife = 14; // safety cap
      this.blinkT = 0;
      this.beamOn = Math.random() < 0.5;
      this.beamTimer = randRange(0.4, 1.4);
      this.hullW = 42;
      this.hullH = 12;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.elapsed += dt;
      this.blinkT += dt;
      this.beamTimer -= dt;
      if (this.beamTimer <= 0) {
        this.beamOn = !this.beamOn;
        this.beamTimer = randRange(0.5, 1.6);
      }
    }
    isAlive() {
      return this.elapsed < this.maxLife && this.x > -200 && this.x < cssW + 200;
    }
    draw(ctx) {
      const lifeLeft = Math.max(0.0001, this.maxLife - this.elapsed);
      const fade = Math.min(1, lifeLeft / 1.2); // fade out last ~1.2s
      ctx.save();
      // Beam (drawn first so it's behind hull)
      if (this.beamOn) {
        const topY = this.y + this.hullH * 0.6;
        const bottomY = Math.min(cssH - 10, this.y + 260);
        const halfTop = 8;
        const halfBottom = 40;
        // jemnější pulz (více frekvencí) — bez šumu knihoven
        const pulse = 0.6 + 0.4 * Math.sin(this.blinkT * 3.7) + 0.2 * Math.sin(this.blinkT * 11.3);
        const alpha = (0.08 + 0.05 * pulse) * fade;
        const g = ctx.createLinearGradient(this.x, topY, this.x, bottomY);
        g.addColorStop(0, `rgba(200,255,240, ${alpha})`);
        g.addColorStop(1, `rgba(200,255,240, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(this.x - halfTop, topY);
        ctx.lineTo(this.x + halfTop, topY);
        ctx.lineTo(this.x + halfBottom, bottomY);
        ctx.lineTo(this.x - halfBottom, bottomY);
        ctx.closePath();
        ctx.fill();
      }

      // Hull
      // main saucer
      const grd = ctx.createLinearGradient(this.x, this.y - this.hullH, this.x, this.y + this.hullH);
      grd.addColorStop(0, "#cfd8dc");
      grd.addColorStop(1, "#90a4ae");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.hullW, this.hullH, 0, 0, Math.PI * 2);
      ctx.fill();
      // top dome
      ctx.fillStyle = `rgba(227,242,253, ${fade})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - this.hullH * 0.7, this.hullW * 0.35, this.hullH * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // rim lights
      const lightCount = 6;
      for (let i = 0; i < lightCount; i++) {
        const t = (i / lightCount) * Math.PI * 2;
        const lx = this.x + Math.cos(t) * (this.hullW * 0.75);
        const ly = this.y + Math.sin(t) * (this.hullH * 0.4);
        const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(this.blinkT * 5 + i));
        ctx.fillStyle = `rgba(255, 255, 180, ${0.35 * pulse * fade})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Mole ---
  class Mole {
    static trySpawn(game) {
      // avoid spawning too close to tanks
      const minDist = 140;
      const candidates = 6;
      for (let i = 0; i < candidates; i++) {
        const x = Math.round(randRange(30, cssW - 30));
        const redDx = Math.abs(x - game.tanks.red.x);
        const blueDx = Math.abs(x - game.tanks.blue.x);
        if (redDx > minDist && blueDx > minDist) {
          const y = game.terrain.getHeightAt(x);
          return new Mole(x, y);
        }
      }
      return null;
    }
    constructor(x, groundY) {
      this.x = x;
      this.groundY = groundY;
      this.elapsed = 0;
      this.emerge = 0.6; // s
      this.stay = 1.0; // s
      this.hide = 0.6; // s
      this.maxRise = randRange(10, 16);
      this.eyeBlinkT = randRange(0.1, 0.3);
    }
    update(dt) {
      this.elapsed += dt;
      this.eyeBlinkT -= dt;
      if (this.eyeBlinkT <= 0) this.eyeBlinkT = randRange(0.8, 1.8);
    }
    isAlive() {
      return this.elapsed <= (this.emerge + this.stay + this.hide);
    }
    _easeInOut(k) {
      return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    }
    _rise() {
      const t = this.elapsed;
      if (t <= this.emerge) return this._easeInOut(t / this.emerge);
      if (t <= this.emerge + this.stay) return 1;
      const u = (t - this.emerge - this.stay) / this.hide;
      return 1 - this._easeInOut(Math.min(1, Math.max(0, u)));
    }
    draw(ctx) {
      const rise = this._rise();
      const headY = this.groundY - rise * this.maxRise;
      const baseW = 22, baseH = 4 + 6 * rise;
      // molehill base ring
      ctx.save();
      ctx.fillStyle = "#5d4733";
      ctx.beginPath();
      ctx.ellipse(this.x, this.groundY - 1, baseW, baseH, 0, 0, Math.PI * 2);
      ctx.fill();
      // head
      ctx.fillStyle = "#6e5540";
      ctx.beginPath();
      ctx.arc(this.x, headY - 6, 7 + 4.5 * rise, 0, Math.PI * 2);
      ctx.fill();
      // nose
      ctx.fillStyle = "#c48b8b";
      ctx.beginPath();
      ctx.arc(this.x + 4, headY - 6, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // eyes (blink)
      const open = this.eyeBlinkT > 0.12;
      ctx.fillStyle = "#111";
      if (open) {
        ctx.beginPath(); ctx.arc(this.x - 2.5, headY - 7, 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x + 1.0, headY - 7.2, 0.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(this.x - 3.0, headY - 7.4, 1.8, 0.4);
        ctx.fillRect(this.x + 0.5, headY - 7.6, 1.8, 0.4);
      }
      // subtle dust when going down
      if (rise < 0.2 && this.elapsed > (this.emerge + this.stay)) {
        ctx.globalAlpha = 0.2 * (0.2 - rise) / 0.2;
        ctx.fillStyle = 'rgba(200,190,170,0.3)';
        ctx.beginPath(); ctx.arc(this.x - 8, this.groundY - 4, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x + 9, this.groundY - 4, 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // --- GROUND: Firefly Cluster ---
  class FireflyCluster {
    static trySpawn(game) {
      // pick a segment not too close to tanks
      const minDist = 120;
      const x = Math.round(randRange(40, cssW - 40));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const groundY = game.terrain.getHeightAt(x);
      return new FireflyCluster(x, groundY);
    }
    constructor(x, groundY) {
      this.x = x;
      this.y = groundY - randRange(12, 36);
      this.flies = new Array(10 + Math.floor(Math.random() * 7)).fill(0).map(() => ({
        x: this.x + randRange(-20, 20),
        y: this.y + randRange(-10, 10),
        r: randRange(1.6, 2.4),
        t: Math.random() * Math.PI * 2,
        speed: randRange(0.8, 1.8),
        jitter: randRange(6, 14),
      }));
      this.ttl = randRange(2.8, 4.6);
    }
    update(dt) {
      this.ttl -= dt;
      const fadeOutStart = 0.8; // last seconds to fade/migrate away
      const leaving = this.ttl < fadeOutStart;
      for (const f of this.flies) {
        f.t += dt * f.speed;
        const wobbleX = Math.cos(f.t * 2.1) * 6 * dt;
        const wobbleY = Math.sin(f.t * 2.7) * 4 * dt;
        // gentle drift to the side as they fade
        const drift = leaving ? 14 * dt : 0;
        f.x += wobbleX + drift;
        f.y += wobbleY - (leaving ? 6 * dt : 0);
      }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const alpha = Math.max(0, Math.min(1, this.ttl / 0.6));
      for (const f of this.flies) {
        // větší vizuální tělo pro lepší viditelnost
        const radius = Math.max(7, 10 - (1 - alpha) * 4);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
        g.addColorStop(0, `rgba(255, 230, 120, ${0.55 * alpha})`);
        g.addColorStop(1, `rgba(255, 230, 120, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 240, 160, ${Math.min(1, 1.0 * alpha)})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- SKY: Satellite ---
  class Satellite {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -60 : cssW + 60;
      this.y = randRange(30, Math.min(120, cssH * 0.2));
      this.vx = (leftToRight ? 1 : -1) * randRange(45, 80);
      this.vy = 0;
      this.t = Math.random() * Math.PI * 2;
      this.ttl = randRange(5, 9);
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += Math.sin(this.t * 0.8) * 4 * dt; // tiny wobble
      this.t += dt;
      this.ttl -= dt;
    }
    isAlive() { return this.ttl > 0 && this.x > -80 && this.x < cssW + 80; }
    draw(ctx) {
      ctx.save();
      const blink = (Math.sin(this.t * 3.0) * 0.5 + 0.5) * 0.7 + 0.2;
      ctx.fillStyle = `rgba(200,220,255, ${blink})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // subtle trail
      const trailX = this.x - Math.sign(this.vx) * 14;
      const g = ctx.createLinearGradient(this.x, this.y, trailX, this.y);
      g.addColorStop(0, `rgba(200,220,255, ${0.35 * blink})`);
      g.addColorStop(1, `rgba(200,220,255, 0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(trailX, this.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- SKY: Birds Flock ---
  class BirdsFlock {
    static spawn() {
      const leftToRight = Math.random() < 0.5;
      const y = randRange(80, Math.min(cssH * 0.45, 320));
      const count = 3 + Math.floor(Math.random() * 5); // 3-7
      const speed = randRange(70, 110) * (leftToRight ? 1 : -1);
      const startX = leftToRight ? -60 : cssW + 60;
      return new BirdsFlock(startX, y, speed, leftToRight, count);
    }
    constructor(x, y, vx, leftToRight, count) {
      this.x = x; this.y = y; this.vx = vx; this.dir = leftToRight ? 1 : -1;
      this.count = count;
      this.ttl = randRange(4, 7);
      this.t = Math.random() * Math.PI * 2;
    }
    update(dt) { this.x += this.vx * dt; this.t += dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -100 && this.x < cssW + 100; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255, ${0.45 * fade})`;
      ctx.lineWidth = 1.8;
      const spread = 18;
      for (let i = 0; i < this.count; i++) {
        const offset = i - (this.count - 1) / 2;
        const wave = Math.sin(this.t * 2 + i * 0.6);
        const bx = this.x + offset * spread * this.dir + wave * 2;
        const by = this.y + Math.abs(offset) * 3 + Math.sin(this.t * 3 + i) * 2;
        // simple V wing: two short lines (větší)
        const size = 7;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - size * this.dir, by - 3.2);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - size * this.dir, by + 3.2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- SKY: Bats Flock (night variation) ---
  class BatsFlock {
    static spawn() {
      const leftToRight = Math.random() < 0.5;
      const y = randRange(cssH * 0.25, cssH * 0.5);
      const count = 6 + Math.floor(Math.random() * 6);
      const speed = randRange(90, 140) * (leftToRight ? 1 : -1);
      const startX = leftToRight ? -60 : cssW + 60;
      return new BatsFlock(startX, y, speed, leftToRight, count);
    }
    constructor(x, y, vx, leftToRight, count) {
      this.x = x; this.y = y; this.vx = vx; this.dir = leftToRight ? 1 : -1;
      this.count = count; this.t = Math.random() * Math.PI * 2; this.ttl = randRange(3, 6);
    }
    update(dt) { this.x += this.vx * dt; this.t += dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -120 && this.x < cssW + 120; }
    draw(ctx) {
      ctx.save();
      ctx.strokeStyle = "rgba(160,160,200,0.45)"; ctx.lineWidth = 1.6;
      const spread = 20;
      for (let i = 0; i < this.count; i++) {
        const offset = i - (this.count - 1) / 2;
        const bx = this.x + offset * spread * this.dir;
        const by = this.y + Math.sin(this.t * 8 + i) * 4;
        const size = 6;
        ctx.beginPath();
        ctx.moveTo(bx - size * this.dir, by);
        ctx.quadraticCurveTo(bx, by - 3.5, bx + size * this.dir, by);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- SKY: Meteor Shower (short burst of multiple shooting stars) ---
  class MeteorShower {
    static spawn() {
      return new MeteorShower();
    }
    constructor() {
      this.stars = new Array(6 + Math.floor(Math.random() * 5)).fill(0).map(() => new ShootingStar());
      this.ttl = 2.0;
    }
    update(dt) { this.ttl -= dt; for (const s of this.stars) s.update(dt); }
    isAlive() { return this.ttl > 0 && this.stars.some(s => s.isAlive()); }
    draw(ctx) { for (const s of this.stars) s.draw(ctx); }
  }

  // --- SKY: Airplane with contrail ---
  class Airplane {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -120 : cssW + 120;
      this.y = randRange(60, Math.min(cssH * 0.35, 260));
      this.vx = (leftToRight ? 1 : -1) * randRange(120, 170);
      this.dir = leftToRight ? 1 : -1;
      this.ttl = randRange(6, 10);
      this.contrail = [];
      this.contrailTimer = 0;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.contrailTimer += dt;
      if (this.contrailTimer >= 0.08) {
        this.contrailTimer = 0;
        this.contrail.push({ x: this.x - this.dir * 10, y: this.y + 2, ttl: 4 });
        if (this.contrail.length > 80) this.contrail.shift();
      }
      for (const c of this.contrail) c.ttl -= dt;
      this.ttl -= dt;
    }
    isAlive() { return this.ttl > 0 && this.x > -180 && this.x < cssW + 180; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 1.5));
      ctx.save();
      // contrail – segmentově s vlastním vyblednutím
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      let prev = null;
      for (let i = 0; i < this.contrail.length; i++) {
        const cur = this.contrail[i];
        if (cur.ttl <= 0) continue;
        if (prev && prev.ttl > 0) {
          const a = Math.min(1, Math.min(prev.ttl, cur.ttl) / 4) * 0.22 * fade;
          if (a > 0.001) {
            ctx.strokeStyle = `rgba(230,230,255, ${a})`;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(cur.x, cur.y);
            ctx.stroke();
          }
        }
        prev = cur;
      }

      // plane body
      ctx.fillStyle = `rgba(238,238,238, ${fade})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 10, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // wing
      ctx.fillStyle = `rgba(208,208,208, ${fade})`;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.dir * 8, this.y - 3);
      ctx.lineTo(this.x - this.dir * 2, this.y - 1);
      ctx.closePath();
      ctx.fill();
      // subtle engine glow
      const eg = ctx.createRadialGradient(this.x + this.dir * 6, this.y + 1, 0, this.x + this.dir * 6, this.y + 1, 6);
      eg.addColorStop(0, `rgba(255,220,160, ${0.15 * fade})`);
      eg.addColorStop(1, 'rgba(255,220,160, 0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(this.x + this.dir * 6, this.y + 1, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- SKY: Hot Air Balloon ---
  class Balloon {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -80 : cssW + 80;
      this.y = randRange(90, Math.min(cssH * 0.5, 340));
      this.vx = (leftToRight ? 1 : -1) * randRange(20, 40);
      this.bobT = Math.random() * Math.PI * 2;
      this.ttl = randRange(10, 18);
      this.color = Math.random() < 0.5 ? "#ff8a65" : "#9575cd";
    }
    update(dt) {
      this.x += this.vx * dt;
      this.bobT += dt;
      this.y += Math.sin(this.bobT * 0.7) * 8 * dt;
      this.ttl -= dt;
    }
    isAlive() { return this.ttl > 0 && this.x > -120 && this.x < cssW + 120; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 2));
      ctx.save();
      // envelope
      const r = 16;
      const g = ctx.createRadialGradient(this.x - 6, this.y - 6, 2, this.x, this.y, r);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = this._applyAlpha(this.color, fade);
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
      // basket
      ctx.strokeStyle = `rgba(109,76,65, ${fade})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x - 4, this.y + 10);
      ctx.lineTo(this.x - 3, this.y + 18);
      ctx.lineTo(this.x + 3, this.y + 18);
      ctx.lineTo(this.x + 4, this.y + 10);
      ctx.stroke();
      // cords
      ctx.beginPath();
      ctx.moveTo(this.x - 3, this.y + 10);
      ctx.lineTo(this.x - 2, this.y + 5);
      ctx.moveTo(this.x + 3, this.y + 10);
      ctx.lineTo(this.x + 2, this.y + 5);
      ctx.stroke();
      // fade end: envelope shrinks slightly
      if (this.ttl < 1.5) {
        const k = Math.max(0.8, this.ttl / 1.5);
        ctx.globalAlpha = 0.4 * (1 - k);
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    _applyAlpha(hexOrRgb, a) {
      if (hexOrRgb.startsWith('#')) {
        // simple hex to rgba fallback for two preset colors
        const c = hexOrRgb === '#ff8a65' ? '255,138,101' : '149,117,205';
        return `rgba(${c}, ${a})`;
      }
      return hexOrRgb;
    }
  }

  // --- GROUND: Hedgehog ---
  class Hedgehog {
    static trySpawn(game) {
      const minDist = 120;
      for (let k = 0; k < 6; k++) {
        const leftToRight = Math.random() < 0.5;
        const x = leftToRight ? -20 : cssW + 20;
        const targetX = leftToRight ? cssW + 20 : -20;
        const midX = randRange(cssW * 0.25, cssW * 0.75);
        const distOk = Math.abs(midX - game.tanks.red.x) > minDist && Math.abs(midX - game.tanks.blue.x) > minDist;
        const slope = terrainSlopeAt(game.terrain, midX);
        const slopeOk = Math.abs(slope) < 0.5;
        if (!distOk || !slopeOk) continue;
        const yStart = game.terrain.getHeightAt(x);
        return new Hedgehog(x, targetX, yStart);
      }
      return null;
    }
    constructor(startX, targetX, groundY) {
      this.x = startX; this.targetX = targetX; this.groundY = groundY; this.ttl = 10;
      this.speed = 36 * Math.sign(targetX - startX);
      this.t = Math.random() * Math.PI * 2;
      this.phase = Math.random() * Math.PI * 2;
    }
    update(dt, game) {
      this.x += this.speed * dt; this.t += dt; this.ttl -= dt;
      if (game) {
        this.groundY = game.terrain.getHeightAt(this.x);
        this.groundSlope = terrainSlopeAt(game.terrain, this.x);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -40 && this.x < cssW + 40; }
    draw(ctx) {
      const y = this.groundY - 9; // slight above ground (větší tělo)
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      const tilt = Math.max(-0.25, Math.min(0.25, Math.atan(this.groundSlope || 0)));
      ctx.save();
      ctx.translate(this.x, y);
      ctx.rotate(tilt);
      // body (větší oval)
      ctx.fillStyle = `rgba(93,71,51, ${fade})`;
      ctx.beginPath(); ctx.ellipse(0, 0, 8.0, 5.2, 0, 0, Math.PI * 2); ctx.fill();
      // spikes
      ctx.strokeStyle = `rgba(77,59,42, ${fade})`; ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI + i * (Math.PI / 10);
        ctx.beginPath();
        ctx.moveTo(-1, -1);
        ctx.lineTo(-1 + Math.cos(a) * 10, -1 + Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Rabbit ---
  class Rabbit {
    static trySpawn(game) {
      const minDist = 120;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -30 : cssW + 30;
      const targetX = leftToRight ? cssW + 30 : -30;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const slope = terrainSlopeAt(game.terrain, midX);
      if (Math.abs(slope) > 0.8) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Rabbit(startX, targetX, yStart, leftToRight);
    }
    constructor(startX, targetX, groundY, leftToRight) {
      this.x = startX; this.targetX = targetX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.speed = 85 * this.dir; this.t = 0; this.ttl = 8;
      this.phase = Math.random() * Math.PI * 2;
    }
    update(dt, game) {
      // move along ground contour: horizontal; Y from terrain, prevent tunneling on steep edges
      this.t += dt; this.ttl -= dt;
      this.x += this.speed * dt;
      if (game) {
        const nx = Math.max(0, Math.min(cssW - 1, this.x));
        this.groundY = game.terrain.getHeightAt(nx);
        this.groundSlope = terrainSlopeAt(game.terrain, nx);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -50 && this.x < cssW + 50; }
    draw(ctx) {
      // hop cycles synced with speed; ensure contact with ground profile
      const cycle = (this.t * 3.0 + this.phase) % (Math.PI * 2);
      const hop = Math.max(0, Math.sin(cycle)) * 6.5;
      const y = this.groundY - 6 - hop;
      const slopeTilt = Math.atan(this.groundSlope || 0);
      const lean = Math.sin(cycle) * 0.15 * this.dir + Math.max(-0.12, Math.min(0.12, slopeTilt)) * 0.5;
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      ctx.fillStyle = `rgba(224,224,224, ${fade})`;
      // body (větší pro lepší viditelnost)
      ctx.save();
      ctx.translate(this.x, y);
      ctx.rotate(lean);
      ctx.beginPath(); ctx.ellipse(0, 0, 5.6, 4.0, 0, 0, Math.PI * 2); ctx.fill();
      // head
      ctx.beginPath(); ctx.arc(5.8 * this.dir, -2.2, 3.2, 0, Math.PI * 2); ctx.fill();
      // ears
      ctx.strokeStyle = `rgba(224,224,224, ${fade})`; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(5.2 * this.dir, -3.2);
      ctx.lineTo(5.2 * this.dir, -10.5);
      ctx.moveTo(6.8 * this.dir, -3.2);
      ctx.lineTo(8.2 * this.dir, -10.5);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    }
  }

  // --- GROUND: Fox ---
  class Fox {
    static trySpawn(game) {
      const minDist = 140;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -40 : cssW + 40;
      const targetX = leftToRight ? cssW + 40 : -40;
      const midX = randRange(cssW * 0.15, cssW * 0.85);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const slope = terrainSlopeAt(game.terrain, midX);
      if (Math.abs(slope) > 0.9) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Fox(startX, targetX, yStart, leftToRight);
    }
    constructor(startX, targetX, groundY, leftToRight) {
      this.x = startX; this.targetX = targetX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.speed = 70 * this.dir; this.t = 0; this.ttl = 8;
    }
    update(dt, game) {
      this.x += this.speed * dt; this.t += dt; this.ttl -= dt;
      if (game) {
        this.groundY = game.terrain.getHeightAt(this.x);
        this.groundSlope = terrainSlopeAt(game.terrain, this.x);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -60 && this.x < cssW + 60; }
    draw(ctx) {
      const y = this.groundY - 7 + Math.sin(this.t * 6) * 0.6;
      const fade = Math.min(1, Math.max(0, this.ttl / 1.0));
      ctx.save();
      ctx.fillStyle = `rgba(239,108,0, ${fade})`; // orange
      // body + slight tilt per actual measured ground slope
      const slopeAngle = Math.atan(this.groundSlope || 0);
      ctx.translate(this.x, y);
      ctx.rotate(Math.max(-0.2, Math.min(0.2, slopeAngle)));
      // výrazněji větší tělo/hlava pro čitelnost
      ctx.beginPath(); ctx.ellipse(0, 0, 10.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      // head
      ctx.beginPath(); ctx.arc(9.0 * this.dir, -1.2, 3.4, 0, Math.PI * 2); ctx.fill();
      // tail
      ctx.strokeStyle = `rgba(239,108,0, ${fade})`; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8 * this.dir, 0.2);
      ctx.lineTo(-16 * this.dir, -2.5);
      ctx.stroke();
      // fade out step as it exits
      // (redundant dříve – přesun není potřeba, ale zachováno bez změny alphy)
      ctx.restore();
    }
  }

  // --- GROUND: Dust Puff (small wind gust) ---
  class DustPuff {
    static trySpawn(game) {
      const minDist = 120;
      const x = Math.round(randRange(40, cssW - 40));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const y = game.terrain.getHeightAt(x);
      return new DustPuff(x, y);
    }
    constructor(x, groundY) {
      this.particles = new Array(18 + Math.floor(Math.random() * 12)).fill(0).map(() => ({
        x: x + randRange(-8, 8),
        y: groundY - randRange(0, 3),
        vx: randRange(30, 80),
        vy: randRange(-12, -3),
        r: randRange(0.8, 1.8),
        ttl: randRange(0.9, 1.6),
      }));
      this.ttl = 1.8;
    }
    update(dt) {
      this.ttl -= dt;
      for (const p of this.particles) {
        p.ttl -= dt;
        p.vy += 10 * dt;
        p.x += p.vx * dt * 0.9; // slight ground drag
        p.y += p.vy * dt;
      }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      ctx.save();
      // fade with ttl and clamp to ground
      for (const p of this.particles) {
        if (p.ttl <= 0) continue;
        const a = Math.min(1, p.ttl / 0.5) * 0.18;
        ctx.fillStyle = `rgba(200,190,170, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- SKY: Cloud Wisp (soft translucent cloud band) ---
  class CloudWisp {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -200 : cssW + 200;
      this.y = randRange(40, Math.min(cssH * 0.5, 360));
      this.vx = (leftToRight ? 1 : -1) * randRange(10, 24);
      this.scale = randRange(0.8, 1.4);
      this.ttl = randRange(14, 24);
      this.noiseT = Math.random() * 1000;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.noiseT += dt;
      this.ttl -= dt;
    }
    isAlive() { return this.ttl > 0 && this.x > -280 && this.x < cssW + 280; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 2));
      const w = 240 * this.scale;
      const h = 60 * this.scale;
      const segments = 6;
      for (let i = 0; i < segments; i++) {
        const ox = (i / segments - 0.5) * w;
        const oy = Math.sin(this.noiseT * 0.6 + i) * 4;
        const rot = Math.sin(this.noiseT * 0.4 + i) * 0.12;
        const localAlpha = (0.6 + 0.4 * Math.sin(this.noiseT * 0.8 + i * 0.9)) * 0.12 * fade;
        ctx.save();
        ctx.globalAlpha = Math.max(0, localAlpha);
        ctx.fillStyle = '#ffffff';
        ctx.translate(this.x + ox, this.y + oy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // --- SKY: Starlink-like Train (series of faint satellites) ---
  class StarlinkTrain {
    static spawn() { return new StarlinkTrain(); }
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.dir = leftToRight ? 1 : -1;
      this.y = randRange(50, Math.min(160, cssH * 0.25));
      this.v = randRange(55, 85) * this.dir;
      const startX = leftToRight ? -120 : cssW + 120;
      const count = 8 + Math.floor(Math.random() * 8);
      const spacing = 22;
      this.points = new Array(count).fill(0).map((_, i) => ({
        x: startX - this.dir * i * spacing + randRange(-2, 2),
        y: this.y + (Math.random() - 0.5) * 4,
        a: 1 - i / (count + 2),
        life: randRange(8, 12)
      }));
      this.ttl = 10;
      this.blinkT = Math.random() * Math.PI * 2;
    }
    update(dt) {
      this.ttl -= dt;
      this.blinkT += dt;
      for (const p of this.points) {
        p.x += this.v * dt + randRange(-2, 2) * 0.05; // drobný jitter
        p.life -= dt * 0.6;
      }
    }
    isAlive() { return this.ttl > 0 && this.points.some(p => p.x > -60 && p.x < cssW + 60); }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.points.length; i++) {
        const p = this.points[i];
        const twinkle = 0.5 + 0.5 * Math.sin(this.blinkT * 3 + i * 0.7);
        const baseA = Math.min(1, Math.max(0, p.life / 2)) * 0.7;
        const a = baseA * p.a * twinkle;
        if (a <= 0.002) continue;
        // tiny glow
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
        rg.addColorStop(0, `rgba(210, 230, 255, ${a * 0.6})`);
        rg.addColorStop(1, 'rgba(210, 230, 255, 0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
        // core
        ctx.fillStyle = `rgba(210, 230, 255, ${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Butterflies cluster ---
  class Butterflies {
    static trySpawn(game) {
      const minDist = 100;
      const x = Math.round(randRange(60, cssW - 60));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const slope = terrainSlopeAt(game.terrain, x);
      if (Math.abs(slope) > 0.9) return null;
      const groundY = game.terrain.getHeightAt(x);
      return new Butterflies(x, groundY - randRange(10, 24));
    }
    constructor(x, y) {
      this.flies = new Array(6 + Math.floor(Math.random() * 6)).fill(0).map(() => ({
        x: x + randRange(-24, 24),
        y: y + randRange(-14, 6),
        t: Math.random() * Math.PI * 2,
        speed: randRange(1.0, 2.0),
        hue: Math.floor(randRange(20, 60)),
        size: randRange(3.2, 4.8),
      }));
      this.ttl = randRange(4.0, 7.0);
    }
    update(dt) {
      this.ttl -= dt;
      const leaving = this.ttl < 0.8;
      for (const b of this.flies) {
        b.t += dt * b.speed;
        b.x += Math.cos(b.t * 2.5) * 10 * dt + (leaving ? 16 * dt : 0);
        b.y += Math.sin(b.t * 3.0) * 8 * dt - (leaving ? 8 * dt : 0);
      }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const alpha = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      for (const b of this.flies) {
        const flap = Math.sin(b.t * 12) * 0.6;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(flap * 0.1);
        ctx.fillStyle = `hsla(${b.hue}, 80%, 70%, ${0.9 * alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size * 2.0, b.size * 1.1, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size * 2.0, b.size * 1.1, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Snail ---
  class Snail {
    static trySpawn(game) {
      const minDist = 120;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -30 : cssW + 30;
      const targetX = leftToRight ? cssW + 30 : -30;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const slope = terrainSlopeAt(game.terrain, midX);
      if (Math.abs(slope) > 0.6) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Snail(startX, targetX, yStart, leftToRight);
    }
    constructor(startX, targetX, groundY, leftToRight) {
      this.x = startX; this.targetX = targetX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.speed = 14 * this.dir; this.t = 0; this.ttl = 18;
    }
    update(dt, game) {
      this.x += this.speed * dt; this.t += dt; this.ttl -= dt;
      if (game) this.groundY = game.terrain.getHeightAt(this.x);
    }
    isAlive() { return this.ttl > 0 && this.x > -50 && this.x < cssW + 50; }
    draw(ctx) {
      const y = this.groundY - 2;
      const fade = Math.min(1, Math.max(0, this.ttl / 1.0));
      ctx.save();
      // shell (větší)
      ctx.fillStyle = `rgba(160,120,80, ${fade})`;
      ctx.beginPath(); ctx.arc(this.x - 2.2 * this.dir, y - 2, 3.2, 0, Math.PI * 2); ctx.fill();
      // body (delší a tlustší)
      ctx.strokeStyle = `rgba(150,140,130, ${fade})`; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(this.x - 3.6 * this.dir, y); ctx.lineTo(this.x + 4.2 * this.dir, y); ctx.stroke();
      // tykadla
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(this.x + 2.2 * this.dir, y - 0.5); ctx.lineTo(this.x + 3.6 * this.dir, y - 3); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.x + 3.8 * this.dir, y - 3.2, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- GROUND: Tumbleweed ---
  class Tumbleweed {
    static trySpawn(game) {
      const minDist = 140;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -30 : cssW + 30;
      const targetX = leftToRight ? cssW + 30 : -30;
      const midX = randRange(cssW * 0.15, cssW * 0.85);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const slope = terrainSlopeAt(game.terrain, midX);
      if (Math.abs(slope) > 1.2) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Tumbleweed(startX, targetX, yStart, leftToRight);
    }
    constructor(startX, targetX, groundY, leftToRight) {
      this.x = startX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.speed = randRange(40, 80) * this.dir; this.r = randRange(5, 9); this.rot = 0; this.ttl = 10;
    }
    update(dt, game) {
      this.x += this.speed * dt; this.rot += (this.speed * dt) / this.r; this.ttl -= dt;
      if (game) this.groundY = game.terrain.getHeightAt(this.x);
    }
    isAlive() { return this.ttl > 0 && this.x > -60 && this.x < cssW + 60; }
    draw(ctx) {
      const y = this.groundY - this.r;
      const fade = Math.min(1, Math.max(0, this.ttl / 1.0));
      ctx.save();
      ctx.translate(this.x, y);
      ctx.rotate(this.rot);
      ctx.strokeStyle = `rgba(170,140,100, ${0.6 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      // multiple tangled rings
      const radii = [this.r, this.r * 0.82, this.r * 0.65];
      const counts = [10, 8, 6];
      for (let k = 0; k < radii.length; k++) {
        const R = radii[k];
        const n = counts[k];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + k * 0.35;
          const arcLen = (0.5 + 0.15 * Math.sin(i * 1.7 + k)) * Math.PI; // 0.5π .. 0.65π
          ctx.beginPath();
          ctx.arc(0, 0, R, a0, a0 + arcLen);
          ctx.stroke();
        }
      }
      // sparse radial twigs
      for (let i = 0; i < 7; i++) {
        const ang = i * (Math.PI * 2 / 7) + 0.3;
        const x0 = Math.cos(ang) * this.r * 0.25;
        const y0 = Math.sin(ang) * this.r * 0.25;
        const x1 = Math.cos(ang) * this.r;
        const y1 = Math.sin(ang) * this.r;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Leaf Fall ---
  class LeafFall {
    static trySpawn(game) {
      const minDist = 100;
      const x = Math.round(randRange(60, cssW - 60));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      return new LeafFall(x);
    }
    constructor(x) {
      this.leaves = new Array(12 + Math.floor(Math.random() * 12)).fill(0).map(() => ({
        x: x + randRange(-80, 80),
        y: randRange(0, cssH * 0.3),
        vy: randRange(16, 28),
        t: Math.random() * Math.PI * 2,
        size: randRange(2.2, 3.6),
        hue: Math.floor(randRange(15, 40)),
      }));
      this.ttl = 6;
    }
    update(dt, game) {
      this.ttl -= dt;
      for (const l of this.leaves) {
        l.t += dt;
        l.x += Math.sin(l.t * 2) * 8 * dt;
        l.y += l.vy * dt;
        if (game) {
          const gy = game.terrain.getHeightAt(l.x);
          if (l.y >= gy - 2) { l.y = gy - 2; l.vy = 0; }
        }
      }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 1));
      ctx.save();
      for (const l of this.leaves) {
        ctx.fillStyle = `hsla(${l.hue}, 60%, 55%, ${0.7 * fade})`;
        ctx.beginPath(); ctx.ellipse(l.x, l.y, l.size * 1.6, l.size, l.t, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Dandelion Seeds (parachute) ---
  class DandelionSeeds {
    static trySpawn(game) {
      const minDist = 120;
      const x = Math.round(randRange(40, cssW - 40));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const groundY = game.terrain.getHeightAt(x);
      return new DandelionSeeds(x, groundY);
    }
    constructor(x, groundY) {
      this.seeds = new Array(12 + Math.floor(Math.random() * 8)).fill(0).map(() => ({
        x: x + randRange(-20, 20),
        y: groundY - randRange(0, 20),
        t: Math.random() * Math.PI * 2,
        vy: randRange(-16, -8),
        vx: randRange(10, 20),
        r: randRange(1.0, 1.6),
      }));
      this.ttl = 4.5;
    }
    update(dt) {
      this.ttl -= dt;
      for (const s of this.seeds) {
        s.t += dt;
        // rotace a mírné klouzání
        const wind = 1 + 0.3 * Math.sin(s.t * 1.3);
        s.x += (Math.cos(s.t * 2) * s.vx * 0.05 + s.vx * dt * 0.2) * wind;
        s.y += s.vy * dt + Math.sin(s.t * 2.5) * 6 * dt;
      }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      for (const s of this.seeds) {
        const rot = Math.sin(s.t * 3) * 0.4;
        ctx.translate(s.x, s.y);
        ctx.rotate(rot);
        ctx.strokeStyle = `rgba(240,240,240, ${0.6 * fade})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -6, s.r * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
    }
  }

  // --- GROUND: Dragonfly Swarm ---
  class DragonflySwarm {
    static trySpawn(game) {
      const minDist = 120;
      const x = Math.round(randRange(60, cssW - 60));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const groundY = game.terrain.getHeightAt(x);
      return new DragonflySwarm(x, groundY - randRange(10, 40));
    }
    constructor(x, y) {
      this.flies = new Array(8 + Math.floor(Math.random() * 6)).fill(0).map(() => ({
        x: x + randRange(-20, 20), y: y + randRange(-6, 6), t: Math.random() * Math.PI * 2,
      }));
      this.dir = Math.random() < 0.5 ? -1 : 1; this.speed = randRange(60, 110) * this.dir; this.ttl = 3.5;
      this.scale = 1.2; // větší vážky
    }
    update(dt) {
      this.ttl -= dt;
      for (const f of this.flies) {
        f.t += dt * 6;
        f.x += this.speed * dt + Math.sin(f.t) * 8 * dt;
        f.y += Math.cos(f.t * 1.6) * 4 * dt;
      }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 0.6));
      ctx.save();
      for (const f of this.flies) {
        const wing = (0.8 + 0.6 * Math.sin(f.t * 12)) * this.scale;
        // glow těla
        const rg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 3.5 * this.scale);
        rg.addColorStop(0, `rgba(200,230,255, ${0.55 * fade})`);
        rg.addColorStop(1, 'rgba(200,230,255, 0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(f.x, f.y, 3.5 * this.scale, 0, Math.PI * 2); ctx.fill();
        // tělo
        ctx.strokeStyle = `rgba(200,230,255, ${0.8 * fade})`;
        ctx.lineWidth = 1.2 * this.scale;
        ctx.beginPath(); ctx.moveTo(f.x - 2 * this.scale, f.y); ctx.lineTo(f.x + 2 * this.scale, f.y); ctx.stroke();
        // křídla – dvě čárky s rychlým flickrem
        ctx.lineWidth = 1 * this.scale;
        const a = 0.6 * fade * (0.7 + 0.3 * Math.sin(f.t * 20));
        ctx.strokeStyle = `rgba(200,230,255, ${a})`;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + 3 * this.scale, f.y - wing); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - 3 * this.scale, f.y - wing); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- SKY: Aurora Curtain ---
  class AuroraCurtain {
    constructor() {
      this.phase = Math.random() * Math.PI * 2;
      this.speed = randRange(0.2, 0.5);
      this.height = randRange(80, 140);
      this.alpha = randRange(0.08, 0.16);
      this.hue = 120 + Math.random() * 60; // greenish to teal
      this.ttl = randRange(8, 14);
    }
    update(dt) { this.phase += dt * this.speed; this.ttl -= dt; }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 1.5));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // adaptivní krok dle šířky – méně sloupců => menší overdraw
      const desiredColumns = Math.max(18, Math.floor(cssW / 60));
      const step = cssW / desiredColumns;
      for (let i = 0; i <= desiredColumns; i++) {
        const x = i * step;
        const t = x / cssW * Math.PI * 2;
        const wobble = Math.sin(t * 1.6 + this.phase) * 14 + Math.sin(t * 0.9 + this.phase * 0.7) * 10;
        const top = Math.max(0, 8 + wobble);
        const jitter = Math.sin(this.phase * 1.3 + i * 0.5) * 6;
        const bottom = top + this.height + Math.sin(t * 2.3 + this.phase) * 10 + jitter;
        const g = ctx.createLinearGradient(x, top, x, bottom);
        g.addColorStop(0, `hsla(${this.hue}, 70%, 60%, ${0.0})`);
        g.addColorStop(0.3, `hsla(${this.hue}, 70%, 60%, ${this.alpha * 0.8 * fade})`);
        g.addColorStop(1, `hsla(${this.hue}, 70%, 60%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - step * 0.6, top, step * 1.2, Math.max(1, bottom - top));
      }
      ctx.restore();
    }
  }

  // --- SKY: Blimp (Zeppelin) ---
  class Blimp {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -140 : cssW + 140;
      this.y = randRange(80, Math.min(cssH * 0.45, 320));
      this.vx = (leftToRight ? 1 : -1) * randRange(24, 40);
      this.dir = leftToRight ? 1 : -1;
      this.ttl = randRange(12, 20);
      this.bobT = Math.random() * Math.PI * 2;
    }
    update(dt) { this.x += this.vx * dt; this.bobT += dt * 0.6; this.y += Math.sin(this.bobT) * 4 * dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -180 && this.x < cssW + 180; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 2));
      ctx.save();
      // hull
      const w = 40, h = 12;
      const grd = ctx.createLinearGradient(this.x, this.y - h, this.x, this.y + h);
      grd.addColorStop(0, `rgba(230,230,230, ${0.9 * fade})`);
      grd.addColorStop(1, `rgba(180,180,180, ${0.9 * fade})`);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, w, h, 0, 0, Math.PI * 2); ctx.fill();
      // fins
      ctx.fillStyle = `rgba(170,170,170, ${0.9 * fade})`;
      ctx.beginPath();
      ctx.moveTo(this.x - w + 6 * this.dir, this.y);
      ctx.lineTo(this.x - w + 16 * this.dir, this.y - 6);
      ctx.lineTo(this.x - w + 16 * this.dir, this.y + 6);
      ctx.closePath(); ctx.fill();
      // gondola
      ctx.fillStyle = `rgba(120,120,120, ${0.9 * fade})`;
      ctx.beginPath();
      ctx.roundRect?.(this.x - 8 * this.dir, this.y + 8, 16, 6, 2);
      if (!ctx.roundRect) { ctx.rect(this.x - 8 * this.dir, this.y + 8, 16, 6); }
      ctx.fill();
      ctx.restore();
    }
  }

  // --- SKY: Distant Lightning ---
  class DistantLightning {
    constructor() {
      this.x = randRange(cssW * 0.1, cssW * 0.9);
      this.horizonY = cssH * 0.7;
      this.points = [];
      const segments = 8;
      let px = this.x, py = 0;
      for (let i = 0; i <= segments; i++) {
        const ny = (i / segments) * (this.horizonY - 10);
        const nx = this.x + randRange(-12, 12) * (1 - i / segments);
        this.points.push({ x: nx, y: ny });
        px = nx; py = ny;
      }
      // multi-flash v rámci jednoho jevu
      this.ttl = 0.4 + Math.random() * 0.3;
      this.t = 0;
      // předpočítej 2–3 vedlejší větve (slabé)
      const branchCount = 1 + Math.floor(Math.random() * 3);
      this.branches = new Array(branchCount).fill(0).map(() => {
        const idx = 2 + Math.floor(Math.random() * (segments - 3));
        const origin = this.points[idx];
        const len = 3 + Math.floor(Math.random() * 3);
        const pts = [{ x: origin.x, y: origin.y }];
        for (let k = 1; k <= len; k++) {
          pts.push({ x: origin.x + randRange(-18, 18) * (k / len), y: origin.y + k * ((this.horizonY - origin.y) / (len + 2)) });
        }
        return pts;
      });
    }
    update(dt) { this.t += dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const flash = Math.pow(Math.max(0, Math.sin(this.t * 40)), 1.8);
      const a = (0.8 * flash) * Math.min(1, Math.max(0, this.ttl / 0.12));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,255,255, ${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.points.length; i++) {
        const p = this.points[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      // branches (slabší alpha)
      ctx.strokeStyle = `rgba(255,255,255, ${a * 0.35})`;
      ctx.lineWidth = 1.5;
      for (const br of (this.branches || [])) {
        ctx.beginPath();
        for (let i = 0; i < br.length; i++) {
          const p = br[i];
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      // horizon glow
      const gx = this.x, gy = this.horizonY - 6, gr = 80;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, `rgba(255,255,255, ${0.10 * a})`);
      g.addColorStop(1, 'rgba(255,255,255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- SKY: Moon ---
  class Moon {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -120 : cssW + 120;
      this.y = randRange(60, 160);
      this.vx = (leftToRight ? 1 : -1) * randRange(14, 24);
      this.r = 14;
      this.ttl = randRange(12, 20);
    }
    update(dt) { this.x += this.vx * dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -160 && this.x < cssW + 160; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 2));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 3);
      g.addColorStop(0, `rgba(255,255,220, ${0.35 * fade})`);
      g.addColorStop(1, 'rgba(255,255,220, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,230, ${0.9 * fade})`;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- GROUND: Cat Silhouette ---
  class CatSilhouette {
    static trySpawn(game) {
      const minDist = 130;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -40 : cssW + 40;
      const targetX = leftToRight ? cssW + 40 : -40;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new CatSilhouette(startX, targetX, yStart, leftToRight);
    }
    constructor(startX, targetX, groundY, leftToRight) {
      this.x = startX; this.targetX = targetX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.speed = 50 * this.dir; this.t = 0; this.ttl = 10;
    }
    update(dt, game) {
      this.x += this.speed * dt; this.t += dt; this.ttl -= dt;
      if (game) {
        this.groundY = game.terrain.getHeightAt(this.x);
        this.groundSlope = terrainSlopeAt(game.terrain, this.x);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -60 && this.x < cssW + 60; }
    draw(ctx) {
      const y = this.groundY - 6;
      const fade = Math.min(1, Math.max(0, this.ttl / 1.0));
      ctx.save();
      ctx.fillStyle = `rgba(30,30,30, ${0.85 * fade})`;
      // body (větší) + jednoduché nožky
      ctx.beginPath(); ctx.ellipse(this.x, y, 11.0, 5.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(30,30,30, ${0.85 * fade})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x - 4 * this.dir, y + 4); ctx.lineTo(this.x - 2 * this.dir, y + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x + 1 * this.dir, y + 4); ctx.lineTo(this.x + 3 * this.dir, y + 6); ctx.stroke();
      // head (větší)
      ctx.beginPath(); ctx.arc(this.x + 12.0 * this.dir, y - 2.2, 3.8, 0, Math.PI * 2); ctx.fill();
      // ears
      ctx.beginPath(); ctx.moveTo(this.x + 8.5 * this.dir, y - 4); ctx.lineTo(this.x + 7.5 * this.dir, y - 7); ctx.lineTo(this.x + 9.5 * this.dir, y - 6); ctx.closePath(); ctx.fill();
      // tail
      ctx.beginPath();
      const tailW = 14, wag = Math.sin(this.t * 6) * 2.4;
      ctx.moveTo(this.x - 9 * this.dir, y);
      ctx.quadraticCurveTo(this.x - 9 * this.dir - tailW * 0.4, y - 3 + wag, this.x - 9 * this.dir - tailW, y + 2 + wag);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- GROUND: Deer Silhouette ---
  class DeerSilhouette {
    static trySpawn(game) {
      const minDist = 150;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -60 : cssW + 60;
      const targetX = leftToRight ? cssW + 60 : -60;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new DeerSilhouette(startX, targetX, yStart, leftToRight);
    }
    constructor(startX, targetX, groundY, leftToRight) {
      this.x = startX; this.targetX = targetX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.speed = 70 * this.dir; this.t = 0; this.ttl = 9; this.phase = Math.random() * Math.PI * 2;
    }
    update(dt, game) { this.x += this.speed * dt; this.t += dt; this.ttl -= dt; if (game) this.groundY = game.terrain.getHeightAt(this.x); }
    isAlive() { return this.ttl > 0 && this.x > -80 && this.x < cssW + 80; }
    draw(ctx) {
      const hop = Math.max(0, Math.sin(this.t * 2.6 + this.phase)) * 5;
      const y = this.groundY - 8 - hop;
      const fade = Math.min(1, Math.max(0, this.ttl / 1));
      ctx.save(); ctx.fillStyle = `rgba(40,40,40, ${0.85 * fade})`; ctx.strokeStyle = `rgba(40,40,40, ${0.85 * fade})`; ctx.lineWidth = 2;
      // body larger
      ctx.beginPath(); ctx.ellipse(this.x, y, 14.0, 5.8, 0, 0, Math.PI * 2); ctx.fill();
      // simple legs
      ctx.beginPath(); ctx.moveTo(this.x - 5 * this.dir, y + 5); ctx.lineTo(this.x - 3 * this.dir, y + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x + 2 * this.dir, y + 5); ctx.lineTo(this.x + 4 * this.dir, y + 8); ctx.stroke();
      // neck + head
      ctx.beginPath(); ctx.moveTo(this.x + 13 * this.dir, y - 2); ctx.lineTo(this.x + 18 * this.dir, y - 9); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.x + 19 * this.dir, y - 9, 3.2, 0, Math.PI * 2); ctx.fill();
      // antlers
      ctx.beginPath(); ctx.moveTo(this.x + 18 * this.dir, y - 10); ctx.lineTo(this.x + 21 * this.dir, y - 15); ctx.moveTo(this.x + 18 * this.dir, y - 10); ctx.lineTo(this.x + 16.5 * this.dir, y - 15); ctx.stroke();
      ctx.restore();
    }
  }

  // --- GROUND: Owl Perch and Fly ---
  class OwlPerch {
    static trySpawn(game) {
      const minDist = 120;
      const x = Math.round(randRange(60, cssW - 60));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const groundY = game.terrain.getHeightAt(x);
      const leftToRight = Math.random() < 0.5;
      return new OwlPerch(x, groundY, leftToRight);
    }
    constructor(x, groundY, leftToRight) {
      this.x = x; this.groundY = groundY; this.dir = leftToRight ? 1 : -1;
      this.phase = 0; // 0 perch, 1 fly
      this.t = 0; this.perchTime = randRange(1.8, 3.2); this.flyTime = 2.4; this.ttl = this.perchTime + this.flyTime;
    }
    update(dt) {
      this.t += dt; this.ttl -= dt;
      if (this.phase === 0 && this.t >= this.perchTime) { this.phase = 1; this.t = 0; }
      if (this.phase === 1) { this.x += this.dir * 80 * dt; this.groundY -= 20 * dt; }
    }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const y = this.groundY - 10 - (this.phase === 1 ? 10 : 0);
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      ctx.fillStyle = `rgba(220,220,220, ${0.9 * fade})`;
      // body (větší)
      ctx.beginPath(); ctx.arc(this.x, y, 3.4, 0, Math.PI * 2); ctx.fill();
      // wings (only when flying)
      if (this.phase === 1) {
        ctx.strokeStyle = `rgba(220,220,220, ${0.9 * fade})`; ctx.lineWidth = 2.2;
        const flap = Math.sin(this.t * 10) * 3.5;
        ctx.beginPath(); ctx.moveTo(this.x, y); ctx.lineTo(this.x - 7, y - flap); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(this.x, y); ctx.lineTo(this.x + 7, y - flap); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- SKY: Kite ---
  class Kite {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -80 : cssW + 80;
      this.y = randRange(140, Math.min(cssH * 0.55, 420));
      this.vx = (leftToRight ? 1 : -1) * randRange(30, 50);
      this.t = Math.random() * Math.PI * 2;
      this.ttl = randRange(10, 18);
      this.color = Math.random() < 0.5 ? '#ff7043' : '#29b6f6';
      this.dir = leftToRight ? 1 : -1;
    }
    update(dt) { this.t += dt; this.x += this.vx * dt; this.y += Math.sin(this.t * 1.2) * 10 * dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -120 && this.x < cssW + 120; }
    draw(ctx) {
      const sway = Math.sin(this.t * 2) * 0.2;
      const fade = Math.min(1, Math.max(0, this.ttl / 1.2));
      ctx.save();
      // tail
      ctx.strokeStyle = `rgba(255,255,255, ${0.45 * fade})`;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      for (let i = 1; i <= 6; i++) {
        const px = this.x - this.dir * i * 10;
        const py = this.y + Math.sin(this.t * 2 + i) * 3;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      // body (diamond)
      ctx.fillStyle = this._applyAlpha(this.color, fade);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 6);
      ctx.lineTo(this.x + 8, this.y);
      ctx.lineTo(this.x, this.y + 6);
      ctx.lineTo(this.x - 8, this.y);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    _applyAlpha(hex, a) {
      const map = { '#ff7043': '255,112,67', '#29b6f6': '41,182,246' };
      const rgb = map[hex] || '255,255,255';
      return `rgba(${rgb}, ${a})`;
    }
  }

  // --- SKY: Paraglider ---
  class Paraglider {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -100 : cssW + 100;
      this.y = randRange(120, Math.min(cssH * 0.5, 360));
      this.vx = (leftToRight ? 1 : -1) * randRange(40, 60);
      this.t = Math.random() * Math.PI * 2; this.dir = leftToRight ? 1 : -1; this.ttl = randRange(10, 16);
      this.color = Math.random() < 0.5 ? '#ffee58' : '#66bb6a';
    }
    update(dt) { this.t += dt; this.x += this.vx * dt; this.y += Math.sin(this.t * 1.5) * 8 * dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -160 && this.x < cssW + 160; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 1.5));
      ctx.save();
      // canopy
      ctx.fillStyle = this._applyAlpha(this.color, fade);
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 10, 18, 6, 0, Math.PI, 0);
      ctx.fill();
      // lines
      ctx.strokeStyle = `rgba(255,255,255, ${0.4 * fade})`;
      ctx.beginPath();
      ctx.moveTo(this.x - 12, this.y - 8);
      ctx.lineTo(this.x, this.y);
      ctx.lineTo(this.x + 12, this.y - 8);
      ctx.stroke();
      // pilot
      ctx.fillStyle = `rgba(220,220,220, ${0.8 * fade})`;
      ctx.beginPath(); ctx.arc(this.x, this.y + 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    _applyAlpha(hex, a) {
      const map = { '#ffee58': '255,238,88', '#66bb6a': '102,187,106' };
      const rgb = map[hex] || '255,255,255';
      return `rgba(${rgb}, ${a})`;
    }
  }

  // --- SKY: Helicopter ---
  class Helicopter {
    constructor() {
      const leftToRight = Math.random() < 0.5;
      this.x = leftToRight ? -140 : cssW + 140;
      this.y = randRange(100, Math.min(cssH * 0.5, 380));
      this.vx = (leftToRight ? 1 : -1) * randRange(70, 110);
      this.dir = leftToRight ? 1 : -1; this.t = 0; this.ttl = randRange(7, 12);
    }
    update(dt) { this.t += dt; this.x += this.vx * dt; this.ttl -= dt; }
    isAlive() { return this.ttl > 0 && this.x > -200 && this.x < cssW + 200; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 1));
      ctx.save();
      // body
      ctx.fillStyle = `rgba(190,190,190, ${0.9 * fade})`;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      // tail boom
      ctx.strokeStyle = `rgba(190,190,190, ${0.9 * fade})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x - 10 * this.dir, this.y); ctx.lineTo(this.x - 24 * this.dir, this.y); ctx.stroke();
      // main rotor blur
      ctx.strokeStyle = `rgba(255,255,255, ${0.35 * fade})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 6, 16, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
      // nav light blink
      const blink = (Math.sin(this.t * 10) * 0.5 + 0.5);
      ctx.fillStyle = `rgba(255,80,80, ${blink * fade})`;
      ctx.beginPath(); ctx.arc(this.x + 10 * this.dir, this.y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- SKY: Rocket Launch ---
  class RocketLaunch {
    static trySpawn(game) {
      const x = randRange(cssW * 0.15, cssW * 0.85);
      const groundY = game.terrain.getHeightAt(x);
      return new RocketLaunch(x, groundY);
    }
    constructor(x, groundY) {
      this.x = x; this.baseY = groundY; this.y = groundY; this.vy = -randRange(120, 180); this.t = 0; this.ttl = 5.5;
      this.trail = []; this.trailTimer = 0;
    }
    update(dt) {
      this.t += dt; this.ttl -= dt; this.y += this.vy * dt; this.vy -= 30 * dt; // accelerate upwards
      this.trailTimer += dt;
      if (this.trailTimer > 0.05) { this.trailTimer = 0; this.trail.push({ x: this.x, y: this.y + 10, ttl: 1.6 }); if (this.trail.length > 60) this.trail.shift(); }
      for (const p of this.trail) p.ttl -= dt;
    }
    isAlive() { return this.ttl > 0 && this.y > -60; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      // trail smoke
      for (const p of this.trail) {
        if (p.ttl <= 0) continue;
        const a = Math.min(1, p.ttl / 1.6) * 0.22;
        ctx.fillStyle = `rgba(230,230,240, ${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
      }
      // base flame
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 10);
      g.addColorStop(0, `rgba(255,240,180, ${0.9 * fade})`);
      g.addColorStop(1, 'rgba(255,120,20, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, 10, 0, Math.PI * 2); ctx.fill();
      // rocket body
      ctx.fillStyle = `rgba(220,220,230, ${0.9 * fade})`;
      ctx.fillRect(this.x - 1.5, this.y - 20, 3, 20);
      ctx.restore();
    }
  }

  // --- SKY: Rainbow Arc ---
  class RainbowArc {
    constructor() {
      this.cx = randRange(cssW * 0.2, cssW * 0.8);
      // umístit na horizont (lehce nad terénní baseline)
      this.cy = Math.min(cssH * 0.7, cssH - 80);
      this.r = randRange(220, 340);
      this.ttl = randRange(5, 8);
    }
    update(dt) { this.ttl -= dt; }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const fade = Math.min(1, Math.max(0, this.ttl / 1));
      const colors = ['#ff0000','#ff7f00','#ffff00','#00ff00','#0000ff','#4b0082','#9400d3'];
      ctx.save(); ctx.globalAlpha = 0.35 * fade;
      // soft rainbow using multiple thin strokes to avoid hard edges, zarovnáno s horizontem
      for (let i = 0; i < colors.length; i++) {
        ctx.strokeStyle = colors[i];
        for (let w = 0; w < 4; w++) {
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r - i * 6 - w, Math.PI, 2 * Math.PI); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // --- GROUND: Squirrel ---
  class Squirrel {
    static trySpawn(game) {
      const minDist = 120;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -40 : cssW + 40;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Squirrel(startX, yStart, leftToRight);
    }
    constructor(startX, groundY, leftToRight) {
      this.x = startX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1; this.t = 0; this.ttl = 8;
      this.speed = 100 * this.dir; this.pauseT = 0;
    }
    update(dt, game) {
      this.t += dt; this.ttl -= dt;
      if (this.pauseT > 0) { this.pauseT -= dt; } else { this.x += this.speed * dt; if (Math.random() < 0.008) this.pauseT = randRange(0.25, 0.6); }
      if (game) {
        this.groundY = game.terrain.getHeightAt(this.x);
        this.groundSlope = terrainSlopeAt(game.terrain, this.x);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -60 && this.x < cssW + 60; }
    draw(ctx) {
      const y = this.groundY - 6;
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save();
      ctx.fillStyle = `rgba(120,90,60, ${0.95 * fade})`;
      ctx.beginPath(); ctx.ellipse(this.x, y, 9.0, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x + 8.6 * this.dir, y - 1.2, 3.0, 0, Math.PI * 2); ctx.fill();
      // tail
      ctx.strokeStyle = `rgba(120,90,60, ${0.95 * fade})`; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(this.x - 7 * this.dir, y); ctx.quadraticCurveTo(this.x - 15 * this.dir, y - 11, this.x - 12 * this.dir, y - 2); ctx.stroke();
      ctx.restore();
    }
  }

  // --- GROUND: Raccoon ---
  class Raccoon {
    static trySpawn(game) {
      const minDist = 120;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -50 : cssW + 50;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Raccoon(startX, yStart, leftToRight);
    }
    constructor(startX, groundY, leftToRight) {
      this.x = startX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1; this.ttl = 10; this.t = 0;
      this.speed = 60 * this.dir;
    }
    update(dt, game) {
      this.t += dt; this.ttl -= dt; this.x += this.speed * dt;
      if (game) {
        this.groundY = game.terrain.getHeightAt(this.x);
        this.groundSlope = terrainSlopeAt(game.terrain, this.x);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -70 && this.x < cssW + 70; }
    draw(ctx) {
      const y = this.groundY - 6;
      const fade = Math.min(1, Math.max(0, this.ttl / 1));
      ctx.save(); ctx.fillStyle = `rgba(110,110,110, ${0.95 * fade})`; ctx.strokeStyle = `rgba(110,110,110, ${0.95 * fade})`;
      // body + head bigger
      ctx.beginPath(); ctx.ellipse(this.x, y, 10.0, 4.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x + 9.4 * this.dir, y - 1, 3.4, 0, Math.PI * 2); ctx.fill();
      // ringed tail (hint stripes by double stroke)
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(this.x - 8.5 * this.dir, y); ctx.lineTo(this.x - 17 * this.dir, y - 1); ctx.stroke();
      ctx.strokeStyle = `rgba(80,80,80, ${0.85 * fade})`;
      // krátký pruh, aby nebyla nula délka
      ctx.beginPath(); ctx.moveTo(this.x - 11.5 * this.dir - 0.9, y - 0.5); ctx.lineTo(this.x - 11.5 * this.dir + 0.9, y - 0.5); ctx.stroke();
      ctx.restore();
    }
  }

  // --- GROUND: Snake ---
  class Snake {
    static trySpawn(game) {
      const minDist = 120;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -40 : cssW + 40;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new Snake(startX, yStart, leftToRight);
    }
    constructor(startX, groundY, leftToRight) {
      this.x = startX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1; this.ttl = 8; this.t = Math.random() * Math.PI * 2;
      this.speed = 40 * this.dir;
    }
    update(dt, game) {
      this.t += dt * 4; this.ttl -= dt; this.x += this.speed * dt;
      if (game) {
        this.groundY = game.terrain.getHeightAt(this.x);
        this.groundSlope = terrainSlopeAt(game.terrain, this.x);
      }
    }
    isAlive() { return this.ttl > 0 && this.x > -60 && this.x < cssW + 60; }
    draw(ctx) {
      const y = this.groundY - 2;
      const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save(); ctx.strokeStyle = `rgba(120,160,120, ${0.9 * fade})`; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const px = this.x - this.dir * i * 3.2;
        const py = y + Math.sin(this.t + i * 0.6) * 1.8;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // malá hlava (kapkovitý tvar)
      ctx.fillStyle = `rgba(120,160,120, ${0.9 * fade})`;
      ctx.beginPath(); ctx.ellipse(this.x + 1 * this.dir, y, 2.2, 1.6, this.dir > 0 ? 0 : Math.PI, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- GROUND: Small ground bird ---
  class GroundBird {
    static trySpawn(game) {
      const minDist = 120;
      const x = Math.round(randRange(60, cssW - 60));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(x);
      return new GroundBird(x, yStart);
    }
    constructor(x, groundY) {
      this.x = x; this.groundY = groundY; this.t = 0; this.phase = 0; this.ttl = randRange(2.2, 3.2);
    }
    update(dt, game) { this.t += dt; this.ttl -= dt; if (this.t > 1) this.phase = 1; if (game) this.groundY = game.terrain.getHeightAt(this.x); }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      const y = this.groundY - 4;
      const fade = Math.min(1, Math.max(0, this.ttl / 0.6));
      ctx.save();
      ctx.fillStyle = `rgba(200,200,200, ${0.9 * fade})`;
      ctx.strokeStyle = `rgba(200,200,200, ${0.9 * fade})`;
      // větší tělo
      ctx.beginPath(); ctx.ellipse(this.x, y, 3.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      // hlava
      ctx.beginPath(); ctx.arc(this.x + 3.4, y - 0.6, 2.0, 0, Math.PI * 2); ctx.fill();
      // drobný zobáček
      ctx.beginPath(); ctx.moveTo(this.x + 4.8, y - 0.6); ctx.lineTo(this.x + 6.2, y - 0.2); ctx.stroke();
      if (this.phase === 0) {
        // peck
        ctx.beginPath(); ctx.moveTo(this.x + 1, y + 1.2); ctx.lineTo(this.x + 2.5, y + 1.6); ctx.stroke();
      } else {
        // hop off
        ctx.beginPath(); ctx.moveTo(this.x, y + 1); ctx.lineTo(this.x + 7, y - 5); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // --- GROUND: Wind-blown Hat ---
  class WindHat {
    static trySpawn(game) {
      const minDist = 120;
      const leftToRight = Math.random() < 0.5;
      const startX = leftToRight ? -50 : cssW + 50;
      const midX = randRange(cssW * 0.2, cssW * 0.8);
      if (Math.abs(midX - game.tanks.red.x) < minDist || Math.abs(midX - game.tanks.blue.x) < minDist) return null;
      const yStart = game.terrain.getHeightAt(startX);
      return new WindHat(startX, yStart, leftToRight);
    }
    constructor(startX, groundY, leftToRight) {
      this.x = startX; this.groundY = groundY; this.dir = leftToRight ? 1 : -1; this.ttl = 7; this.t = 0; this.speed = 70 * this.dir;
    }
    update(dt, game) { this.t += dt; this.ttl -= dt; this.x += this.speed * dt; if (game) this.groundY = game.terrain.getHeightAt(this.x); }
    isAlive() { return this.ttl > 0 && this.x > -80 && this.x < cssW + 80; }
    draw(ctx) {
      const y = this.groundY - 4 - Math.abs(Math.sin(this.t * 3)) * 2; const fade = Math.min(1, Math.max(0, this.ttl / 0.8));
      ctx.save(); ctx.fillStyle = `rgba(180,120,80, ${0.9 * fade})`;
      ctx.beginPath(); ctx.ellipse(this.x, y, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x, y - 2, 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  // --- GROUND→SKY: Lantern Release ---
  class LanternRelease {
    static trySpawn(game) {
      const minDist = 140;
      const x = Math.round(randRange(80, cssW - 80));
      if (Math.abs(x - game.tanks.red.x) < minDist || Math.abs(x - game.tanks.blue.x) < minDist) return null;
      const y = game.terrain.getHeightAt(x);
      return new LanternRelease(x, y);
    }
    constructor(x, groundY) {
      this.lanterns = new Array(3 + Math.floor(Math.random() * 4)).fill(0).map(() => ({
        x: x + randRange(-12, 12), y: groundY - randRange(0, 8), t: Math.random() * Math.PI * 2, ttl: randRange(4, 7)
      }));
      this.ttl = 7.5;
    }
    update(dt) { this.ttl -= dt; for (const l of this.lanterns) { l.ttl -= dt; l.t += dt; l.x += Math.sin(l.t) * 6 * dt; l.y -= 18 * dt; } }
    isAlive() { return this.ttl > 0; }
    draw(ctx) {
      ctx.save();
      for (const l of this.lanterns) {
        const a = Math.min(1, Math.max(0, l.ttl / 1.2));
        const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 10);
        glow.addColorStop(0, `rgba(255,220,140, ${0.5 * a})`);
        glow.addColorStop(1, 'rgba(255,220,140, 0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(l.x, l.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,240,200, ${0.9 * a})`; ctx.fillRect(l.x - 2, l.y - 3, 4, 6);
      }
      ctx.restore();
    }
  }

  // ---------- Game ----------
  class Game {
    constructor() {
      this.input = new InputManager();
      this.sound = new SoundEngine();
      this.terrain = new Terrain(cssW, cssH);
      this.tanks = {
        red: new Tank({ x: Math.round(cssW * 0.15), color: "#ff4b4b", facing: 1 }),
        blue: new Tank({ x: Math.round(cssW * 0.85), color: "#4bb3ff", facing: -1 }),
      };
      this.positionTanksOnTerrain();
      this.active = Math.random() < 0.5 ? "red" : "blue"; // random start on first round
      this.nextRoundStarter = null; // loser will start next round
      this.projectile = null;
      this.effects = [];
      this.impactMarks = { red: [], blue: [] };
      this.shotIndex = { red: 0, blue: 0 }; // counts fired shots per player this round
      this.attemptOrders = { red: [], blue: [] }; // last N attempts (impacts or not) per player
      this.scores = { red: 0, blue: 0 };
      this.isGameOver = false;
      this.isResolvingShot = false; // během letu střely a po zásahu až do ukončení kola
      this._pendingResetTimeout = null;
      this.aimPips = new AimPips();
      this.flair = new FlairManager();
      this.lastTime = performance.now();
      this.accum = 0;
      this.updateHud();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);

      const restartBtn = document.getElementById("restartBtn");
      restartBtn.addEventListener("click", () => this.resetGame());

      // Aim assist per-player state and UI bindings
      this.aimAssistEnabled = { red: false, blue: false };
      this._bindAimToggleUI();

      // Bot controllers and UI
      this.controllers = { red: null, blue: null }; // null => human
      this.botDifficulty = { red: null, blue: null }; // 'easy' | 'medium' | 'hard' | null
      this._bindBotUI();
    }

    positionTanksOnTerrain() {
      for (const k of ["red", "blue"]) {
        const tank = this.tanks[k];
        tank.y = this.terrain.getHeightAt(tank.x);
        // Clamp visually above terrain
        tank.y = Math.min(cssH - 2, tank.y);
        // reset aim defaults each round for clarity
        tank.angleDeg = 45;
        tank.power = 60;
      }
    }

    resetRound(starting) {
      this.terrain = new Terrain(cssW, cssH);
      // place tanks near edges but avoid too steep slopes by adjusting X if needed
      this.tanks.red.x = Math.round(cssW * 0.15);
      this.tanks.blue.x = Math.round(cssW * 0.85);
      this.positionTanksOnTerrain();
      this.projectile = null;
      this.effects.length = 0;
      this.impactMarks.red.length = 0;
      this.impactMarks.blue.length = 0;
      this.aimPips.clear();
      if (this.flair) this.flair.clear();
      this.active = starting || this.active;
      this.isResolvingShot = false;
      this.shotIndex = { red: 0, blue: 0 };
      this.attemptOrders = { red: [], blue: [] };
      this.updateHud();
      if (this.controllers[this.active]) this.controllers[this.active].resetForNewTurn();
    }

    resetGame() {
      this.scores = { red: 0, blue: 0 };
      this.isGameOver = false;
      document.getElementById("overlay").classList.add("hidden");
      document.getElementById("restartBtn").classList.add("hidden");
      this.nextRoundStarter = null;
      if (this._pendingResetTimeout) { clearTimeout(this._pendingResetTimeout); this._pendingResetTimeout = null; }
      this.resetRound("red");
      this.updateHud();
    }

    updateHud() {
      document.getElementById("scoreRed").textContent = String(this.scores.red);
      document.getElementById("scoreBlue").textContent = String(this.scores.blue);
    }

    _bindAimToggleUI() {
      const btnRed = document.getElementById("aimToggleRed");
      const btnBlue = document.getElementById("aimToggleBlue");
      const sync = () => {
        if (btnRed) btnRed.setAttribute("aria-pressed", String(!!this.aimAssistEnabled.red));
        if (btnBlue) btnBlue.setAttribute("aria-pressed", String(!!this.aimAssistEnabled.blue));
      };
      if (btnRed) {
        btnRed.addEventListener("click", () => {
          this.aimAssistEnabled.red = !this.aimAssistEnabled.red;
          sync();
        });
      }
      if (btnBlue) {
        btnBlue.addEventListener("click", () => {
          this.aimAssistEnabled.blue = !this.aimAssistEnabled.blue;
          sync();
        });
      }
      sync();
    }

    _bindBotUI() {
      const setupSide = (side) => {
        const ids = side === 'red'
          ? { easy: 'botEasyRed', med: 'botMediumRed', hard: 'botHardRed' }
          : { easy: 'botEasyBlue', med: 'botMediumBlue', hard: 'botHardBlue' };
        const elEasy = document.getElementById(ids.easy);
        const elMed = document.getElementById(ids.med);
        const elHard = document.getElementById(ids.hard);
        const sync = () => {
          const d = this.botDifficulty[side];
          if (elEasy) elEasy.setAttribute('aria-pressed', String(d === 'easy'));
          if (elMed) elMed.setAttribute('aria-pressed', String(d === 'medium'));
          if (elHard) elHard.setAttribute('aria-pressed', String(d === 'hard'));
        };
        const setDifficulty = (d) => {
          // toggle off if same pressed
          const next = this.botDifficulty[side] === d ? null : d;
          this.botDifficulty[side] = next;
          this.controllers[side] = next ? new BotController(next, side) : null;
          // if this side is active, reset bot turn state
          if (this.controllers[side] && this.active === side) this.controllers[side].resetForNewTurn();
          sync();
        };
        if (elEasy) elEasy.addEventListener('click', () => setDifficulty('easy'));
        if (elMed) elMed.addEventListener('click', () => setDifficulty('medium'));
        if (elHard) elHard.addEventListener('click', () => setDifficulty('hard'));
        sync();
      };
      setupSide('red');
      setupSide('blue');
    }

    handleInput(dt) {
      if (this.isGameOver) return;
      // restart (zakázáno na přání) – nic nedělá

      // If bot is controlling active side, let it act
      const bot = this.controllers[this.active];
      if (bot) {
        bot.update(this, dt);
        return;
      }

      const tank = this.tanks[this.active];
      const isRed = this.active === "red";

      // adjust angle/power only when not in flight
      if (!this.projectile && !this.isResolvingShot) {
        // Červený: A→90 (zvyš), D→0 (sniž); W→max, S→min
        // Modrý: →→90 (zvyš), ←→0 (sniž); ↑→max, ↓→min
        const angleUp = isRed ? this.input.isDown(KEY.A) : this.input.isDown(KEY.RIGHT);
        const angleDown = isRed ? this.input.isDown(KEY.D) : this.input.isDown(KEY.LEFT);
        const powerUp = isRed ? this.input.isDown(KEY.W) : this.input.isDown(KEY.UP);
        const powerDown = isRed ? this.input.isDown(KEY.S) : this.input.isDown(KEY.DOWN);

        // odstraněno okamžité skákání na krajní hodnoty

        const ease = (t) => {
          const cl = Math.min(ADJUST_ACCEL_TIME_S, Math.max(0, t));
          const k = cl / ADJUST_ACCEL_TIME_S; // 0..1
          return k * k; // ease-in
        };
        const angleUpSpeed = ANGLE_ADJUST_START + (ANGLE_ADJUST_PER_S - ANGLE_ADJUST_START) * ease(this.input.heldFor(isRed ? KEY.A : KEY.RIGHT));
        const angleDownSpeed = ANGLE_ADJUST_START + (ANGLE_ADJUST_PER_S - ANGLE_ADJUST_START) * ease(this.input.heldFor(isRed ? KEY.D : KEY.LEFT));
        const powerUpSpeed = POWER_ADJUST_START + (POWER_ADJUST_PER_S - POWER_ADJUST_START) * ease(this.input.heldFor(isRed ? KEY.W : KEY.UP));
        const powerDownSpeed = POWER_ADJUST_START + (POWER_ADJUST_PER_S - POWER_ADJUST_START) * ease(this.input.heldFor(isRed ? KEY.S : KEY.DOWN));

        if (angleUp) tank.angleDeg += angleUpSpeed * dt;
        if (angleDown) tank.angleDeg -= angleDownSpeed * dt;
        if (powerUp) tank.power += powerUpSpeed * dt;
        if (powerDown) tank.power -= powerDownSpeed * dt;

        tank.angleDeg = clamp(tank.angleDeg, ANGLE_MIN, ANGLE_MAX);
        tank.power = clamp(tank.power, POWER_MIN, POWER_MAX);

        // space to fire
        if (this.input.consume(KEY.SPACE)) {
          this.fire();
        }
      }
    }

    fire() {
      if (this.projectile || this.isGameOver) return;
      const tank = this.tanks[this.active];
      const a = degToRad(tank.angleDeg);
      const speed = tank.power * SPEED_PER_POWER;
      const dirX = Math.cos(a) * tank.facing;
      const dirY = -Math.sin(a);
      const start = tank.getCannonTip();
      const vx = dirX * speed;
      const vy = dirY * speed;
      this.projectile = new Projectile(start.x, start.y, vx, vy);
      // Shot attempt counter (pro výpočet stáří stop)
      this.shotIndex[this.active] = (this.shotIndex[this.active] || 0) + 1;
      // Zapiš pokus o střelu (i když nebude dopad)
      const ord = this.shotIndex[this.active];
      const arr = this.attemptOrders[this.active];
      arr.push(ord);
      while (arr.length > IMPACT_MARKS_PER_COLOR) arr.shift();
      this.aimPips.clear();
      this.sound.playShoot(tank.power);
      // trigger muzzle flash for active tank
      tank.muzzleFlashMs = 140;
      // potlač míření/pips až do ukončení kola
      this.isResolvingShot = true;
    }

    endTurn() {
      this.projectile = null;
      this.active = this.active === "red" ? "blue" : "red";
      this.isResolvingShot = false;
      this.updateHud();
      if (this.controllers[this.active]) this.controllers[this.active].resetForNewTurn();
    }

    awardPoint(winner) {
      this.scores[winner]++;
      const loser = winner === "red" ? "blue" : "red";
      this.nextRoundStarter = loser; // loser starts next round
      this.updateHud();

      if (this.scores[winner] >= MAX_SCORE) {
        this.gameOver(winner);
      } else {
        // počkej, než se dohraje animace přímého zásahu
        if (this._pendingResetTimeout) { clearTimeout(this._pendingResetTimeout); }
        this._pendingResetTimeout = setTimeout(() => {
          this.resetRound(this.nextRoundStarter);
          this._pendingResetTimeout = null;
        }, DIRECT_HIT_EXPLOSION_MS + 150);
      }
    }

    gameOver(winner) {
      this.isGameOver = true;
      const overlay = document.getElementById("overlay");
      const text = document.getElementById("overlayText");
      const btn = document.getElementById("restartBtn");
      overlay.classList.remove("hidden");
      btn.classList.remove("hidden");
      const winnerName = winner === "red" ? "Červený" : "Modrý";
      text.textContent = `Vyhrál ${winnerName}!`;
      text.style.color = winner === "red" ? "#ff4b4b" : "#4bb3ff";

      // Auto-restart if both sides are bots
      const bothBots = !!this.controllers.red && !!this.controllers.blue;
      if (bothBots) {
        // hide button to avoid flicker and auto-restart shortly after
        btn.classList.add("hidden");
        setTimeout(() => {
          if (!this.isGameOver) return; // already reset manually
          this.resetGame();
        }, 1800);
      }
    }

    checkCollisions() {
      if (!this.projectile) return;
      const p = this.projectile;

      // off screen
      if (p.x < -20 || p.x > cssW + 20 || p.y > cssH + 20) {
        // Offscreen: silent, invisible. No explosion and no impact mark.
        // Přesto posuň okno posledních pokusů a odřízni staré stopy
        this.pruneImpactMarks(this.active);
        this.projectile = null;
        this.endTurn();
        return;
      }

      // hit tank direct
      const hitTank = (tank) => {
        const dx = p.x - tank.x;
        const dy = p.y - (tank.y - tank.hullHeight * 0.5); // approximate center
        const d2 = dx * dx + dy * dy;
        return d2 <= (TANK_RADIUS + PROJECTILE_RADIUS) * (TANK_RADIUS + PROJECTILE_RADIUS);
      };
      const enemyKey = this.active === "red" ? "blue" : "red";
      const enemy = this.tanks[enemyKey];
      const self = this.tanks[this.active];
      if (hitTank(enemy)) {
        this.explode(p.x, p.y, true, false);
        this.addImpactMark(p.x, p.y, this.active);
        this.projectile = null;
        this.awardPoint(this.active);
        return;
      }
      if (hitTank(self)) {
        // self-hit: count as kill for the opponent
        this.explode(p.x, p.y, true, true);
        this.addImpactMark(p.x, p.y, this.active);
        this.projectile = null;
        // award point to the opponent and let self (loser) start next round via existing logic
        this.awardPoint(enemyKey);
        return;
      }

      // hit ground
      const groundY = this.terrain.getHeightAt(p.x);
      if (p.y + PROJECTILE_RADIUS >= groundY) {
        this.addImpactMark(p.x, groundY, this.active);
        this.projectile = null;
        // proximity kill check (dopad do země pod/velmi blízko tanku)
        const enemyCenterY = enemy.y - enemy.hullHeight * 0.5;
        const selfCenterY = self.y - self.hullHeight * 0.5;
        const distToEnemy = Math.hypot(enemy.x - p.x, enemyCenterY - groundY);
        const distToSelf = Math.hypot(self.x - p.x, selfCenterY - groundY);
        const thresh = TANK_RADIUS + GROUND_HIT_AWARD_RADIUS;
        if (distToEnemy <= thresh) {
          // treat as direct hit for audiovisuals
          this.explode(p.x, groundY, true, false);
          this.awardPoint(this.active);
        } else if (distToSelf <= thresh) {
          this.explode(p.x, groundY, true, true);
          this.awardPoint(enemyKey);
        } else {
          this.explode(p.x, groundY, false, false);
          this.endTurn();
        }
      }
    }

    explode(x, y, isDirectHit, isSelfHit = false) {
      // enqueue an effect to be animated inside main loop (zajistí, že animace je vidět)
      const fx = new ExplosionEffect(x, y, isDirectHit);
      this.effects.push(fx);
      if (isDirectHit) this.sound.playHitLong(); else this.sound.playExplosion();
    }

    addImpactMark(x, y, colorKey) {
      const list = this.impactMarks[colorKey];
      const order = this.shotIndex[colorKey] || 0;
      list.push({ x, y, order });
      // udrž pouze stopy, které spadají do posledních N pokusů
      this.pruneImpactMarks(colorKey);
    }

    pruneImpactMarks(colorKey) {
      const keep = new Set(this.attemptOrders[colorKey]);
      this.impactMarks[colorKey] = this.impactMarks[colorKey].filter((m) => keep.has(m.order));
      // bezpečnostní omezení, kdyby bylo více stop se stejným order
      this.impactMarks[colorKey].sort((a, b) => a.order - b.order);
      while (this.impactMarks[colorKey].length > IMPACT_MARKS_PER_COLOR) this.impactMarks[colorKey].shift();
    }

    update(dt) {
      this.handleInput(dt);

      // flair visuals
      if (this.flair) this.flair.update(dt, this);

      if (this.projectile) {
        this.projectile.update(dt);
        this.checkCollisions();
      } else if (!this.isResolvingShot) {
        // update aim pips for current player
        this.aimPips.update(dt, this.tanks[this.active]);
      }

      // update effects
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const fx = this.effects[i];
        fx.update(dt);
        if (!fx.isAlive()) this.effects.splice(i, 1);
      }

      // reduce muzzle flash timers
      for (const k of ["red", "blue"]) {
        const t = this.tanks[k];
        if (t.muzzleFlashMs > 0) t.muzzleFlashMs -= dt * 1000;
      }
    }

    draw() {
      drawSky(ctx);
      // sky easter eggs
      if (this.flair) this.flair.drawBackground(ctx);
      this.terrain.draw(ctx);
      // ground easter eggs (above ground, below marks/tanks)
      if (this.flair) this.flair.drawMidground(ctx);

      // persistent impact marks (within a round), older are less visible
      this.drawImpactMarks(ctx);

      // tanks (aura viditelná, pokud je hráč na tahu, i během letu střely)
      this.tanks.red.draw(ctx, this.active === "red");
      this.tanks.blue.draw(ctx, this.active === "blue");

      // Trajectory guide and aim pips only when not in flight and když se neřeší výsledek střely
      if (!this.projectile && !this.isResolvingShot) {
        const activeTank = this.tanks[this.active];
        if (this.aimAssistEnabled[this.active]) {
          this.drawTrajectoryGuideForTank(activeTank, this.active);
        }
        this.aimPips.draw(ctx);
      }

      // projectile
      if (this.projectile) this.projectile.draw(ctx);

      // explosion effects overlay (po střele a před HUDem)
      for (const fx of this.effects) {
        fx.draw(ctx);
      }

      // popisky u tanků odstraněny
    }

    drawTrajectoryGuideForTank(tank, key) {
      // simulate ballistic path from current barrel tip
      const start = tank.getCannonTip();
      const angle = degToRad(tank.angleDeg);
      const speed = tank.power * SPEED_PER_POWER;
      let vx = Math.cos(angle) * tank.facing * speed;
      let vy = -Math.sin(angle) * speed;
      let x = start.x;
      let y = start.y;
      const dt = 1 / 60; // seconds per step
      const maxSeconds = 6; // cap
      const points = [];
      for (let t = 0; t < maxSeconds; t += dt) {
        // stop if off-screen or hit ground
        if (x < -10 || x > cssW + 10 || y > cssH + 10) break;
        const gy = this.terrain.getHeightAt(x);
        if (y >= gy) break;
        points.push({ x, y });
        vy += GRAVITY_PX_PER_S2 * dt;
        x += vx * dt;
        y += vy * dt;
      }
      if (points.length < 2) return;
      // draw only a fraction of the path based on score difference
      const otherKey = key === "red" ? "blue" : "red";
      const scoreDiff = (this.scores[key] || 0) - (this.scores[otherKey] || 0); // positive if leading
      const factor = 1 - 0.2 * scoreDiff; // -20% length per point lead, +20% per point behind
      const baseRatio = 0.5; // tie shows half of the path
      const ratio = clamp(baseRatio * factor, 0, 1);
      const halfCount = Math.max(2, Math.floor(points.length * ratio));
      const onLen = 12; // px
      const offLen = 10; // px
      const cycle = onLen + offLen;
      let acc = 0;
      ctx.save();
      ctx.lineWidth = 2;
      let prev = points[0];
      for (let i = 1; i < halfCount; i++) {
        const cur = points[i];
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const segLen = Math.hypot(dx, dy);
        const midAcc = acc + segLen * 0.5;
        const inOn = (midAcc % cycle) < onLen;
        const tNorm = (i - 1) / (halfCount - 1);
        const alpha = 0.8 * Math.max(0, 1 - tNorm); // linear fade to 0
        if (inOn && alpha > 0.001) {
          const stroke = key === "red" ? `rgba(255,75,75,${alpha})` : `rgba(75,179,255,${alpha})`;
          ctx.strokeStyle = stroke;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(cur.x, cur.y);
          ctx.stroke();
        }
        acc += segLen;
        prev = cur;
      }
      ctx.restore();
    }

    drawImpactMarks(ctx) {
      const drawList = (list, color, currentOrder) => {
        const sorted = list.slice().sort((a, b) => a.order - b.order);
        for (let i = 0; i < sorted.length; i++) {
          const m = sorted[i];
          const ageShots = Math.max(0, currentOrder - m.order); // kolik výstřelů zpět
          const intensity = ageShots === 0 ? 0.82 : ageShots === 1 ? 0.55 : 0.32;
          ctx.save();
          ctx.globalAlpha = intensity;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.28)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      };
      drawList(this.impactMarks.red, this.tanks.red.color, this.shotIndex.red || 0);
      drawList(this.impactMarks.blue, this.tanks.blue.color, this.shotIndex.blue || 0);
    }

    drawTinyReadout(tank) {
      const txt = `∠ ${tank.angleDeg.toFixed(0)}°  ⎯  síla ${tank.power.toFixed(0)}`;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = tank.facing === 1 ? "left" : "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const px = tank.facing === 1 ? tank.x + 28 : tank.x - 28;
      const py = tank.y - tank.hullHeight - 6;
      ctx.fillText(txt, px, py);
    }

    loop(now) {
      const dt = Math.min(0.033, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(this.loop);
    }
  }

  // ---------- Start Game ----------
  const game = new Game();
})();


