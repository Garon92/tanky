import { Rng } from '../core/rng';
import type { Biome } from '../game/biomes';
import { BEDROCK_Y, WORLD_H, WORLD_W } from '../game/constants';
import type { Terrain } from '../game/terrain';
import type { Camera } from './camera';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Sky, sun/moon, stars and two parallax hill layers – cached per biome + canvas size. */
export class Backdrop {
  canvas: HTMLCanvasElement | null = null;
  private key = '';

  get(biome: Biome, cam: Camera, seed: number): HTMLCanvasElement {
    const key = `${biome.id}|${cam.cssW}x${cam.cssH}@${cam.dpr}|${seed}`;
    if (this.canvas && key === this.key) return this.canvas;
    this.key = key;
    const c = this.canvas && this.canvas.width === Math.round(cam.cssW * cam.dpr) && this.canvas.height === Math.round(cam.cssH * cam.dpr) ? this.canvas : makeCanvas(cam.cssW * cam.dpr, cam.cssH * cam.dpr);
    this.canvas = c;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    cam.applyWorld(ctx, false);
    const v = cam.view;
    const rng = new Rng(seed);

    // sky
    const g = ctx.createLinearGradient(0, v.y0, 0, WORLD_H * 0.75);
    g.addColorStop(0, biome.sky[0]);
    g.addColorStop(0.55, biome.sky[1]);
    g.addColorStop(1, biome.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4);

    // stars
    if (biome.stars) {
      for (let i = 0; i < 260; i++) {
        const x = rng.range(v.x0, v.x1);
        const y = rng.range(v.y0, WORLD_H * 0.62);
        const r = rng.chance(0.08) ? rng.range(1.2, 1.9) : rng.range(0.5, 1.1);
        ctx.fillStyle = `rgba(255,255,255,${rng.range(0.25, 0.85) * (1 - y / (WORLD_H * 0.9))})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // sun / moon / earth
    const sx = WORLD_W * 0.78;
    const sy = WORLD_H * 0.16;
    if (biome.sun === 'sun') {
      const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220);
      glow.addColorStop(0, 'rgba(255,248,200,0.9)');
      glow.addColorStop(0.2, 'rgba(255,236,160,0.35)');
      glow.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 220, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = biome.id === 'desert' ? '#fff1c7' : '#fffbe6';
      ctx.beginPath();
      ctx.arc(sx, sy, 44, 0, Math.PI * 2);
      ctx.fill();
    } else if (biome.sun === 'moon') {
      const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 160);
      glow.addColorStop(0, 'rgba(230,236,255,0.35)');
      glow.addColorStop(1, 'rgba(230,236,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 160, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1dc';
      ctx.beginPath();
      ctx.arc(sx, sy, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(180,176,150,0.45)';
      for (const [dx, dy, r] of [
        [-12, -8, 8],
        [10, 6, 6],
        [-4, 14, 5],
        [14, -14, 4],
      ] as const) {
        ctx.beginPath();
        ctx.arc(sx + dx, sy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (biome.sun === 'earth') {
      const glow = ctx.createRadialGradient(sx, sy, 30, sx, sy, 120);
      glow.addColorStop(0, 'rgba(120,180,255,0.35)');
      glow.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 50, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#2f7fd8';
      ctx.fillRect(sx - 50, sy - 50, 100, 100);
      ctx.fillStyle = '#4caf50';
      for (const [dx, dy, rx, ry] of [
        [-18, -10, 20, 14],
        [16, 12, 16, 20],
        [-6, 26, 12, 8],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(sx + dx, sy + dy, rx, ry, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(sx - 10, sy - 30, 26, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // night side
      const shade = ctx.createLinearGradient(sx - 50, sy, sx + 50, sy);
      shade.addColorStop(0.45, 'rgba(0,0,20,0)');
      shade.addColorStop(1, 'rgba(0,0,20,0.75)');
      ctx.fillStyle = shade;
      ctx.fillRect(sx - 50, sy - 50, 100, 100);
      ctx.restore();
    } else if (biome.id === 'volcano') {
      // glowing volcano silhouette far away
      const vx = WORLD_W * 0.3;
      const glow = ctx.createRadialGradient(vx, WORLD_H * 0.36, 10, vx, WORLD_H * 0.36, 260);
      glow.addColorStop(0, 'rgba(255,120,40,0.55)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(vx - 300, WORLD_H * 0.1, 600, 500);
    }

    // parallax hills
    const layer = (base: number, amp: number, color: string, freq: number, jag: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(v.x0 - 10, v.y1 + 10);
      const p1 = rng.range(0, 6.28);
      const p2 = rng.range(0, 6.28);
      const p3 = rng.range(0, 6.28);
      for (let x = v.x0 - 10; x <= v.x1 + 10; x += 8) {
        const t = x / WORLD_W;
        const y =
          base -
          amp * (0.55 + 0.45 * Math.sin(t * Math.PI * 2 * freq + p1)) -
          amp * 0.35 * Math.sin(t * Math.PI * 2 * freq * 2.3 + p2) -
          jag * Math.abs(Math.sin(t * Math.PI * 2 * freq * 6.1 + p3));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(v.x1 + 10, v.y1 + 10);
      ctx.closePath();
      ctx.fill();
    };
    const far = biome.id === 'snow' || biome.id === 'volcano' ? 60 : biome.id === 'moon' ? 30 : 40;
    layer(WORLD_H * 0.62, 150, biome.far, 1.3, far * 0.6);
    // snow caps / haze on far hills
    const haze = ctx.createLinearGradient(0, WORLD_H * 0.3, 0, WORLD_H * 0.75);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, biome.night ? 'rgba(20,30,60,0.25)' : 'rgba(255,255,255,0.28)');
    ctx.fillStyle = haze;
    ctx.fillRect(v.x0, WORLD_H * 0.3, v.x1 - v.x0, WORLD_H * 0.5);
    layer(WORLD_H * 0.7, 90, biome.mid, 2.1, far * 0.25);
    if (biome.id === 'volcano') {
      // lava glow at horizon
      const lg = ctx.createLinearGradient(0, WORLD_H * 0.55, 0, WORLD_H * 0.8);
      lg.addColorStop(0, 'rgba(255,90,30,0)');
      lg.addColorStop(1, 'rgba(255,90,30,0.25)');
      ctx.fillStyle = lg;
      ctx.fillRect(v.x0, WORLD_H * 0.55, v.x1 - v.x0, WORLD_H * 0.3);
    }
    return c;
  }
}

/** Cached, re-rendered-on-change terrain layer. */
export class TerrainLayer {
  canvas: HTMLCanvasElement | null = null;
  private key = '';

  get(terrain: Terrain, biome: Biome, cam: Camera, seed: number): HTMLCanvasElement {
    const key = `${terrain.version}|${biome.id}|${cam.cssW}x${cam.cssH}@${cam.dpr}|${seed}|${terrain.heights.length}`;
    if (this.canvas && key === this.key && this.lastTerrain === terrain) return this.canvas;
    this.key = key;
    this.lastTerrain = terrain;
    const W = Math.round(cam.cssW * cam.dpr);
    const H = Math.round(cam.cssH * cam.dpr);
    if (!this.canvas || this.canvas.width !== W || this.canvas.height !== H) this.canvas = makeCanvas(W, H);
    const ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    cam.applyWorld(ctx, false);
    drawTerrain(ctx, terrain, biome, cam, seed);
    return this.canvas;
  }
  private lastTerrain: Terrain | null = null;
}

function surfacePath(ctx: CanvasRenderingContext2D, terrain: Terrain, x0: number, x1: number, bottom: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  ctx.lineTo(x0, terrain.heightAt(x0));
  const start = Math.max(0, Math.floor(x0));
  const end = Math.min(terrain.w - 1, Math.ceil(x1));
  for (let x = start; x <= end; x++) ctx.lineTo(x, terrain.heights[x] as number);
  ctx.lineTo(x1, terrain.heightAt(x1));
  ctx.lineTo(x1, bottom);
  ctx.closePath();
}

export function drawTerrain(ctx: CanvasRenderingContext2D, terrain: Terrain, biome: Biome, cam: Camera, seed: number): void {
  const v = cam.view;
  const x0 = Math.min(0, v.x0) - 20;
  const x1 = Math.max(terrain.w, v.x1) + 20;
  const bottom = Math.max(WORLD_H, v.y1) + 20;
  const rng = new Rng(seed ^ 0x5bd1e995);

  // body
  surfacePath(ctx, terrain, x0, x1, bottom);
  const g = ctx.createLinearGradient(0, 300, 0, WORLD_H);
  g.addColorStop(0, biome.ground[0]);
  g.addColorStop(1, biome.ground[1]);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  surfacePath(ctx, terrain, x0, x1, bottom);
  ctx.clip();
  // strata bands
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = biome.speck;
  ctx.lineWidth = 10;
  for (let i = 0; i < 6; i++) {
    const by = 420 + i * 80 + rng.range(-20, 20);
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 20) ctx.lineTo(x, by + Math.sin(x * 0.006 + i) * 18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // pebbles & specks
  for (let i = 0; i < 420; i++) {
    const x = rng.range(x0, x1);
    const top = terrain.original[Math.max(0, Math.min(terrain.w - 1, Math.floor(x)))] as number;
    const y = rng.range(top + 10, WORLD_H);
    const big = rng.chance(0.12);
    ctx.fillStyle = big ? biome.rock : biome.speck;
    ctx.globalAlpha = big ? 0.55 : 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, big ? rng.range(4, 9) : rng.range(1.2, 2.6), big ? rng.range(3, 6) : rng.range(1, 2), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (biome.id === 'volcano') {
    // glowing cracks
    ctx.strokeStyle = 'rgba(255,110,30,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      let x = rng.range(x0, x1);
      let y = rng.range(terrain.heightAt(x) + 20, WORLD_H - 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += rng.range(-18, 18);
        y += rng.range(6, 18);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // inner shadow under the surface
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 26;
  ctx.beginPath();
  for (let x = Math.floor(x0); x <= x1; x += 3) ctx.lineTo(x, terrain.heightAt(x) + 13);
  ctx.stroke();
  ctx.restore();

  // bedrock
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x0, BEDROCK_Y + 2, x1 - x0, bottom - BEDROCK_Y);

  // top layer where the ground is undisturbed; crater rims elsewhere
  const undisturbed = (x: number) => {
    const i = Math.max(0, Math.min(terrain.w - 1, Math.round(x)));
    return (terrain.heights[i] as number) <= (terrain.original[i] as number) + 1.5;
  };
  const runs: [number, number][] = [];
  let runStart: number | null = null;
  for (let x = Math.floor(x0); x <= x1; x++) {
    const ok = undisturbed(x);
    if (ok && runStart === null) runStart = x;
    if ((!ok || x === Math.floor(x1)) && runStart !== null) {
      runs.push([runStart, x]);
      runStart = null;
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokeRuns = (dy: number, width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const [a, b] of runs) {
      ctx.beginPath();
      for (let x = a; x <= b; x += 2) ctx.lineTo(x, terrain.heightAt(x) + dy);
      ctx.lineTo(b, terrain.heightAt(b) + dy);
      ctx.stroke();
    }
  };
  strokeRuns(4, 9, biome.top);
  strokeRuns(1, 3, biome.topLight);
  // crater rims (disturbed parts)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let inRim = false;
  for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(terrain.w - 1, x1); x += 2) {
    if (!undisturbed(x)) {
      const y = terrain.heightAt(x) + 1;
      if (!inRim) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      inRim = true;
    } else inRim = false;
  }
  ctx.stroke();

  // decorations on undisturbed ground
  const deco = new Rng(seed ^ 0x9e3779b9);
  for (let x = Math.max(4, Math.floor(x0)); x < Math.min(terrain.w - 4, x1); x += 6) {
    const r = deco.next();
    if (!undisturbed(x) || !undisturbed(x + 4) || !undisturbed(x - 4)) continue;
    const y = terrain.heightAt(x);
    const slope = terrain.slopeAt(x);
    if (Math.abs(slope) > 1.4) continue;
    switch (biome.id) {
      case 'meadow':
      case 'night':
        if (r < 0.55) {
          ctx.strokeStyle = biome.id === 'night' ? '#2c7a37' : '#3f9e44';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const h = 4 + deco.next() * 6;
          ctx.moveTo(x - 2, y + 1);
          ctx.lineTo(x - 3, y - h * 0.8);
          ctx.moveTo(x, y + 1);
          ctx.lineTo(x + 0.5, y - h);
          ctx.moveTo(x + 2, y + 1);
          ctx.lineTo(x + 3.5, y - h * 0.7);
          ctx.stroke();
        } else if (r < 0.6 && biome.id === 'meadow') {
          ctx.fillStyle = deco.pick(['#ffd54a', '#ff8fd1', '#ffffff', '#b388ff']);
          ctx.beginPath();
          ctx.arc(x, y - 6, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#3f9e44';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y - 5);
          ctx.stroke();
        }
        break;
      case 'desert':
        if (r < 0.025) {
          // little cactus
          ctx.fillStyle = '#5b9e4d';
          const h = 14 + deco.next() * 14;
          ctx.fillRect(x - 2.5, y - h, 5, h + 2);
          ctx.fillRect(x - 8, y - h * 0.6, 4, 3);
          ctx.fillRect(x - 8, y - h * 0.9, 3, h * 0.35);
          ctx.fillRect(x + 3, y - h * 0.5, 4, 3);
          ctx.fillRect(x + 5, y - h * 0.8, 3, h * 0.33);
        } else if (r < 0.12) {
          ctx.fillStyle = 'rgba(150,100,50,0.5)';
          ctx.beginPath();
          ctx.ellipse(x, y + 1, 2 + deco.next() * 2, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'snow':
        if (r < 0.03) {
          // small pine
          const h = 18 + deco.next() * 16;
          ctx.fillStyle = '#2e6b4f';
          ctx.beginPath();
          ctx.moveTo(x, y - h);
          ctx.lineTo(x - h * 0.33, y - 2);
          ctx.lineTo(x + h * 0.33, y - 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(x, y - h);
          ctx.lineTo(x - h * 0.14, y - h * 0.62);
          ctx.lineTo(x + h * 0.14, y - h * 0.62);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#6d4c41';
          ctx.fillRect(x - 1.5, y - 3, 3, 4);
        }
        break;
      case 'moon':
        if (r < 0.06) {
          ctx.fillStyle = 'rgba(90,94,106,0.6)';
          ctx.beginPath();
          ctx.ellipse(x, y + 1, 2 + deco.next() * 4, 1.5 + deco.next() * 2, 0, Math.PI, 0);
          ctx.fill();
        }
        break;
      case 'volcano':
        if (r < 0.04) {
          ctx.fillStyle = '#2a201e';
          ctx.beginPath();
          ctx.moveTo(x - 5, y + 1);
          ctx.lineTo(x - 1, y - 8 - deco.next() * 6);
          ctx.lineTo(x + 4, y + 1);
          ctx.fill();
        }
        break;
    }
  }
}

/** Animated water (or lava) surface. */
export function drawWater(ctx: CanvasRenderingContext2D, terrain: Terrain, waterY: number, biome: Biome, time: number, cam: Camera): void {
  const v = cam.view;
  const lava = biome.id === 'volcano';
  const x0 = Math.max(Math.floor(v.x0), -40);
  const x1 = Math.min(Math.ceil(v.x1), terrain.w + 40);
  ctx.save();
  const g = ctx.createLinearGradient(0, waterY, 0, WORLD_H);
  if (lava) {
    g.addColorStop(0, 'rgba(255,170,40,0.95)');
    g.addColorStop(0.4, 'rgba(230,70,20,0.95)');
    g.addColorStop(1, 'rgba(120,20,10,0.95)');
  } else {
    g.addColorStop(0, biome.night ? 'rgba(40,110,190,0.8)' : 'rgba(70,170,240,0.78)');
    g.addColorStop(1, biome.night ? 'rgba(10,30,70,0.92)' : 'rgba(20,80,160,0.88)');
  }
  ctx.fillStyle = g;
  // columns where the ground is below the water level
  let inside = false;
  ctx.beginPath();
  const wave = (x: number) => waterY + Math.sin(x * 0.03 + time * 2.2) * 2 + Math.sin(x * 0.011 - time * 1.3) * 1.5;
  let segStart = 0;
  const segs: [number, number][] = [];
  for (let x = x0; x <= x1; x += 2) {
    const below = terrain.heightAt(x) > waterY - 3;
    if (below && !inside) {
      inside = true;
      segStart = x;
    } else if (!below && inside) {
      inside = false;
      segs.push([segStart, x]);
    }
  }
  if (inside) segs.push([segStart, x1]);
  for (const [a, b] of segs) {
    ctx.beginPath();
    ctx.moveTo(a - 2, wave(a));
    for (let x = a; x <= b + 2; x += 4) ctx.lineTo(x, wave(x));
    for (let x = b + 2; x >= a - 2; x -= 2) ctx.lineTo(x, Math.max(wave(x), terrain.heightAt(x) + 2));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = lava ? 'rgba(255,230,140,0.9)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = a; x <= b; x += 4) ctx.lineTo(x, wave(x));
    ctx.stroke();
  }
  ctx.restore();
}
