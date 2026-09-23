import { describe, expect, it } from 'vitest';
import { GRAVITY, SIM_DT } from '../src/game/constants';
import { makeProjectile, simulate, stepProjectile, type PhysEnv } from '../src/game/physics';
import { Terrain } from '../src/game/terrain';

function env(over: Partial<PhysEnv> = {}): PhysEnv {
  return {
    terrain: Terrain.flat(600),
    blocks: [],
    woods: [],
    pads: [],
    portals: [],
    tanks: [],
    crates: [],
    targets: [],
    wind: 0,
    gravity: GRAVITY,
    waterY: null,
    walls: 'open',
    w: 1600,
    h: 900,
    ...over,
  };
}

const shot = (x: number, y: number, vx: number, vy: number, weapon: 'shell' | 'bouncer' | 'roller' = 'shell') =>
  makeProjectile({ weapon, owner: 99, team: 0, x, y, vx, vy });

describe('projectile physics', () => {
  it('lands where the ballistic formula says (flat ground, no wind)', () => {
    const v = 700;
    const a = Math.PI / 4;
    const p = shot(200, 600 - 0.01, Math.cos(a) * v, -Math.sin(a) * v);
    const r = simulate(p, env(), SIM_DT);
    expect(r.kind).toBe('explode');
    const expected = 200 + (v * v) / GRAVITY; // range at 45°
    expect(Math.abs(r.x - expected)).toBeLessThan(15);
  });

  it('wind pushes the shell', () => {
    const a = shot(200, 590, 400, -500);
    const b = shot(200, 590, 400, -500);
    const calm = simulate(a, env(), SIM_DT);
    const windy = simulate(b, env({ wind: 100 }), SIM_DT);
    expect(windy.x).toBeGreaterThan(calm.x + 20);
  });

  it('hits a tank in the flight path', () => {
    const p = shot(200, 500, 600, 0);
    const r = simulate(p, env({ tanks: [{ id: 5, team: 1, x: 400, y: 544, r: 20 }] }), SIM_DT);
    expect(r.kind).toBe('explode');
    expect(r.tank).toBe(5);
  });

  it('does not hit its own tank right after launch', () => {
    const p = shot(200, 580, 300, -300);
    const ev = stepProjectile(p, env({ tanks: [{ id: 99, team: 0, x: 200, y: 590, r: 21 }] }), SIM_DT);
    expect(ev).toBeNull();
  });

  it('explodes on a stone block', () => {
    const p = shot(200, 500, 600, 0);
    const r = simulate(p, env({ blocks: [{ id: 1, x: 500, y: 400, w: 30, h: 200, mat: 'stone' }] }), SIM_DT);
    expect(r.kind).toBe('explode');
    expect(r.x).toBeLessThanOrEqual(501);
    expect(r.x).toBeGreaterThan(480);
  });

  it('bouncer bounces off the ground before exploding', () => {
    const p = shot(200, 400, 300, 0, 'bouncer');
    const r = simulate(p, env(), SIM_DT);
    expect(r.bounces).toBeGreaterThanOrEqual(1);
    expect(r.x).toBeGreaterThan(400);
  });

  it('trampoline sends the shell back up', () => {
    const p = shot(500, 300, 0, 200);
    const e = env({ pads: [{ id: 1, x: 460, y: 586, w: 80, h: 14, squash: 0 }] });
    let bounced = false;
    for (let i = 0; i < 400; i++) {
      const ev = stepProjectile(p, e, SIM_DT);
      if (ev?.t === 'bounce' && ev.on === 'pad') {
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);
    expect(p.vy).toBeLessThan(0);
  });

  it('portal teleports keeping the direction', () => {
    const p = shot(100, 300, 1000, 0);
    const e = env({
      portals: [
        { id: 1, x: 300, y: 300, r: 26, pair: 2, hue: 0 },
        { id: 2, x: 1000, y: 200, r: 26, pair: 1, hue: 0 },
      ],
    });
    let tp = false;
    for (let i = 0; i < 200 && !tp; i++) tp = stepProjectile(p, e, SIM_DT)?.t === 'portal';
    expect(tp).toBe(true);
    expect(p.x).toBeGreaterThan(1000);
    expect(p.vx).toBeGreaterThan(0);
  });

  it('splashes into water', () => {
    const t = Terrain.flat(700);
    const p = shot(200, 500, 300, 0);
    const r = simulate(p, env({ terrain: t, waterY: 650 }), SIM_DT);
    expect(r.kind).toBe('splash');
  });

  it('leaves the world through open side walls', () => {
    const p = shot(1500, 300, 900, -200);
    expect(simulate(p, env(), SIM_DT).kind).toBe('out');
  });

  it('bounces off side walls when enabled', () => {
    const p = shot(1500, 300, 900, -200);
    const r = simulate(p, env({ walls: 'bounce' }), SIM_DT);
    expect(r.kind).toBe('explode');
    expect(r.x).toBeLessThan(1600);
  });

  it('roller rolls downhill after landing', () => {
    const t = Terrain.flat(600);
    for (let x = 0; x < 1600; x++) t.heights[x] = 400 + Math.min(x, 1600 - x) * 0.25; // valley at x = 800
    const p = shot(300, 300, 50, 50, 'roller');
    const r = simulate(p, env({ terrain: t }), SIM_DT, 20);
    expect(r.kind).toBe('explode');
    expect(r.x).toBeGreaterThan(600);
    expect(r.x).toBeLessThan(1000);
  });
});
