import { BEDROCK_Y, TRAIL_LEN } from './constants';
import type { Terrain } from './terrain';
import type { Block, Crate, Pad, Portal, Projectile, Target, Walls, Wood } from './types';
import { WEAPONS } from './weapons';

export interface HitCircle {
  id: number;
  team: number;
  x: number;
  y: number;
  r: number;
}

/** Everything a projectile can interact with. Shared by the live world and AI prediction. */
export interface PhysEnv {
  terrain: Terrain;
  blocks: Block[];
  woods: Wood[];
  pads: Pad[];
  portals: Portal[];
  tanks: HitCircle[];
  crates: Crate[];
  targets: Target[];
  wind: number;
  gravity: number;
  waterY: number | null;
  walls: Walls;
  w: number;
  h: number;
}

export type PhysEvent =
  | { t: 'explode'; x: number; y: number; tank: number | null; crate: number | null; target: number | null }
  | { t: 'bounce'; x: number; y: number; on: 'terrain' | 'pad' | 'wall' | 'block' }
  | { t: 'splash'; x: number; y: number }
  | { t: 'out' }
  | { t: 'portal'; from: number; to: number }
  | { t: 'land'; x: number; y: number }
  | { t: 'dig'; x: number; y: number }
  | { t: 'apex'; x: number; y: number };

const CRATE_R = 15;
const SUB_LEN = 6; // max distance per substep (tunneling guard)

let nextProjId = 1;

export function makeProjectile(opts: {
  weapon: Projectile['weapon'];
  owner: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sub?: boolean;
  damage?: number;
  radius?: number;
}): Projectile {
  const def = WEAPONS[opts.weapon];
  return {
    id: nextProjId++,
    weapon: opts.weapon,
    owner: opts.owner,
    team: opts.team,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    r: opts.sub ? Math.max(3, def.size * 0.7) : def.size,
    damage: opts.damage ?? def.damage,
    radius: opts.radius ?? def.radius,
    bounces: def.bounces ?? 0,
    mode: 'fly',
    rollV: 0,
    rollSlow: 0,
    digLeft: def.digLen ?? 0,
    digLastX: Number.NaN,
    digLastY: 0,
    age: 0,
    portalCd: 0,
    split: !!opts.sub,
    sub: !!opts.sub,
    alive: true,
    trail: [],
    apexY: opts.y,
  };
}

const explode = (x: number, y: number, tank: number | null = null, crate: number | null = null, target: number | null = null): PhysEvent => ({
  t: 'explode',
  x,
  y,
  tank,
  crate,
  target,
});

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

function hitCircles(p: Projectile, x: number, y: number, env: PhysEnv): PhysEvent | null {
  for (const c of env.tanks) {
    if (c.id === p.owner && p.age < 0.3 && !p.sub) continue; // leaving own barrel
    const dx = x - c.x;
    const dy = y - c.y;
    const rr = c.r + p.r;
    if (dx * dx + dy * dy <= rr * rr) return explode(x, y, c.id);
  }
  for (const t of env.targets) {
    if (!t.alive) continue;
    const dx = x - t.x;
    const dy = y - t.y;
    const rr = t.r + p.r;
    if (dx * dx + dy * dy <= rr * rr) return explode(x, y, null, null, t.id);
  }
  for (const c of env.crates) {
    if (!c.alive) continue;
    const dx = x - c.x;
    const dy = y - (c.y - CRATE_R);
    const rr = CRATE_R + p.r;
    if (dx * dx + dy * dy <= rr * rr) return explode(x, y, null, c.id);
  }
  return null;
}

/** Reflect velocity off a surface with the given (unit) normal. */
function reflect(p: Projectile, nx: number, ny: number, restitution: number, friction = 0.9): void {
  const vn = p.vx * nx + p.vy * ny;
  if (vn >= 0) return; // already moving away
  // split into normal and tangential parts
  const vnx = vn * nx;
  const vny = vn * ny;
  const vtx = p.vx - vnx;
  const vty = p.vy - vny;
  p.vx = vtx * friction - vnx * restitution;
  p.vy = vty * friction - vny * restitution;
}

function pushTrail(p: Projectile): void {
  p.trail.push(p.x, p.y);
  if (p.trail.length > TRAIL_LEN * 2) p.trail.splice(0, 2);
}

/**
 * Advance a projectile by dt. Returns the first notable event (or null).
 * Pure with respect to the environment (never mutates env) – safe for AI simulation.
 */
export function stepProjectile(p: Projectile, env: PhysEnv, dt: number, trail = true): PhysEvent | null {
  if (!p.alive) return null;
  if (p.mode === 'roll') return stepRoll(p, env, dt);
  if (p.mode === 'dig') return stepDig(p, env, dt);

  const speed = Math.hypot(p.vx, p.vy);
  const n = Math.max(1, Math.ceil((speed * dt) / SUB_LEN));
  const h = dt / n;
  const def = WEAPONS[p.weapon];
  for (let i = 0; i < n; i++) {
    p.age += h;
    if (p.portalCd > 0) p.portalCd -= h;
    const prevVy = p.vy;
    p.vy += env.gravity * h;
    p.vx += env.wind * h;
    if (def.behavior === 'homing' && !p.sub && p.age > 0.35 && p.vy > -220) steerHoming(p, env, h);
    const nx = p.x + p.vx * h;
    const ny = p.y + p.vy * h;

    // --- apex (cluster split)
    if (!p.split && def.behavior === 'cluster' && prevVy < 0 && p.vy >= 0) {
      p.x = nx;
      p.y = ny;
      return { t: 'apex', x: nx, y: ny };
    }

    // --- world bounds
    if (nx < p.r || nx > env.w - p.r) {
      if (env.walls === 'bounce') {
        p.x = nx < p.r ? p.r : env.w - p.r;
        p.y = ny;
        p.vx = -p.vx * 0.85;
        return { t: 'bounce', x: p.x, y: p.y, on: 'wall' };
      }
      if (nx < -80 || nx > env.w + 80) return { t: 'out' };
    }
    if (ny > env.h + 60 || ny < -4000) return { t: 'out' };

    // --- tanks, targets, crates
    const hc = hitCircles(p, nx, ny, env);
    if (hc) return hc;

    // --- portals
    if (p.portalCd <= 0) {
      for (const po of env.portals) {
        const dx = nx - po.x;
        const dy = ny - po.y;
        if (dx * dx + dy * dy <= po.r * po.r) {
          const dest = env.portals.find((q) => q.id === po.pair);
          if (!dest) break;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          p.x = dest.x + (p.vx / sp) * (dest.r + 6);
          p.y = dest.y + (p.vy / sp) * (dest.r + 6);
          p.portalCd = 0.35;
          p.trail.length = 0;
          return { t: 'portal', from: po.id, to: dest.id };
        }
      }
    }

    // --- trampolines
    for (const pad of env.pads) {
      if (inRect(nx, ny, pad, p.r)) {
        const fromAbove = p.y + p.r <= pad.y + 4 && p.vy > 0;
        if (fromAbove) {
          p.x = nx;
          p.y = pad.y - p.r - 0.5;
          p.vy = -Math.max(Math.abs(p.vy) * 1.02, 380);
          p.vx *= 0.98;
          return { t: 'bounce', x: p.x, y: pad.y, on: 'pad' };
        }
        return bounceOrExplodeRect(p, nx, ny, pad);
      }
    }

    // --- solid blocks & wooden boxes
    for (const b of env.blocks) {
      if (inRect(nx, ny, b, p.r)) return bounceOrExplodeRect(p, nx, ny, b);
    }
    for (const w of env.woods) {
      if (w.alive && inRect(nx, ny, w, p.r)) {
        if (p.bounces > 0) return bounceOrExplodeRect(p, nx, ny, w);
        return explode(nx, ny);
      }
    }

    // --- water
    if (env.waterY !== null && ny >= env.waterY && env.terrain.heightAt(nx) > env.waterY) {
      return { t: 'splash', x: nx, y: env.waterY };
    }

    // --- terrain
    const ground = env.terrain.heightAt(nx);
    if (ny + p.r * 0.4 >= ground) {
      // refine contact point along the segment
      let ax = p.x;
      let ay = p.y;
      let bx = nx;
      let by = ny;
      for (let k = 0; k < 5; k++) {
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        if (my + p.r * 0.4 >= env.terrain.heightAt(mx)) {
          bx = mx;
          by = my;
        } else {
          ax = mx;
          ay = my;
        }
      }
      const cx = ax;
      const cy = Math.min(ay, env.terrain.heightAt(ax) - p.r * 0.4);
      if (def.behavior === 'roll' && !p.sub) {
        p.x = cx;
        p.y = env.terrain.heightAt(cx) - p.r;
        const s = env.terrain.slopeAt(cx);
        const len = Math.hypot(1, s);
        // tangential component of velocity along (1, s)
        p.rollV = ((p.vx + p.vy * s) / len) * 0.55;
        p.mode = 'roll';
        return { t: 'land', x: p.x, y: p.y };
      }
      if (def.behavior === 'dig' && !p.sub) {
        p.x = cx;
        p.y = cy;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        p.vx = (p.vx / sp) * 340;
        p.vy = Math.max(60, (p.vy / sp) * 340);
        p.mode = 'dig';
        return { t: 'land', x: cx, y: cy };
      }
      if (p.bounces > 0) {
        const s = env.terrain.slopeAt(cx);
        const len = Math.hypot(s, 1);
        const nxn = s / len;
        const nyn = -1 / len;
        p.x = cx;
        p.y = env.terrain.heightAt(cx) - p.r - 1;
        reflect(p, nxn, nyn, 0.62, 0.8);
        p.bounces--;
        if (Math.hypot(p.vx, p.vy) < 70) return explode(p.x, p.y);
        return { t: 'bounce', x: p.x, y: p.y, on: 'terrain' };
      }
      return explode(cx, cy);
    }

    p.x = nx;
    p.y = ny;
    if (p.y < p.apexY) p.apexY = p.y;
  }
  if (trail) pushTrail(p);
  return null;
}

function bounceOrExplodeRect(p: Projectile, nx: number, ny: number, r: { x: number; y: number; w: number; h: number }): PhysEvent {
  if (p.bounces <= 0) {
    // explode at the rect boundary closest to where we came from
    const cx = Math.min(Math.max(p.x, r.x - p.r), r.x + r.w + p.r);
    const cy = Math.min(Math.max(p.y, r.y - p.r), r.y + r.h + p.r);
    return explode(cx, cy);
  }
  // decide which face we crossed using previous position
  const wasLeft = p.x < r.x - p.r * 0.5;
  const wasRight = p.x > r.x + r.w + p.r * 0.5;
  const wasAbove = p.y < r.y - p.r * 0.5;
  if (wasAbove) {
    p.y = r.y - p.r - 0.5;
    p.x = nx;
    reflect(p, 0, -1, 0.75);
  } else if (wasLeft || wasRight) {
    p.x = wasLeft ? r.x - p.r - 0.5 : r.x + r.w + p.r + 0.5;
    p.y = ny;
    reflect(p, wasLeft ? -1 : 1, 0, 0.75);
  } else {
    p.y = r.y + r.h + p.r + 0.5;
    reflect(p, 0, 1, 0.75);
  }
  p.bounces--;
  return { t: 'bounce', x: p.x, y: p.y, on: 'block' };
}

function steerHoming(p: Projectile, env: PhysEnv, h: number): void {
  let best: HitCircle | null = null;
  let bestD = Infinity;
  for (const c of env.tanks) {
    if (c.team === p.team) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best || bestD > 900) return;
  const sp = Math.hypot(p.vx, p.vy);
  const cur = Math.atan2(p.vy, p.vx);
  const want = Math.atan2(best.y - p.y, best.x - p.x);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = 2.2 * h; // rad per second
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  const na = cur + turn;
  const nsp = Math.max(sp, 260);
  p.vx = Math.cos(na) * nsp;
  p.vy = Math.sin(na) * nsp;
}

function stepRoll(p: Projectile, env: PhysEnv, dt: number): PhysEvent | null {
  const n = Math.max(1, Math.ceil((Math.abs(p.rollV) * dt) / SUB_LEN));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    p.age += h;
    const s = env.terrain.slopeAt(p.x, 4);
    const len = Math.hypot(1, s);
    p.rollV += ((env.gravity * s) / len) * h;
    const fr = 70 * h;
    if (Math.abs(p.rollV) <= fr) p.rollV = 0;
    else p.rollV -= Math.sign(p.rollV) * fr;
    if (Math.abs(p.rollV) < 10) p.rollSlow += h;
    else p.rollSlow = 0;
    if (p.rollSlow > 0.3 || p.age > 7) return explode(p.x, p.y);
    const nx = p.x + (p.rollV / len) * h;
    if (nx < p.r || nx > env.w - p.r) {
      if (env.walls === 'bounce') {
        p.rollV = -p.rollV * 0.7;
        continue;
      }
      return { t: 'out' };
    }
    const ny = env.terrain.heightAt(nx) - p.r;
    for (const b of env.blocks) if (inRect(nx, ny, b, p.r * 0.8)) return explode(p.x, p.y);
    for (const w of env.woods) if (w.alive && inRect(nx, ny, w, p.r * 0.8)) return explode(p.x, p.y);
    const hc = hitCircles(p, nx, ny, env);
    if (hc) return hc;
    if (env.waterY !== null && ny + p.r >= env.waterY) return { t: 'splash', x: nx, y: env.waterY };
    p.vx = p.rollV / len;
    p.vy = (p.rollV / len) * s;
    p.x = nx;
    p.y = ny;
  }
  pushTrail(p);
  return null;
}

function stepDig(p: Projectile, env: PhysEnv, dt: number): PhysEvent | null {
  p.age += dt;
  p.vy += 120 * dt;
  const sp = Math.hypot(p.vx, p.vy) || 1;
  p.vx = (p.vx / sp) * 340;
  p.vy = (p.vy / sp) * 340;
  const nx = p.x + p.vx * dt;
  const ny = p.y + p.vy * dt;
  p.digLeft -= 340 * dt;
  const hc = hitCircles(p, nx, ny, env);
  if (hc) return hc;
  if (p.digLeft <= 0 || ny >= BEDROCK_Y - 4 || nx < 0 || nx > env.w) return explode(p.x, p.y);
  for (const b of env.blocks) if (inRect(nx, ny, b, p.r)) return explode(p.x, p.y);
  // left the ground into open air (e.g. through a hill) → pop out and explode
  if (ny < env.terrain.heightAt(nx) - 14) return explode(nx, ny);
  const prevBucket = Math.floor((p.age - dt) * 30);
  p.x = nx;
  p.y = ny;
  pushTrail(p);
  if (Math.floor(p.age * 30) !== prevBucket) return { t: 'dig', x: nx, y: ny };
  return null;
}

export interface SimResult {
  kind: 'explode' | 'splash' | 'out' | 'timeout';
  x: number;
  y: number;
  tank: number | null;
  time: number;
  bounces: number;
}

/**
 * Predict where a projectile ends up. Runs the exact same step function as the game.
 * Clusters are predicted by their main shell; airstrike/dig/roll behave as in the game (minus terrain edits).
 */
export function simulate(p: Projectile, env: PhysEnv, dt: number, maxTime = 8, path?: number[], pathEvery = 3): SimResult {
  let t = 0;
  let bounces = 0;
  let step = 0;
  while (t < maxTime) {
    const ev = stepProjectile(p, env, dt, false);
    t += dt;
    if (path && step++ % pathEvery === 0) path.push(p.x, p.y);
    if (!ev) continue;
    switch (ev.t) {
      case 'explode':
        if (path) path.push(ev.x, ev.y);
        return { kind: 'explode', x: ev.x, y: ev.y, tank: ev.tank, time: t, bounces };
      case 'splash':
        return { kind: 'splash', x: ev.x, y: ev.y, tank: null, time: t, bounces };
      case 'out':
        return { kind: 'out', x: p.x, y: p.y, tank: null, time: t, bounces };
      case 'apex':
        p.split = true; // keep flying as one shell for prediction
        break;
      case 'bounce':
        bounces++;
        break;
      default:
        break;
    }
  }
  return { kind: 'timeout', x: p.x, y: p.y, tank: null, time: t, bounces };
}

export function resetProjectileIds(): void {
  nextProjId = 1;
}
