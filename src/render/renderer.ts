import { clamp, degToRad } from '../core/math';
import { rand } from '../core/rng';
import { guidePath } from '../game/ai';
import { BIOMES, type Biome } from '../game/biomes';
import { TANK_H, WORLD_H, WORLD_W } from '../game/constants';
import type { Match } from '../game/match';
import type { Tank } from '../game/tank';
import type { Wood } from '../game/types';
import { WEAPONS } from '../game/weapons';
import type { WorldEvent } from '../game/world';
import { Camera } from './camera';
import { FlairManager, type FlairCtx } from './flair';
import { Fx } from './fx';
import { Backdrop, drawWater, TerrainLayer } from './scenery';
import { drawBlock, drawCrate, drawPad, drawPortal, drawProjectile, drawTank, drawTarget, drawWood, roundRect, shade } from './sprites';

export const FONT = "'Nunito Variable', Nunito, ui-rounded, system-ui, sans-serif";

export interface PointerAim {
  active: boolean;
  x: number;
  y: number;
}

interface Pip {
  x: number;
  y: number;
  r: number;
  ttl: number;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly cam = new Camera();
  readonly fx = new Fx();
  readonly flair = new FlairManager();
  private backdrop = new Backdrop();
  private terrainLayer = new TerrainLayer();
  private time = 0;
  private pips: Pip[] = [];
  private pipT = 0;
  private guideKey = '';
  private guide: number[] = [];
  private flairCtx: FlairCtx;
  private lastWorld: unknown = null;
  private sceneSeed = 1;
  pointer: PointerAim = { active: false, x: 0, y: 0 };
  /** Called when the renderer wants the camera to shake / the loop to hit-stop. */
  onHitStop?: (s: number) => void;
  showLabels = true;
  private windDir = 1;
  private wind = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.flairCtx = {
      W: WORLD_W,
      H: WORLD_H,
      heightAt: () => WORLD_H,
      slopeAt: () => 0,
      avoid: [],
      night: false,
      biome: 'meadow',
      busy: false,
    };
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.cam.resize(cssW, cssH, dpr);
  }

  /** New world → reset caches and cosmetic state. */
  private onNewWorld(match: Match): void {
    this.lastWorld = match.world;
    this.fx.clear();
    this.flair.clear();
    this.pips.length = 0;
    this.guideKey = '';
    this.sceneSeed = (match.world.rng.int(1, 1e9) ^ (match.round * 7919)) >>> 0;
    this.syncFlairCtx(match);
    this.flair.warmup(this.flairCtx, 5);
    if (this.cam.zoomed) this.cam.snap(this.focusX(match));
  }

  private holdFocus = WORLD_W / 2;

  /** Where the camera should look when zoomed in (phones): shot in flight, else the active tank + its target. */
  private focusX(match: Match): number {
    const w = match.world;
    const cam = this.cam;
    const p = w.projectiles[0];
    if (p) {
      this.holdFocus = p.x;
      return p.x;
    }
    if (match.phase === 'flight' || match.phase === 'roundEnd' || match.phase === 'over') return this.holdFocus;
    const t = match.active ?? w.tanks.find((x) => x.control === 'human') ?? w.tanks[0];
    if (!t) return WORLD_W / 2;
    const reach = cam.viewW * 0.36;
    let target = t.x + t.facing * reach * 0.6;
    // don't move the world under the finger while aiming by drag
    if (this.pointer.active && match.isHumanTurn) return this.holdFocus;
    {
      // look toward the nearest enemy, keeping the active tank on screen
      const foes = w.tanks.filter((o) => o.alive && o.team !== t.team);
      if (foes.length) {
        const near = foes.reduce((a, b) => (Math.abs(b.x - t.x) < Math.abs(a.x - t.x) ? b : a));
        target = (t.x + near.x) / 2;
      }
    }
    target = Math.min(t.x + reach, Math.max(t.x - reach, target));
    this.holdFocus = target;
    return target;
  }

  private syncFlairCtx(match: Match): void {
    const w = match.world;
    const b = BIOMES[w.biome];
    const c = this.flairCtx;
    c.heightAt = (x) => w.terrain.heightAt(x);
    c.slopeAt = (x) => w.terrain.slopeAt(x);
    c.avoid = w.tanks.filter((t) => t.alive).map((t) => t.x);
    c.night = b.night;
    c.biome = b.id;
    c.busy = match.phase === 'flight';
  }

  // ---------------------------------------------------------------------------
  // Events → visuals
  // ---------------------------------------------------------------------------

  handleEvent(e: WorldEvent, match: Match): void {
    const b = BIOMES[match.world.biome];
    const fx = this.fx;
    switch (e.t) {
      case 'fire': {
        const a = degToRad(e.angle);
        fx.muzzle(e.x, e.y, Math.cos(a), -Math.sin(a));
        this.cam.addTrauma(0.12 + (e.weapon === 'mega' ? 0.2 : 0));
        this.pips.length = 0;
        break;
      }
      case 'explosion':
        if (e.kind === 'dirt') {
          fx.dirtBurst(e.x, e.y, e.r, b.ground[0], b.speck);
          this.cam.addTrauma(0.15);
        } else if (e.kind === 'small') {
          fx.flash(e.x, e.y, 30, 0.15);
          for (let i = 0; i < 12; i++) fx.spawn('smoke', e.x, e.y, rand(-30, 30), rand(-80, -30), rand(0.8, 1.6), rand(5, 9), '255,90,90', { grow: 16, drag: 1 });
        } else {
          const big = e.kind === 'death' || e.r > 60;
          fx.explosion(e.x, e.y, e.r, b.ground[0], b.speck, big);
          this.cam.addTrauma(Math.min(1, 0.18 + e.shake * 0.55 + (e.direct ? 0.2 : 0)));
          if (e.direct || e.kind === 'death') this.onHitStop?.(e.kind === 'death' ? 0.1 : 0.07);
        }
        break;
      case 'damage': {
        const t = e.tank;
        if (e.amount > 0) {
          const big = e.amount >= 40;
          fx.text(t.x + 34 * t.scale, t.cy - 34 * t.scale, `−${e.amount}`, big ? '#ffd54a' : '#ffffff', big ? 30 : 24, 1.4, 'rgba(120,0,0,0.75)');
          if (e.direct) fx.text(t.x, t.cy - 100 * t.scale, 'Přímý zásah!', '#ffab91', 18, 1.3, 'rgba(90,20,0,0.75)');
        }
        if (e.absorbed > 0) {
          fx.text(t.x + 24, t.cy - 40, `🛡 ${e.absorbed}`, '#8fe3ff', 18, 1.1);
          fx.ring(t.x, t.cy, 20, 50, 0.4, 'rgba(140,230,255,0.9)', 3);
        }
        break;
      }
      case 'death':
        fx.debris(e.tank.x, e.tank.cy, e.tank.color, 16);
        fx.debris(e.tank.x, e.tank.cy, '#3b4048', 10);
        this.cam.addTrauma(0.5);
        break;
      case 'bounce':
        fx.spawn('dust', e.x, e.y, 0, -20, 0.5, 8, '200,190,170', { grow: 20 });
        if (e.on === 'pad') fx.sparkle(e.x, e.y, '255,120,210', 8);
        break;
      case 'splash':
        fx.splash(e.x, e.y, b.id === 'volcano' ? '#ffb040' : '#bfe6ff');
        break;
      case 'portal':
        fx.sparkle(e.x, e.y, '220,170,255', 12);
        fx.sparkle(e.x2, e.y2, '220,170,255', 12);
        fx.ring(e.x2, e.y2, 10, 50, 0.4, 'rgba(220,170,255,0.9)', 3);
        break;
      case 'crate': {
        const c = e.crate;
        fx.sparkle(c.x, c.y - 14, '255,230,120', 18);
        fx.debris(c.x, c.y - 12, '#c8955a', 6);
        if (e.tank) {
          const label =
            c.kind === 'repair' ? '+35 ❤' : c.kind === 'shield' ? 'Štít!' : c.kind === 'fuel' ? '+100 paliva' : c.weapon ? `+${c.amount} ${WEAPONS[c.weapon].name}` : 'Bonus!';
          fx.text(e.tank.x, e.tank.cy - 70, label, '#b9f6ca', 20, 1.6, 'rgba(0,60,20,0.7)');
        }
        break;
      }
      case 'crateSpawn':
        break;
      case 'crateLand':
        fx.spawn('dust', e.crate.x, e.crate.y, 0, -10, 0.6, 12, '200,190,170', { grow: 18 });
        break;
      case 'wood':
        fx.debris(e.wood.x + e.wood.w / 2, e.wood.y + e.wood.h / 2, '#b07a44', 10);
        break;
      case 'land':
        if (e.fall > 20) {
          for (let i = 0; i < 10; i++) fx.spawn('dust', e.tank.x + rand(-26, 26), e.tank.y, rand(-40, 40), rand(-30, -5), rand(0.5, 1), rand(8, 14), '190,180,160', { grow: 16 });
          this.cam.addTrauma(Math.min(0.4, e.fall / 400));
        }
        break;
      case 'dig':
        for (let i = 0; i < 3; i++) fx.spawn('dirt', e.x + rand(-6, 6), match.world.terrain.heightAt(e.x), rand(-60, 60), rand(-160, -60), rand(0.5, 1), rand(2, 4), b.ground[0], { gravity: 900, bounce: true });
        break;
      case 'target':
        fx.confetti(e.x, e.y, 34);
        fx.ring(e.x, e.y, 6, 44, 0.35, 'rgba(255,255,255,0.9)', 3);
        break;
      case 'split':
        fx.sparkle(e.x, e.y, '255,150,230', 20);
        fx.flash(e.x, e.y, 40, 0.15, '255,200,240');
        break;
      case 'shield':
        fx.ring(e.tank.x, e.tank.cy, 20, 60, 0.5, 'rgba(140,230,255,0.9)', 4);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  draw(match: Match, dt: number, paused: boolean): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const w = match.world;
    if (w !== this.lastWorld) this.onNewWorld(match);
    const biome = BIOMES[w.biome];
    const fdt = paused ? 0 : dt;
    this.time += fdt;
    if (cam.zoomed) cam.follow(this.focusX(match));
    cam.update(fdt);
    this.fx.update(fdt, w.terrain);
    this.syncFlairCtx(match);
    this.flair.update(fdt, this.flairCtx);
    this.windDir = w.wind < -5 ? -1 : 1;
    this.wind = w.wind;
    this.ambient(biome, fdt);
    for (const t of w.tanks) {
      if (t.driving > 0 && fdt > 0 && Math.random() < 0.5) {
        const back = t.x - t.facing * 22 * t.scale;
        this.fx.spawn('dust', back, t.y - 2, rand(-20, 20), rand(-25, -5), rand(0.4, 0.8), rand(4, 8), '190,175,150', { grow: 14 });
        this.fx.tread(t.x + rand(-20, 20), 0);
      }
      if (!t.alive && fdt > 0 && Math.random() < 0.25) {
        this.fx.spawn('smoke', t.x + rand(-6, 6), t.cy - 6, rand(-8, 8), rand(-40, -20), rand(1.2, 2.2), rand(5, 9), '60,60,64', { grow: 10 });
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // clear first: when zoomed the strip caches still cover the screen, but be safe at edges
    ctx.fillStyle = biome.sky[2];
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.backdrop.get(biome, cam, this.sceneSeed), Math.round(cam.stripX), 0);
    cam.applyWorld(ctx);
    this.flair.drawBack(ctx, this.flairCtx);

    // terrain (cached; shake applied as offset)
    const layer = this.terrainLayer.get(w.terrain, biome, cam, this.sceneSeed);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, Math.round(cam.stripX + cam.shakeX * cam.dpr), Math.round(cam.shakeY * cam.dpr));
    cam.applyWorld(ctx);
    this.fx.drawTreads(ctx, w.terrain);
    this.flair.drawGround(ctx, this.flairCtx);

    // bouncy world edges: glowing force fields
    if (w.walls === 'bounce') this.drawBounceWalls(ctx);

    // level objects
    for (const b of w.blocks) drawBlock(ctx, b);
    for (const p of w.pads) drawPad(ctx, p, this.time);
    for (const wd of w.woods) if (wd.alive) this.drawWoodWithShadow(ctx, wd);
    for (const p of w.portals) drawPortal(ctx, p, this.time);
    for (const c of w.crates) if (c.alive) drawCrate(ctx, c, this.time);
    for (const t of w.targets) if (t.alive) drawTarget(ctx, t, this.time);

    this.drawImpactMarks(ctx, match);
    this.fx.drawBack(ctx);

    // tanks (wrecks first)
    const enemyFace = match.mode.id === 'campaign' || match.mode.id === 'survival';
    for (const t of w.tanks) if (!t.alive) drawTank(ctx, t, { active: false, enemyFace: false, time: this.time });
    for (const t of w.tanks) if (t.alive) drawTank(ctx, t, { active: t === match.active && match.phase === 'aim', enemyFace: enemyFace && t.team !== 0, time: this.time });

    if (w.waterY !== null) drawWater(ctx, w.terrain, w.waterY, biome, this.time, cam);

    // aim helpers
    const act = match.active;
    if (act && match.isHumanTurn) {
      this.drawGhost(ctx, match, act);
      this.drawGuide(ctx, match, act);
      this.drawPips(ctx, act, fdt);
      if (this.pointer.active) this.drawPointerAim(ctx, act);
    } else this.pips.length = 0;

    for (const p of w.projectiles) drawProjectile(ctx, p, this.time);
    this.fx.drawFront(ctx);

    // ---- screen space
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    this.drawLabels(ctx, match);
    this.drawTexts(ctx);
    this.drawOffscreen(ctx, match);
  }

  private drawWoodWithShadow(ctx: CanvasRenderingContext2D, wd: Wood): void {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(wd.x + 3, wd.y + 3, wd.w, wd.h);
    drawWood(ctx, wd);
  }

  private ambient(b: Biome, dt: number): void {
    if (dt <= 0) return;
    const v = this.cam.view;
    const fx = this.fx;
    switch (b.ambient) {
      case 'snow':
        if (Math.random() < dt * 30) fx.spawn('snow', rand(v.x0 - 200, v.x1 + 200), v.y0 - 10, rand(-20, 20) + this.wind * 0.5, rand(30, 70), 16, rand(1.2, 2.8), '#ffffff', { drag: 0 });
        break;
      case 'ash':
        if (Math.random() < dt * 14) fx.spawn('ember', rand(v.x0, v.x1), WORLD_H + 10, rand(-15, 15), rand(-60, -25), rand(4, 9), rand(1.5, 2.8), '', {});
        break;
      case 'dust': {
        // wind-blown sand specks
        const dir = this.windDir || 1;
        if (Math.random() < dt * 22) fx.spawn('snow', dir > 0 ? v.x0 - 5 : v.x1 + 5, rand(250, 780), dir * rand(160, 280), rand(-12, 12), 9, rand(0.8, 1.6), '#f3d9a4', {});
        break;
      }
      case 'pollen':
        if (Math.random() < dt * 3) fx.spawn('glow', rand(v.x0, v.x1), rand(250, 650), rand(-10, 10), rand(-8, 4), rand(4, 8), rand(2, 4), '255,250,200', {});
        break;
      default:
        break;
    }
  }

  private drawGuide(ctx: CanvasRenderingContext2D, match: Match, t: Tank): void {
    const ratio = match.guideRatio(t);
    if (ratio <= 0) return;
    const key = `${t.angle.toFixed(2)}|${t.power.toFixed(2)}|${t.x.toFixed(1)}|${t.y.toFixed(1)}|${match.world.wind.toFixed(2)}|${match.world.terrain.version}|${t.weapon}`;
    if (key !== this.guideKey) {
      this.guideKey = key;
      this.guide = guidePath(match.world, t);
    }
    const path = this.guide;
    if (path.length < 4) return;
    // resample into evenly spaced dots
    let total = 0;
    for (let i = 2; i < path.length; i += 2) total += Math.hypot((path[i] as number) - (path[i - 2] as number), (path[i + 1] as number) - (path[i - 1] as number));
    const show = total * ratio;
    const gap = 16;
    let acc = 0;
    let next = gap * 0.6;
    const col = t.color;
    const dotR = Math.max(2.4, 3.2 / Math.max(0.6, this.cam.scale * 1.2));
    for (let i = 2; i < path.length && next < show; i += 2) {
      const x0 = path[i - 2] as number;
      const y0 = path[i - 1] as number;
      const x1 = path[i] as number;
      const y1 = path[i + 1] as number;
      const seg = Math.hypot(x1 - x0, y1 - y0);
      while (next <= acc + seg && next < show) {
        const k = (next - acc) / (seg || 1);
        const x = x0 + (x1 - x0) * k;
        const y = y0 + (y1 - y0) * k;
        const fade = ratio >= 1 ? 0.9 : 0.9 * (1 - next / show);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, dotR + 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fill();
        next += gap;
      }
      acc += seg;
    }
    ctx.globalAlpha = 1;
    if (ratio >= 1) {
      // landing crosshair
      const ex = path[path.length - 2] as number;
      const ey = path[path.length - 1] as number;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ex, ey, 12, 0, Math.PI * 2);
      ctx.moveTo(ex - 18, ey);
      ctx.lineTo(ex - 6, ey);
      ctx.moveTo(ex + 6, ey);
      ctx.lineTo(ex + 18, ey);
      ctx.moveTo(ex, ey - 18);
      ctx.lineTo(ex, ey - 6);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  private drawBounceWalls(ctx: CanvasRenderingContext2D): void {
    const v = this.cam.view;
    const top = Math.min(0, v.y0) - 20;
    const h = WORLD_H - top;
    for (const side of [0, 1]) {
      const x = side === 0 ? 0 : WORLD_W;
      const dir = side === 0 ? 1 : -1;
      const g = ctx.createLinearGradient(x, 0, x + dir * 26, 0);
      g.addColorStop(0, 'rgba(120,220,255,0.55)');
      g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(side === 0 ? 0 : WORLD_W - 26, top, 26, h);
      ctx.strokeStyle = 'rgba(190,240,255,0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -this.time * 40;
      ctx.beginPath();
      ctx.moveTo(x + dir * 2, top);
      ctx.lineTo(x + dir * 2, WORLD_H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Faint dashed path of the tank's previous shot – helps to correct the aim. */
  private drawGhost(ctx: CanvasRenderingContext2D, match: Match, t: Tank): void {
    const path = match.lastPath.get(t.id);
    if (!path || path.length < 6) return;
    ctx.save();
    ctx.setLineDash([5, 9]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(path[0] as number, path[1] as number);
    for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i] as number, path[i + 1] as number);
    ctx.stroke();
    ctx.strokeStyle = t.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  /** The original game's pulsing aim "pips": direction + a feel for power. */
  private drawPips(ctx: CanvasRenderingContext2D, t: Tank, dt: number): void {
    this.pipT += dt;
    if (this.pipT >= 0.16) {
      this.pipT = 0;
      const a = degToRad(t.angle);
      const reach = t.power * 2.6;
      for (const f of [0.6, 0.8, 1.05, 1.3, 1.55]) {
        const ja = (Math.random() - 0.5) * 0.14;
        const d = f * reach + (Math.random() - 0.5) * 16;
        this.pips.push({ x: t.pivotX + Math.cos(a + ja) * d, y: t.pivotY - Math.sin(a + ja) * d, r: 3 + Math.random() * 5, ttl: 1.2 });
      }
    }
    for (let i = this.pips.length - 1; i >= 0; i--) {
      const p = this.pips[i] as Pip;
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.pips.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(255,213,74,${clamp(p.ttl / 1.2, 0, 1) * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPointerAim(ctx: CanvasRenderingContext2D, t: Tank): void {
    const p = this.cam.toWorld(this.pointer.x, this.pointer.y);
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(t.pivotX, t.pivotY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = t.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawImpactMarks(ctx: CanvasRenderingContext2D, match: Match): void {
    for (const t of match.world.tanks) {
      const list = match.lastImpact.get(t.id);
      if (!list || !list.length) continue;
      const human = t.control === 'human';
      for (let i = 0; i < list.length; i++) {
        const m = list[i] as { x: number; y: number; n: number };
        const age = list.length - 1 - i;
        const a = age === 0 ? 0.85 : age === 1 ? 0.55 : 0.3;
        ctx.globalAlpha = human ? a : a * 0.55;
        const y = Math.min(m.y, match.world.terrain.heightAt(m.x) + 2);
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.arc(m.x, y, human ? 6.5 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, y, human ? 9 : 6.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawLabels(ctx: CanvasRenderingContext2D, match: Match): void {
    const cam = this.cam;
    const small = cam.cssW < 700;
    for (const t of match.world.tanks) {
      if (!t.alive || (t.falling && t.chute)) continue;
      const s = cam.toScreen(t.x, t.y - TANK_H * t.scale - 14 * t.scale);
      const bw = (small ? 36 : 46) * Math.min(1.3, t.scale);
      const bh = small ? 5 : 7;
      const x = s.x - bw / 2;
      const y = s.y - (small ? 18 : 24);
      // hp bar
      ctx.fillStyle = 'rgba(10,14,24,0.55)';
      roundRect(ctx, x - 2, y - 2, bw + 4, bh + 4, 5);
      ctx.fill();
      const k = clamp(t.hp / t.maxHp, 0, 1);
      ctx.fillStyle = k > 0.6 ? '#4cd964' : k > 0.3 ? '#ffc53d' : '#ff5252';
      roundRect(ctx, x, y, Math.max(bh, bw * k), bh, 3);
      if (k > 0) ctx.fill();
      if (t.shield > 0) {
        ctx.fillStyle = 'rgba(120,220,255,0.85)';
        roundRect(ctx, x, y - 4, bw * Math.min(1, t.shield / 100), 3, 1.5);
        ctx.fill();
      }
      // name
      if (this.showLabels && !small) {
        ctx.font = `800 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,14,24,0.6)';
        ctx.strokeText(t.name, s.x, y - 5);
        ctx.fillStyle = shade(t.color, 0.55);
        ctx.fillText(t.name, s.x, y - 5);
      }
      // active arrow
      if (t === match.active && match.phase === 'aim') {
        const bob = Math.sin(this.time * 6) * 4;
        const ay = y - (small ? 10 : 24) + bob;
        ctx.fillStyle = t.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x - 9, ay - 11);
        ctx.lineTo(s.x + 9, ay - 11);
        ctx.lineTo(s.x, ay);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  private drawTexts(ctx: CanvasRenderingContext2D): void {
    if (!this.fx.texts.length) return;
    // convert world positions to screen for crisp, readable text at any scale
    const saved = this.fx.texts.map((t) => ({ t, x: t.x, y: t.y, size: t.size }));
    const k = clamp(this.cam.scale * 1.4, 0.75, 1.15);
    for (const s of saved) {
      const p = this.cam.toScreen(s.x, s.y);
      s.t.x = p.x;
      s.t.y = p.y;
      s.t.size = s.size * k;
    }
    this.fx.drawTexts(ctx, FONT);
    for (const s of saved) {
      s.t.x = s.x;
      s.t.y = s.y;
      s.t.size = s.size;
    }
  }

  private drawOffscreen(ctx: CanvasRenderingContext2D, match: Match): void {
    for (const p of match.world.projectiles) {
      const s = this.cam.toScreen(p.x, p.y);
      if (s.y >= 0) continue;
      const x = clamp(s.x, 14, this.cam.cssW - 14);
      const h = Math.min(1, -s.y / 400);
      ctx.fillStyle = `rgba(255,255,255,${0.9 - h * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x - 8, 20);
      ctx.lineTo(x + 8, 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = WEAPONS[p.weapon].color;
      ctx.beginPath();
      ctx.arc(x, 26, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

