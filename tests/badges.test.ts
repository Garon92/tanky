import { describe, expect, it } from 'vitest';
import { BadgeTracker, BADGES } from '../src/game/badges';
import { SIM_DT } from '../src/game/constants';
import { Match } from '../src/game/match';
import { CampaignMode } from '../src/game/modes';

function setup() {
  const got: string[] = [];
  const tracker = new BadgeTracker([], (b) => got.push(b.id));
  const mode = new CampaignMode(2, 'normal', 'Test', 0);
  const m = new Match(mode, { guide: 'off', hints: false }, 3);
  m.begin();
  for (let i = 0; i < 1000 && !m.isHumanTurn; i++) m.update(SIM_DT);
  return { got, tracker, m, mode };
}

describe('badges', () => {
  it('ids are unique and every badge has an icon', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const b of BADGES) expect(b.icon.length).toBeGreaterThan(0);
  });

  it('a direct hit by the human earns first-hit and direct once', () => {
    const { got, tracker, m, mode } = setup();
    const foe = m.world.tanks.find((t) => t.team !== 0)!;
    m.world.damageTank(foe, 20, mode.player.id, foe.x, foe.y, true);
    m.world.damageTank(foe, 5, mode.player.id, foe.x, foe.y, true);
    for (const e of m.world.events) tracker.event(e, m);
    expect(got).toEqual(['first-hit', 'direct']);
  });

  it('bot damage never earns badges', () => {
    const { got, tracker, m, mode } = setup();
    const foe = m.world.tanks.find((t) => t.team !== 0)!;
    m.world.damageTank(mode.player, 20, foe.id, mode.player.x, mode.player.y, true);
    for (const e of m.world.events) tracker.event(e, m);
    expect(got).toEqual([]);
  });

  it('winning a level without damage earns first-win and untouched', () => {
    const { got, tracker, m } = setup();
    tracker.result({ mode: 'campaign', won: true, title: '', subtitle: '', stars: 3, stats: [] }, m, { level: 2, damageTaken: 0, totalStars: 6, maxStars: 45 });
    expect(got).toEqual(expect.arrayContaining(['first-win', 'perfect', 'untouched']));
    expect(got).not.toContain('all-stars');
    const before = got.length;
    tracker.result({ mode: 'campaign', won: true, title: '', subtitle: '', stars: 3, stats: [] }, m, { level: 2, damageTaken: 0 });
    expect(got.length).toBe(before); // no duplicates
  });

  it('survival waves', () => {
    const got: string[] = [];
    const tracker = new BadgeTracker(['wave5'], (b) => got.push(b.id));
    tracker.waveCleared(5);
    tracker.waveCleared(10);
    expect(got).toEqual(['wave10']);
  });
});
