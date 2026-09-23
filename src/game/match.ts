import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { Input, PressAction } from '../core/input';
import type { GuideLength } from '../core/storage';
import { BotBrain } from './bot';
import { ADJUST_ACCEL_TIME, ANGLE_SPEED_MAX, ANGLE_SPEED_START, POWER_SPEED_MAX, POWER_SPEED_START, WORLD_W } from './constants';
import type { Tank } from './tank';
import type { WeaponId } from './types';
import { WEAPON_ORDER, WEAPONS } from './weapons';
import type { World, WorldEvent } from './world';

export type ModeId = 'campaign' | 'duel' | 'survival' | 'targets' | 'demo';
export type Phase = 'intro' | 'aim' | 'flight' | 'roundEnd' | 'reward' | 'over';

export interface MatchSettings {
  guide: GuideLength;
  hints: boolean;
}

export interface ResultStat {
  label: string;
  value: string;
}

export interface ResultData {
  mode: ModeId;
  won: boolean | null;
  title: string;
  subtitle: string;
  color?: string;
  stars?: number;
  score?: number;
  best?: number;
  newBest?: boolean;
  stats: ResultStat[];
  table?: { name: string; color: string; cells: string[] }[];
  tableHead?: string[];
  canNext?: boolean;
}

export interface Announcement {
  text: string;
  sub?: string;
  color?: string;
  kind: 'turn' | 'round' | 'info' | 'good' | 'bad' | 'wave';
}

export interface HudInfo {
  title: string;
  /** e.g. "Vlna 3" or "Kolo 2 / do 3 výher" */
  subtitle: string;
  /** big number on the right (score / shots left) */
  counters: { label: string; value: string; icon: 'star' | 'shot' | 'wave' | 'trophy' | 'skull' | 'target' | 'tank' }[];
}

export interface RewardOption {
  id: string;
  title: string;
  desc: string;
  icon: WeaponId | 'repair' | 'shield' | 'fuel' | 'maxhp';
  apply: (t: Tank) => void;
}

export type TurnOutcome = 'continue' | 'roundOver' | 'over' | 'wait';

export abstract class Mode {
  abstract readonly id: ModeId;
  match!: Match;
  /** Build the first world. */
  abstract start(): void;
  onTurnStart(_t: Tank): void {}
  onWorldEvent(_e: WorldEvent): void {}
  /** Called when all motion settled after a shot. 'wait' = the mode switched phase itself (e.g. reward screen). */
  abstract afterTurn(): TurnOutcome;
  /** roundOver → set up next round (returns false = match is over). */
  nextRound(): boolean {
    return false;
  }
  abstract results(): ResultData;
  abstract hud(): HudInfo;
  guideRatio(_t: Tank): number {
    const g = this.match.settings.guide;
    return g === 'long' ? 1 : g === 'short' ? 0.38 : 0;
  }
  /** Order in which tanks take turns. */
  turnOrder(): Tank[] {
    return this.match.world.tanks;
  }
  /** Tutorial / contextual hint for the current human turn. */
  hint(): string | null {
    return null;
  }
  rewardOptions(): RewardOption[] {
    return [];
  }
  chooseReward(_i: number): void {}
  /** Seconds to wait in `intro` before the first turn. */
  introTime(): number {
    return 1.2;
  }
}

const ease = (held: number): number => {
  const k = clamp(held / ADJUST_ACCEL_TIME, 0, 1);
  return k * k;
};

export class Match {
  world!: World;
  phase: Phase = 'intro';
  phaseT = 0;
  active: Tank | null = null;
  turn = 0;
  round = 1;
  rng: Rng;
  brains = new Map<number, BotBrain>();
  /** Current turn result tracking. */
  private turnShooter: Tank | null = null;
  private turnHit = false;
  private turnDamage = 0;
  private flightT = 0;
  private settleT = 0;
  windRange = 0;
  windMode: 'fixed' | 'random' | 'drift' = 'fixed';
  crateChance = 0;
  /** Game time in seconds (for stats). */
  playTime = 0;
  result: ResultData | null = null;
  /** Aim was changed by the human this turn (tutorial). */
  aimTouched = { angle: false, power: false, fired: false };
  events: WorldEvent[] = [];
  onAnnounce?: (a: Announcement) => void;
  onOver?: (r: ResultData) => void;
  onReward?: (opts: RewardOption[]) => void;
  onTurn?: (t: Tank) => void;
  /** Bots think faster (survival/demo). */
  botSpeed = 1;
  lastImpact = new Map<number, { x: number; y: number; n: number }[]>();

  constructor(
    readonly mode: Mode,
    readonly settings: MatchSettings,
    seed?: number,
  ) {
    this.rng = new Rng(seed);
    mode.match = this;
  }

  begin(): void {
    this.mode.start();
    this.setPhase('intro');
  }

  setWorld(w: World): void {
    this.world = w;
    this.brains.clear();
    this.lastImpact.clear();
    for (const t of w.tanks) if (t.control === 'bot') this.brains.set(t.id, this.makeBrain(t));
  }

  private makeBrain(t: Tank): BotBrain {
    const b = new BotBrain(t, new Rng(this.rng.int(0, 1e9)));
    b.speed = this.botSpeed;
    return b;
  }

  brainFor(t: Tank): BotBrain {
    let b = this.brains.get(t.id);
    if (!b) {
      b = this.makeBrain(t);
      this.brains.set(t.id, b);
    }
    return b;
  }

  setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  announce(a: Announcement): void {
    this.onAnnounce?.(a);
  }

  get isHumanTurn(): boolean {
    return this.phase === 'aim' && !!this.active && this.active.control === 'human' && this.active.alive;
  }

  // ---------------------------------------------------------------------------
  // Turn cycle
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.phaseT += dt;
    if (this.phase !== 'over') this.playTime += dt;
    this.world.update(dt);
    // forward world events to mode + collect for renderer/audio
    if (this.world.events.length) {
      for (const e of this.world.events) {
        this.trackEvent(e);
        this.mode.onWorldEvent(e);
        this.events.push(e);
      }
      this.world.events.length = 0;
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= this.mode.introTime() && !this.world.isBusy()) this.nextTurn(true);
        break;
      case 'aim': {
        const t = this.active;
        if (!t || !t.alive || t.hp <= 0) {
          this.setPhase('flight');
          break;
        }
        if (t.control === 'bot') {
          const brain = this.brainFor(t);
          if (brain.update(this.world, dt)) this.fire();
        } else if (t.control === 'passive') {
          if (this.phaseT > 0.9) this.endTurnWithoutShot();
        }
        break;
      }
      case 'flight':
        this.flightT += dt;
        if (this.world.isBusy()) {
          this.settleT = 0;
          if (this.flightT > 25) {
            // safety valve: something is stuck
            this.world.projectiles.length = 0;
          }
        } else {
          this.settleT += dt;
          if (this.settleT > 0.55) this.resolveTurn();
        }
        break;
      case 'roundEnd':
        if (this.phaseT > 2.6) {
          if (this.mode.nextRound()) {
            this.round++;
            this.setPhase('intro');
          } else this.finish();
        }
        break;
      case 'reward':
      case 'over':
        break;
    }
  }

  private trackEvent(e: WorldEvent): void {
    if (e.t === 'damage' && this.turnShooter && e.by === this.turnShooter.id && e.tank.team !== this.turnShooter.team && e.amount > 0) {
      this.turnHit = true;
      this.turnDamage += e.amount;
    }
    if (e.t === 'explosion' && this.turnShooter && e.owner === this.turnShooter.id && e.kind !== 'death') {
      const list = this.lastImpact.get(e.owner) ?? [];
      list.push({ x: e.x, y: e.y, n: this.turnShooter.shots });
      while (list.length > 3) list.shift();
      this.lastImpact.set(e.owner, list);
    }
  }

  fire(): boolean {
    const t = this.active;
    if (!t || this.phase !== 'aim' || !t.alive) return false;
    this.world.fire(t);
    this.turnShooter = t;
    this.turnHit = false;
    this.turnDamage = 0;
    this.flightT = 0;
    this.settleT = 0;
    this.aimTouched.fired = true;
    this.setPhase('flight');
    return true;
  }

  private endTurnWithoutShot(): void {
    this.turnShooter = null;
    this.flightT = 0;
    this.settleT = 1;
    this.setPhase('flight');
  }

  private resolveTurn(): void {
    const shooter = this.turnShooter;
    if (shooter) {
      if (this.turnHit) shooter.hits++;
      if (shooter.control === 'human' && shooter.alive) {
        if (this.turnDamage > 0) this.announce({ text: this.turnDamage >= 45 ? 'Skvělý zásah!' : 'Zásah!', sub: `−${this.turnDamage}`, kind: 'good' });
      }
    }
    this.turnShooter = null;
    const r = this.mode.afterTurn();
    if (r === 'continue') this.nextTurn(false);
    else if (r === 'roundOver') this.setPhase('roundEnd');
    else if (r === 'over') this.finish();
  }

  finish(): void {
    if (this.phase === 'over') return;
    this.setPhase('over');
    this.active = null;
    this.result = this.mode.results();
    this.onOver?.(this.result);
  }

  /** Pick the next living tank and start its turn. */
  nextTurn(first: boolean): void {
    const order = this.mode.turnOrder().filter((t) => t.alive && t.hp > 0);
    if (order.length === 0) {
      this.finish();
      return;
    }
    let next: Tank;
    if (first || !this.active) {
      next = this.firstTank ?? (order[0] as Tank);
      if (!next.alive) next = order[0] as Tank;
      this.firstTank = null;
    } else {
      const all = this.mode.turnOrder();
      const idx = all.indexOf(this.active);
      next = order[0] as Tank;
      for (let k = 1; k <= all.length; k++) {
        const c = all[(idx + k) % all.length] as Tank;
        if (c.alive && c.hp > 0) {
          next = c;
          break;
        }
      }
    }
    this.active = next;
    this.turn++;
    this.aimTouched.angle = false;
    this.aimTouched.power = false;
    // wind
    if (this.windRange > 0) {
      if (this.windMode === 'random') this.world.wind = this.rng.range(-this.windRange, this.windRange);
      else if (this.windMode === 'drift') this.world.wind = clamp(this.world.wind + this.rng.gauss() * this.windRange * 0.35, -this.windRange, this.windRange);
    }
    // crates from the sky
    if (this.crateChance > 0 && this.turn > 1 && this.rng.chance(this.crateChance) && this.world.crates.filter((c) => c.alive).length < 3) {
      this.world.spawnCrate(this.rng.range(120, WORLD_W - 120));
    }
    if (!next.hasAmmo(next.weapon)) next.weapon = 'shell';
    this.mode.onTurnStart(next);
    if (next.control === 'bot') this.brainFor(next).startTurn(this.world);
    this.setPhase('aim');
    this.onTurn?.(next);
  }

  /** Tank that should start the next round/first turn (set by modes). */
  firstTank: Tank | null = null;

  // ---------------------------------------------------------------------------
  // Human control
  // ---------------------------------------------------------------------------

  applyHumanInput(input: Input, dt: number): void {
    const t = this.active;
    if (!t || !this.isHumanTurn) return;
    const fine = input.isHeld('fine') ? 0.3 : 1;
    const aSpeed = (h: number) => (ANGLE_SPEED_START + (ANGLE_SPEED_MAX - ANGLE_SPEED_START) * ease(h)) * fine * dt;
    const pSpeed = (h: number) => (POWER_SPEED_START + (POWER_SPEED_MAX - POWER_SPEED_START) * ease(h)) * fine * dt;
    if (input.isHeld('aimLeft')) this.adjustAngle(aSpeed(input.heldFor('aimLeft')));
    if (input.isHeld('aimRight')) this.adjustAngle(-aSpeed(input.heldFor('aimRight')));
    if (input.isHeld('powerUp')) this.adjustPower(pSpeed(input.heldFor('powerUp')));
    if (input.isHeld('powerDown')) this.adjustPower(-pSpeed(input.heldFor('powerDown')));
    if (input.padAxes.x !== 0) this.adjustAngle(-input.padAxes.x * ANGLE_SPEED_MAX * 0.8 * Math.abs(input.padAxes.x) * dt);
    if (input.padAxes.y !== 0) this.adjustPower(-input.padAxes.y * POWER_SPEED_MAX * 0.7 * Math.abs(input.padAxes.y) * dt);
    if (input.isHeld('driveLeft') && !input.isHeld('driveRight')) this.world.drive(t, -1, dt);
    else if (input.isHeld('driveRight') && !input.isHeld('driveLeft')) this.world.drive(t, 1, dt);
  }

  adjustAngle(d: number): void {
    const t = this.active;
    if (!t || !this.isHumanTurn) return;
    t.setAngle(t.angle + d);
    this.aimTouched.angle = true;
  }

  adjustPower(d: number): void {
    const t = this.active;
    if (!t || !this.isHumanTurn) return;
    t.setPower(t.power + d);
    this.aimTouched.power = true;
  }

  setAim(angle: number, power: number): void {
    const t = this.active;
    if (!t || !this.isHumanTurn) return;
    if (Math.abs(angle - t.angle) > 0.5) this.aimTouched.angle = true;
    if (Math.abs(power - t.power) > 0.5) this.aimTouched.power = true;
    t.setAngle(angle);
    t.setPower(power);
  }

  /** Weapons the active tank can use, in display order. */
  availableWeapons(t: Tank | null = this.active): WeaponId[] {
    if (!t) return [];
    return WEAPON_ORDER.filter((w) => t.hasAmmo(w));
  }

  selectWeapon(w: WeaponId): void {
    const t = this.active;
    if (!t || !this.isHumanTurn || !t.hasAmmo(w)) return;
    t.weapon = w;
  }

  cycleWeapon(dir: 1 | -1): void {
    const t = this.active;
    if (!t || !this.isHumanTurn) return;
    const list = this.availableWeapons(t);
    const i = list.indexOf(t.weapon);
    const n = list[(i + dir + list.length) % list.length];
    if (n) t.weapon = n;
  }

  handlePress(a: PressAction): void {
    if (!this.isHumanTurn) return;
    if (a === 'fire') this.fire();
    else if (a === 'nextWeapon') this.cycleWeapon(1);
    else if (a === 'prevWeapon') this.cycleWeapon(-1);
    else if (a.startsWith('weapon')) {
      const i = Number(a.slice(6)) - 1;
      const w = this.availableWeapons()[i];
      if (w) this.selectWeapon(w);
    }
  }

  guideRatio(t: Tank): number {
    return this.mode.guideRatio(t);
  }

  weaponName(w: WeaponId): string {
    return WEAPONS[w].name;
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
