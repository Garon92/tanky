import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { planBot, runSync } from '../src/game/ai';
import { SIM_DT } from '../src/game/constants';
import { Tank } from '../src/game/tank';
import { generateTerrain } from '../src/game/terrain';
import { World } from '../src/game/world';
import type { BotLevel, TankKind } from '../src/game/types';

function trial(kind: TankKind, level: BotLevel, seed: number, shots: number): boolean[] {
  const rng = new Rng(seed);
  const t = generateTerrain(rng, 'hills');
  const w = new World(t, { biome: 'meadow', wind: rng.range(-40, 40), seed });
  const me = w.addTank(new Tank({ x: 1350, team: 1, kind, control: 'bot', botLevel: level }));
  const foe = w.addTank(new Tank({ x: 250, team: 0 }));
  const mem = { lastTarget: null, streak: 0 };
  const res: boolean[] = [];
  const brainRng = new Rng(seed * 7 + 1);
  for (let s = 0; s < shots; s++) {
    foe.hp = 100; foe.alive = true;
    const plan = runSync(planBot(w, me, level, brainRng, mem));
    me.setAngle(plan.angle); me.setPower(plan.power); me.weapon = plan.weapon; me.inventory[plan.weapon] = 5;
    const before = foe.hp;
    w.fire(me);
    for (let i = 0; i < 2400 && w.isBusy(); i++) w.update(SIM_DT);
    res.push(foe.hp < before);
    w.terrain = w.terrain; // keep craters
  }
  return res;
}

it('balance', () => {
  const kinds: [TankKind, BotLevel][] = [['cadet', 'normal'], ['soldier', 'easy'], ['soldier', 'normal'], ['soldier', 'hard'], ['sniper', 'normal'], ['heavy', 'normal']];
  for (const [k, l] of kinds) {
    const N = 24, S = 4;
    const hits = new Array(S).fill(0);
    for (let n = 0; n < N; n++) trial(k, l, 1000 + n, S).forEach((h, i) => (hits[i] += h ? 1 : 0));
    console.log(k, l, hits.map((h) => Math.round((h / N) * 100) + '%').join(' '));
  }
}, 120000);
