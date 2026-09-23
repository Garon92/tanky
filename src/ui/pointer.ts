import { clamp, radToDeg } from '../core/math';
import type { Match } from '../game/match';
import type { Renderer } from '../render/renderer';

/**
 * Drag on the battlefield to aim: the barrel points at the finger/mouse,
 * distance from the tank sets the power. Mouse wheel fine-tunes power.
 */
export class PointerAim {
  private id: number | null = null;
  match: Match | null = null;
  onAim?: () => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('lostpointercapture', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') document.documentElement.dataset.input = 'touch';
    else if (e.pointerType === 'mouse') document.documentElement.dataset.input = 'mouse';
    const m = this.match;
    if (!m || !m.isHumanTurn || this.id !== null) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.id = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone (or synthetic) – aiming still works without capture */
    }
    e.preventDefault();
    this.apply(e);
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    this.apply(e);
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.renderer.pointer.active = false;
  };

  cancel(): void {
    this.id = null;
    this.renderer.pointer.active = false;
  }

  private apply(e: PointerEvent): void {
    const m = this.match;
    const t = m?.active;
    if (!m || !t || !m.isHumanTurn) {
      this.cancel();
      return;
    }
    const p = this.local(e);
    const w = this.renderer.cam.toWorld(p.x, p.y);
    const dx = w.x - t.pivotX;
    const dy = t.pivotY - w.y;
    let angle = radToDeg(Math.atan2(dy, dx));
    if (angle < 0) angle = dx >= 0 ? 0 : 180;
    const d = Math.hypot(dx, dy);
    const power = clamp((d - 30) / 3.6, 5, 100);
    m.setAim(angle, power);
    this.renderer.pointer.active = true;
    this.renderer.pointer.x = p.x;
    this.renderer.pointer.y = p.y;
    this.onAim?.();
  }

  private wheel = (e: WheelEvent): void => {
    const m = this.match;
    if (!m || !m.isHumanTurn) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.5 : 2;
    m.adjustPower(e.deltaY < 0 ? step : -step);
  };
}
