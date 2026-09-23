import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/game/constants';
import { Tank } from '../src/game/tank';
import { Terrain } from '../src/game/terrain';
import type { WeaponId } from '../src/game/types';
import { WEAPON_ORDER } from '../src/game/weapons';
import { World, type WorldEvent } from '../src/game/world';

function arena(): { w: World; a: Tank; b: Tank } {
  const w = new World(Terrain.flat(600), { biome: 'meadow', seed: 9 });
  const a = w.addTank(new Tank({ x: 300, team: 0 }));
  const b = w.addTank(new Tank({ x: 1100, team: 1 }));
  return { w, a, b };
}

function settle(w: World, maxSeconds = 20): WorldEvent[] {
  const events: WorldEvent[] = [];
  let t = 0;
  do {
    w.update(SIM_DT);
    events.push(...w.events);
    w.events.length = 0;
    t += SIM_DT;
  } while (w.isBusy() && t < maxSeconds);
  return events;
}

describe('world', () => {
  it.each(WEAPON_ORDER)('weapon %s resolves and settles', (weapon: WeaponId) => {
    const w = new World(Terrain.flat(600), { biome: 'meadow', seed: 9 });
    const a = w.addTank(new Tank({ x: 300, team: 0 }));
    a.inventory[weapon] = 3;
    a.weapon = weapon;
    a.setAngle(45);
    a.setPower(50);
    const before = w.terrain.heights.reduce((s, h) => s + h, 0);
    expect(w.fire(a)).toBe(true);
    const events = settle(w);
    expect(w.isBusy()).toBe(false);
    expect(events.some((e) => e.t === 'fire')).toBe(true);
    expect(events.some((e) => e.t === 'explosion')).toBe(true);
    const after = w.terrain.heights.reduce((s, h) => s + h, 0);
    if (weapon === 'dirt') expect(after).toBeLessThan(before); // ground raised
    else expect(after).toBeGreaterThan(before); // craters
    expect(a.ammo(weapon)).toBe(2);
  });

  it('direct hit damages and can destroy a tank', () => {
    const { w, a, b } = arena();
    b.hp = 10;
    w.damageTank(b, 50, a.id, b.x, b.y, true);
    expect(b.hp).toBe(0);
    const events = settle(w);
    expect(b.alive).toBe(false);
    expect(events.some((e) => e.t === 'death')).toBe(true);
    expect(a.kills).toBe(1);
  });

  it('one-hit rule kills on any real damage', () => {
    const { w, a, b } = arena();
    w.oneHit = true;
    w.damageTank(b, 12, a.id, b.x, b.y, false);
    expect(b.hp).toBe(0);
  });

  it('shield absorbs damage first', () => {
    const { w, a, b } = arena();
    b.shield = 30;
    w.damageTank(b, 20, a.id, b.x, b.y, false);
    expect(b.hp).toBe(100);
    expect(b.shield).toBe(10);
  });

  it('tank falls when the ground under it is blown away and takes fall damage', () => {
    const { w, a, b } = arena();
    w.terrain.crater(b.x, b.y + 60, 90);
    const events = settle(w);
    const land = events.find((e) => e.t === 'land');
    expect(land).toBeDefined();
    expect(b.y).toBeGreaterThan(640);
    expect(b.hp).toBeLessThan(100);
    void a;
  });

  it('driving uses fuel and stops at steep walls', () => {
    const { w, a } = arena();
    const fuel = a.fuel;
    for (let i = 0; i < 60; i++) w.drive(a, 1, SIM_DT);
    expect(a.x).toBeGreaterThan(300);
    expect(a.fuel).toBeLessThan(fuel);
    // wall of rock right in front
    w.addBlock(a.x + 35, 300, 30, 400);
    const x = a.x;
    for (let i = 0; i < 120; i++) w.drive(a, 1, SIM_DT);
    expect(a.x).toBeLessThan(x + 20);
  });

  it('crates fall with a parachute, land and can be collected by driving over them', () => {
    const { w, a } = arena();
    const c = w.spawnCrate(a.x + 60, 'repair');
    a.hp = 50;
    settle(w);
    expect(c.landed).toBe(true);
    for (let i = 0; i < 200 && c.alive; i++) w.drive(a, 1, SIM_DT);
    expect(c.alive).toBe(false);
    expect(a.hp).toBe(85);
  });

  it('explosion collects crates for the shooter and breaks wooden boxes', () => {
    const { w, a } = arena();
    const c = w.spawnCrate(800, 'ammo', false);
    w.addWoodStack(760, 1, 2);
    w.explode(790, 590, 30, 50, a.id, null, 'shell', 0.3);
    expect(c.alive).toBe(false);
    expect(w.woods.some((x) => !x.alive)).toBe(true);
    const got = Object.entries(a.inventory).filter(([k, n]) => k !== 'shell' && (n ?? 0) > 0);
    expect(got.length).toBeGreaterThan(0);
  });

  it('wooden boxes fall when the box below is destroyed', () => {
    const { w } = arena();
    w.addWoodStack(760, 1, 3);
    const top = w.woods[2]!;
    const y0 = top.y;
    w.woods[0]!.alive = false;
    settle(w);
    for (let i = 0; i < 240; i++) w.update(SIM_DT);
    expect(top.y).toBeGreaterThan(y0 + 20);
  });
});
