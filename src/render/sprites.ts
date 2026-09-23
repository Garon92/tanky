import { degToRad } from '../core/math';
import { TANK_H, TANK_W } from '../game/constants';
import type { Tank } from '../game/tank';
import type { Block, Crate, Pad, Portal, Projectile, Target, Wood } from '../game/types';
import { WEAPONS } from '../game/weapons';

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// ---------------------------------------------------------------------------
// Tank
// ---------------------------------------------------------------------------

export interface TankDrawOpts {
  active: boolean;
  enemyFace: boolean;
  time: number;
}

export function drawTank(ctx: CanvasRenderingContext2D, t: Tank, o: TankDrawOpts): void {
  const s = t.scale;
  const dead = !t.alive;
  const look = t.def.look;
  const body = dead ? '#3a3a3a' : t.color;
  const w = TANK_W;
  const hullTop = -TANK_H + 4;

  // parachute (drop-ins)
  if (t.chute && t.falling) {
    ctx.save();
    ctx.translate(t.x, t.y - TANK_H * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-18 * s, 0);
    ctx.lineTo(-30 * s, -44 * s);
    ctx.moveTo(18 * s, 0);
    ctx.lineTo(30 * s, -44 * s);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -48 * s);
    ctx.stroke();
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.ellipse(0, -46 * s, 36 * s, 20 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, -46 * s, 12 * s, 20 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

  // active glow
  if (o.active && !dead) {
    const g = ctx.createRadialGradient(t.x, t.cy, 6, t.x, t.cy, 70 * s);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.cy, 70 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // barrel (absolute angle, from pivot) – drawn first so the turret covers its base
  if (!dead) {
    const a = degToRad(t.angle);
    const len = t.barrelLen - t.recoil * 7 * s;
    const px = t.pivotX;
    const py = t.pivotY;
    const bw = (look === 'mortar' ? 9 : look === 'heavy' || look === 'boss' ? 7.5 : look === 'sniper' ? 4.5 : 6) * s;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-a);
    ctx.fillStyle = '#2b2f36';
    roundRect(ctx, 0, -bw / 2 - 1, len + 1, bw + 2, 2.5);
    ctx.fill();
    const bg = ctx.createLinearGradient(0, -bw / 2, 0, bw / 2);
    bg.addColorStop(0, '#e9edf2');
    bg.addColorStop(1, '#9aa3ad');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, -bw / 2, len, bw, 2);
    ctx.fill();
    ctx.fillStyle = shade(t.color, -0.1);
    roundRect(ctx, len - 5 * s, -bw / 2 - 1.5, 5 * s, bw + 3, 1.5);
    ctx.fill();
    if (look === 'sniper') {
      ctx.fillStyle = '#2b2f36';
      roundRect(ctx, len * 0.35, -bw / 2 - 5, 10 * s, 4, 1.5);
      ctx.fill();
    }
    if (look === 'boss') {
      ctx.fillStyle = '#2b2f36';
      roundRect(ctx, 0, bw / 2 + 1, len * 0.7, bw * 0.7, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.tilt);
  ctx.scale(s, s);

  // tracks
  const tw = w + 8;
  ctx.fillStyle = '#23262b';
  roundRect(ctx, -tw / 2, -10, tw, 11, 5.5);
  ctx.fill();
  // tread segments (animated)
  ctx.save();
  roundRect(ctx, -tw / 2, -10, tw, 11, 5.5);
  ctx.clip();
  ctx.fillStyle = '#3b4048';
  const phase = ((t.treadPhase % 6) + 6) % 6;
  for (let x = -tw / 2 - 6 + phase; x < tw / 2 + 6; x += 6) ctx.fillRect(x, -10, 2.4, 11);
  ctx.restore();
  // wheels
  for (let i = 0; i < 5; i++) {
    const wx = -w / 2 + 4 + i * ((w - 8) / 4);
    ctx.fillStyle = '#5b626d';
    ctx.beginPath();
    ctx.arc(wx, -4.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a929e';
    ctx.beginPath();
    ctx.arc(wx, -4.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // hull
  const hullW = look === 'light' ? w - 6 : w;
  ctx.fillStyle = shade(body, -0.35);
  ctx.beginPath();
  ctx.moveTo(-hullW / 2 - 3, -8);
  ctx.lineTo(hullW / 2 + 3, -8);
  ctx.lineTo(hullW / 2 - 4, hullTop);
  ctx.lineTo(-hullW / 2 + 4, hullTop);
  ctx.closePath();
  ctx.fill();
  const hg = ctx.createLinearGradient(0, hullTop, 0, -8);
  hg.addColorStop(0, shade(body, 0.25));
  hg.addColorStop(1, body);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-hullW / 2 - 1.5, -9.5);
  ctx.lineTo(hullW / 2 + 1.5, -9.5);
  ctx.lineTo(hullW / 2 - 4.5, hullTop + 1);
  ctx.lineTo(-hullW / 2 + 4.5, hullTop + 1);
  ctx.closePath();
  ctx.fill();
  // armor skirts for heavies
  if (look === 'heavy' || look === 'boss') {
    ctx.fillStyle = shade(body, -0.2);
    roundRect(ctx, -w / 2 - 4, -11, w + 8, 5, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-w / 2 + 2 + i * (w / 5), -8.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (look === 'digger' && !dead) {
    // drill at the front
    const f = t.facing;
    ctx.fillStyle = '#b0bec5';
    ctx.beginPath();
    ctx.moveTo(f * (w / 2 + 2), -13);
    ctx.lineTo(f * (w / 2 + 14), -8);
    ctx.lineTo(f * (w / 2 + 2), -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(f * (w / 2 + 3 + i * 3.5), -12 + i * 1.3);
      ctx.lineTo(f * (w / 2 + 3 + i * 3.5), -4 - i * 1.3);
      ctx.stroke();
    }
  }
  if (look === 'dummy' && !dead) {
    // painted target on the hull
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(0, -10, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -10, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // turret dome
  const tr = look === 'light' ? 10 : look === 'heavy' || look === 'boss' ? 13 : 11.5;
  const ty = -TANK_H;
  const dg = ctx.createRadialGradient(-4, ty - 5, 2, 0, ty, tr + 3);
  dg.addColorStop(0, shade(body, 0.35));
  dg.addColorStop(1, shade(body, -0.12));
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.arc(0, ty, tr, Math.PI, 0);
  ctx.lineTo(tr, ty + 3);
  ctx.lineTo(-tr, ty + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // hit flash
  if (t.flash > 0) {
    ctx.globalAlpha = t.flash * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, ty, tr + 1, Math.PI, 0);
    ctx.fill();
    roundRect(ctx, -hullW / 2 - 2, hullTop, hullW + 4, 12, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // face: eyes looking along the barrel
  if (!dead) {
    ctx.save();
    ctx.translate(0, ty - 2);
    // counter-rotate so eyes look toward the aim in world space
    const look2 = degToRad(t.angle) + t.tilt;
    const lx = Math.cos(look2) * 1.6;
    const ly = -Math.sin(look2) * 1.2;
    const f = t.facing;
    const ex = [f * 1.5 - 3.6, f * 1.5 + 3.6];
    const blink = t.blinkT < 0 || t.hurtT > 0.45;
    for (const x of ex) {
      if (t.hurtT > 0.45) {
        // squeezed "> <" eyes
        ctx.strokeStyle = '#1b1d22';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 2, -2);
        ctx.lineTo(x + 2, 0);
        ctx.lineTo(x - 2, 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, 0, 2.9, blink ? 0.6 : 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!blink) {
        ctx.fillStyle = '#1b1d22';
        ctx.beginPath();
        ctx.arc(x + lx, ly + 0.3, 1.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + lx + 0.5, ly - 0.4, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (o.enemyFace && t.hurtT <= 0.45) {
      // grumpy brows
      ctx.strokeStyle = '#1b1d22';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo((ex[0] as number) - 3, -4.6);
      ctx.lineTo((ex[0] as number) + 2.5, -3.2);
      ctx.moveTo((ex[1] as number) + 3, -4.6);
      ctx.lineTo((ex[1] as number) - 2.5, -3.2);
      ctx.stroke();
    }
    ctx.restore();
    // hats
    if (look === 'boss') {
      ctx.fillStyle = '#263238';
      roundRect(ctx, -12, ty - tr - 5, 24, 7, 3);
      ctx.fill();
      ctx.fillStyle = '#1c2429';
      roundRect(ctx, -15, ty - tr + 1, 30, 3.5, 1.5);
      ctx.fill();
      ctx.fillStyle = '#ffd54a';
      star(ctx, 0, ty - tr - 1.5, 3.2);
    } else if (look === 'light') {
      ctx.strokeStyle = '#2b2f36';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6 * t.facing, ty - tr + 3);
      ctx.lineTo(-10 * t.facing, ty - tr - 9);
      ctx.stroke();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(-10 * t.facing, ty - tr - 9, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (look === 'mortar') {
      ctx.fillStyle = '#6d4c41';
      ctx.beginPath();
      ctx.ellipse(0, ty - tr + 2, 9, 3.2, 0, Math.PI, 0);
      ctx.fill();
    }
  } else {
    // wreck: soot
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(-6, ty + 2, 5, 0, Math.PI * 2);
    ctx.arc(7, -12, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // shield bubble
  if (t.shield > 0 && !dead) {
    const pulse = 0.5 + 0.5 * Math.sin(o.time * 4);
    const r = 34 * s;
    const g = ctx.createRadialGradient(t.x, t.cy, r * 0.6, t.x, t.cy, r);
    g.addColorStop(0, 'rgba(90,210,255,0)');
    g.addColorStop(1, `rgba(90,210,255,${0.28 + pulse * 0.12})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(160,235,255,${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // muzzle flash
  if (t.muzzle > 0 && !dead) {
    const m = t.muzzlePos();
    const a = degToRad(t.angle);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m.x, m.y);
    ctx.rotate(-a);
    const k = t.muzzle;
    ctx.fillStyle = `rgba(255,220,120,${k})`;
    ctx.beginPath();
    ctx.moveTo(0, -6 * k);
    ctx.lineTo(26 * k * s, 0);
    ctx.lineTo(0, 6 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,230,${k})`;
    ctx.beginPath();
    ctx.arc(2, 0, 6 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Level objects
// ---------------------------------------------------------------------------

export function drawBlock(ctx: CanvasRenderingContext2D, b: Block): void {
  const metal = b.mat === 'metal';
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  if (metal) {
    g.addColorStop(0, '#8d99a6');
    g.addColorStop(0.5, '#c3ccd6');
    g.addColorStop(1, '#6f7b88');
  } else {
    g.addColorStop(0, '#8a8f98');
    g.addColorStop(1, '#6b707a');
  }
  ctx.fillStyle = g;
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.clip();
  if (metal) {
    ctx.fillStyle = 'rgba(40,50,60,0.55)';
    for (let y = b.y + 7; y < b.y + b.h - 3; y += 22) {
      for (let x = b.x + 6; x < b.x + b.w - 3; x += 22) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 2);
  } else {
    // stone bricks
    ctx.strokeStyle = 'rgba(40,40,45,0.4)';
    ctx.lineWidth = 1.2;
    let row = 0;
    for (let y = b.y + 14; y < b.y + b.h; y += 14, row++) {
      ctx.beginPath();
      ctx.moveTo(b.x, y);
      ctx.lineTo(b.x + b.w, y);
      ctx.stroke();
      for (let x = b.x + (row % 2 ? 10 : 22); x < b.x + b.w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 3);
  }
  ctx.restore();
}

export function drawWood(ctx: CanvasRenderingContext2D, w: Wood): void {
  ctx.fillStyle = '#b07a44';
  roundRect(ctx, w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1, 3);
  ctx.fill();
  ctx.strokeStyle = '#6d4523';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(109,69,35,0.8)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(w.x + 4, w.y + 4);
  ctx.lineTo(w.x + w.w - 4, w.y + w.h - 4);
  ctx.moveTo(w.x + w.w - 4, w.y + 4);
  ctx.lineTo(w.x + 4, w.y + w.h - 4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(w.x + 3, w.y + 3, w.w - 6, 2);
}

export function drawPad(ctx: CanvasRenderingContext2D, p: Pad, time: number): void {
  const sq = p.squash;
  const top = p.y + sq * 5;
  // legs
  ctx.strokeStyle = '#455a64';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x + 6, p.y + p.h);
  ctx.lineTo(p.x + 10, top + 4);
  ctx.moveTo(p.x + p.w - 6, p.y + p.h);
  ctx.lineTo(p.x + p.w - 10, top + 4);
  ctx.stroke();
  // spring zigzag
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const x = p.x + p.w / 2 + (i % 2 ? 6 : -6);
    ctx.lineTo(x, top + 4 + (i / 8) * (p.y + p.h - top - 4));
  }
  ctx.stroke();
  // mat
  const g = ctx.createLinearGradient(0, top, 0, top + 6);
  g.addColorStop(0, '#ff6ec7');
  g.addColorStop(1, '#c2185b');
  ctx.fillStyle = g;
  roundRect(ctx, p.x, top, p.w, 6, 3);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(time * 3)})`;
  ctx.fillRect(p.x + 6, top + 1, p.w - 12, 1.5);
}

export function drawPortal(ctx: CanvasRenderingContext2D, p: Portal, time: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, p.r * 1.6);
  g.addColorStop(0, `hsla(${p.hue},100%,80%,0.9)`);
  g.addColorStop(0.5, `hsla(${p.hue},90%,55%,0.45)`);
  g.addColorStop(1, `hsla(${p.hue},90%,50%,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `hsla(${p.hue + i * 25},100%,${70 - i * 10}%,${0.9 - i * 0.2})`;
    ctx.beginPath();
    const r = p.r - i * 6;
    const a0 = time * (2 + i) * (i % 2 ? -1 : 1);
    ctx.arc(0, 0, Math.max(2, r), a0, a0 + Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.fillStyle = `hsla(${p.hue},100%,20%,0.85)`;
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const CRATE_COLORS: Record<Crate['kind'], string> = { repair: '#43a047', shield: '#29b6f6', fuel: '#fb8c00', ammo: '#8e24aa' };

export function drawCrate(ctx: CanvasRenderingContext2D, c: Crate, time: number): void {
  const x = c.x;
  const y = c.y;
  const s = 26;
  const sway = c.chute ? Math.sin(time * 2 + c.id) * 0.12 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  if (c.chute) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-s / 2, -s);
    ctx.lineTo(-24, -58);
    ctx.moveTo(s / 2, -s);
    ctx.lineTo(24, -58);
    ctx.stroke();
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.ellipse(0, -58, 30, 18, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = CRATE_COLORS[c.kind];
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.ellipse(i * 15, -58, 7, 18, 0, Math.PI, 0);
      ctx.fill();
    }
  }
  // box
  ctx.fillStyle = '#c8955a';
  roundRect(ctx, -s / 2, -s, s, s, 4);
  ctx.fill();
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 2;
  ctx.stroke();
  // colored band + icon
  ctx.fillStyle = CRATE_COLORS[c.kind];
  roundRect(ctx, -s / 2 + 3, -s + 7, s - 6, 12, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  const cy = -s + 13;
  switch (c.kind) {
    case 'repair':
      ctx.fillRect(-1.5, cy - 4.5, 3, 9);
      ctx.fillRect(-4.5, cy - 1.5, 9, 3);
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, cy - 5);
      ctx.lineTo(4.5, cy - 3);
      ctx.lineTo(3.5, cy + 2);
      ctx.lineTo(0, cy + 5);
      ctx.lineTo(-3.5, cy + 2);
      ctx.lineTo(-4.5, cy - 3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'fuel':
      ctx.beginPath();
      ctx.moveTo(0, cy - 5);
      ctx.quadraticCurveTo(4.5, cy + 1, 0, cy + 5);
      ctx.quadraticCurveTo(-4.5, cy + 1, 0, cy - 5);
      ctx.fill();
      break;
    case 'ammo':
      star(ctx, 0, cy, 5);
      break;
  }
  // sparkle when landed
  if (c.landed) {
    const k = (Math.sin(time * 3 + c.id) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${0.5 * k})`;
    star(ctx, s / 2 - 2, -s + 1, 3 + 2 * k);
  }
  ctx.restore();
}

export function drawTarget(ctx: CanvasRenderingContext2D, t: Target, time: number): void {
  ctx.save();
  ctx.translate(t.x, t.y);
  switch (t.kind) {
    case 'balloon': {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, t.r);
      ctx.quadraticCurveTo(6 * Math.sin(time * 2 + t.hue), t.r + 20, 0, t.r + 40);
      ctx.stroke();
      const g = ctx.createRadialGradient(-t.r * 0.35, -t.r * 0.4, 2, 0, 0, t.r * 1.1);
      g.addColorStop(0, `hsl(${t.hue},90%,78%)`);
      g.addColorStop(1, `hsl(${t.hue},80%,48%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, t.r * 0.86, t.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${t.hue},80%,42%)`;
      ctx.beginPath();
      ctx.moveTo(-3, t.r - 1);
      ctx.lineTo(3, t.r - 1);
      ctx.lineTo(0, t.r + 4);
      ctx.fill();
      break;
    }
    case 'board': {
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(-2, t.r - 4, 4, 40);
      const rings = ['#ffffff', '#e53935', '#ffffff', '#e53935', '#ffd54a'];
      rings.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(0, 0, t.r * (1 - i * 0.19), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, t.r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'ufo': {
      ctx.fillStyle = 'rgba(160,255,230,0.18)';
      ctx.beginPath();
      ctx.moveTo(-6, 4);
      ctx.lineTo(6, 4);
      ctx.lineTo(18, 60);
      ctx.lineTo(-18, 60);
      ctx.fill();
      ctx.fillStyle = '#b0bec5';
      ctx.beginPath();
      ctx.ellipse(0, 0, t.r * 1.2, t.r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,240,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, -5, t.r * 0.5, t.r * 0.45, 0, Math.PI, 0);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = (Math.floor(time * 6) + i) % 2 ? '#ffeb3b' : '#ff5252';
        ctx.beginPath();
        ctx.arc(-t.r + 4 + i * ((t.r * 2 - 8) / 4), 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'bird': {
      const dir = t.vx >= 0 ? 1 : -1;
      const flap = Math.sin(time * 12 + t.hue) * 7;
      ctx.scale(dir, 1);
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.moveTo(11, -2);
      ctx.lineTo(18, 0);
      ctx.lineTo(11, 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(6, -3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(6.8, -3, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffa000';
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(-10, -8 - flap);
      ctx.lineTo(4, -3);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  const def = WEAPONS[p.weapon];
  const color = def.color;
  // trail
  const tr = p.trail;
  if (tr.length >= 4) {
    ctx.lineCap = 'round';
    const n = tr.length / 2;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.strokeStyle = p.weapon === 'dirt' ? `rgba(120,80,40,${k * 0.5})` : `rgba(255,255,255,${k * 0.42})`;
      ctx.lineWidth = p.r * 1.3 * k;
      ctx.beginPath();
      ctx.moveTo(tr[(i - 1) * 2] as number, tr[(i - 1) * 2 + 1] as number);
      ctx.lineTo(tr[i * 2] as number, tr[i * 2 + 1] as number);
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  // glow
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r * 3.2);
  g.addColorStop(0, 'rgba(255,240,200,0.55)');
  g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const ang = Math.atan2(p.vy, p.vx);
  if (p.weapon === 'homing') {
    ctx.rotate(ang);
    ctx.fillStyle = '#eceff1';
    roundRect(ctx, -9, -3, 16, 6, 3);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(7, -3);
    ctx.lineTo(12, 0);
    ctx.lineTo(7, 3);
    ctx.fill();
    ctx.fillStyle = `rgba(255,${150 + Math.random() * 80},40,0.9)`;
    ctx.beginPath();
    ctx.moveTo(-9, -2.5);
    ctx.lineTo(-16 - Math.random() * 6, 0);
    ctx.lineTo(-9, 2.5);
    ctx.fill();
  } else if (p.weapon === 'digger' && p.mode === 'dig') {
    ctx.rotate(ang);
    ctx.fillStyle = '#b0bec5';
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(10, 0);
    ctx.lineTo(-6, 5);
    ctx.fill();
  } else {
    const rg = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, 0.5, 0, 0, p.r);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.35, color);
    rg.addColorStop(1, shade(color.startsWith('#') ? color : '#ffd54a', -0.35));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    if (p.weapon === 'roller' || p.weapon === 'bouncer') {
      ctx.rotate(p.x * 0.08);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-p.r * 0.8, 0);
      ctx.lineTo(p.r * 0.8, 0);
      ctx.stroke();
    }
    if (p.weapon === 'cluster' && !p.sub) {
      const k = (Math.sin(time * 20) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${k})`;
      star(ctx, 0, 0, p.r * 0.7);
    }
    if (p.weapon === 'mega') {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 2 + Math.sin(time * 16) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
