import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { WORLD_W } from '../src/game/constants';
import { flattestNear, randomMap } from '../src/game/mapgen';
import { Terrain } from '../src/game/terrain';

describe('random maps', () => {
  it('spawns are inside the world, apart, level and out of water', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const slots of [1, 2, 4]) {
        const { world, spawns } = randomMap({ biome: 'random', slots, wind: 'weak', seed, obstacles: true });
        expect(spawns.length).toBe(slots);
        for (const x of spawns) {
          expect(x).toBeGreaterThanOrEqual(50);
          expect(x).toBeLessThanOrEqual(WORLD_W - 50);
          const y = world.terrain.heightAt(x);
          if (world.waterY !== null) expect(y).toBeLessThan(world.waterY);
          // flattened pad under the tank
          expect(Math.abs(world.terrain.heightAt(x - 20) - world.terrain.heightAt(x + 20))).toBeLessThan(3);
        }
        for (let i = 1; i < spawns.length; i++) expect(Math.abs((spawns[i] as number) - (spawns[i - 1] as number))).toBeGreaterThan(150);
      }
    }
  });

  it('same seed → same map', () => {
    const a = randomMap({ biome: 'random', slots: 2, wind: 'strong', seed: 77 });
    const b = randomMap({ biome: 'random', slots: 2, wind: 'strong', seed: 77 });
    expect(a.world.biome).toBe(b.world.biome);
    expect(a.world.wind).toBe(b.world.wind);
    expect(Array.from(a.world.terrain.heights)).toEqual(Array.from(b.world.terrain.heights));
  });

  it('flattestNear prefers level ground', () => {
    const t = Terrain.flat(600);
    for (let x = 0; x < 600; x++) t.heights[x] = 600 - (600 - x) * 0.8; // steep slope left of 600
    const x = flattestNear(t, 500, 150);
    expect(x).toBeGreaterThanOrEqual(600);
  });

  it('rng is deterministic and in range', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(Rng.fromString('tanky').next()).toBe(Rng.fromString('tanky').next());
  });
});
