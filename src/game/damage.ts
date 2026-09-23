import { FALL_DMG_MAX, FALL_DMG_PER_UNIT, FALL_SAFE } from './constants';

/**
 * Splash damage of an explosion to a tank.
 * @param base   weapon damage at the center
 * @param radius blast radius
 * @param dist   distance from explosion center to the tank's hit-circle center
 * @param hitR   tank hit radius (bigger tanks catch more of the blast)
 * @returns rounded damage, 0 when out of range
 */
export function splashDamage(base: number, radius: number, dist: number, hitR: number): number {
  if (base <= 0 || radius <= 0) return 0;
  const d = Math.max(0, dist - hitR * 0.6);
  if (d >= radius) return 0;
  const k = 1 - d / radius;
  const dmg = base * (0.3 + 0.7 * k);
  return Math.max(1, Math.round(dmg));
}

/** Damage from falling `fall` units. */
export function fallDamage(fall: number): number {
  if (fall <= FALL_SAFE) return 0;
  return Math.min(FALL_DMG_MAX, Math.round((fall - FALL_SAFE) * FALL_DMG_PER_UNIT));
}

/** Split incoming damage between shield and hull. */
export function absorbShield(amount: number, shield: number): { hull: number; shield: number; absorbed: number } {
  const absorbed = Math.min(shield, amount);
  return { hull: amount - absorbed, shield: shield - absorbed, absorbed };
}
