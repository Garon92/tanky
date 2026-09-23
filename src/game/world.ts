import { clamp, degToRad } from '../core/math';
import { Rng } from '../core/rng';
import { DRIVE_SPEED, GRAVITY, MAX_CLIMB_SLOPE, MAX_SPEED, TANK_H, TANK_W, WORLD_H, WORLD_W } from './constants';
import { absorbShield, fallDamage, splashDamage } from './damage';
import { makeProjectile, stepProjectile, type HitCircle, type PhysEnv } from './physics';
import type { Tank } from './tank';
import { Terrain } from './terrain';
import type { BiomeId, Block, Crate, CrateKind, Pad, Portal, Projectile, Target, Walls, WeaponId, Wood } from './types';
import { randomWeapon, WEAPONS } from './weapons';

export type WorldEvent =
  | { t: 'fire'; tank: Tank; weapon: WeaponId; x: number; y: number; angle: number; power: number }
  | { t: 'explosion'; x: number; y: number; r: number; weapon: WeaponId; owner: number; direct: boolean; shake: number; kind: 'normal' | 'dirt' | 'death' | 'small' }
  | { t: 'damage'; tank: Tank; amount: number; by: number; x: number; y: number; direct: boolean; absorbed: number }
  | { t: 'death'; tank: Tank; by: number }
  | { t: 'bounce'; x: number; y: number; on: string }
  | { t: 'splash'; x: number; y: number }
  | { t: 'portal'; x: number; y: number; x2: number; y2: number; hue: number }
  | { t: 'crate'; crate: Crate; tank: Tank | null }
  | { t: 'crateSpawn'; crate: Crate }
  | { t: 'crateLand'; crate: Crate }
  | { t: 'wood'; wood: Wood }
  | { t: 'land'; tank: Tank; fall: number; damage: number }
  | { t: 'dig'; x: number; y: number }
  | { t: 'target'; target: Target; by: number; x: number; y: number }
  | { t: 'split'; x: number; y: number }
  | { t: 'shield'; tank: Tank };

export interface WorldOptions {
  biome: BiomeId;
  gravity?: number;
  wind?: number;
  waterY?: number | null;
  walls?: Walls;
  oneHit?: boolean;
  seed?: number;
}

interface Pending {
  t: number;
  run: () => void;
}

const WOOD_SIZE = 30;
const CRATE_FALL_SPEED = 70;

export class World {
  terrain: Terrain;
  biome: BiomeId;
  gravity: number;
  wind: number;
  waterY: number | null;
  walls: Walls;
  oneHit: boolean;
  tanks: Tank[] = [];
  projectiles: Projectile[] = [];
  crates: Crate[] = [];
  blocks: Block[] = [];
  woods: Wood[] = [];
  pads: Pad[] = [];
  portals: Portal[] = [];
  targets: Target[] = [];
  events: WorldEvent[] = [];
  time = 0;
  rng: Rng;
  private pending: Pending[] = [];
  private nextId = 1;
  private env: PhysEnv;
  private circles: HitCircle[] = [];
  /** When true, crater & damage are applied but no events are produced (AI lookahead, tests). */
  silent = false;

  constructor(terrain: Terrain, opts: WorldOptions) {
    this.terrain = terrain;
    this.biome = opts.biome;
    this.gravity = opts.gravity ?? GRAVITY;
    this.wind = opts.wind ?? 0;
    this.waterY = opts.waterY ?? null;
    this.walls = opts.walls ?? 'open';
    this.oneHit = !!opts.oneHit;
    this.rng = new Rng(opts.seed);
    this.env = {
      terrain,
      blocks: this.blocks,
      woods: this.woods,
      pads: this.pads,
      portals: this.portals,
      tanks: this.circles,
      crates: this.crates,
      targets: this.targets,
      wind: this.wind,
      gravity: this.gravity,
      waterY: this.waterY,
      walls: this.walls,
      w: WORLD_W,
      h: WORLD_H,
    };
  }

  id(): number {
    return this.nextId++;
  }

  emit(e: WorldEvent): void {
    if (!this.silent) this.events.push(e);
  }

  /** Physics environment snapshot (live references; tank circles refreshed). */
  physEnv(): PhysEnv {
    this.circles.length = 0;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      this.circles.push({ id: t.id, team: t.team, x: t.x, y: t.cy, r: t.hitR });
    }
    this.env.terrain = this.terrain;
    this.env.wind = this.wind;
    this.env.gravity = this.gravity;
    this.env.waterY = this.waterY;
    this.env.walls = this.walls;
    return this.env;
  }

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------

  addTank(t: Tank): Tank {
    this.tanks.push(t);
    this.placeOnGround(t);
    return t;
  }

  placeOnGround(t: Tank): void {
    t.y = this.groundAt(t.x, -Infinity);
    t.tilt = this.slopeTilt(t);
    t.vy = 0;
    t.falling = false;
  }

  addBlock(x: number, y: number, w: number, h: number, mat: Block['mat'] = 'stone'): Block {
    const b: Block = { id: this.id(), x, y, w, h, mat };
    this.blocks.push(b);
    return b;
  }

  /** Block standing on the ground at x (visible height h above the highest ground point). */
  addGroundBlock(x: number, w: number, h: number, mat: Block['mat'] = 'stone'): Block {
    const top = this.terrain.maxHeightIn(x, x + w) - h;
    const bottom = this.terrain.minHeightIn(x, x + w) + 6;
    return this.addBlock(x, top, w, bottom - top, mat);
  }

  /** Stack of wooden boxes (cols × rows) standing on the ground; x = left edge. */
  addWoodStack(x: number, cols: number, rows: number): void {
    for (let c = 0; c < cols; c++) {
      const bx = x + c * WOOD_SIZE;
      const ground = this.solidTopBelow(bx + WOOD_SIZE * 0.5, -Infinity, WOOD_SIZE);
      for (let r = 0; r < rows; r++) {
        this.woods.push({ id: this.id(), x: bx, y: ground - (r + 1) * WOOD_SIZE, w: WOOD_SIZE, h: WOOD_SIZE, alive: true, vy: 0, hp: 1 });
      }
    }
  }

  addPad(x: number, w: number): Pad {
    const top = this.terrain.maxHeightIn(x, x + w);
    const pad: Pad = { id: this.id(), x, y: top - 14, w, h: 14, squash: 0 };
    this.pads.push(pad);
    return pad;
  }

  addPortalPair(ax: number, ay: number, bx: number, by: number, hue = 280): [Portal, Portal] {
    const a: Portal = { id: this.id(), x: ax, y: ay, r: 26, pair: 0, hue };
    const b: Portal = { id: this.id(), x: bx, y: by, r: 26, pair: a.id, hue: (hue + 40) % 360 };
    a.pair = b.id;
    this.portals.push(a, b);
    return [a, b];
  }

  spawnCrate(x: number, kind?: CrateKind, fromSky = true): Crate {
    const k: CrateKind = kind ?? this.rng.pick<CrateKind>(['repair', 'repair', 'shield', 'fuel', 'ammo', 'ammo', 'ammo']);
    const weapon = k === 'ammo' ? randomWeapon(() => this.rng.next(), ['mega']) : null;
    const crate: Crate = {
      id: this.id(),
      x: clamp(x, 30, WORLD_W - 30),
      y: fromSky ? -30 : this.solidTopBelow(x, -Infinity, 20),
      vy: 0,
      kind: k,
      weapon,
      amount: k === 'ammo' ? (weapon === 'big' || weapon === 'homing' || weapon === 'airstrike' ? 1 : 2) : 1,
      landed: !fromSky,
      chute: fromSky,
      alive: true,
      t: 0,
    };
    this.crates.push(crate);
    if (fromSky) this.emit({ t: 'crateSpawn', crate });
    return crate;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Top of solid support (terrain, blocks, pads, woods) at x for something currently at `fromY`. */
  solidTopBelow(x: number, fromY: number, halfW = 0, ignoreWoodId = -1): number {
    let top = halfW > 0 ? this.terrain.maxHeightIn(x - halfW * 0.5, x + halfW * 0.5) : this.terrain.heightAt(x);
    const tol = 6;
    for (const b of this.blocks) if (x + halfW * 0.5 >= b.x && x - halfW * 0.5 <= b.x + b.w && b.y >= fromY - tol && b.y < top) top = b.y;
    for (const p of this.pads) if (x >= p.x && x <= p.x + p.w && p.y >= fromY - tol && p.y < top) top = p.y;
    for (const w of this.woods) {
      if (!w.alive || w.id === ignoreWoodId) continue;
      if (x + halfW * 0.5 > w.x + 1 && x - halfW * 0.5 < w.x + w.w - 1 && w.y >= fromY - tol && w.y < top) top = w.y;
    }
    return top;
  }

  /** Ground under a tank at x (the tank's current y decides which platforms are reachable). */
  groundAt(x: number, fromY: number): number {
    return this.solidTopBelow(x, fromY, TANK_W * 0.35);
  }

  slopeTilt(t: Tank): number {
    const half = (TANK_W * 0.5 * t.scale) | 0;
    const l = this.solidTopBelow(t.x - half, t.y - 8);
    const r = this.solidTopBelow(t.x + half, t.y - 8);
    return clamp(Math.atan2(r - l, half * 2), -0.6, 0.6);
  }

  aliveTanks(): Tank[] {
    return this.tanks.filter((t) => t.alive);
  }

  tankById(id: number): Tank | undefined {
    return this.tanks.find((t) => t.id === id);
  }

  /** Anything still moving / pending? */
  isBusy(): boolean {
    if (this.projectiles.length > 0 || this.pending.length > 0) return true;
    for (const t of this.tanks) if (t.falling || (t.hp <= 0 && t.alive)) return true;
    for (const c of this.crates) if (c.alive && !c.landed) return true;
    for (const w of this.woods) if (w.alive && w.vy > 0) return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Fire the tank's current weapon. Returns false if not possible. */
  fire(t: Tank): boolean {
    if (!t.alive || !t.hasAmmo(t.weapon)) t.weapon = 'shell';
    const def = WEAPONS[t.weapon];
    const m = t.muzzlePos();
    const speed = (t.power / 100) * MAX_SPEED;
    const angles = def.behavior === 'triple' ? [-(def.spreadDeg ?? 4), 0, def.spreadDeg ?? 4] : [0];
    for (const off of angles) {
      const a = degToRad(t.angle + off);
      this.projectiles.push(
        makeProjectile({
          weapon: t.weapon,
          owner: t.id,
          team: t.team,
          x: m.x,
          y: m.y,
          vx: Math.cos(a) * speed,
          vy: -Math.sin(a) * speed,
        }),
      );
    }
    t.useAmmo(t.weapon);
    t.shots++;
    t.recoil = 1;
    t.muzzle = 1;
    this.emit({ t: 'fire', tank: t, weapon: t.weapon, x: m.x, y: m.y, angle: t.angle, power: t.power });
    if (!t.hasAmmo(t.weapon)) t.weapon = 'shell';
    return true;
  }

  /** Drive a tank left (-1) / right (+1). Returns distance moved. */
  drive(t: Tank, dir: -1 | 1, dt: number): number {
    if (!t.alive || t.falling || t.fuel <= 0) return 0;
    const dx = dir * DRIVE_SPEED * dt;
    const half = TANK_W * 0.5 * t.scale;
    const nx = clamp(t.x + dx, half, WORLD_W - half);
    if (nx === t.x) return 0;
    const ny = this.groundAt(nx, t.y);
    // too steep (or a wall)?
    if (ny < t.y - MAX_CLIMB_SLOPE * Math.abs(nx - t.x) - 0.6) return 0;
    // side collision with blocks (anything whose top is clearly above the tank's feet)
    const bodyTop = t.y - TANK_H * t.scale;
    for (const b of this.blocks) {
      if (nx + half * 0.9 > b.x && nx - half * 0.9 < b.x + b.w && b.y < t.y - 6 && b.y + b.h > bodyTop) {
        if (!(t.x + half * 0.9 > b.x && t.x - half * 0.9 < b.x + b.w)) return 0;
      }
    }
    for (const w of this.woods) {
      if (!w.alive) continue;
      if (nx + half * 0.9 > w.x && nx - half * 0.9 < w.x + w.w && w.y < t.y - 6 && w.y + w.h > bodyTop) {
        if (!(t.x + half * 0.9 > w.x && t.x - half * 0.9 < w.x + w.w)) return 0;
      }
    }
    // other tanks
    for (const o of this.tanks) {
      if (o === t || !o.alive) continue;
      const minD = (TANK_W * 0.5) * (t.scale + o.scale) * 0.92;
      if (Math.abs(nx - o.x) < minD && Math.abs(o.y - t.y) < 40 && Math.abs(nx - o.x) < Math.abs(t.x - o.x)) return 0;
    }
    if (this.waterY !== null && ny > this.waterY + 8) return 0; // don't drive into deep water
    const moved = Math.abs(nx - t.x);
    t.x = nx;
    if (ny > t.y + 2) {
      t.falling = true;
      t.fallFrom = t.y;
      t.vy = 0;
    } else t.y = ny;
    t.fuel = Math.max(0, t.fuel - moved);
    t.treadPhase += dx;
    t.driving = 0.15;
    // pick up crates by touching them
    for (const c of this.crates) {
      if (c.alive && c.landed && Math.abs(c.x - t.x) < half + 14 && Math.abs(c.y - t.y) < 40) this.collectCrate(c, t);
    }
    return moved;
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  schedule(delay: number, run: () => void): void {
    this.pending.push({ t: delay, run });
  }

  update(dt: number): void {
    this.time += dt;
    // pending actions (death blasts, air strike bombs)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i] as Pending;
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.run();
      }
    }

    const env = this.physEnv();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i] as Projectile;
      const ev = stepProjectile(p, env, dt);
      if (!ev) continue;
      switch (ev.t) {
        case 'explode':
          p.alive = false;
          this.onImpact(p, ev.x, ev.y, ev.tank, ev.target);
          break;
        case 'splash':
          p.alive = false;
          this.emit({ t: 'splash', x: ev.x, y: ev.y });
          break;
        case 'out':
          p.alive = false;
          break;
        case 'bounce':
          this.emit({ t: 'bounce', x: ev.x, y: ev.y, on: ev.on });
          if (ev.on === 'pad') {
            const pad = this.pads.find((q) => ev.x >= q.x - 8 && ev.x <= q.x + q.w + 8);
            if (pad) pad.squash = 1;
          }
          break;
        case 'portal': {
          const a = this.portals.find((q) => q.id === ev.from);
          const b = this.portals.find((q) => q.id === ev.to);
          if (a && b) this.emit({ t: 'portal', x: a.x, y: a.y, x2: b.x, y2: b.y, hue: a.hue });
          break;
        }
        case 'apex':
          p.alive = false;
          this.splitCluster(p);
          break;
        case 'dig': {
          this.terrain.crater(ev.x, ev.y, 13);
          this.emit({ t: 'dig', x: ev.x, y: ev.y });
          break;
        }
        case 'land':
          this.emit({ t: 'bounce', x: ev.x, y: ev.y, on: 'terrain' });
          break;
      }
      if (!p.alive) this.projectiles.splice(i, 1);
    }

    this.updateTanks(dt);
    this.updateCrates(dt);
    this.updateWoods(dt);
    this.updateTargets(dt);
    for (const pad of this.pads) pad.squash = Math.max(0, pad.squash - dt * 4);
  }

  private splitCluster(p: Projectile): void {
    const def = WEAPONS[p.weapon];
    const n = def.subCount ?? 5;
    this.emit({ t: 'split', x: p.x, y: p.y });
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      this.projectiles.push(
        makeProjectile({
          weapon: p.weapon,
          owner: p.owner,
          team: p.team,
          x: p.x,
          y: p.y,
          vx: p.vx + k * 260,
          vy: -60 - Math.abs(k) * 40 + this.rng.range(-20, 20),
          sub: true,
          damage: def.subDamage,
          radius: def.subRadius,
        }),
      );
    }
  }

  private onImpact(p: Projectile, x: number, y: number, tankId: number | null, targetId: number | null): void {
    const def = WEAPONS[p.weapon];
    if (targetId !== null) {
      const tg = this.targets.find((q) => q.id === targetId);
      if (tg) this.popTarget(tg, p.owner);
    }
    if (def.behavior === 'dirt' && !p.sub) {
      this.terrain.addDirt(x, y, def.radius);
      this.emit({ t: 'explosion', x, y, r: def.radius, weapon: p.weapon, owner: p.owner, direct: false, shake: def.shake, kind: 'dirt' });
      this.afterTerrainChange();
      return;
    }
    if (def.behavior === 'airstrike' && !p.sub) {
      this.emit({ t: 'explosion', x, y, r: 16, weapon: p.weapon, owner: p.owner, direct: false, shake: 0.1, kind: 'small' });
      const n = def.subCount ?? 5;
      for (let i = 0; i < n; i++) {
        const bx = x + (i - (n - 1) / 2) * 62 + this.rng.range(-10, 10);
        this.schedule(0.5 + i * 0.18, () => {
          this.projectiles.push(
            makeProjectile({ weapon: 'airstrike', owner: p.owner, team: p.team, x: bx, y: -40, vx: this.wind * 0.3, vy: 420, sub: true, damage: def.subDamage, radius: def.subRadius }),
          );
        });
      }
      return;
    }
    this.explode(x, y, p.damage, p.radius, p.owner, tankId, p.weapon, def.shake * (p.sub ? 0.5 : 1));
  }

  /** Blast at (x,y): crater, damage, woods, crates, targets. */
  explode(x: number, y: number, damage: number, radius: number, owner: number, directTank: number | null, weapon: WeaponId, shake: number, kind: 'normal' | 'death' = 'normal'): void {
    const craterR = radius * (kind === 'death' ? 0.7 : 0.85);
    this.terrain.crater(x, y, craterR);
    const ownerTank = this.tankById(owner);
    const mul = ownerTank ? ownerTank.def.damageMul : 1;
    let directHit = false;
    for (const t of this.tanks) {
      if (!t.alive || t.hp <= 0) continue;
      const d = Math.hypot(t.x - x, t.cy - y);
      let dmg = t.id === directTank ? Math.round(damage * 1.1) : splashDamage(damage, radius, d, t.hitR);
      if (t.id === directTank) directHit = true;
      dmg = Math.round(dmg * mul);
      if (dmg > 0) this.damageTank(t, dmg, owner, x, y, t.id === directTank);
    }
    for (const w of this.woods) {
      if (!w.alive) continue;
      const d = Math.hypot(w.x + w.w / 2 - x, w.y + w.h / 2 - y);
      if (d < radius + w.w * 0.45) {
        w.alive = false;
        this.emit({ t: 'wood', wood: w });
      }
    }
    for (const c of this.crates) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - x, c.y - 15 - y);
      if (d < radius + 16) this.collectCrate(c, ownerTank && ownerTank.alive ? ownerTank : null);
    }
    for (const tg of this.targets) {
      if (!tg.alive) continue;
      const d = Math.hypot(tg.x - x, tg.y - y);
      if (d < radius * 0.7 + tg.r) this.popTarget(tg, owner);
    }
    this.emit({ t: 'explosion', x, y, r: radius, weapon, owner, direct: directHit, shake, kind: kind === 'death' ? 'death' : 'normal' });
    this.afterTerrainChange();
  }

  damageTank(t: Tank, amount: number, by: number, x: number, y: number, direct: boolean): void {
    if (!t.alive || t.hp <= 0) return;
    let dmg = amount;
    if (this.oneHit && dmg >= 8) dmg = t.hp + t.shield;
    const s = absorbShield(dmg, t.shield);
    if (s.absorbed > 0 && s.shield <= 0) this.emit({ t: 'shield', tank: t });
    t.shield = s.shield;
    const hull = Math.min(t.hp, s.hull);
    t.hp -= hull;
    t.damageTaken += hull;
    t.flash = 1;
    t.hurtT = 0.9;
    if (by !== t.id) t.lastHitBy = by;
    const src = this.tankById(by);
    if (src && src !== t && src.team !== t.team) {
      src.damageDealt += hull;
    }
    this.emit({ t: 'damage', tank: t, amount: hull, by, x, y, direct, absorbed: s.absorbed });
    if (t.hp <= 0) this.killTank(t, by);
  }

  private killTank(t: Tank, by: number): void {
    t.hp = 0;
    t.deathT = 0.5;
    const killer = this.tankById(by === t.id ? t.lastHitBy : by);
    if (killer && killer !== t && killer.team !== t.team) killer.kills++;
    this.schedule(0.5, () => {
      t.alive = false;
      this.emit({ t: 'death', tank: t, by });
      this.explode(t.x, t.cy, 18, 46 * t.scale, by, null, 'big', 0.8, 'death');
    });
  }

  collectCrate(c: Crate, t: Tank | null): void {
    if (!c.alive) return;
    c.alive = false;
    if (t) {
      switch (c.kind) {
        case 'repair':
          t.hp = Math.min(t.maxHp, t.hp + 35);
          break;
        case 'shield':
          t.shield = Math.min(80, t.shield + 50);
          break;
        case 'fuel':
          t.fuel = Math.min(t.maxFuel + 100, t.fuel + 100);
          t.maxFuel = Math.max(t.maxFuel, t.fuel);
          break;
        case 'ammo':
          if (c.weapon) t.addAmmo(c.weapon, c.amount);
          break;
      }
    }
    this.emit({ t: 'crate', crate: c, tank: t });
  }

  private popTarget(tg: Target, by: number): void {
    if (!tg.alive) return;
    tg.alive = false;
    this.emit({ t: 'target', target: tg, by, x: tg.x, y: tg.y });
  }

  private afterTerrainChange(): void {
    // tanks & crates re-check support on next update (updateTanks/updateCrates)
  }

  private updateTanks(dt: number): void {
    for (const t of this.tanks) {
      if (t.deathT > 0) t.deathT = Math.max(0, t.deathT - dt);
      if (!t.alive) continue;
      if (t.falling) {
        t.vy = Math.min(t.vy + this.gravity * dt, t.chute ? 210 : 900);
        const ny = t.y + t.vy * dt;
        const ground = this.groundAt(t.x, t.y);
        if (ny >= ground) {
          t.y = ground;
          t.falling = false;
          t.vy = 0;
          const fall = ground - t.fallFrom;
          const dmg = t.chute ? 0 : fallDamage(fall);
          t.chute = false;
          this.emit({ t: 'land', tank: t, fall, damage: dmg });
          if (dmg > 0) this.damageTank(t, dmg, t.lastHitBy >= 0 ? t.lastHitBy : t.id, t.x, t.y, false);
        } else t.y = ny;
      } else {
        const ground = this.groundAt(t.x, t.y);
        if (ground > t.y + 1.5) {
          t.falling = true;
          t.fallFrom = t.y;
          t.vy = 0;
        } else if (ground < t.y) {
          t.y = ground; // pushed up by dirt
        }
      }
      // water: tanks float at the surface level at most
      const target = this.slopeTilt(t);
      t.tilt += (target - t.tilt) * Math.min(1, dt * 10);
      // cosmetic timers
      t.flash = Math.max(0, t.flash - dt * 5);
      t.hurtT = Math.max(0, t.hurtT - dt);
      t.recoil = Math.max(0, t.recoil - dt * 5);
      t.muzzle = Math.max(0, t.muzzle - dt * 8);
      t.driving = Math.max(0, t.driving - dt);
      t.blinkT -= dt;
      if (t.blinkT < -0.12) t.blinkT = 1.5 + Math.random() * 3.5;
    }
  }

  private updateCrates(dt: number): void {
    for (const c of this.crates) {
      if (!c.alive) continue;
      c.t += dt;
      const ground = this.solidTopBelow(c.x, c.y - 2, 20);
      if (!c.landed) {
        c.vy = c.chute ? CRATE_FALL_SPEED : Math.min(c.vy + this.gravity * dt, 700);
        c.x += (c.chute ? this.wind * 0.15 : 0) * dt;
        c.x = clamp(c.x, 20, WORLD_W - 20);
        c.y += c.vy * dt;
        if (this.waterY !== null && c.y >= this.waterY && this.terrain.heightAt(c.x) > this.waterY) {
          c.alive = false;
          this.emit({ t: 'splash', x: c.x, y: this.waterY });
          continue;
        }
        if (c.y >= ground) {
          c.y = ground;
          c.landed = true;
          c.chute = false;
          c.vy = 0;
          this.emit({ t: 'crateLand', crate: c });
          // landed on a tank? give it
          for (const t of this.tanks) {
            if (t.alive && Math.abs(t.x - c.x) < TANK_W * 0.5 * t.scale + 12 && Math.abs(t.y - c.y) < 40) {
              this.collectCrate(c, t);
              break;
            }
          }
        }
      } else if (ground > c.y + 1) {
        c.landed = false;
        c.chute = false;
      } else c.y = ground;
    }
  }

  private updateWoods(dt: number): void {
    // settle from the bottom up
    const order = this.woods.filter((w) => w.alive).sort((a, b) => b.y - a.y);
    for (const w of order) {
      const support = this.solidTopBelow(w.x + w.w / 2, w.y + w.h - 2, w.w - 4, w.id);
      const bottom = w.y + w.h;
      if (support > bottom + 0.5) {
        w.vy = Math.min(w.vy + this.gravity * dt, 800);
        w.y = Math.min(w.y + w.vy * dt, support - w.h);
        if (w.y + w.h >= support - 0.01) w.vy = 0;
      } else {
        w.vy = 0;
        if (support < bottom - 0.5 && support > w.y) w.y = support - w.h;
      }
    }
  }

  private updateTargets(dt: number): void {
    for (const tg of this.targets) {
      if (!tg.alive) continue;
      tg.t += dt;
      switch (tg.kind) {
        case 'balloon':
          tg.y = tg.baseY + Math.sin(tg.t * 1.3 + tg.hue) * 10;
          tg.x += tg.vx * dt;
          break;
        case 'ufo':
        case 'bird':
          tg.x += tg.vx * dt;
          tg.y = tg.baseY + Math.sin(tg.t * 2) * (tg.kind === 'bird' ? 14 : 6);
          if (tg.x < 40 || tg.x > WORLD_W - 40) tg.vx = -tg.vx;
          break;
        case 'board':
          break;
      }
      if (tg.kind === 'balloon' && (tg.x < 30 || tg.x > WORLD_W - 30)) tg.vx = -tg.vx;
    }
  }

  /** Remove dead cosmetic leftovers (between rounds/waves). */
  cleanup(): void {
    this.crates = this.crates.filter((c) => c.alive);
    this.woods = this.woods.filter((w) => w.alive);
    this.targets = this.targets.filter((t) => t.alive);
    this.env.crates = this.crates;
    this.env.woods = this.woods;
    this.env.targets = this.targets;
  }

  /** Change wind; returns new wind. */
  setWind(w: number): number {
    this.wind = w;
    return w;
  }
}

export const WORLD_BOUNDS = { w: WORLD_W, h: WORLD_H };
