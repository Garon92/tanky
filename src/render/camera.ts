import { WORLD_H, WORLD_W } from '../game/constants';

/**
 * Fits the fixed logical world into the canvas (letterboxing is filled by the renderer),
 * plus trauma-based screen shake.
 */
export class Camera {
  cssW = 1;
  cssH = 1;
  dpr = 1;
  scale = 1;
  offX = 0;
  offY = 0;
  private trauma = 0;
  shakeX = 0;
  shakeY = 0;
  private t = 0;
  enabled = true;

  /** Screen space (CSS px) reserved for HUD at the top / bottom – used on tall (portrait) screens. */
  insetTop = 0;
  insetBottom = 0;

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    const availH = Math.max(1, this.cssH - this.insetTop - this.insetBottom);
    this.scale = Math.min(this.cssW / WORLD_W, availH / WORLD_H);
    this.offX = (this.cssW - WORLD_W * this.scale) / 2;
    // anchor the world to the bottom of the free area: extra space goes to the sky
    this.offY = this.cssH - this.insetBottom - WORLD_H * this.scale;
    if (this.insetBottom === 0 && this.offY > 0 && this.cssH / this.cssW < 0.9) this.offY = (this.cssH - WORLD_H * this.scale) * 0.75;
  }

  addTrauma(amount: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma;
    const max = 16;
    this.shakeX = s * max * (Math.sin(this.t * 71.3) * 0.6 + Math.sin(this.t * 37.1) * 0.4);
    this.shakeY = s * max * (Math.sin(this.t * 63.7 + 1.3) * 0.6 + Math.sin(this.t * 29.9 + 0.7) * 0.4);
  }

  /** Apply world transform (world units → device pixels). */
  applyWorld(ctx: CanvasRenderingContext2D, shake = true): void {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.dpr * (this.offX + (shake ? this.shakeX : 0)), this.dpr * (this.offY + (shake ? this.shakeY : 0)));
  }

  /** Screen (CSS px relative to canvas) → world. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.offX) / this.scale, y: (sy - this.offY) / this.scale };
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.scale + this.offX, y: wy * this.scale + this.offY };
  }

  /** Visible world rect (may extend beyond the world on letterboxed sides). */
  get view(): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: -this.offX / this.scale,
      y0: -this.offY / this.scale,
      x1: (this.cssW - this.offX) / this.scale,
      y1: (this.cssH - this.offY) / this.scale,
    };
  }
}
