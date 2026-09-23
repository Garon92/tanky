export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const smoothstep = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
};
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const k = clamp(t, 0, 1) - 1;
  return 1 + c3 * k * k * k + c1 * k * k;
};
/** Approach `target` from `current` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
};
/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);

export interface Vec {
  x: number;
  y: number;
}
