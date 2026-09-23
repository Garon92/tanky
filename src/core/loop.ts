/**
 * Fixed-timestep game loop.
 * - `update(dt)` is always called with the same dt (SIM_DT) → deterministic physics, AI prediction == reality.
 * - `render(alpha, frameDt)` once per animation frame.
 * - Stops requesting frames while the document is hidden.
 */
export interface LoopHooks {
  update(dt: number): void;
  render(frameDt: number): void;
}

export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  /** Multiplier applied to simulated time (hit-stop, slow motion, fast-forward). */
  timeScale = 1;
  /** Skip this many seconds of simulation (hit stop). */
  private freeze = 0;

  constructor(
    private readonly hooks: LoopHooks,
    readonly step = 1 / 120,
    private readonly maxSteps = 16,
  ) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.halt();
      else if (this.running) this.kick();
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.kick();
  }

  stop(): void {
    this.running = false;
    this.halt();
  }

  hitStop(seconds: number): void {
    this.freeze = Math.max(this.freeze, seconds);
  }

  private kick(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private halt(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (!this.running) return;
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt > 0.1) frameDt = 0.1; // tab switch / hiccup guard
    if (frameDt < 0) frameDt = 0;
    let simDt = frameDt;
    if (this.freeze > 0) {
      const f = Math.min(this.freeze, simDt);
      this.freeze -= f;
      simDt -= f;
    }
    this.acc += simDt * this.timeScale;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.hooks.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    if (steps >= this.maxSteps) this.acc = 0;
    this.hooks.render(frameDt);
    if (this.running && !document.hidden) this.raf = requestAnimationFrame(this.frame);
  };
}
