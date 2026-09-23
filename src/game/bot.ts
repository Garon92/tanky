import { approach } from '../core/math';
import type { Rng } from '../core/rng';
import { LEVEL_PARAMS, planBot, type BotMemory, type BotPlan } from './ai';
import { ANGLE_SPEED_MAX, POWER_SPEED_MAX } from './constants';
import type { Tank } from './tank';
import type { World } from './world';

/** Drives one bot tank through a turn: think → (drive → re-think) → aim → fire. */
export class BotBrain {
  state: 'think' | 'drive' | 'aim' | 'settle' | 'done' = 'think';
  private gen: Generator<void, BotPlan> | null = null;
  plan: BotPlan | null = null;
  private t = 0;
  private minThink = 0.5;
  private moved = false;
  private stuck = 0;
  readonly mem: BotMemory = { lastTarget: null, streak: 0 };
  /** Speed multiplier (survival makes bots a bit snappier). */
  speed = 1;

  constructor(
    readonly tank: Tank,
    private rng: Rng,
  ) {}

  startTurn(world: World): void {
    this.state = 'think';
    this.t = 0;
    this.moved = false;
    this.stuck = 0;
    this.plan = null;
    this.minThink = (LEVEL_PARAMS[this.tank.botLevel].think + this.rng.range(-0.15, 0.25)) / this.speed;
    this.gen = planBot(world, this.tank, this.tank.botLevel, this.rng, this.mem);
  }

  /** Returns true when the bot wants to fire now. */
  update(world: World, dt: number): boolean {
    const t = this.tank;
    this.t += dt;
    switch (this.state) {
      case 'think': {
        if (this.gen) {
          const start = performance.now();
          // spend at most ~4 ms per frame thinking
          for (;;) {
            const r = this.gen.next();
            if (r.done) {
              this.plan = r.value;
              this.gen = null;
              break;
            }
            if (performance.now() - start > 4) break;
          }
        }
        if (!this.gen && this.plan && this.t >= this.minThink) {
          if (this.plan.moveTo !== null && !this.moved) this.state = 'drive';
          else {
            this.state = 'aim';
            if (t.hasAmmo(this.plan.weapon)) t.weapon = this.plan.weapon;
          }
          this.t = 0;
        }
        return false;
      }
      case 'drive': {
        const target = this.plan?.moveTo ?? t.x;
        const dir = target > t.x ? 1 : -1;
        const moved = Math.abs(target - t.x) < 2 ? 0 : world.drive(t, dir as 1 | -1, dt);
        if (moved === 0) this.stuck += dt;
        if (Math.abs(target - t.x) < 2 || this.stuck > 0.25 || t.fuel <= 0 || this.t > 4) {
          // re-plan from the new spot (no further driving)
          this.moved = true;
          this.state = 'think';
          this.t = 0;
          this.minThink = 0.25;
          if (!t.falling) this.gen = planBot(world, t, t.botLevel, this.rng, this.mem);
        }
        return false;
      }
      case 'aim': {
        if (!this.plan) return false;
        const k = LEVEL_PARAMS[t.botLevel].adjustSpeed * this.speed;
        // ease in like a human holding a key
        const ramp = Math.min(1, 0.35 + this.t * 1.4);
        t.setAngle(approach(t.angle, this.plan.angle, ANGLE_SPEED_MAX * k * ramp * dt));
        t.setPower(approach(t.power, this.plan.power, POWER_SPEED_MAX * k * ramp * dt));
        if (Math.abs(t.angle - this.plan.angle) < 0.05 && Math.abs(t.power - this.plan.power) < 0.05) {
          this.state = 'settle';
          this.t = 0;
        }
        return false;
      }
      case 'settle':
        if (this.t > 0.28 / this.speed) {
          this.state = 'done';
          return true;
        }
        return false;
      case 'done':
        return false;
    }
  }
}
