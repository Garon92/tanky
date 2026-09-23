import { rand } from '../core/rng';
import type { Terrain } from '../game/terrain';

/** Pooled particle system + transient effects (rings, flashes, floating text). World coordinates. */

export type PKind = 'spark' | 'fire' | 'smoke' | 'dirt' | 'debris' | 'dust' | 'drop' | 'confetti' | 'star' | 'ember' | 'snow' | 'glow';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  bounce: boolean;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  max: number;
  color: string;
  width: number;
}

interface Flash {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  color: string;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  max: number;
  vy: number;
  outline: string;
}

interface Mark {
  x: number;
  side: number;
  t: number;
}

const MAX_PARTICLES = 2200;

export class Fx {
  parts: Particle[] = [];
  private pool: Particle[] = [];
  rings: Ring[] = [];
  flashes: Flash[] = [];
  texts: FloatText[] = [];
  treads: Mark[] = [];
  /** 0..1 global intensity (reduced motion lowers it) */
  intensity = 1;

  clear(): void {
    for (const p of this.parts) this.pool.push(p);
    this.parts.length = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
    this.texts.length = 0;
    this.treads.length = 0;
  }

  spawn(kind: PKind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, extra: Partial<Particle> = {}): void {
    if (this.parts.length >= MAX_PARTICLES) return;
    const p = this.pool.pop() ?? ({} as Particle);
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = extra.grow ?? 0;
    p.color = color;
    p.rot = extra.rot ?? rand(0, Math.PI * 2);
    p.vr = extra.vr ?? 0;
    p.gravity = extra.gravity ?? 0;
    p.drag = extra.drag ?? 0;
    p.bounce = extra.bounce ?? false;
    this.parts.push(p);
  }

  ring(x: number, y: number, r0: number, r1: number, dur: number, color: string, width = 3): void {
    this.rings.push({ x, y, r0, r1, t: 0, max: dur, color, width });
  }

  flash(x: number, y: number, r: number, dur: number, color = '255,240,190'): void {
    this.flashes.push({ x, y, r, t: 0, max: dur, color });
  }

  text(x: number, y: number, text: string, color: string, size = 22, dur = 1.3, outline = 'rgba(0,0,0,0.55)'): void {
    // avoid overlap with other fresh texts at the same place
    for (const o of this.texts) if (o.t < 0.3 && Math.abs(o.x - x) < 40 && Math.abs(o.y - y) < 24) y -= 26;
    this.texts.push({ x, y, text, color, size, t: 0, max: dur, vy: -38, outline });
  }

  tread(x: number, side: number): void {
    this.treads.push({ x, side, t: 0 });
    if (this.treads.length > 400) this.treads.shift();
  }

  // -------------------------------------------------------------------------
  // Composite effects
  // -------------------------------------------------------------------------

  explosion(x: number, y: number, r: number, dirt: string, dirtDark: string, big = false): void {
    const k = this.intensity;
    const n = Math.round((big ? 1.4 : 1) * (10 + r * 0.45) * k);
    this.flash(x, y, r * 1.7, 0.22);
    this.ring(x, y, r * 0.3, r * 1.5, 0.35, 'rgba(255,255,255,0.55)', 3);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 190) * (r / 36);
      this.spawn('fire', x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6 - 30, rand(0.25, 0.55), rand(r * 0.25, r * 0.45), '', { grow: -r * 0.3, drag: 3 });
    }
    for (let i = 0; i < n * 0.8; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(160, 460);
      this.spawn('spark', x, y, Math.cos(a) * s, Math.sin(a) * s - 80, rand(0.3, 0.8), rand(1.4, 2.6), '', { gravity: 600, drag: 1.2 });
    }
    for (let i = 0; i < n * 0.7; i++) {
      const a = rand(-Math.PI, 0);
      const s = rand(120, 360) * Math.min(1.6, r / 36);
      const c = Math.random() < 0.5 ? dirt : dirtDark;
      this.spawn('dirt', x + rand(-r * 0.3, r * 0.3), y + rand(-4, 4), Math.cos(a) * s, Math.sin(a) * s, rand(0.9, 1.8), rand(2, 4.5), c, { gravity: 900, vr: rand(-10, 10), bounce: true });
    }
    for (let i = 0; i < n * 0.6; i++) {
      this.spawn('smoke', x + rand(-r * 0.4, r * 0.4), y + rand(-r * 0.3, r * 0.1), rand(-25, 25), rand(-60, -15), rand(0.9, 2.0), rand(r * 0.25, r * 0.5), big ? '70,70,75' : '110,110,115', { grow: r * 0.5, drag: 1.2 });
    }
  }

  dirtBurst(x: number, y: number, r: number, dirt: string, dirtDark: string): void {
    for (let i = 0; i < 40 * this.intensity; i++) {
      const a = rand(-Math.PI, 0);
      const s = rand(60, 260);
      this.spawn('dirt', x + rand(-r * 0.5, r * 0.5), y + rand(-r * 0.5, r * 0.3), Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.5, rand(0.6, 1.4), rand(2.5, 5), Math.random() < 0.5 ? dirt : dirtDark, { gravity: 900, bounce: true });
    }
    for (let i = 0; i < 10; i++) this.spawn('dust', x + rand(-r, r), y + rand(-r * 0.3, r * 0.3), rand(-30, 30), rand(-30, -5), rand(0.6, 1.2), rand(8, 18), '170,140,100', { grow: 20 });
  }

  debris(x: number, y: number, color: string, n = 14): void {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const s = rand(180, 420);
      this.spawn('debris', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(1.2, 2.2), rand(3, 7), color, { gravity: 900, vr: rand(-14, 14), bounce: true });
    }
  }

  splash(x: number, y: number, color: string): void {
    for (let i = 0; i < 26 * this.intensity; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const s = rand(120, 360);
      this.spawn('drop', x + rand(-6, 6), y, Math.cos(a) * s * 0.6, Math.sin(a) * s, rand(0.5, 1.0), rand(1.8, 3.4), color, { gravity: 900 });
    }
    this.ring(x, y, 4, 60, 0.6, 'rgba(255,255,255,0.7)', 2);
  }

  confetti(x: number, y: number, n = 30): void {
    const colors = ['#ff4b4b', '#ffc53d', '#4cd964', '#4bb3ff', '#b388ff', '#ff8fd1'];
    for (let i = 0; i < n * this.intensity; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 320);
      this.spawn('confetti', x, y, Math.cos(a) * s, Math.sin(a) * s - 120, rand(1.0, 1.8), rand(3, 5), colors[i % colors.length] as string, { gravity: 420, drag: 1.4, vr: rand(-12, 12) });
    }
  }

  sparkle(x: number, y: number, color = '255,230,120', n = 14): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 160);
      this.spawn('star', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.0), rand(3, 6), color, { drag: 2.5, vr: rand(-6, 6) });
    }
  }

  muzzle(x: number, y: number, dirx: number, diry: number): void {
    this.flash(x, y, 26, 0.1, '255,230,160');
    for (let i = 0; i < 8 * this.intensity; i++) {
      const s = rand(40, 140);
      this.spawn('smoke', x, y, dirx * s + rand(-20, 20), diry * s + rand(-20, 10), rand(0.5, 1.1), rand(4, 8), '200,200,205', { grow: 18, drag: 2.2 });
    }
    for (let i = 0; i < 6; i++) {
      const s = rand(150, 320);
      this.spawn('spark', x, y, dirx * s + rand(-50, 50), diry * s + rand(-50, 50), rand(0.1, 0.25), rand(1.2, 2), '', { drag: 4 });
    }
  }

  // -------------------------------------------------------------------------

  update(dt: number, terrain: Terrain | null): void {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1] as Particle;
        parts.pop();
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0.1, p.size + p.grow * dt);
      if (p.bounce && terrain) {
        const g = terrain.heightAt(p.x);
        if (p.y > g) {
          p.y = g;
          if (Math.abs(p.vy) > 60) {
            p.vy = -p.vy * 0.3;
            p.vx *= 0.6;
          } else {
            p.vy = 0;
            p.vx *= 0.8;
            p.vr *= 0.8;
          }
        }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i] as Ring;
      r.t += dt;
      if (r.t >= r.max) this.rings.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i] as Flash;
      f.t += dt;
      if (f.t >= f.max) this.flashes.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i] as FloatText;
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= 1 - dt * 1.5;
      if (t.t >= t.max) this.texts.splice(i, 1);
    }
    for (let i = this.treads.length - 1; i >= 0; i--) {
      const m = this.treads[i] as Mark;
      m.t += dt;
      if (m.t > 14) this.treads.splice(i, 1);
    }
  }

  drawTreads(ctx: CanvasRenderingContext2D, terrain: Terrain): void {
    if (!this.treads.length) return;
    ctx.fillStyle = 'rgba(40,28,18,1)';
    for (const m of this.treads) {
      const a = Math.max(0, 0.28 * (1 - m.t / 14));
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const y = terrain.heightAt(m.x);
      ctx.fillRect(m.x - 1.5, y - 1.2 + m.side * 0.1, 3, 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Particles behind tanks (smoke, dirt). */
  drawBack(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      const k = p.life / p.max;
      switch (p.kind) {
        case 'smoke':
          ctx.fillStyle = `rgba(${p.color},${0.45 * k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'dust':
          ctx.fillStyle = `rgba(${p.color},${0.28 * k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        default:
          break;
      }
    }
  }

  /** Particles in front (fire, sparks, debris, text). */
  drawFront(ctx: CanvasRenderingContext2D): void {
    // solid particles
    for (const p of this.parts) {
      const k = p.life / p.max;
      switch (p.kind) {
        case 'dirt':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'debris':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          ctx.restore();
          break;
        case 'drop':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'confetti':
          ctx.globalAlpha = Math.min(1, k * 2.5);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.5 * Math.abs(Math.cos(p.rot * 1.7)), p.size * 2, p.size * Math.abs(Math.cos(p.rot * 1.7)) + 0.5);
          ctx.restore();
          break;
        case 'snow':
          ctx.globalAlpha = Math.min(1, k * 3) * 0.9;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
    // additive glow
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const k = 1 - f.t / f.max;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(${f.color},${0.85 * k})`);
      g.addColorStop(0.4, `rgba(255,170,60,${0.4 * k})`);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      switch (p.kind) {
        case 'fire': {
          const hue = 20 + 40 * k;
          ctx.fillStyle = `hsla(${hue},100%,${45 + 25 * k}%,${0.75 * k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark':
          ctx.strokeStyle = `rgba(255,${200 + 55 * k},${90 + 120 * k},${k})`;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
          ctx.stroke();
          break;
        case 'ember':
          ctx.fillStyle = `rgba(255,${120 + 80 * k},40,${k})`;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'star': {
          ctx.fillStyle = `rgba(${p.color},${k})`;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const s = p.size * (0.5 + k * 0.5);
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
            ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.35, Math.sin(a + Math.PI / 4) * s * 0.35);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'glow': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, `rgba(${p.color},${0.7 * k})`);
          g.addColorStop(1, `rgba(${p.color},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const r of this.rings) {
      const k = r.t / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Floating texts (screen space). `maxX` = screen width: texts are kept fully on screen. */
  drawTexts(ctx: CanvasRenderingContext2D, font: string, maxX = 0): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.max;
      const pop = t.t < 0.12 ? 0.6 + (t.t / 0.12) * 0.55 : t.t < 0.24 ? 1.15 - ((t.t - 0.12) / 0.12) * 0.15 : 1;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `900 ${Math.round(t.size * pop)}px ${font}`;
      ctx.lineWidth = Math.max(3, t.size * 0.18);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = t.outline;
      let x = t.x;
      if (maxX > 0) {
        const half = ctx.measureText(t.text).width / 2 + ctx.lineWidth;
        x = half * 2 + 8 >= maxX ? maxX / 2 : Math.min(Math.max(x, half + 4), maxX - half - 4);
      }
      ctx.strokeText(t.text, x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
