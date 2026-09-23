import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { planBot, runSync } from '../src/game/ai';
import { SIM_DT } from '../src/game/constants';
import { Tank } from '../src/game/tank';
import { Terrain } from '../src/game/terrain';
import { World } from '../src/game/world';

function duelWorld(opts: { wind?: number; hill?: boolean } = {}): { w: World; me: Tank; enemy: Tank } {
  const t = Terrain.flat(600);
  if (opts.hill) for (let x = 650; x < 950; x++) t.heights[x] = 600 - Math.sin(((x - 650) / 300) * Math.PI) * 260;
  t.original = t.heights.slice();
  const w = new World(t, { biome: 'meadow', wind: opts.wind ?? 0, seed: 1 });
  const me = w.addTank(new Tank({ x: 250, team: 0, control: 'bot', botLevel: 'hard' }));
  const enemy = w.addTank(new Tank({ x: 1250, team: 1, control: 'human' }));
  return { w, me, enemy };
}

/** Fire the plan and step the world until quiet; returns damage dealt to the enemy. */
function play(w: World, me: Tank, enemy: Tank, angle: number, power: number): number {
  me.setAngle(angle);
  me.setPower(power);
  const before = enemy.hp;
  w.fire(me);
  for (let i = 0; i < 120 * 12 && w.isBusy(); i++) w.update(SIM_DT);
  return before - enemy.hp;
}

describe('bot AI', () => {
  it('finds a shot that hits on flat ground', () => {
    const { w, me, enemy } = duelWorld();
    const plan = runSync(planBot(w, me, 'hard', new Rng(3), { lastTarget: enemy.id, streak: 5 }));
    expect(plan.predictedDamage).toBeGreaterThan(20);
    expect(plan.angle).toBeLessThan(90); // enemy is to the right
    // hard bot after a streak is accurate enough to actually hit
    expect(play(w, me, enemy, plan.angle, plan.power)).toBeGreaterThan(0);
  });

  it('compensates for wind', () => {
    const { w, me, enemy } = duelWorld({ wind: 90 });
    const plan = runSync(planBot(w, me, 'hard', new Rng(4), { lastTarget: enemy.id, streak: 8 }));
    expect(play(w, me, enemy, plan.angle, plan.power)).toBeGreaterThan(0);
  });

  it('lobs over a hill', () => {
    const { w, me } = duelWorld({ hill: true });
    const plan = runSync(planBot(w, me, 'hard', new Rng(5), { lastTarget: null, streak: 5 }));
    expect(plan.predictedDamage).toBeGreaterThan(0);
    expect(plan.angle).toBeGreaterThan(30);
  });

  it('easy bots are less accurate than hard bots on average', () => {
    // average miss distance of the first shot
    const spread = (level: 'easy' | 'hard') => {
      let sum = 0;
      for (let s = 0; s < 8; s++) {
        const { w, me, enemy } = duelWorld();
        const p = runSync(planBot(w, me, level, new Rng(200 + s), { lastTarget: null, streak: 0 }));
        me.setAngle(p.angle);
        me.setPower(p.power);
        w.fire(me);
        let x = enemy.x + 2000;
        for (let i = 0; i < 2000 && w.isBusy(); i++) {
          w.update(SIM_DT);
          for (const e of w.events) if (e.t === 'explosion' && e.kind === 'normal') x = e.x;
          w.events.length = 0;
        }
        sum += Math.min(600, Math.abs(x - enemy.x));
      }
      return sum / 8;
    };
    expect(spread('easy')).toBeGreaterThan(spread('hard'));
  });

  it('aims left at an enemy on the left', () => {
    const t = Terrain.flat(600);
    const w = new World(t, { biome: 'meadow', seed: 2 });
    const me = w.addTank(new Tank({ x: 1300, team: 1, control: 'bot' }));
    w.addTank(new Tank({ x: 300, team: 0 }));
    const plan = runSync(planBot(w, me, 'normal', new Rng(1), { lastTarget: null, streak: 0 }));
    expect(plan.angle).toBeGreaterThan(90);
  });
});
