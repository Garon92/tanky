import { clamp, degToRad } from '../core/math';
import type { Rng } from '../core/rng';
import { BARREL_LEN, MAX_SPEED, SIM_DT, TANK_H } from './constants';
import { splashDamage } from './damage';
import { makeProjectile, simulate, type PhysEnv } from './physics';
import type { Tank } from './tank';
import type { BotLevel, WeaponId } from './types';
import { WEAPONS } from './weapons';
import type { World } from './world';

export interface ShotCandidate {
  angle: number;
  power: number;
  weapon: WeaponId;
  score: number;
  /** Predicted damage to enemies. */
  damage: number;
  /** Predicted damage to self/allies. */
  selfDamage: number;
  impactX: number;
  impactY: number;
  targetId: number | null;
}

export interface BotPlan {
  angle: number;
  power: number;
  weapon: WeaponId;
  /** Drive to this x first (null = stay). */
  moveTo: number | null;
  targetId: number | null;
  predictedDamage: number;
}

export interface BotMemory {
  lastTarget: number | null;
  streak: number;
}

export const LEVEL_PARAMS: Record<BotLevel, { angleSd: number; powerSd: number; floor: number; learn: number; think: number; special: number; adjustSpeed: number }> = {
  easy: { angleSd: 7, powerSd: 8, floor: 0.75, learn: 0.9, think: 0.9, special: 0.25, adjustSpeed: 0.55 },
  normal: { angleSd: 4.4, powerSd: 5, floor: 0.5, learn: 0.8, think: 0.6, special: 0.4, adjustSpeed: 0.8 },
  hard: { angleSd: 1.4, powerSd: 1.7, floor: 0.15, learn: 0.6, think: 0.4, special: 0.65, adjustSpeed: 1 },
};

interface Shooter {
  id: number;
  team: number;
  pivotX: number;
  pivotY: number;
  barrelLen: number;
}

function shooterAt(t: Tank, x: number, groundY: number): Shooter {
  return {
    id: t.id,
    team: t.team,
    pivotX: x,
    pivotY: groundY - TANK_H * t.scale,
    barrelLen: t.barrelLen || BARREL_LEN,
  };
}

/** Predict a single shot. Exposed for tests and for the aim guide. */
export function predictShot(env: PhysEnv, s: Shooter, angle: number, power: number, weapon: WeaponId, dt = SIM_DT): { x: number; y: number; tank: number | null; kind: string } {
  const a = degToRad(angle);
  const speed = (power / 100) * MAX_SPEED;
  const p = makeProjectile({
    weapon,
    owner: s.id,
    team: s.team,
    x: s.pivotX + Math.cos(a) * s.barrelLen,
    y: s.pivotY - Math.sin(a) * s.barrelLen,
    vx: Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
  });
  const r = simulate(p, env, dt, 7);
  return { x: r.x, y: r.y, tank: r.tank, kind: r.kind };
}

function evaluateImpact(world: World, me: Tank, weapon: WeaponId, hit: { x: number; y: number; tank: number | null; kind: string }): { damage: number; self: number; target: number | null } {
  if (hit.kind !== 'explode') return { damage: 0, self: 0, target: null };
  const def = WEAPONS[weapon];
  let dmgBase = def.damage;
  let radius = def.radius;
  if (def.behavior === 'triple') dmgBase *= 1.8;
  if (def.behavior === 'cluster') {
    dmgBase = (def.subDamage ?? 18) * 2.2;
    radius = (def.subRadius ?? 26) * 2.2;
  }
  if (def.behavior === 'airstrike') {
    dmgBase = (def.subDamage ?? 24) * 2;
    radius = 120;
  }
  if (def.behavior === 'dirt') return { damage: 0, self: 0, target: null };
  let damage = 0;
  let self = 0;
  let target: number | null = null;
  let best = 0;
  for (const t of world.tanks) {
    if (!t.alive || t.hp <= 0) continue;
    const d = Math.hypot(t.x - hit.x, t.cy - hit.y);
    const dmg = t.id === hit.tank ? dmgBase * 1.1 : splashDamage(dmgBase, radius, d, t.hitR);
    if (dmg <= 0) continue;
    const eff = Math.min(dmg, t.hp + t.shield);
    if (t.team === me.team) self += eff;
    else {
      damage += eff + (dmg >= t.hp ? 25 : 0); // bonus for a kill
      if (eff > best) {
        best = eff;
        target = t.id;
      }
    }
  }
  return { damage, self, target };
}

/** Horizontal miss of an impact relative to a target, positive = beyond it (seen from the shooter). */
function signedMiss(fromX: number, targetX: number, impactX: number): number {
  const dir = targetX >= fromX ? 1 : -1;
  return (impactX - targetX) * dir;
}

/**
 * Search the best (angle, power) for one weapon against all enemies.
 * Angles are swept on the enemy's side; for each angle power is found by coarse scan + bisection.
 */
export function* searchShots(world: World, me: Tank, shooter: Shooter, weapon: WeaponId, env: PhysEnv): Generator<void, ShotCandidate[]> {
  const enemies = world.tanks
    .filter((t) => t.alive && t.hp > 0 && t.team !== me.team)
    .sort((a, b) => Math.abs(a.x - shooter.pivotX) - Math.abs(b.x - shooter.pivotX))
    .slice(0, 3);
  const out: ShotCandidate[] = [];
  const coarseDt = 1 / 60;
  for (const enemy of enemies) {
    const right = enemy.x >= shooter.pivotX;
    const [pa, pb] = me.def.preferAngle;
    const angles: number[] = [];
    for (let a = 8; a <= 86; a += 4) angles.push(a);
    for (const rel of angles) {
      yield;
      const angle = right ? rel : 180 - rel;
      // coarse scan
      let prevPower = -1;
      let prevMiss = 0;
      let bestLocal: { power: number; miss: number } | null = null;
      for (let power = 14; power <= 100; power += 9) {
        const hit = predictShot(env, shooter, angle, power, weapon, coarseDt);
        const miss = hit.tank === enemy.id ? 0 : hit.kind === 'explode' ? signedMiss(shooter.pivotX, enemy.x, hit.x) : hit.kind === 'out' ? 3000 : signedMiss(shooter.pivotX, enemy.x, hit.x);
        if (!bestLocal || Math.abs(miss) < Math.abs(bestLocal.miss)) bestLocal = { power, miss };
        if (prevPower > 0 && Math.sign(miss) !== Math.sign(prevMiss) && Math.abs(miss - prevMiss) < 2500) {
          // bisection between prevPower and power
          let lo = prevPower;
          let hi = power;
          let loMiss = prevMiss;
          for (let k = 0; k < 7; k++) {
            const mid = (lo + hi) / 2;
            const h2 = predictShot(env, shooter, angle, mid, weapon, coarseDt);
            const m2 = h2.tank === enemy.id ? 0 : signedMiss(shooter.pivotX, enemy.x, h2.x);
            if (Math.abs(m2) < Math.abs(bestLocal.miss)) bestLocal = { power: mid, miss: m2 };
            if (Math.sign(m2) === Math.sign(loMiss)) {
              lo = mid;
              loMiss = m2;
            } else hi = mid;
          }
          break; // the first crossing is the lower-power (usually cleaner) solution for this angle
        }
        prevPower = power;
        prevMiss = miss;
      }
      if (!bestLocal || Math.abs(bestLocal.miss) > 260) continue;
      // exact prediction with the real timestep
      const hit = predictShot(env, shooter, angle, bestLocal.power, weapon);
      const ev = evaluateImpact(world, me, weapon, hit);
      const prefer = rel >= pa && rel <= pb ? 6 : 0;
      const score = ev.damage - ev.self * 2.5 + prefer - Math.abs(signedMiss(shooter.pivotX, enemy.x, hit.x)) * 0.02;
      out.push({ angle, power: bestLocal.power, weapon, score, damage: ev.damage, selfDamage: ev.self, impactX: hit.x, impactY: hit.y, targetId: ev.target ?? enemy.id });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function pickWeapons(me: Tank, rng: Rng, level: BotLevel): WeaponId[] {
  const list: WeaponId[] = ['shell'];
  const specials = (Object.keys(me.inventory) as WeaponId[]).filter(
    (w) => w !== 'shell' && me.hasAmmo(w) && w !== 'dirt' && w !== 'digger' && w !== 'airstrike',
  );
  if (specials.length && rng.chance(LEVEL_PARAMS[level].special)) list.push(rng.pick(specials));
  return list;
}

/**
 * Full bot decision: weapon, aim (with human-like error) and optional repositioning.
 */
export function* planBot(world: World, me: Tank, level: BotLevel, rng: Rng, mem: BotMemory): Generator<void, BotPlan> {
  const env = world.physEnv();
  const params = LEVEL_PARAMS[level];
  const here = shooterAt(me, me.pivotX, me.pivotY + TANK_H * me.scale);
  here.pivotX = me.pivotX;
  here.pivotY = me.pivotY;
  const weapons = pickWeapons(me, rng, level);
  let best: ShotCandidate | null = null;
  for (const w of weapons) {
    const c = (yield* searchShots(world, me, here, w, env))[0];
    if (c && (!best || c.score > best.score + (w === 'shell' ? 0 : 4))) best = c;
  }

  // Blocked? try repositioning with the fuel we have.
  let moveTo: number | null = null;
  if ((!best || best.damage < 5) && me.fuel > 15) {
    const offsets = [-40, 40, -80, 80, -130, 130].filter((o) => Math.abs(o) <= me.fuel);
    let bestMove: { x: number; c: ShotCandidate } | null = null;
    for (const o of offsets) {
      const x = clamp(me.x + o, 30, world.terrain.w - 30);
      const gy = world.groundAt(x, me.y);
      if (gy < me.y - Math.abs(o) * 1.1) continue; // unreachable cliff
      const s = shooterAt(me, x, gy);
      const c = (yield* searchShots(world, me, s, 'shell', env))[0];
      if (c && c.damage > (bestMove?.c.damage ?? (best?.damage ?? 0) + 4)) bestMove = { x, c };
    }
    if (bestMove) {
      moveTo = bestMove.x;
      best = bestMove.c;
    }
  }

  if (!best) {
    // nothing sensible: lob toward the nearest enemy
    const enemy = world.tanks.find((t) => t.alive && t.team !== me.team);
    const right = enemy ? enemy.x > me.x : me.x < world.terrain.w / 2;
    return { angle: right ? 55 : 125, power: 60, weapon: 'shell', moveTo, targetId: enemy?.id ?? null, predictedDamage: 0 };
  }

  // Human-like error that shrinks while shooting at the same target.
  if (mem.lastTarget === best.targetId) mem.streak++;
  else mem.streak = 0;
  mem.lastTarget = best.targetId;
  const learn = Math.max(params.floor, Math.pow(params.learn, mem.streak));
  const err = me.def.aimError * learn;
  const angle = clamp(best.angle + rng.gauss() * params.angleSd * err, 1, 179);
  const power = clamp(best.power + rng.gauss() * params.powerSd * err, 8, 100);
  return { angle, power, weapon: best.weapon, moveTo, targetId: best.targetId, predictedDamage: best.damage };
}

/** Run a generator to completion (tests, instant decisions). */
export function runSync<T>(g: Generator<void, T>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/** Trajectory points for the aim guide (x,y pairs) until first impact. */
export function guidePath(world: World, t: Tank, maxPoints = 400): number[] {
  const env = world.physEnv();
  const a = degToRad(t.angle);
  const speed = (t.power / 100) * MAX_SPEED;
  const m = t.muzzlePos();
  const p = makeProjectile({ weapon: 'shell', owner: t.id, team: t.team, x: m.x, y: m.y, vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed });
  const path: number[] = [m.x, m.y];
  simulate(p, env, SIM_DT, 6, path, 2);
  if (path.length > maxPoints * 2) path.length = maxPoints * 2;
  return path;
}
