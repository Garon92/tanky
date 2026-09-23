import { clamp, lerp } from '../core/math';
import { Rng } from '../core/rng';
import { BEDROCK_Y, TERRAIN_MIN_Y, WORLD_H, WORLD_W } from './constants';

/**
 * Destructible heightmap terrain. `heights[x]` = surface y of column x (y grows downward).
 * Explosions remove a circle of material: the ground above an underground hole collapses,
 * so the surface simply drops by the removed chord length (Scorched-Earth style).
 */
export class Terrain {
  readonly w: number;
  readonly h: number;
  heights: Float32Array;
  /** Surface at level start – used to know where grass/snow survives. */
  original: Float32Array;
  /** Incremented on every modification (render cache key). */
  version = 0;

  constructor(heights: Float32Array, w = WORLD_W, h = WORLD_H) {
    this.w = w;
    this.h = h;
    this.heights = heights;
    this.original = heights.slice();
  }

  static flat(y: number, w = WORLD_W, h = WORLD_H): Terrain {
    return new Terrain(new Float32Array(w).fill(y), w, h);
  }

  clone(): Terrain {
    const t = new Terrain(this.heights.slice(), this.w, this.h);
    t.original = this.original.slice();
    t.version = this.version;
    return t;
  }

  /** Surface y at any x (linear interpolation, clamped to world). */
  heightAt(x: number): number {
    if (x <= 0) return this.heights[0] as number;
    const max = this.w - 1;
    if (x >= max) return this.heights[max] as number;
    const i = Math.floor(x);
    const f = x - i;
    const a = this.heights[i] as number;
    const b = this.heights[i + 1] as number;
    return a + (b - a) * f;
  }

  /** dy/dx around x. */
  slopeAt(x: number, span = 5): number {
    return (this.heightAt(x + span) - this.heightAt(x - span)) / (span * 2);
  }

  isSolid(x: number, y: number): boolean {
    return y >= this.heightAt(x);
  }

  /** Remove a circle of ground. Returns removed area (for debris amount). */
  crater(cx: number, cy: number, r: number): number {
    if (r <= 0) return 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    let removed = 0;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = r * r - dx * dx;
      if (d2 <= 0) continue;
      const dy = Math.sqrt(d2);
      const top = cy - dy;
      const bottom = cy + dy;
      const surf = this.heights[x] as number;
      const cut = bottom - Math.max(surf, top);
      if (cut > 0) {
        const next = Math.min(BEDROCK_Y, surf + cut);
        removed += next - surf;
        this.heights[x] = next;
      }
    }
    if (removed > 0) this.version++;
    return removed;
  }

  /**
   * Remove the vertical span [top, bottom] from every column in [x0, x1] once (tunnel collapse).
   * Unlike overlapping craters this never double-counts, so a dug tunnel becomes a clean trench.
   */
  cutSpan(x0: number, x1: number, top: number, bottom: number, y1Top = top, y1Bottom = bottom): number {
    // half-open column range so consecutive segments never cut the same column twice
    const a = Math.max(0, Math.ceil(Math.min(x0, x1)));
    const b = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1)) - 1);
    let removed = 0;
    const span = x1 - x0 || 1;
    for (let x = a; x <= b; x++) {
      // interpolate the tunnel between its two end heights (no staircase)
      const t = Math.min(1, Math.max(0, (x - x0) / span));
      const tp = top + (y1Top - top) * t;
      const bt = bottom + (y1Bottom - bottom) * t;
      const surf = this.heights[x] as number;
      const cut = bt - Math.max(surf, tp);
      if (cut > 0) {
        const next = Math.min(BEDROCK_Y, surf + cut);
        removed += next - surf;
        this.heights[x] = next;
      }
    }
    if (removed > 0) this.version++;
    return removed;
  }

  /** Add a circle (ball) of dirt. Dirt that would float falls onto the surface below. */
  addDirt(cx: number, cy: number, r: number): number {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    let added = 0;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = r * r - dx * dx;
      if (d2 <= 0) continue;
      const dy = Math.sqrt(d2);
      const top = cy - dy;
      const bottom = cy + dy;
      const surf = this.heights[x] as number;
      // whole chord floats above the ground → falls and piles up; otherwise only the part above the surface
      const add = bottom <= surf ? 2 * dy : Math.max(0, surf - top);
      if (add > 0) {
        const next = Math.max(TERRAIN_MIN_Y, surf - add);
        added += surf - next;
        this.heights[x] = next;
      }
    }
    if (added > 0) {
      this.version++;
      this.relax(x0 - 2, x1 + 2, 1);
    }
    return added;
  }

  /** Light smoothing pass (removes 1-px spikes after edits). */
  relax(from: number, to: number, passes = 1): void {
    const a = Math.max(1, from);
    const b = Math.min(this.w - 2, to);
    for (let p = 0; p < passes; p++) {
      for (let x = a; x <= b; x++) {
        const l = this.heights[x - 1] as number;
        const c = this.heights[x] as number;
        const r = this.heights[x + 1] as number;
        // only knock down isolated spikes / fill isolated pits
        if ((c < l && c < r) || (c > l && c > r)) this.heights[x] = (l + r) * 0.5;
      }
    }
  }

  /** Highest surface point (smallest y) within [x0, x1]. */
  maxHeightIn(x0: number, x1: number): number {
    let m = Infinity;
    const a = clamp(Math.floor(x0), 0, this.w - 1);
    const b = clamp(Math.ceil(x1), 0, this.w - 1);
    for (let x = a; x <= b; x++) m = Math.min(m, this.heights[x] as number);
    return m;
  }

  /** Lowest surface point (largest y) within [x0, x1]. */
  minHeightIn(x0: number, x1: number): number {
    let m = -Infinity;
    const a = clamp(Math.floor(x0), 0, this.w - 1);
    const b = clamp(Math.ceil(x1), 0, this.w - 1);
    for (let x = a; x <= b; x++) m = Math.max(m, this.heights[x] as number);
    return m;
  }

  /** Flatten ground under [x0,x1] to the average (used for spawn pads). */
  flatten(x0: number, x1: number, blend = 12): void {
    const a = clamp(Math.floor(x0), 0, this.w - 1);
    const b = clamp(Math.ceil(x1), 0, this.w - 1);
    let sum = 0;
    for (let x = a; x <= b; x++) sum += this.heights[x] as number;
    const avg = sum / (b - a + 1);
    for (let x = a - blend; x <= b + blend; x++) {
      if (x < 0 || x >= this.w) continue;
      let t = 1;
      if (x < a) t = 1 - (a - x) / blend;
      else if (x > b) t = 1 - (x - b) / blend;
      t = t * t * (3 - 2 * t);
      this.heights[x] = lerp(this.heights[x] as number, avg, t);
    }
    this.original = this.heights.slice();
    this.version++;
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type TerrainStyle = 'hills' | 'valley' | 'mountain' | 'plateaus' | 'islands' | 'dunes' | 'craters';

/** Catmull-Rom interpolation through control points (x in world units, y in world units). */
export function heightsFromPoints(points: readonly (readonly [number, number])[], w = WORLD_W): Float32Array {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts.length === 0) return new Float32Array(w).fill(WORLD_H * 0.7);
  if ((pts[0] as [number, number])[0] > 0) pts.unshift([0, (pts[0] as [number, number])[1]]);
  const last = pts[pts.length - 1] as [number, number];
  if (last[0] < w - 1) pts.push([w - 1, last[1]]);
  const out = new Float32Array(w);
  let seg = 0;
  for (let x = 0; x < w; x++) {
    while (seg < pts.length - 2 && x > (pts[seg + 1] as [number, number])[0]) seg++;
    const p1 = pts[seg] as [number, number];
    const p2 = pts[seg + 1] as [number, number];
    const p0 = (pts[seg - 1] ?? p1) as [number, number];
    const p3 = (pts[seg + 2] ?? p2) as [number, number];
    const span = p2[0] - p1[0] || 1;
    const t = clamp((x - p1[0]) / span, 0, 1);
    // centripetal-ish Catmull-Rom on y only (x is monotonic)
    const m1 = ((p2[1] - p0[1]) / ((p2[0] - p0[0]) || 1)) * span;
    const m2 = ((p3[1] - p1[1]) / ((p3[0] - p1[0]) || 1)) * span;
    const t2 = t * t;
    const t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    out[x] = clamp(y, TERRAIN_MIN_Y, BEDROCK_Y - 20);
  }
  return out;
}

/** Add gentle seeded bumps so hand-made shapes don't look too clean. */
export function addNoise(h: Float32Array, rng: Rng, amp: number): void {
  if (amp <= 0) return;
  const w = h.length;
  const waves = [
    { a: amp, f: rng.range(3, 5), p: rng.range(0, Math.PI * 2) },
    { a: amp * 0.45, f: rng.range(8, 12), p: rng.range(0, Math.PI * 2) },
    { a: amp * 0.18, f: rng.range(20, 30), p: rng.range(0, Math.PI * 2) },
  ];
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let d = 0;
    for (const wv of waves) d += wv.a * Math.sin(t * Math.PI * 2 * wv.f + wv.p);
    h[x] = clamp((h[x] as number) + d, TERRAIN_MIN_Y, BEDROCK_Y - 20);
  }
}

function smooth(h: Float32Array, k: number): Float32Array {
  const w = h.length;
  const out = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    let c = 0;
    for (let i = -k; i <= k; i++) {
      s += h[clamp(x + i, 0, w - 1)] as number;
      c++;
    }
    out[x] = s / c;
  }
  return out;
}

/** Random terrain in one of several styles (used for duel, survival and targets). */
export function generateTerrain(rng: Rng, style: TerrainStyle, w = WORLD_W, h = WORLD_H): Terrain {
  const base = h * 0.66;
  const pts: [number, number][] = [];
  const n = 9;
  switch (style) {
    case 'valley':
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const v = Math.pow(Math.abs(t - 0.5) * 2, 1.6);
        pts.push([t * w, base + 120 - v * 260 + rng.range(-25, 25)]);
      }
      break;
    case 'mountain':
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const v = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.3);
        pts.push([t * w, base + 60 - v * rng.range(250, 330) + rng.range(-20, 20)]);
      }
      break;
    case 'plateaus': {
      let y = base + rng.range(-60, 60);
      for (let i = 0; i <= n * 2; i++) {
        const t = i / (n * 2);
        if (i % 3 === 0) y = clamp(base + rng.range(-150, 110), 250, h - 120);
        pts.push([t * w, y]);
      }
      break;
    }
    case 'islands':
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const up = i % 3 !== 1;
        pts.push([t * w, up ? base - rng.range(20, 110) : h - rng.range(90, 130)]);
      }
      break;
    case 'dunes':
      for (let i = 0; i <= n * 2; i++) {
        const t = i / (n * 2);
        pts.push([t * w, base + Math.sin(t * Math.PI * rng.range(5, 7)) * 45 + rng.range(-15, 15)]);
      }
      break;
    case 'craters':
    case 'hills':
    default: {
      // the original game's recipe: three sine waves + lifted edges
      const a1 = lerp(40, 80, rng.next());
      const a2 = lerp(18, 36, rng.next());
      const a3 = lerp(6, 16, rng.next());
      const f1 = lerp(0.5, 1.2, rng.next());
      const f2 = lerp(1.8, 3.0, rng.next());
      const f3 = lerp(4.0, 7.5, rng.next());
      const p1 = rng.range(0, Math.PI * 2);
      const p2 = rng.range(0, Math.PI * 2);
      const p3 = rng.range(0, Math.PI * 2);
      const arr = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const t = x / w;
        let y =
          base +
          a1 * Math.sin(t * Math.PI * 2 * f1 + p1) * 1.4 +
          a2 * Math.sin(t * Math.PI * 2 * f2 + p2) * 1.3 +
          a3 * Math.sin(t * Math.PI * 2 * f3 + p3);
        const edge = Math.min(x / (w * 0.15), (w - 1 - x) / (w * 0.15), 1);
        y -= (1 - edge) * 70;
        arr[x] = clamp(y, TERRAIN_MIN_Y + 80, BEDROCK_Y - 40);
      }
      const terrain = new Terrain(smooth(arr, 3), w, h);
      if (style === 'craters') {
        for (let i = 0; i < 7; i++) terrain.crater(rng.range(100, w - 100), terrain.heightAt(rng.range(100, w - 100)) - 10, rng.range(40, 90));
        terrain.heights = smooth(terrain.heights, 2);
        terrain.original = terrain.heights.slice();
      }
      return terrain;
    }
  }
  const heights = heightsFromPoints(pts, w);
  addNoise(heights, rng, 10);
  return new Terrain(smooth(heights, 2), w, h);
}
