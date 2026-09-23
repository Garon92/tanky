import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { WIND_STRONG, WIND_WEAK, WORLD_W } from './constants';
import { BIOMES } from './biomes';
import type { LevelDef } from './levels';
import { Tank, TEAM_COLORS, TEAM_NAMES } from './tank';
import { addNoise, generateTerrain, heightsFromPoints, Terrain, type TerrainStyle } from './terrain';
import type { BiomeId, BotLevel, TankKind, Walls } from './types';
import { defaultInventory, type Inventory } from './weapons';
import { World } from './world';

export interface SlotSpec {
  control: 'human' | 'bot' | 'passive';
  botLevel?: BotLevel;
  kind?: TankKind;
  name?: string;
  team: number;
  color?: string;
  guide?: boolean;
  hp?: number;
  inventory?: Inventory;
}

/** Build the world for a hand-made campaign level. */
export function buildLevel(def: LevelDef, difficulty: BotLevel, playerName: string): { world: World; player: Tank; enemies: Tank[] } {
  const rng = new Rng(def.terrain.seed ?? def.id * 101);
  const heights = heightsFromPoints(def.terrain.pts);
  addNoise(heights, rng, def.terrain.noise ?? 0);
  const terrain = new Terrain(heights);
  for (const [x, r] of def.terrain.craters ?? []) terrain.crater(x, terrain.heightAt(x) - r * 0.35, r);
  terrain.original = terrain.heights.slice();
  // flat pads under tanks so they start level
  for (const x of [def.player.x, ...def.enemies.map((e) => e.x)]) terrain.flatten(x - 26, x + 26, 16);

  const biome = BIOMES[def.biome];
  const world = new World(terrain, {
    biome: def.biome,
    gravity: def.gravity ?? biome.gravity,
    wind: def.wind ?? 0,
    waterY: def.water ?? null,
    walls: def.walls ?? 'open',
    seed: rng.int(0, 1e9),
  });
  for (const b of def.blocks ?? []) {
    if (b.y === undefined) world.addGroundBlock(b.x, b.w, b.h, b.mat ?? 'stone');
    else world.addBlock(b.x, b.y, b.w, b.h, b.mat ?? 'stone');
  }
  for (const p of def.pads ?? []) world.addPad(p.x, p.w);
  for (const w of def.woods ?? []) world.addWoodStack(w.x, w.cols, w.rows);
  for (const p of def.portals ?? []) world.addPortalPair(p.a[0], p.a[1], p.b[0], p.b[1], p.hue ?? 280);
  for (const c of def.crates ?? []) world.spawnCrate(c.x, c.kind, false);

  const player = world.addTank(
    new Tank({
      x: def.player.x,
      team: 0,
      kind: 'player',
      control: 'human',
      name: playerName || 'Ty',
      color: TEAM_COLORS[0],
      hp: def.player.hp,
      inventory: { ...defaultInventory(), ...(def.player.weapons ?? {}) },
    }),
  );
  if (def.player.weapons) player.inventory = { ...def.player.weapons };
  player.angle = def.enemies[0] && def.enemies[0].x < def.player.x ? 135 : 45;

  const hpMul = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.15 : 1;
  const enemies = def.enemies.map((e) => {
    const t = new Tank({ x: e.x, team: 1, kind: e.kind, control: e.kind === 'dummy' ? 'passive' : 'bot', botLevel: difficulty, inventory: e.weapons });
    t.maxHp = Math.round(t.maxHp * hpMul);
    t.hp = t.maxHp;
    t.angle = e.x > def.player.x ? 135 : 45;
    return world.addTank(t);
  });
  return { world, player, enemies };
}

export interface RandomMapOptions {
  biome: BiomeId | 'random';
  slots: number;
  wind: 'off' | 'weak' | 'strong';
  walls?: Walls;
  seed?: number;
  obstacles?: boolean;
  style?: TerrainStyle;
}

/** Random battlefield for duel / survival / targets. Returns world and evenly spaced spawn xs. */
export function randomMap(o: RandomMapOptions): { world: World; spawns: number[]; rng: Rng } {
  const rng = new Rng(o.seed);
  const biomeId: BiomeId = o.biome === 'random' ? rng.pick<BiomeId>(['meadow', 'desert', 'snow', 'night', 'moon', 'volcano']) : o.biome;
  const biome = BIOMES[biomeId];
  const styles: TerrainStyle[] =
    biomeId === 'moon' ? ['craters', 'hills', 'plateaus'] : biomeId === 'desert' ? ['dunes', 'hills', 'mountain', 'plateaus'] : ['hills', 'hills', 'valley', 'mountain', 'plateaus', 'islands'];
  const style = o.style ?? rng.pick(styles);
  const terrain = generateTerrain(rng, style);
  const n = Math.max(1, o.slots);
  const margin = n <= 2 ? 0.14 : 0.1;
  const spawns: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.18 : margin + (i / (n - 1)) * (1 - margin * 2);
    spawns.push(Math.round(clamp(t * WORLD_W + rng.range(-40, 40), 70, WORLD_W - 70)));
  }
  let waterY: number | null = null;
  if (style === 'islands' || (biomeId === 'volcano' && rng.chance(0.7))) {
    // water/lava at the lowest third of the dips
    let low = 0;
    for (let x = 0; x < terrain.w; x++) low = Math.max(low, terrain.heights[x] as number);
    waterY = low - rng.range(30, 60);
    // keep spawns out of the water
    for (let i = 0; i < spawns.length; i++) {
      let x = spawns[i] as number;
      let tries = 0;
      while (terrain.heightAt(x) > waterY - 12 && tries++ < 60) x += (i % 2 === 0 ? 1 : -1) * 12;
      spawns[i] = clamp(x, 60, WORLD_W - 60);
    }
  }
  for (let i = 0; i < spawns.length; i++) spawns[i] = flattestNear(terrain, spawns[i] as number, 70, waterY);
  for (const x of spawns) terrain.flatten(x - 26, x + 26, 16);
  const windMax = o.wind === 'strong' ? WIND_STRONG : o.wind === 'weak' ? WIND_WEAK : 0;
  const world = new World(terrain, {
    biome: biomeId,
    gravity: biome.gravity,
    wind: windMax ? rng.range(-windMax, windMax) : 0,
    waterY,
    walls: o.walls ?? 'open',
    seed: rng.int(0, 1e9),
  });
  if (o.obstacles && rng.chance(0.6)) {
    // a little something in the middle: trampoline, wood pile or portals
    const mid = (spawns[0]! + spawns[spawns.length - 1]!) / 2;
    const r = rng.next();
    if (r < 0.35) world.addWoodStack(mid - 30, 2, rng.int(2, 4));
    else if (r < 0.6) world.addPad(mid - 45, 90);
    else if (r < 0.8) world.addPortalPair(rng.range(300, 600), rng.range(180, 320), rng.range(1000, 1300), rng.range(180, 320), rng.int(0, 359));
    else world.addGroundBlock(mid - 16, 32, rng.range(60, 120), rng.chance(0.5) ? 'stone' : 'metal');
  }
  return { world, spawns, rng };
}

/** Most level spot within ±range of x (keeps tanks off cliffs and out of water). */
export function flattestNear(terrain: Terrain, x: number, range: number, waterY: number | null = null): number {
  let best = x;
  let bestScore = Infinity;
  for (let cx = Math.max(60, x - range); cx <= Math.min(terrain.w - 60, x + range); cx += 5) {
    const l = terrain.heightAt(cx - 26);
    const r = terrain.heightAt(cx + 26);
    const c = terrain.heightAt(cx);
    let score = Math.abs(r - l) + Math.abs(c - (l + r) / 2) * 1.5 + Math.abs(cx - x) * 0.08;
    if (waterY !== null && c > waterY - 14) score += 1000;
    if (score < bestScore) {
      bestScore = score;
      best = cx;
    }
  }
  return best;
}

export function windMaxFor(w: 'off' | 'weak' | 'strong'): number {
  return w === 'strong' ? WIND_STRONG : w === 'weak' ? WIND_WEAK : 0;
}

export function defaultTankName(team: number): string {
  return TEAM_NAMES[team % TEAM_NAMES.length] ?? 'Tank';
}
