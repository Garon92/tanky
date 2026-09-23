import { describe, expect, it } from 'vitest';
import { absorbShield, fallDamage, splashDamage } from '../src/game/damage';
import { FALL_DMG_MAX, FALL_SAFE } from '../src/game/constants';

describe('damage', () => {
  it('full damage at the center, none outside the radius', () => {
    expect(splashDamage(40, 36, 0, 21)).toBe(40);
    expect(splashDamage(40, 36, 200, 21)).toBe(0);
  });
  it('falls off with distance and bigger tanks catch more', () => {
    const near = splashDamage(40, 40, 20, 21);
    const far = splashDamage(40, 40, 45, 21);
    expect(near).toBeGreaterThan(far);
    expect(splashDamage(40, 40, 45, 32)).toBeGreaterThan(far);
  });
  it('edge of the blast still does at least 30 %', () => {
    const r = 40;
    const hitR = 20;
    const d = r + hitR * 0.6 - 0.5;
    expect(splashDamage(100, r, d, hitR)).toBeGreaterThanOrEqual(30);
  });
  it('fall damage starts after the safe height and is capped', () => {
    expect(fallDamage(FALL_SAFE)).toBe(0);
    expect(fallDamage(FALL_SAFE + 50)).toBeGreaterThan(0);
    expect(fallDamage(5000)).toBe(FALL_DMG_MAX);
  });
  it('shield absorbs first', () => {
    expect(absorbShield(30, 50)).toEqual({ hull: 0, shield: 20, absorbed: 30 });
    expect(absorbShield(30, 10)).toEqual({ hull: 20, shield: 0, absorbed: 10 });
  });
});
