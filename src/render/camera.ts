import { WORLD_H, WORLD_W } from '../game/constants';

/**
 * Fits the fixed logical world into the canvas (letterboxing is filled by the renderer),
 * plus trauma-based screen shake.
 *
 * On small screens (phones) the camera zooms in a little and pans horizontally to follow
 * the action (`follow()`), so tanks stay readable. On tablets/desktops the whole world is visible.
 */
export class Camera {
  cssW = 1;
  cssH = 1;
  dpr = 1;
  scale = 1;
  /** Scale that fits the whole world (before zoom). */
  fitScale = 1;
  offX = 0;
  offY = 0;
  private trauma = 0;
  shakeX = 0;
  shakeY = 0;
  private t = 0;
  enabled = true;
  /** World x at the centre of the view (used when zoomed). */
  cx = WORLD_W / 2;
  private targetCx = WORLD_W / 2;
  /** Horizontal world margin kept in the static caches (letterbox fill). */
  margin = 0;

  /** Screen space (CSS px) reserved for HUD at the top / bottom – used on tall (portrait) screens. */
  insetTop = 0;
  insetBottom = 0;
  /** Allow zooming on small screens. */
  allowZoom = true;

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    const availH = Math.max(1, this.cssH - this.insetTop - this.insetBottom);
    this.fitScale = Math.min(this.cssW / WORLD_W, availH / WORLD_H);
    // phones: zoom towards a comfortable minimum scale (at most 1.7×)
    const zoom = this.allowZoom && this.fitScale < 0.46 ? Math.min(1.7, 0.55 / this.fitScale) : 1;
    this.scale = this.fitScale * zoom;
    this.margin = Math.max(40, (this.cssW - WORLD_W * this.scale) / 2 / this.scale + 20);
    // anchor the world to the bottom of the free area: extra space goes to the sky (or the sky is cropped)
    this.offY = this.cssH - this.insetBottom - WORLD_H * this.scale;
    if (this.insetBottom === 0 && this.offY > 0 && this.cssH / this.cssW < 0.9) this.offY = (this.cssH - WORLD_H * this.scale) * 0.75;
    this.placeX();
  }

  get zoomed(): boolean {
    return WORLD_W * this.scale > this.cssW + 1;
  }

  /** Visible width in world units. */
  get viewW(): number {
    return this.cssW / this.scale;
  }

  private placeX(): void {
    if (!this.zoomed) {
      this.offX = (this.cssW - WORLD_W * this.scale) / 2;
      this.cx = WORLD_W / 2;
      return;
    }
    const half = this.viewW / 2;
    this.cx = Math.min(WORLD_W - half, Math.max(half, this.cx));
    this.offX = this.cssW / 2 - this.cx * this.scale;
  }

  /** Set the world x the camera should glide to (only matters when zoomed). */
  follow(x: number): void {
    this.targetCx = x;
  }

  /** Jump straight to the target (new world / resize). */
  snap(x: number): void {
    this.targetCx = x;
    this.cx = x;
    this.placeX();
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
    if (this.zoomed) {
      this.cx += (this.targetCx - this.cx) * (1 - Math.exp(-dt * 3.2));
      this.placeX();
    }
  }

  /** Apply world transform (world units → device pixels). */
  applyWorld(ctx: CanvasRenderingContext2D, shake = true): void {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.dpr * (this.offX + (shake ? this.shakeX : 0)), this.dpr * (this.offY + (shake ? this.shakeY : 0)));
  }

  /** Transform for the static world-strip caches (x = −margin at the canvas' left edge). */
  applyStrip(ctx: CanvasRenderingContext2D): void {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.dpr * this.margin * this.scale, this.dpr * this.offY);
  }

  /** Size in device px of the world-strip caches. */
  get stripSize(): { w: number; h: number } {
    return { w: Math.ceil((WORLD_W + this.margin * 2) * this.scale * this.dpr), h: Math.ceil(this.cssH * this.dpr) };
  }

  /** Device-px x where a strip cache must be drawn. */
  get stripX(): number {
    return this.dpr * (this.offX - this.margin * this.scale);
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

  /** The full world strip range covered by the static caches. */
  get strip(): { x0: number; x1: number; y0: number; y1: number } {
    return { x0: -this.margin, x1: WORLD_W + this.margin, y0: -this.offY / this.scale, y1: (this.cssH - this.offY) / this.scale };
  }
}
