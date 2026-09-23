import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/game/constants';
import { Match } from '../src/game/match';
import { CampaignMode, DuelMode, SurvivalMode, TargetsMode } from '../src/game/modes';

function run(m: Match, seconds: number): void {
  for (let i = 0; i < seconds / SIM_DT && m.phase !== 'over'; i++) {
    m.update(SIM_DT);
    if (m.phase === 'reward') m.mode.chooseReward(0);
  }
}

describe('match flow', () => {
  it('bot vs bot duel reaches a winner', () => {
    const mode = new DuelMode({
      slots: [
        { control: 'hard', guide: false },
        { control: 'hard', guide: false },
        { control: 'off', guide: false },
        { control: 'off', guide: false },
      ],
      rounds: 1,
      hp: 'normal',
      wind: 'weak',
      crates: true,
      biome: 'meadow',
      walls: 'open',
    });
    const m = new Match(mode, { guide: 'off', hints: false }, 42);
    let over = false;
    m.onOver = () => (over = true);
    m.begin();
    run(m, 900);
    expect(over).toBe(true);
    expect(m.result?.title).toMatch(/vítězí|Remíza/);
    const shots = mode.tanks.reduce((s, t) => s + t.shots, 0);
    expect(shots).toBeGreaterThan(1);
  });

  it('one-hit rules end a round on the first hit', () => {
    const mode = new DuelMode({
      slots: [
        { control: 'hard', guide: false },
        { control: 'hard', guide: false },
        { control: 'off', guide: false },
        { control: 'off', guide: false },
      ],
      rounds: 1,
      hp: 'onehit',
      wind: 'off',
      crates: false,
      biome: 'meadow',
      walls: 'open',
    });
    const m = new Match(mode, { guide: 'off', hints: false }, 7);
    m.begin();
    run(m, 600);
    expect(m.phase).toBe('over');
    const loser = mode.tanks.find((t) => !t.alive);
    expect(loser).toBeDefined();
  });

  it('human turn waits for input and firing ends the turn', () => {
    const mode = new CampaignMode(1, 'normal', 'Test', 0);
    const m = new Match(mode, { guide: 'short', hints: true }, 1);
    m.begin();
    run(m, 3);
    expect(m.phase).toBe('aim');
    expect(m.isHumanTurn).toBe(true);
    expect(mode.hint()).toBe('aim');
    m.adjustAngle(5);
    expect(mode.hint()).toBe('power');
    m.adjustPower(5);
    expect(mode.hint()).toBe('fire');
    expect(m.fire()).toBe(true);
    expect(m.phase).toBe('flight');
    run(m, 8);
    // dummy tank passes, so it's our turn again
    expect(m.isHumanTurn).toBe(true);
    expect(mode.player.shots).toBe(1);
    // the shot missed → the tutorial tells how to correct it
    if (mode.player.damageDealt === 0) expect(mode.hint()).toBe('adjust');
  });

  it('campaign level can be won and gives stars', () => {
    const mode = new CampaignMode(1, 'normal', 'Test', 0);
    const m = new Match(mode, { guide: 'off', hints: false }, 1);
    m.begin();
    run(m, 3);
    // cheat: kill the dummy directly
    const dummy = m.world.tanks.find((t) => t.team === 1)!;
    m.world.damageTank(dummy, 999, mode.player.id, dummy.x, dummy.y, true);
    m.fire();
    run(m, 10);
    expect(m.phase).toBe('over');
    expect(m.result?.won).toBe(true);
    expect(m.result?.stars).toBe(3);
  });

  it('survival advances waves when bots are destroyed', () => {
    const mode = new SurvivalMode('Test', 0);
    const m = new Match(mode, { guide: 'off', hints: false }, 3);
    m.begin();
    for (let i = 0; i < 2000 && !m.isHumanTurn; i++) m.update(SIM_DT);
    expect(m.isHumanTurn).toBe(true);
    for (const t of m.world.tanks.filter((t) => t.team === 1)) m.world.damageTank(t, 999, mode.player.id, t.x, t.y, true);
    m.fire();
    run(m, 12);
    expect(mode.wave).toBeGreaterThanOrEqual(2);
    expect(mode.score).toBeGreaterThan(0);
  });

  it('targets mode ends after 12 shots', () => {
    const mode = new TargetsMode('Test', 0);
    const m = new Match(mode, { guide: 'long', hints: false }, 5);
    m.begin();
    for (let i = 0; i < 12; i++) {
      run(m, 3);
      if (m.isHumanTurn) {
        m.setAim(40 + i * 3, 50 + i * 2);
        m.fire();
      }
      run(m, 10);
    }
    expect(m.phase).toBe('over');
    expect(m.world.targets.length).toBeGreaterThan(0);
  });
});

describe('team duel', () => {
  it('2 vs 2 bots: the whole team scores and the match ends', () => {
    const mode = new DuelMode({
      slots: [
        { control: 'hard', guide: false },
        { control: 'hard', guide: false },
        { control: 'normal', guide: false },
        { control: 'normal', guide: false },
      ],
      rounds: 1,
      hp: 'onehit',
      wind: 'off',
      crates: false,
      biome: 'meadow',
      walls: 'open',
      teams: true,
    });
    const m = new Match(mode, { guide: 'off', hints: false }, 11);
    m.begin();
    expect(mode.tanks.map((t) => t.team)).toEqual([0, 1, 0, 1]);
    // teams keep to their side
    const left = mode.tanks.filter((t) => t.x < 800).map((t) => t.team);
    expect(new Set(left).size).toBe(1);
    for (let i = 0; i < 900 / SIM_DT && m.phase !== 'over'; i++) m.update(SIM_DT);
    expect(m.phase).toBe('over');
    const winners = mode.tanks.filter((t) => t.wins > 0);
    if (winners.length) {
      expect(winners.length).toBe(2);
      expect(winners[0]!.team).toBe(winners[1]!.team);
    }
  });
});
