import { describe, expect, it } from 'vitest';
import { defaultSave, mergeDefaults } from '../src/core/storage';

describe('save data', () => {
  it('merges partial/old data onto defaults', () => {
    const merged = mergeDefaults(defaultSave(), {
      campaign: { stars: [3, 2] },
      survival: { bestScore: 1200 },
      duel: { rounds: 5, slots: [{ control: 'hard', guide: false }] },
      unknownKey: 42,
    });
    expect(merged.campaign.stars).toEqual([3, 2]);
    expect(merged.campaign.difficulty).toBe('normal');
    expect(merged.survival.bestScore).toBe(1200);
    expect(merged.survival.bestWave).toBe(0);
    expect(merged.duel.rounds).toBe(5);
    expect(merged.duel.teams).toBe(false);
    expect((merged as unknown as Record<string, unknown>).unknownKey).toBeUndefined();
  });

  it('ignores values of the wrong type', () => {
    const merged = mergeDefaults(defaultSave(), { survival: { bestScore: 'lots' }, prefs: { shake: 'yes' }, badges: 'none' });
    expect(merged.survival.bestScore).toBe(0);
    expect(merged.prefs.shake).toBe(true);
    expect(merged.badges).toEqual([]);
  });

  it('survives garbage', () => {
    expect(mergeDefaults(defaultSave(), null)).toEqual(defaultSave());
    expect(mergeDefaults(defaultSave(), 'x')).toEqual(defaultSave());
  });
});
