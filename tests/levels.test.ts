import { describe, expect, it } from 'vitest';
import { SIM_DT, WORLD_W } from '../src/game/constants';
import { levelById, LEVELS, starsFor, WORLDS } from '../src/game/levels';
import { buildLevel } from '../src/game/mapgen';
import { Match } from '../src/game/match';
import { CampaignMode } from '../src/game/modes';

describe('campaign levels', () => {
  it('ids are 1..N and every world lists existing levels', () => {
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    const listed = WORLDS.flatMap((w) => w.levels);
    expect(listed.sort((a, b) => a - b)).toEqual(LEVELS.map((l) => l.id));
    for (const id of listed) expect(levelById(id)).toBeDefined();
  });

  it.each(LEVELS.map((l) => [l.id, l.name] as const))('level %i (%s) builds a sane world', (id) => {
    const def = levelById(id)!;
    const { world, player, enemies } = buildLevel(def, 'normal', 'Test');
    expect(enemies.length).toBe(def.enemies.length);
    for (const t of [player, ...enemies]) {
      expect(t.x).toBeGreaterThan(20);
      expect(t.x).toBeLessThan(WORLD_W - 20);
      expect(Number.isFinite(t.y)).toBe(true);
      // standing on something, not buried and not floating
      expect(Math.abs(world.groundAt(t.x, t.y) - t.y)).toBeLessThan(2);
      // not under water/lava
      if (world.waterY !== null) expect(t.y).toBeLessThan(world.waterY);
    }
    expect(def.par).toBeGreaterThan(0);
    expect(def.tip.length).toBeGreaterThan(10);
  });

  it('stars follow the par rule', () => {
    expect(starsFor(3, 3, true)).toBe(3);
    expect(starsFor(4, 3, true)).toBe(2);
    expect(starsFor(5, 3, true)).toBe(2);
    expect(starsFor(6, 3, true)).toBe(1);
    expect(starsFor(1, 3, false)).toBe(0);
  });

  // A hard bot playing the player's tank must be able to beat every level (proves the level is solvable
  // and that enemies can act without errors).
  it.each(LEVELS.map((l) => [l.id, l.name] as const))(
    'level %i (%s) is winnable by a hard bot',
    (id) => {
      let won = 0;
      for (let attempt = 0; attempt < 3 && won === 0; attempt++) {
        const mode = new CampaignMode(id, 'easy', 'Bot', 0);
        const m = new Match(mode, { guide: 'off', hints: false }, 100 + attempt * 17 + id);
        m.begin();
        mode.player.control = 'bot';
        mode.player.botLevel = 'hard';
        m.brains.clear();
        for (let i = 0; i < (240 / SIM_DT) && m.phase !== 'over'; i++) m.update(SIM_DT);
        expect(m.phase).toBe('over');
        if (m.result?.won) won++;
      }
      expect(won).toBeGreaterThan(0);
    },
    60000,
  );
});
