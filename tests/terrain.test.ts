import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { BEDROCK_Y, TERRAIN_MIN_Y, WORLD_W } from '../src/game/constants';
import { generateTerrain, heightsFromPoints, Terrain } from '../src/game/terrain';

describe('Terrain', () => {
  it('interpolates heights between columns', () => {
    const t = Terrain.flat(500, 10, 100);
    t.heights[3] = 400;
    t.heights[4] = 500;
    expect(t.heightAt(3.5)).toBeCloseTo(450);
    expect(t.heightAt(-5)).toBe(500);
    expect(t.heightAt(99)).toBe(500);
  });

  it('crater lowers the surface where the circle cuts it', () => {
    const t = Terrain.flat(600);
    const removed = t.crater(800, 600, 40);
    expect(removed).toBeGreaterThan(0);
    expect(t.heightAt(800)).toBeCloseTo(640, 0);
    expect(t.heightAt(700)).toBe(600);
    expect(t.version).toBe(1);
  });

  it('underground blast collapses the ground above by the chord length', () => {
    const t = Terrain.flat(500);
    t.crater(800, 700, 30); // fully underground
    expect(t.heightAt(800)).toBeCloseTo(560, 0);
  });

  it('crater in the air does nothing', () => {
    const t = Terrain.flat(600);
    expect(t.crater(800, 300, 40)).toBe(0);
    expect(t.version).toBe(0);
  });

  it('never digs below bedrock', () => {
    const t = Terrain.flat(BEDROCK_Y - 5);
    t.crater(400, BEDROCK_Y, 200);
    for (let x = 0; x < t.w; x++) expect(t.heights[x]).toBeLessThanOrEqual(BEDROCK_Y);
  });

  it('dirt adds ground and floating dirt falls onto the surface', () => {
    const t = Terrain.flat(600);
    t.addDirt(800, 590, 30);
    expect(t.heightAt(800)).toBeLessThan(600);
    const t2 = Terrain.flat(600);
    t2.addDirt(800, 200, 30); // high in the air: falls and piles up a 60 high mound
    expect(t2.heightAt(800)).toBeCloseTo(540, 0);
    expect(t2.heightAt(700)).toBe(600);
  });

  it('flatten makes the pad level', () => {
    const t = generateTerrain(new Rng(1), 'hills');
    t.flatten(400, 450);
    expect(Math.abs(t.heightAt(400) - t.heightAt(450))).toBeLessThan(0.01);
  });

  it('control points produce a smooth profile through them', () => {
    const h = heightsFromPoints([
      [0, 600],
      [800, 400],
      [1599, 600],
    ]);
    expect(h[800]).toBeCloseTo(400, 0);
    expect(h[0]).toBeCloseTo(600, 0);
    expect(h[400]).toBeGreaterThan(400);
    expect(h[400]).toBeLessThan(600);
  });

  it('all generator styles stay within world limits', () => {
    for (const style of ['hills', 'valley', 'mountain', 'plateaus', 'islands', 'dunes', 'craters'] as const) {
      for (let seed = 0; seed < 5; seed++) {
        const t = generateTerrain(new Rng(seed), style);
        expect(t.heights.length).toBe(WORLD_W);
        for (let x = 0; x < t.w; x += 7) {
          expect(t.heights[x]).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
          expect(t.heights[x]).toBeLessThanOrEqual(BEDROCK_Y);
        }
      }
    }
  });
});
