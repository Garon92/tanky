/**
 * Ambient "easter eggs" from the original game – shooting stars, UFOs, balloons, moles, rabbits, foxes…
 * Ported from the old main.js to TypeScript, now in world coordinates and aware of day/night and biome.
 * Purely cosmetic.
 */
import { rand } from '../core/rng';
import type { BiomeId } from '../game/types';

export interface FlairCtx {
  W: number;
  H: number;
  heightAt(x: number): number;
  slopeAt(x: number): number;
  /** x positions to keep creatures away from (tanks). */
  avoid: number[];
  night: boolean;
  biome: BiomeId;
  busy: boolean;
}

export interface FlairEntity {
  update(dt: number, c: FlairCtx): void;
  isAlive(c: FlairCtx): boolean;
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void;
}

const farFrom = (c: FlairCtx, x: number, d: number): boolean => c.avoid.every((a) => Math.abs(a - x) > d);
const fadeIn = (t: number, dur: number): number => Math.min(1, Math.max(0, t / dur));

// ============================================================================ SKY
class ShootingStar implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  tail: number;
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    const sp = rand(680, 980);
    this.tail = rand(80, 120);
    this.x = ltr ? -80 : c.W + 80;
    this.y = rand(40, Math.min(c.H * 0.38, 260));
    this.vx = ltr ? sp : -sp;
    this.vy = rand(120, 220);
    this.ttl = rand(0.9, 1.6);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -200 && this.x < c.W + 200;
  }
  draw(g: CanvasRenderingContext2D): void {
    const fade = fadeIn(this.ttl, 0.3);
    const len = Math.hypot(this.vx, this.vy) || 1;
    const tx = this.x - (this.vx / len) * this.tail;
    const ty = this.y - (this.vy / len) * this.tail;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(this.x, this.y, tx, ty);
    gr.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(tx, ty);
    g.stroke();
    g.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
    g.beginPath();
    g.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

class Comet implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  max: number;
  tail = rand(220, 320);
  core = rand(3, 4.2);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    const sp = rand(180, 300);
    const a = (Math.random() - 0.5) * 0.35;
    this.x = ltr ? -120 : c.W + 120;
    this.y = rand(60, Math.min(c.H * 0.45, 320));
    this.vx = Math.cos(a) * sp * (ltr ? 1 : -1);
    this.vy = Math.sin(a) * sp * (ltr ? 1 : -1);
    this.ttl = this.max = rand(2.6, 4.2);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -240 && this.x < c.W + 240;
  }
  draw(g: CanvasRenderingContext2D): void {
    const fade = fadeIn(this.ttl, this.max * 0.5);
    const len = Math.hypot(this.vx, this.vy) || 1;
    const tx = this.x - (this.vx / len) * this.tail;
    const ty = this.y - (this.vy / len) * this.tail;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(this.x, this.y, tx, ty);
    gr.addColorStop(0, `rgba(255,230,160,${0.95 * fade})`);
    gr.addColorStop(0.3, `rgba(255,180,80,${0.5 * fade})`);
    gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.strokeStyle = gr;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(tx, ty);
    g.stroke();
    const rg = g.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.core * 3);
    rg.addColorStop(0, `rgba(255,240,200,${0.9 * fade})`);
    rg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(this.x, this.y, this.core * 3, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

class UFO implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  t = 0;
  life = 14;
  beam = Math.random() < 0.5;
  beamT = rand(0.4, 1.4);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.x = ltr ? -120 : c.W + 120;
    this.y = rand(80, Math.min(c.H * 0.4, 260));
    this.vx = (ltr ? 1 : -1) * rand(60, 120);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.t += dt;
    this.beamT -= dt;
    if (this.beamT <= 0) {
      this.beam = !this.beam;
      this.beamT = rand(0.5, 1.6);
    }
  }
  isAlive(c: FlairCtx): boolean {
    return this.t < this.life && this.x > -200 && this.x < c.W + 200;
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    const fade = Math.min(1, (this.life - this.t) / 1.2);
    g.save();
    if (this.beam) {
      const top = this.y + 7;
      const bottom = Math.min(c.heightAt(this.x), this.y + 260);
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 3.7) + 0.2 * Math.sin(this.t * 11.3);
      const a = (0.08 + 0.05 * pulse) * fade;
      const gr = g.createLinearGradient(this.x, top, this.x, bottom);
      gr.addColorStop(0, `rgba(200,255,240,${a})`);
      gr.addColorStop(1, 'rgba(200,255,240,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(this.x - 8, top);
      g.lineTo(this.x + 8, top);
      g.lineTo(this.x + 40, bottom);
      g.lineTo(this.x - 40, bottom);
      g.closePath();
      g.fill();
    }
    const gr = g.createLinearGradient(this.x, this.y - 12, this.x, this.y + 12);
    gr.addColorStop(0, '#cfd8dc');
    gr.addColorStop(1, '#90a4ae');
    g.globalAlpha = fade;
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(this.x, this.y, 42, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(227,242,253,1)';
    g.beginPath();
    g.ellipse(this.x, this.y - 8.4, 14.7, 7.2, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(this.t * 5 + i));
      g.fillStyle = `rgba(255,255,180,${0.5 * pulse})`;
      g.beginPath();
      g.arc(this.x + Math.cos(t) * 31, this.y + Math.sin(t) * 4.8, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

class Satellite implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  t = rand(0, 6.28);
  ttl = rand(5, 9);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.x = ltr ? -60 : c.W + 60;
    this.y = rand(30, Math.min(120, c.H * 0.2));
    this.vx = (ltr ? 1 : -1) * rand(45, 80);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += Math.sin(this.t * 0.8) * 4 * dt;
    this.t += dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -80 && this.x < c.W + 80;
  }
  draw(g: CanvasRenderingContext2D): void {
    const blink = (Math.sin(this.t * 3) * 0.5 + 0.5) * 0.7 + 0.2;
    g.fillStyle = `rgba(200,220,255,${blink})`;
    g.beginPath();
    g.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
    g.fill();
  }
}

class BirdsFlock implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  dir: number;
  n: number;
  ttl = rand(4, 7);
  t = rand(0, 6.28);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.y = rand(80, Math.min(c.H * 0.45, 320));
    this.n = 3 + Math.floor(Math.random() * 5);
    this.vx = rand(70, 110) * this.dir;
    this.x = ltr ? -60 : c.W + 60;
    this.ttl = (c.W + 160) / Math.abs(this.vx);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.t += dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -100 && this.x < c.W + 100;
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    g.strokeStyle = c.night ? 'rgba(255,255,255,0.45)' : 'rgba(40,52,70,0.6)';
    g.lineWidth = 1.8;
    for (let i = 0; i < this.n; i++) {
      const off = i - (this.n - 1) / 2;
      const bx = this.x + off * 18 * this.dir + Math.sin(this.t * 2 + i * 0.6) * 2;
      const by = this.y + Math.abs(off) * 3 + Math.sin(this.t * 3 + i) * 2;
      const flap = Math.sin(this.t * 9 + i) * 2.5;
      g.beginPath();
      g.moveTo(bx - 7, by - 3.2 - flap);
      g.quadraticCurveTo(bx - 2, by - 1, bx, by);
      g.quadraticCurveTo(bx + 2, by - 1, bx + 7, by - 3.2 - flap);
      g.stroke();
    }
  }
}

class BatsFlock implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  dir: number;
  n = 6 + Math.floor(Math.random() * 6);
  t = rand(0, 6.28);
  ttl = rand(3, 6);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.y = rand(c.H * 0.25, c.H * 0.5);
    this.vx = rand(90, 140) * this.dir;
    this.x = ltr ? -60 : c.W + 60;
    this.ttl = (c.W + 160) / Math.abs(this.vx);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.t += dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -120 && this.x < c.W + 120;
  }
  draw(g: CanvasRenderingContext2D): void {
    g.strokeStyle = 'rgba(160,160,200,0.5)';
    g.lineWidth = 1.6;
    for (let i = 0; i < this.n; i++) {
      const off = i - (this.n - 1) / 2;
      const bx = this.x + off * 20 * this.dir;
      const by = this.y + Math.sin(this.t * 8 + i) * 4;
      g.beginPath();
      g.moveTo(bx - 6 * this.dir, by);
      g.quadraticCurveTo(bx, by - 3.5, bx + 6 * this.dir, by);
      g.stroke();
    }
  }
}

class MeteorShower implements FlairEntity {
  stars: ShootingStar[];
  ttl = 2;
  constructor(c: FlairCtx) {
    this.stars = Array.from({ length: 6 + Math.floor(Math.random() * 5) }, () => new ShootingStar(c));
  }
  update(dt: number): void {
    this.ttl -= dt;
    for (const s of this.stars) s.update(dt);
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.stars.some((s) => s.isAlive(c));
  }
  draw(g: CanvasRenderingContext2D): void {
    for (const s of this.stars) s.draw(g);
  }
}

class Airplane implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  dir: number;
  ttl: number;
  trail: { x: number; y: number; ttl: number }[] = [];
  tt = 0;
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.x = ltr ? -120 : c.W + 120;
    this.y = rand(60, Math.min(c.H * 0.35, 260));
    this.vx = this.dir * rand(120, 170);
    this.ttl = (c.W + 240) / Math.abs(this.vx);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.tt += dt;
    if (this.tt >= 0.08) {
      this.tt = 0;
      this.trail.push({ x: this.x - this.dir * 10, y: this.y + 2, ttl: 4 });
      if (this.trail.length > 80) this.trail.shift();
    }
    for (const t of this.trail) t.ttl -= dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -180 && this.x < c.W + 180;
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    const fade = fadeIn(this.ttl, 1.5);
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1] as { x: number; y: number; ttl: number };
      const b = this.trail[i] as { x: number; y: number; ttl: number };
      if (a.ttl <= 0 || b.ttl <= 0) continue;
      g.strokeStyle = `rgba(255,255,255,${Math.min(a.ttl, b.ttl) / 4 * (c.night ? 0.22 : 0.5) * fade})`;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.fillStyle = c.night ? `rgba(238,238,238,${fade})` : `rgba(250,250,250,${fade})`;
    g.beginPath();
    g.ellipse(this.x, this.y, 10, 3.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(190,196,206,${fade})`;
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(this.x - this.dir * 8, this.y - 3);
    g.lineTo(this.x - this.dir * 2, this.y - 1);
    g.closePath();
    g.fill();
  }
}

class Balloon implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  t = rand(0, 6.28);
  ttl = rand(14, 22);
  color = Math.random() < 0.5 ? '255,138,101' : '149,117,205';
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.x = ltr ? -80 : c.W + 80;
    this.y = rand(90, Math.min(c.H * 0.5, 340));
    this.vx = (ltr ? 1 : -1) * rand(20, 40);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.t += dt;
    this.y += Math.sin(this.t * 0.7) * 8 * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -120 && this.x < c.W + 120;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = fadeIn(this.ttl, 2);
    const r = 16;
    g.fillStyle = `rgba(${this.color},${f})`;
    g.beginPath();
    g.arc(this.x, this.y, r, 0, Math.PI * 2);
    g.fill();
    // stripes
    g.fillStyle = `rgba(255,255,255,${0.35 * f})`;
    g.beginPath();
    g.ellipse(this.x, this.y, r * 0.35, r, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(109,76,65,${f})`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(this.x - 4, this.y + 10);
    g.lineTo(this.x - 3, this.y + 18);
    g.lineTo(this.x + 3, this.y + 18);
    g.lineTo(this.x + 4, this.y + 10);
    g.stroke();
  }
}

class CloudWisp implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  scale = rand(0.8, 1.4);
  ttl = rand(18, 30);
  n = rand(0, 1000);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.x = ltr ? -200 : c.W + 200;
    this.y = rand(40, Math.min(c.H * 0.45, 340));
    this.vx = (ltr ? 1 : -1) * rand(10, 24);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.n += dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -280 && this.x < c.W + 280;
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    const fade = fadeIn(this.ttl, 2);
    const w = 240 * this.scale;
    const h = 60 * this.scale;
    const base = c.night ? 0.12 : 0.5;
    for (let i = 0; i < 6; i++) {
      const ox = (i / 6 - 0.5) * w;
      const oy = Math.sin(this.n * 0.6 + i) * 4 - Math.sin((i / 5) * Math.PI) * h * 0.25;
      const a = (0.6 + 0.4 * Math.sin(this.n * 0.8 + i * 0.9)) * base * fade;
      g.save();
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = '#ffffff';
      g.translate(this.x + ox, this.y + oy);
      g.beginPath();
      g.ellipse(0, 0, w * 0.2, h * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
}

class StarlinkTrain implements FlairEntity {
  dir: number;
  v: number;
  pts: { x: number; y: number; a: number; life: number }[];
  ttl = 10;
  t = rand(0, 6.28);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    const y = rand(50, Math.min(160, c.H * 0.25));
    this.v = rand(55, 85) * this.dir;
    const sx = ltr ? -120 : c.W + 120;
    const n = 8 + Math.floor(Math.random() * 8);
    this.pts = Array.from({ length: n }, (_, i) => ({ x: sx - this.dir * i * 22, y: y + (Math.random() - 0.5) * 4, a: 1 - i / (n + 2), life: rand(8, 12) }));
  }
  update(dt: number): void {
    this.ttl -= dt;
    this.t += dt;
    for (const p of this.pts) {
      p.x += this.v * dt;
      p.life -= dt * 0.6;
    }
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.pts.some((p) => p.x > -60 && p.x < c.W + 60);
  }
  draw(g: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i] as { x: number; y: number; a: number; life: number };
      const a = Math.min(1, Math.max(0, p.life / 2)) * 0.7 * p.a * (0.5 + 0.5 * Math.sin(this.t * 3 + i * 0.7));
      if (a <= 0.002) continue;
      g.fillStyle = `rgba(210,230,255,${a})`;
      g.beginPath();
      g.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

class AuroraCurtain implements FlairEntity {
  phase = rand(0, 6.28);
  speed = rand(0.2, 0.5);
  height = rand(80, 140);
  alpha = rand(0.08, 0.16);
  hue = 120 + Math.random() * 60;
  ttl = rand(8, 14);
  update(dt: number): void {
    this.phase += dt * this.speed;
    this.ttl -= dt;
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    const fade = fadeIn(this.ttl, 1.5) * Math.min(1, (14 - this.ttl) / 2 + 0.2);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const cols = 26;
    const step = c.W / cols;
    for (let i = 0; i <= cols; i++) {
      const x = i * step;
      const t = (x / c.W) * Math.PI * 2;
      const top = Math.max(0, 8 + Math.sin(t * 1.6 + this.phase) * 14 + Math.sin(t * 0.9 + this.phase * 0.7) * 10);
      const bottom = top + this.height + Math.sin(t * 2.3 + this.phase) * 10 + Math.sin(this.phase * 1.3 + i * 0.5) * 6;
      const gr = g.createLinearGradient(x, top, x, bottom);
      gr.addColorStop(0, `hsla(${this.hue},70%,60%,0)`);
      gr.addColorStop(0.3, `hsla(${this.hue},70%,60%,${this.alpha * 0.8 * fade})`);
      gr.addColorStop(1, `hsla(${this.hue},70%,60%,0)`);
      g.fillStyle = gr;
      g.fillRect(x - step * 0.6, top, step * 1.2, Math.max(1, bottom - top));
    }
    g.restore();
  }
}

class Blimp implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  dir: number;
  ttl = rand(20, 30);
  t = rand(0, 6.28);
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.x = ltr ? -140 : c.W + 140;
    this.y = rand(80, Math.min(c.H * 0.4, 300));
    this.vx = this.dir * rand(24, 40);
  }
  update(dt: number): void {
    this.x += this.vx * dt;
    this.t += dt * 0.6;
    this.y += Math.sin(this.t) * 4 * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -180 && this.x < c.W + 180;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = fadeIn(this.ttl, 2);
    const gr = g.createLinearGradient(this.x, this.y - 12, this.x, this.y + 12);
    gr.addColorStop(0, `rgba(235,235,240,${0.95 * f})`);
    gr.addColorStop(1, `rgba(180,180,190,${0.95 * f})`);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(this.x, this.y, 40, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(239,83,80,${0.9 * f})`;
    g.fillRect(this.x - 14, this.y - 2, 28, 4);
    g.fillStyle = `rgba(160,160,170,${0.95 * f})`;
    g.beginPath();
    g.moveTo(this.x - this.dir * 34, this.y);
    g.lineTo(this.x - this.dir * 46, this.y - 8);
    g.lineTo(this.x - this.dir * 46, this.y + 8);
    g.closePath();
    g.fill();
    g.fillStyle = `rgba(110,110,120,${0.95 * f})`;
    g.fillRect(this.x - 8, this.y + 10, 16, 6);
  }
}

class DistantLightning implements FlairEntity {
  x: number;
  horizon: number;
  pts: { x: number; y: number }[] = [];
  branches: { x: number; y: number }[][];
  ttl = 0.4 + Math.random() * 0.3;
  t = 0;
  constructor(c: FlairCtx) {
    this.x = rand(c.W * 0.1, c.W * 0.9);
    this.horizon = c.H * 0.6;
    for (let i = 0; i <= 8; i++) this.pts.push({ x: this.x + rand(-12, 12) * (1 - i / 8), y: (i / 8) * (this.horizon - 10) });
    this.branches = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => {
      const o = this.pts[2 + Math.floor(Math.random() * 5)] as { x: number; y: number };
      const len = 3 + Math.floor(Math.random() * 3);
      const pts = [{ x: o.x, y: o.y }];
      for (let k = 1; k <= len; k++) pts.push({ x: o.x + rand(-18, 18) * (k / len), y: o.y + k * ((this.horizon - o.y) / (len + 2)) });
      return pts;
    });
  }
  update(dt: number): void {
    this.t += dt;
    this.ttl -= dt;
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    const flash = Math.pow(Math.max(0, Math.sin(this.t * 40)), 1.8);
    const a = 0.8 * flash * Math.min(1, Math.max(0, this.ttl / 0.12));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.lineWidth = 2;
    g.beginPath();
    this.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${a * 0.35})`;
    g.lineWidth = 1.5;
    for (const br of this.branches) {
      g.beginPath();
      br.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    g.restore();
  }
}

class Kite implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  dir: number;
  t = rand(0, 6.28);
  ttl = rand(14, 22);
  color = Math.random() < 0.5 ? '255,112,67' : '41,182,246';
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.x = ltr ? -80 : c.W + 80;
    this.y = rand(140, Math.min(c.H * 0.5, 400));
    this.vx = this.dir * rand(30, 50);
  }
  update(dt: number): void {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += Math.sin(this.t * 1.2) * 10 * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -120 && this.x < c.W + 120;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = fadeIn(this.ttl, 1.2);
    g.strokeStyle = `rgba(255,255,255,${0.6 * f})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(this.x, this.y);
    for (let i = 1; i <= 6; i++) g.lineTo(this.x - this.dir * i * 10, this.y + 6 + Math.sin(this.t * 2 + i) * 3);
    g.stroke();
    g.fillStyle = `rgba(${this.color},${f})`;
    g.beginPath();
    g.moveTo(this.x, this.y - 8);
    g.lineTo(this.x + 9, this.y);
    g.lineTo(this.x, this.y + 8);
    g.lineTo(this.x - 9, this.y);
    g.closePath();
    g.fill();
  }
}

class Paraglider implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  t = rand(0, 6.28);
  ttl = rand(14, 20);
  color = Math.random() < 0.5 ? '255,238,88' : '102,187,106';
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.x = ltr ? -100 : c.W + 100;
    this.y = rand(120, Math.min(c.H * 0.45, 340));
    this.vx = (ltr ? 1 : -1) * rand(40, 60);
  }
  update(dt: number): void {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += Math.sin(this.t * 1.5) * 8 * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -160 && this.x < c.W + 160;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = fadeIn(this.ttl, 1.5);
    g.fillStyle = `rgba(${this.color},${f})`;
    g.beginPath();
    g.ellipse(this.x, this.y - 10, 18, 6, 0, Math.PI, 0);
    g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.5 * f})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(this.x - 12, this.y - 8);
    g.lineTo(this.x, this.y);
    g.lineTo(this.x + 12, this.y - 8);
    g.stroke();
    g.fillStyle = `rgba(60,60,70,${0.8 * f})`;
    g.beginPath();
    g.arc(this.x, this.y + 3, 2.2, 0, Math.PI * 2);
    g.fill();
  }
}

class Helicopter implements FlairEntity {
  x: number;
  y: number;
  vx: number;
  dir: number;
  t = 0;
  ttl: number;
  constructor(c: FlairCtx) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.x = ltr ? -140 : c.W + 140;
    this.y = rand(100, Math.min(c.H * 0.45, 360));
    this.vx = this.dir * rand(70, 110);
    this.ttl = (c.W + 280) / Math.abs(this.vx);
  }
  update(dt: number): void {
    this.t += dt;
    this.x += this.vx * dt;
    this.ttl -= dt;
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -200 && this.x < c.W + 200;
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    const f = fadeIn(this.ttl, 1);
    const body = c.night ? '190,190,190' : '90,100,110';
    g.fillStyle = `rgba(${body},${0.9 * f})`;
    g.beginPath();
    g.ellipse(this.x, this.y, 10, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(${body},${0.9 * f})`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(this.x - 10 * this.dir, this.y);
    g.lineTo(this.x - 24 * this.dir, this.y - 1);
    g.stroke();
    g.strokeStyle = `rgba(${c.night ? '255,255,255' : '60,60,70'},${0.35 * f})`;
    g.beginPath();
    g.ellipse(this.x, this.y - 6, 16 * Math.abs(Math.cos(this.t * 30)) + 2, 1.5, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `rgba(255,80,80,${(Math.sin(this.t * 10) * 0.5 + 0.5) * f})`;
    g.beginPath();
    g.arc(this.x + 10 * this.dir, this.y - 2, 1.5, 0, Math.PI * 2);
    g.fill();
  }
}

class RocketLaunch implements FlairEntity {
  x: number;
  y: number;
  vy = -rand(120, 180);
  ttl = 5.5;
  trail: { x: number; y: number; ttl: number }[] = [];
  tt = 0;
  constructor(c: FlairCtx) {
    this.x = rand(c.W * 0.15, c.W * 0.85);
    this.y = c.heightAt(this.x);
  }
  update(dt: number): void {
    this.ttl -= dt;
    this.y += this.vy * dt;
    this.vy -= 30 * dt;
    this.tt += dt;
    if (this.tt > 0.05) {
      this.tt = 0;
      this.trail.push({ x: this.x + rand(-1, 1), y: this.y + 10, ttl: 1.6 });
      if (this.trail.length > 60) this.trail.shift();
    }
    for (const p of this.trail) p.ttl -= dt;
  }
  isAlive(): boolean {
    return this.ttl > 0 && this.y > -60;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = fadeIn(this.ttl, 0.8);
    for (const p of this.trail) {
      if (p.ttl <= 0) continue;
      g.fillStyle = `rgba(230,230,240,${Math.min(1, p.ttl / 1.6) * 0.25})`;
      g.beginPath();
      g.arc(p.x, p.y, 6 + (1.6 - p.ttl) * 6, 0, Math.PI * 2);
      g.fill();
    }
    const gr = g.createRadialGradient(this.x, this.y, 0, this.x, this.y, 10);
    gr.addColorStop(0, `rgba(255,240,180,${0.9 * f})`);
    gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(this.x, this.y, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(230,230,238,${0.95 * f})`;
    g.fillRect(this.x - 2, this.y - 22, 4, 20);
    g.fillStyle = `rgba(239,83,80,${0.95 * f})`;
    g.beginPath();
    g.moveTo(this.x - 2, this.y - 22);
    g.lineTo(this.x, this.y - 28);
    g.lineTo(this.x + 2, this.y - 22);
    g.fill();
  }
}

class RainbowArc implements FlairEntity {
  cx: number;
  cy: number;
  r = rand(220, 340);
  ttl = rand(6, 9);
  max: number;
  constructor(c: FlairCtx) {
    this.cx = rand(c.W * 0.2, c.W * 0.8);
    this.cy = c.H * 0.72;
    this.max = this.ttl;
  }
  update(dt: number): void {
    this.ttl -= dt;
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = Math.min(fadeIn(this.ttl, 1.5), fadeIn(this.max - this.ttl, 1.5));
    const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
    g.save();
    g.globalAlpha = 0.3 * f;
    g.lineWidth = 6;
    colors.forEach((col, i) => {
      g.strokeStyle = col;
      g.beginPath();
      g.arc(this.cx, this.cy, this.r - i * 6, Math.PI, 2 * Math.PI);
      g.stroke();
    });
    g.restore();
  }
}

// ============================================================================ GROUND
abstract class Walker implements FlairEntity {
  x: number;
  dir: number;
  speed: number;
  t = 0;
  ttl: number;
  gy = 0;
  slope = 0;
  constructor(c: FlairCtx, speed: number, margin: number, ttl?: number) {
    const ltr = Math.random() < 0.5;
    this.dir = ltr ? 1 : -1;
    this.x = ltr ? -margin : c.W + margin;
    this.speed = speed * this.dir;
    this.ttl = ttl ?? (c.W + margin * 2) / speed;
    this.gy = c.heightAt(Math.max(0, Math.min(c.W - 1, this.x)));
  }
  update(dt: number, c: FlairCtx): void {
    this.t += dt;
    this.ttl -= dt;
    this.x += this.speed * dt;
    const nx = Math.max(0, Math.min(c.W - 1, this.x));
    this.gy = c.heightAt(nx);
    this.slope = c.slopeAt(nx);
  }
  isAlive(c: FlairCtx): boolean {
    return this.ttl > 0 && this.x > -90 && this.x < c.W + 90;
  }
  abstract draw(g: CanvasRenderingContext2D, c: FlairCtx): void;
  get fade(): number {
    return fadeIn(this.ttl, 0.8);
  }
  tilt(max = 0.25): number {
    return Math.max(-max, Math.min(max, Math.atan(this.slope)));
  }
}

class Hedgehog extends Walker {
  constructor(c: FlairCtx) {
    super(c, 36, 20);
  }
  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.translate(this.x, this.gy - 6);
    g.rotate(this.tilt());
    g.scale(this.dir, 1);
    g.fillStyle = `rgba(93,71,51,${this.fade})`;
    g.beginPath();
    g.ellipse(0, 0, 8, 5.2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(77,59,42,${this.fade})`;
    g.lineWidth = 1;
    g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI + i * (Math.PI / 10);
      g.beginPath();
      g.moveTo(-1, -1);
      g.lineTo(-1 + Math.cos(a) * 10, -1 + Math.sin(a) * 7);
      g.stroke();
    }
    g.fillStyle = `rgba(160,130,100,${this.fade})`;
    g.beginPath();
    g.ellipse(7, 1, 3.5, 2.6, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(10, 1.2, 0.9, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

class Rabbit extends Walker {
  phase = rand(0, 6.28);
  constructor(c: FlairCtx) {
    super(c, 85, 30);
  }
  draw(g: CanvasRenderingContext2D): void {
    const cyc = (this.t * 3 + this.phase) % (Math.PI * 2);
    const hop = Math.max(0, Math.sin(cyc)) * 6.5;
    g.save();
    g.translate(this.x, this.gy - 6 - hop);
    g.rotate(Math.sin(cyc) * 0.15 * this.dir + this.tilt(0.12) * 0.5);
    g.fillStyle = `rgba(230,230,230,${this.fade})`;
    g.beginPath();
    g.ellipse(0, 0, 5.6, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(5.8 * this.dir, -2.2, 3.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(230,230,230,${this.fade})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(5.2 * this.dir, -3.2);
    g.lineTo(5.2 * this.dir, -10.5);
    g.moveTo(6.8 * this.dir, -3.2);
    g.lineTo(8.2 * this.dir, -10.5);
    g.stroke();
    g.restore();
  }
}

class Fox extends Walker {
  constructor(c: FlairCtx) {
    super(c, 70, 40);
  }
  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.translate(this.x, this.gy - 7 + Math.sin(this.t * 6) * 0.6);
    g.rotate(this.tilt(0.2));
    g.fillStyle = `rgba(239,108,0,${this.fade})`;
    g.beginPath();
    g.ellipse(0, 0, 10.5, 4.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(9 * this.dir, -1.2, 3.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(8 * this.dir, -3.5);
    g.lineTo(9.5 * this.dir, -7.5);
    g.lineTo(11 * this.dir, -3.5);
    g.fill();
    g.strokeStyle = `rgba(239,108,0,${this.fade})`;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-8 * this.dir, 0.2);
    g.lineTo(-16 * this.dir, -2.5);
    g.stroke();
    g.fillStyle = `rgba(255,255,255,${this.fade})`;
    g.beginPath();
    g.arc(-16 * this.dir, -2.6, 1.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

class Snail extends Walker {
  constructor(c: FlairCtx) {
    super(c, 14, 30, 30);
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 2;
    g.save();
    g.fillStyle = `rgba(160,120,80,${this.fade})`;
    g.beginPath();
    g.arc(this.x - 2.2 * this.dir, y - 2.5, 3.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(120,90,60,${this.fade})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(this.x - 2.2 * this.dir, y - 2.5, 1.6, 0, Math.PI * 1.5);
    g.stroke();
    g.strokeStyle = `rgba(150,140,130,${this.fade})`;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(this.x - 3.6 * this.dir, y);
    g.lineTo(this.x + 4.2 * this.dir, y);
    g.stroke();
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(this.x + 2.2 * this.dir, y - 0.5);
    g.lineTo(this.x + 3.6 * this.dir, y - 3.5);
    g.stroke();
    g.restore();
  }
}

class Tumbleweed extends Walker {
  r = rand(5, 9);
  rot = 0;
  constructor(c: FlairCtx) {
    super(c, rand(40, 80), 30);
  }
  override update(dt: number, c: FlairCtx): void {
    super.update(dt, c);
    this.rot += (this.speed * dt) / this.r;
  }
  draw(g: CanvasRenderingContext2D): void {
    const bounce = Math.abs(Math.sin(this.t * 4)) * 4;
    g.save();
    g.translate(this.x, this.gy - this.r - bounce);
    g.rotate(this.rot);
    g.strokeStyle = `rgba(170,140,100,${0.7 * this.fade})`;
    g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const R = this.r * (1 - k * 0.18);
      const n = 10 - k * 2;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + k * 0.35;
        g.beginPath();
        g.arc(0, 0, R, a0, a0 + (0.5 + 0.15 * Math.sin(i * 1.7 + k)) * Math.PI);
        g.stroke();
      }
    }
    g.restore();
  }
}

class CatSilhouette extends Walker {
  constructor(c: FlairCtx) {
    super(c, 50, 40);
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 6;
    const d = this.dir;
    g.save();
    g.fillStyle = `rgba(30,30,30,${0.85 * this.fade})`;
    g.strokeStyle = `rgba(30,30,30,${0.85 * this.fade})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(this.x, y, 11, 5.6, 0, 0, Math.PI * 2);
    g.fill();
    const step = Math.sin(this.t * 8) * 1.5;
    g.beginPath();
    g.moveTo(this.x - 4 * d, y + 4);
    g.lineTo(this.x - 2 * d + step, y + 6);
    g.moveTo(this.x + 4 * d, y + 4);
    g.lineTo(this.x + 6 * d - step, y + 6);
    g.stroke();
    g.beginPath();
    g.arc(this.x + 12 * d, y - 2.2, 3.8, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(this.x + 9.5 * d, y - 4);
    g.lineTo(this.x + 10 * d, y - 8);
    g.lineTo(this.x + 12 * d, y - 5.5);
    g.lineTo(this.x + 14 * d, y - 8);
    g.lineTo(this.x + 14.5 * d, y - 4);
    g.fill();
    const wag = Math.sin(this.t * 6) * 2.4;
    g.beginPath();
    g.moveTo(this.x - 9 * d, y);
    g.quadraticCurveTo(this.x - 14.6 * d, y - 3 + wag, this.x - 23 * d, y - 8 + wag);
    g.stroke();
    g.fillStyle = `rgba(255,235,59,${0.9 * this.fade})`;
    g.beginPath();
    g.arc(this.x + 13.4 * d, y - 2.8, 0.8, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

class Deer extends Walker {
  phase = rand(0, 6.28);
  constructor(c: FlairCtx) {
    super(c, 70, 60);
  }
  draw(g: CanvasRenderingContext2D, c: FlairCtx): void {
    const hop = Math.max(0, Math.sin(this.t * 2.6 + this.phase)) * 5;
    const y = this.gy - 10 - hop;
    const d = this.dir;
    const col = c.night ? '40,40,40' : '141,96,62';
    g.save();
    g.fillStyle = `rgba(${col},${0.9 * this.fade})`;
    g.strokeStyle = `rgba(${col},${0.9 * this.fade})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(this.x, y, 14, 5.8, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(this.x - 9 * d, y + 4);
    g.lineTo(this.x - 8 * d, y + 10);
    g.moveTo(this.x + 8 * d, y + 4);
    g.lineTo(this.x + 9 * d, y + 10);
    g.stroke();
    g.beginPath();
    g.moveTo(this.x + 12 * d, y - 2);
    g.lineTo(this.x + 18 * d, y - 9);
    g.stroke();
    g.beginPath();
    g.arc(this.x + 19 * d, y - 9, 3.2, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(this.x + 18 * d, y - 11);
    g.lineTo(this.x + 21 * d, y - 17);
    g.moveTo(this.x + 18 * d, y - 11);
    g.lineTo(this.x + 16 * d, y - 17);
    g.stroke();
    g.restore();
  }
}

class Squirrel extends Walker {
  pause = 0;
  constructor(c: FlairCtx) {
    super(c, 100, 40);
  }
  override update(dt: number, c: FlairCtx): void {
    if (this.pause > 0) {
      this.pause -= dt;
      this.t += dt;
      this.ttl -= dt * 0.2;
      return;
    }
    super.update(dt, c);
    if (Math.random() < 0.008) this.pause = rand(0.25, 0.6);
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 6;
    const d = this.dir;
    g.save();
    g.fillStyle = `rgba(165,110,60,${this.fade})`;
    g.beginPath();
    g.ellipse(this.x, y, 8, 4.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(this.x + 8 * d, y - 1.5, 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(165,110,60,${this.fade})`;
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(this.x - 7 * d, y);
    g.quadraticCurveTo(this.x - 15 * d, y - 11, this.x - 10 * d, y - 14);
    g.stroke();
    g.restore();
  }
}

class Raccoon extends Walker {
  constructor(c: FlairCtx) {
    super(c, 60, 50);
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 6;
    const d = this.dir;
    g.save();
    g.fillStyle = `rgba(120,120,120,${this.fade})`;
    g.beginPath();
    g.ellipse(this.x, y, 10, 4.6, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(this.x + 9.4 * d, y - 1, 3.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(30,30,30,${this.fade})`;
    g.fillRect(this.x + 8 * d - 1.5, y - 2, 4, 1.4);
    g.strokeStyle = `rgba(120,120,120,${this.fade})`;
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(this.x - 8.5 * d, y);
    g.lineTo(this.x - 17 * d, y - 1);
    g.stroke();
    g.strokeStyle = `rgba(50,50,50,${this.fade})`;
    for (const k of [11.5, 14.5]) {
      g.beginPath();
      g.moveTo(this.x - k * d, y - 2);
      g.lineTo(this.x - k * d, y + 1);
      g.stroke();
    }
    g.restore();
  }
}

class Snake extends Walker {
  constructor(c: FlairCtx) {
    super(c, 40, 40);
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 2;
    g.save();
    g.strokeStyle = `rgba(120,160,90,${0.95 * this.fade})`;
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const px = this.x - this.dir * i * 3.2;
      const py = y + Math.sin(this.t * 4 + i * 0.6) * 1.8;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    g.fillStyle = `rgba(120,160,90,${this.fade})`;
    g.beginPath();
    g.ellipse(this.x + this.dir, y, 2.6, 1.8, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

class WindHat extends Walker {
  constructor(c: FlairCtx) {
    super(c, 70, 50);
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 4 - Math.abs(Math.sin(this.t * 3)) * 6;
    g.save();
    g.translate(this.x, y);
    g.rotate(this.t * 3 * this.dir);
    g.fillStyle = `rgba(90,70,160,${this.fade})`;
    g.beginPath();
    g.ellipse(0, 0, 6, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-3, -6, 6, 6);
    g.fillStyle = `rgba(239,83,80,${this.fade})`;
    g.fillRect(-3, -2, 6, 1.4);
    g.restore();
  }
}

/** Stationary ground events */
class Mole implements FlairEntity {
  x: number;
  gy: number;
  t = 0;
  rise = rand(10, 16);
  blink = rand(0.1, 0.3);
  constructor(c: FlairCtx, x: number) {
    this.x = x;
    this.gy = c.heightAt(x);
  }
  update(dt: number, c: FlairCtx): void {
    this.t += dt;
    this.blink -= dt;
    if (this.blink <= 0) this.blink = rand(0.8, 1.8);
    this.gy = c.heightAt(this.x);
  }
  isAlive(): boolean {
    return this.t <= 2.4;
  }
  private k(): number {
    const e = (v: number) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
    if (this.t <= 0.6) return e(this.t / 0.6);
    if (this.t <= 1.8) return 1;
    return 1 - e(Math.min(1, (this.t - 1.8) / 0.6));
  }
  draw(g: CanvasRenderingContext2D): void {
    const rise = this.k();
    const hy = this.gy - rise * this.rise;
    g.fillStyle = '#5d4733';
    g.beginPath();
    g.ellipse(this.x, this.gy - 1, 18, 4 + 5 * rise, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#6e5540';
    g.beginPath();
    g.arc(this.x, hy - 6, 7 + 4 * rise, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e59b9b';
    g.beginPath();
    g.arc(this.x + 4, hy - 5, 1.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    if (this.blink > 0.12) {
      g.beginPath();
      g.arc(this.x - 2.5, hy - 8, 0.9, 0, Math.PI * 2);
      g.arc(this.x + 1.2, hy - 8.2, 0.9, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(this.x - 3.2, hy - 8.2, 2, 0.5);
      g.fillRect(this.x + 0.4, hy - 8.4, 2, 0.5);
    }
  }
}

class FireflyCluster implements FlairEntity {
  flies: { x: number; y: number; r: number; t: number; sp: number }[];
  ttl = rand(2.8, 4.6);
  constructor(c: FlairCtx, x: number) {
    const y = c.heightAt(x) - rand(12, 36);
    this.flies = Array.from({ length: 10 + Math.floor(Math.random() * 7) }, () => ({ x: x + rand(-20, 20), y: y + rand(-10, 10), r: rand(1.6, 2.4), t: rand(0, 6.28), sp: rand(0.8, 1.8) }));
  }
  update(dt: number): void {
    this.ttl -= dt;
    const leaving = this.ttl < 0.8;
    for (const f of this.flies) {
      f.t += dt * f.sp;
      f.x += Math.cos(f.t * 2.1) * 6 * dt + (leaving ? 14 * dt : 0);
      f.y += Math.sin(f.t * 2.7) * 4 * dt - (leaving ? 6 * dt : 0);
    }
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const a = Math.min(1, this.ttl / 0.6);
    for (const f of this.flies) {
      const tw = 0.6 + 0.4 * Math.sin(f.t * 5);
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 8);
      gr.addColorStop(0, `rgba(255,230,120,${0.5 * a * tw})`);
      gr.addColorStop(1, 'rgba(255,230,120,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(f.x, f.y, 8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

class Swarm implements FlairEntity {
  // butterflies (day) or dragonflies
  items: { x: number; y: number; t: number; sp: number; hue: number; size: number }[];
  ttl = rand(4, 7);
  kind: 'butterfly' | 'dragonfly';
  vx: number;
  constructor(c: FlairCtx, x: number, kind: 'butterfly' | 'dragonfly') {
    this.kind = kind;
    const y = c.heightAt(x) - rand(12, 40);
    this.vx = kind === 'dragonfly' ? rand(60, 110) * (Math.random() < 0.5 ? -1 : 1) : 0;
    const n = kind === 'dragonfly' ? 5 + Math.floor(Math.random() * 5) : 4 + Math.floor(Math.random() * 5);
    this.items = Array.from({ length: n }, () => ({ x: x + rand(-24, 24), y: y + rand(-14, 6), t: rand(0, 6.28), sp: rand(1, 2), hue: Math.floor(rand(0, 360)), size: rand(3.2, 4.8) }));
    if (kind === 'dragonfly') this.ttl = 3.5;
  }
  update(dt: number): void {
    this.ttl -= dt;
    const leaving = this.ttl < 0.8;
    for (const b of this.items) {
      b.t += dt * b.sp * (this.kind === 'dragonfly' ? 6 : 1);
      if (this.kind === 'butterfly') {
        b.x += Math.cos(b.t * 2.5) * 10 * dt + (leaving ? 16 * dt : 0);
        b.y += Math.sin(b.t * 3) * 8 * dt - (leaving ? 8 * dt : 0);
      } else {
        b.x += this.vx * dt + Math.sin(b.t) * 8 * dt;
        b.y += Math.cos(b.t * 1.6) * 4 * dt;
      }
    }
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    const a = Math.min(1, this.ttl / 0.8);
    for (const b of this.items) {
      if (this.kind === 'butterfly') {
        const flap = Math.abs(Math.sin(b.t * 12));
        g.fillStyle = `hsla(${b.hue},85%,65%,${0.95 * a})`;
        g.beginPath();
        g.ellipse(b.x - b.size * 0.6, b.y, b.size * flap + 0.5, b.size * 1.1, 0.3, 0, Math.PI * 2);
        g.ellipse(b.x + b.size * 0.6, b.y, b.size * flap + 0.5, b.size * 1.1, -0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgba(40,30,30,${a})`;
        g.fillRect(b.x - 0.6, b.y - 2.5, 1.2, 5);
      } else {
        const wing = 0.8 + 0.6 * Math.sin(b.t * 12);
        g.strokeStyle = `rgba(90,200,255,${0.8 * a})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(b.x - 3, b.y);
        g.lineTo(b.x + 3, b.y);
        g.stroke();
        g.strokeStyle = `rgba(200,240,255,${0.7 * a})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x + 3.6, b.y - wing * 1.2);
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - 3.6, b.y - wing * 1.2);
        g.stroke();
      }
    }
  }
}

class Floaters implements FlairEntity {
  // leaves, dandelion seeds, lanterns, dust puffs
  items: { x: number; y: number; vx: number; vy: number; t: number; size: number; hue: number; ttl: number }[];
  ttl: number;
  constructor(c: FlairCtx, x: number, readonly kind: 'leaf' | 'seed' | 'lantern' | 'dust') {
    const gy = c.heightAt(x);
    const n = kind === 'lantern' ? 3 + Math.floor(Math.random() * 4) : kind === 'dust' ? 18 : 12 + Math.floor(Math.random() * 8);
    this.ttl = kind === 'lantern' ? 8 : kind === 'dust' ? 1.8 : 6;
    this.items = Array.from({ length: n }, () => ({
      x: x + rand(kind === 'leaf' ? -80 : -20, kind === 'leaf' ? 80 : 20),
      y: kind === 'leaf' ? rand(0, c.H * 0.3) : gy - rand(0, kind === 'dust' ? 3 : 18),
      vx: kind === 'dust' ? rand(30, 80) : rand(10, 20),
      vy: kind === 'leaf' ? rand(16, 28) : kind === 'lantern' ? -18 : kind === 'dust' ? rand(-12, -3) : rand(-16, -8),
      t: rand(0, 6.28),
      size: kind === 'leaf' ? rand(2.2, 3.6) : kind === 'dust' ? rand(0.8, 1.8) : rand(1, 1.6),
      hue: Math.floor(rand(15, 45)),
      ttl: kind === 'lantern' ? rand(5, 8) : rand(0.9, 1.6),
    }));
  }
  update(dt: number, c: FlairCtx): void {
    this.ttl -= dt;
    for (const p of this.items) {
      p.t += dt;
      p.ttl -= dt;
      switch (this.kind) {
        case 'leaf': {
          p.x += Math.sin(p.t * 2) * 8 * dt;
          p.y += p.vy * dt;
          const gy = c.heightAt(p.x);
          if (p.y >= gy - 2) {
            p.y = gy - 2;
            p.vy = 0;
          }
          break;
        }
        case 'seed':
          p.x += (Math.cos(p.t * 2) * p.vx * 0.05 + p.vx * dt * 0.4) * (1 + 0.3 * Math.sin(p.t * 1.3));
          p.y += p.vy * dt + Math.sin(p.t * 2.5) * 6 * dt;
          break;
        case 'lantern':
          p.x += Math.sin(p.t) * 6 * dt;
          p.y += p.vy * dt;
          break;
        case 'dust':
          p.vy += 10 * dt;
          p.x += p.vx * dt * 0.9;
          p.y += p.vy * dt;
          break;
      }
    }
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    const f = Math.min(1, this.ttl / 1);
    for (const p of this.items) {
      switch (this.kind) {
        case 'leaf':
          g.fillStyle = `hsla(${p.hue},65%,50%,${0.8 * f})`;
          g.beginPath();
          g.ellipse(p.x, p.y, p.size * 1.6, p.size, p.t, 0, Math.PI * 2);
          g.fill();
          break;
        case 'seed':
          g.strokeStyle = `rgba(245,245,245,${0.7 * f})`;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x, p.y - 6);
          g.stroke();
          g.beginPath();
          g.arc(p.x, p.y - 6, p.size * 2, 0, Math.PI * 2);
          g.stroke();
          break;
        case 'lantern': {
          const a = Math.min(1, Math.max(0, p.ttl / 1.2));
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
          gr.addColorStop(0, `rgba(255,220,140,${0.55 * a})`);
          gr.addColorStop(1, 'rgba(255,220,140,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(p.x, p.y, 12, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(255,240,200,${0.9 * a})`;
          g.fillRect(p.x - 2.5, p.y - 3.5, 5, 7);
          break;
        }
        case 'dust':
          if (p.ttl <= 0) break;
          g.fillStyle = `rgba(200,190,170,${Math.min(1, p.ttl / 0.5) * 0.3})`;
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.fill();
          break;
      }
    }
  }
}

class Owl implements FlairEntity {
  x: number;
  gy: number;
  dir = Math.random() < 0.5 ? 1 : -1;
  t = 0;
  perch = rand(1.8, 3.2);
  flying = false;
  ttl: number;
  constructor(c: FlairCtx, x: number) {
    this.x = x;
    this.gy = c.heightAt(x);
    this.ttl = this.perch + 2.4;
  }
  update(dt: number): void {
    this.t += dt;
    this.ttl -= dt;
    if (!this.flying && this.t >= this.perch) {
      this.flying = true;
      this.t = 0;
    }
    if (this.flying) {
      this.x += this.dir * 80 * dt;
      this.gy -= 30 * dt;
    }
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    const y = this.gy - 10 - (this.flying ? 10 : 0);
    const f = Math.min(1, this.ttl / 0.8);
    g.fillStyle = `rgba(200,190,170,${f})`;
    g.beginPath();
    g.ellipse(this.x, y, 4, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,220,80,${f})`;
    g.beginPath();
    g.arc(this.x - 1.6, y - 2, 1.2, 0, Math.PI * 2);
    g.arc(this.x + 1.6, y - 2, 1.2, 0, Math.PI * 2);
    g.fill();
    if (this.flying) {
      g.strokeStyle = `rgba(200,190,170,${f})`;
      g.lineWidth = 2.2;
      const flap = Math.sin(this.t * 10) * 4;
      g.beginPath();
      g.moveTo(this.x, y);
      g.lineTo(this.x - 8, y - flap);
      g.moveTo(this.x, y);
      g.lineTo(this.x + 8, y - flap);
      g.stroke();
    }
  }
}

class GroundBird implements FlairEntity {
  x: number;
  gy: number;
  t = 0;
  ttl = rand(2.2, 3.2);
  constructor(c: FlairCtx, x: number) {
    this.x = x;
    this.gy = c.heightAt(x);
  }
  update(dt: number): void {
    this.t += dt;
    this.ttl -= dt;
    if (this.t > 1.2) {
      this.x += 60 * dt;
      this.gy -= 50 * dt;
    }
  }
  isAlive(): boolean {
    return this.ttl > 0;
  }
  draw(g: CanvasRenderingContext2D): void {
    const peck = this.t < 1.2 ? Math.max(0, Math.sin(this.t * 14)) * 2 : 0;
    const y = this.gy - 4;
    const f = Math.min(1, this.ttl / 0.6);
    g.fillStyle = `rgba(120,85,60,${f})`;
    g.beginPath();
    g.ellipse(this.x, y, 3.8, 2.8, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(this.x + 3.4, y - 0.6 + peck, 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,160,0,${f})`;
    g.fillRect(this.x + 5, y - 0.8 + peck, 1.8, 0.9);
  }
}

// ============================================================================ Manager

type When = 'day' | 'night' | 'any';
interface SpawnRule {
  layer: 'bg' | 'mg';
  rate: number;
  when: When;
  biomes?: BiomeId[];
  not?: BiomeId[];
  unique?: boolean;
  make: (c: FlairCtx) => FlairEntity | null;
}

const EARTHY: BiomeId[] = ['meadow', 'desert', 'snow', 'night'];

const groundX = (c: FlairCtx, d = 120): number | null => {
  for (let i = 0; i < 6; i++) {
    const x = rand(50, c.W - 50);
    if (farFrom(c, x, d) && Math.abs(c.slopeAt(x)) < 0.9) return x;
  }
  return null;
};
const walker = (Ctor: new (c: FlairCtx) => FlairEntity) => (c: FlairCtx) => {
  const mid = rand(c.W * 0.2, c.W * 0.8);
  return farFrom(c, mid, 110) ? new Ctor(c) : null;
};
const at = (Ctor: new (c: FlairCtx, x: number) => FlairEntity) => (c: FlairCtx) => {
  const x = groundX(c);
  return x === null ? null : new Ctor(c, x);
};

const RULES: SpawnRule[] = [
  // sky
  { layer: 'bg', rate: 0.18, when: 'night', make: (c) => new ShootingStar(c) },
  { layer: 'bg', rate: 0.05, when: 'night', make: (c) => new Comet(c) },
  { layer: 'bg', rate: 0.03, when: 'night', make: (c) => new UFO(c) },
  { layer: 'bg', rate: 0.08, when: 'night', make: (c) => new Satellite(c) },
  { layer: 'bg', rate: 0.07, when: 'day', not: ['moon', 'volcano'], make: (c) => new BirdsFlock(c) },
  { layer: 'bg', rate: 0.04, when: 'any', not: ['moon'], make: (c) => new Airplane(c) },
  { layer: 'bg', rate: 0.025, when: 'day', not: ['moon', 'volcano'], make: (c) => new Balloon(c) },
  { layer: 'bg', rate: 0.05, when: 'night', not: ['moon'], make: (c) => new BatsFlock(c) },
  { layer: 'bg', rate: 0.008, when: 'night', unique: true, make: (c) => new MeteorShower(c) },
  { layer: 'bg', rate: 0.07, when: 'any', not: ['moon'], make: (c) => new CloudWisp(c) },
  { layer: 'bg', rate: 0.012, when: 'night', unique: true, make: (c) => new StarlinkTrain(c) },
  { layer: 'bg', rate: 0.02, when: 'day', not: ['moon', 'volcano'], make: (c) => new Blimp(c) },
  { layer: 'bg', rate: 0.012, when: 'night', unique: true, not: ['moon'], make: (c) => new DistantLightning(c) },
  { layer: 'bg', rate: 0.01, when: 'night', unique: true, biomes: ['night', 'snow'], make: () => new AuroraCurtain() },
  { layer: 'bg', rate: 0.02, when: 'day', biomes: ['meadow', 'desert'], make: (c) => new Kite(c) },
  { layer: 'bg', rate: 0.02, when: 'day', biomes: ['meadow', 'snow'], make: (c) => new Paraglider(c) },
  { layer: 'bg', rate: 0.02, when: 'any', not: ['moon'], make: (c) => new Helicopter(c) },
  { layer: 'bg', rate: 0.012, when: 'any', unique: true, make: (c) => new RocketLaunch(c) },
  { layer: 'bg', rate: 0.012, when: 'day', unique: true, biomes: ['meadow'], make: (c) => new RainbowArc(c) },
  // ground
  { layer: 'mg', rate: 0.07, when: 'any', biomes: EARTHY, make: at(Mole) },
  { layer: 'mg', rate: 0.1, when: 'night', biomes: ['night'], make: at(FireflyCluster) },
  { layer: 'mg', rate: 0.07, when: 'any', biomes: ['meadow', 'night'], make: walker(Hedgehog) },
  { layer: 'mg', rate: 0.1, when: 'any', biomes: ['meadow', 'snow', 'night'], make: walker(Rabbit) },
  { layer: 'mg', rate: 0.05, when: 'any', biomes: ['meadow', 'snow', 'night'], make: walker(Fox) },
  { layer: 'mg', rate: 0.1, when: 'any', biomes: ['desert'], make: (c) => { const x = groundX(c); return x === null ? null : new Floaters(c, x, 'dust'); } },
  { layer: 'mg', rate: 0.1, when: 'day', biomes: ['meadow'], make: (c) => { const x = groundX(c, 100); return x === null ? null : new Swarm(c, x, 'butterfly'); } },
  { layer: 'mg', rate: 0.06, when: 'day', biomes: ['meadow'], make: walker(Snail) },
  { layer: 'mg', rate: 0.09, when: 'any', biomes: ['desert'], make: walker(Tumbleweed) },
  { layer: 'mg', rate: 0.07, when: 'day', biomes: ['meadow'], make: (c) => { const x = groundX(c, 100); return x === null ? null : new Floaters(c, x, 'leaf'); } },
  { layer: 'mg', rate: 0.07, when: 'day', biomes: ['meadow'], make: (c) => { const x = groundX(c); return x === null ? null : new Floaters(c, x, 'seed'); } },
  { layer: 'mg', rate: 0.08, when: 'day', biomes: ['meadow', 'desert'], make: (c) => { const x = groundX(c); return x === null ? null : new Swarm(c, x, 'dragonfly'); } },
  { layer: 'mg', rate: 0.05, when: 'night', biomes: ['night', 'snow'], make: walker(CatSilhouette) },
  { layer: 'mg', rate: 0.05, when: 'any', biomes: ['meadow', 'snow', 'night'], make: walker(Deer) },
  { layer: 'mg', rate: 0.05, when: 'night', biomes: ['night'], make: at(Owl) },
  { layer: 'mg', rate: 0.06, when: 'day', biomes: ['meadow', 'snow'], make: walker(Squirrel) },
  { layer: 'mg', rate: 0.06, when: 'night', biomes: ['night'], make: walker(Raccoon) },
  { layer: 'mg', rate: 0.06, when: 'any', biomes: ['desert', 'meadow'], make: walker(Snake) },
  { layer: 'mg', rate: 0.08, when: 'day', biomes: ['meadow', 'desert'], make: at(GroundBird) },
  { layer: 'mg', rate: 0.05, when: 'any', biomes: EARTHY, make: walker(WindHat) },
  { layer: 'mg', rate: 0.05, when: 'night', biomes: ['night', 'snow'], make: (c) => { const x = groundX(c, 140); return x === null ? null : new Floaters(c, x, 'lantern'); } },
];

const RATE_MULT = 0.55;

export class FlairManager {
  bg: FlairEntity[] = [];
  mg: FlairEntity[] = [];
  private cooldown = 0;
  enabled = true;

  clear(): void {
    this.bg.length = 0;
    this.mg.length = 0;
    this.cooldown = 0;
  }

  update(dt: number, c: FlairCtx): void {
    for (const list of [this.bg, this.mg]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i] as FlairEntity;
        e.update(dt, c);
        if (!e.isAlive(c)) list.splice(i, 1);
      }
    }
    if (!this.enabled) return;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    if (c.busy) return;
    let spawned = 0;
    for (const r of RULES) {
      if (spawned >= 2) break;
      if (r.when === 'day' && c.night) continue;
      if (r.when === 'night' && !c.night) continue;
      if (r.biomes && !r.biomes.includes(c.biome)) continue;
      if (r.not && r.not.includes(c.biome)) continue;
      const list = r.layer === 'bg' ? this.bg : this.mg;
      if (list.length >= 9) continue;
      const p = 1 - Math.exp(-r.rate * RATE_MULT * dt);
      if (Math.random() >= p) continue;
      const e = r.make(c);
      if (!e) continue;
      if (r.unique && list.some((o) => o.constructor === e.constructor)) continue;
      list.push(e);
      spawned++;
    }
    if (spawned) this.cooldown = 0.22;
  }

  /** Pre-populate a few things so a fresh scene isn't empty. */
  warmup(c: FlairCtx, seconds = 6): void {
    const busy = c.busy;
    c.busy = false;
    for (let t = 0; t < seconds; t += 0.1) this.update(0.1, c);
    c.busy = busy;
  }

  drawBack(g: CanvasRenderingContext2D, c: FlairCtx): void {
    for (const e of this.bg) e.draw(g, c);
  }
  drawGround(g: CanvasRenderingContext2D, c: FlairCtx): void {
    for (const e of this.mg) e.draw(g, c);
  }
}
