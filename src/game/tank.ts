import { clamp, degToRad } from '../core/math';
import { BARREL_LEN, TANK_H, TANK_HIT_R } from './constants';
import { defaultInventory, INFINITE, type Inventory } from './weapons';
import type { BotLevel, Control, TankKind, WeaponId } from './types';

export interface TankKindDef {
  kind: TankKind;
  name: string;
  /** Short description shown in level intros. */
  desc: string;
  hp: number;
  scale: number;
  /** Multiplies aiming error of bots (lower = more accurate). */
  aimError: number;
  /** Preferred launch angle band (degrees from horizontal, toward target). */
  preferAngle: [number, number];
  damageMul: number;
  fuel: number;
  loadout: Inventory;
  /** Visual style. */
  look: 'standard' | 'light' | 'heavy' | 'mortar' | 'sniper' | 'digger' | 'boss' | 'dummy';
  bodyColor?: string;
}

export const TANK_KINDS: Record<TankKind, TankKindDef> = {
  player: {
    kind: 'player',
    name: 'Ty',
    desc: 'Tvůj tank.',
    hp: 100,
    scale: 1,
    aimError: 1,
    preferAngle: [30, 70],
    damageMul: 1,
    fuel: 140,
    loadout: defaultInventory(),
    look: 'standard',
  },
  dummy: {
    kind: 'dummy',
    name: 'Cvičný tank',
    desc: 'Nestřílí. Ideální na trénink!',
    hp: 60,
    scale: 1,
    aimError: 1,
    preferAngle: [30, 60],
    damageMul: 0,
    fuel: 0,
    loadout: { shell: INFINITE },
    look: 'dummy',
    bodyColor: '#c9a86a',
  },
  cadet: {
    kind: 'cadet',
    name: 'Kadet',
    desc: 'Malý a ještě se učí mířit.',
    hp: 60,
    scale: 0.85,
    aimError: 2,
    preferAngle: [35, 60],
    damageMul: 0.7,
    fuel: 60,
    loadout: { shell: INFINITE },
    look: 'light',
    bodyColor: '#6cc070',
  },
  soldier: {
    kind: 'soldier',
    name: 'Vojín',
    desc: 'Obyčejný tank, míří slušně.',
    hp: 100,
    scale: 1,
    aimError: 1,
    preferAngle: [30, 65],
    damageMul: 1,
    fuel: 90,
    loadout: { shell: INFINITE, triple: 1 },
    look: 'standard',
    bodyColor: '#4bb3ff',
  },
  heavy: {
    kind: 'heavy',
    name: 'Obr',
    desc: 'Velký a odolný, ale pomalý.',
    hp: 170,
    scale: 1.25,
    aimError: 1.15,
    preferAngle: [25, 55],
    damageMul: 1.2,
    fuel: 40,
    loadout: { shell: INFINITE, big: 2 },
    look: 'heavy',
    bodyColor: '#8e7cc3',
  },
  mortar: {
    kind: 'mortar',
    name: 'Minomet',
    desc: 'Střílí vysoko do oblouku, přes všechno.',
    hp: 90,
    scale: 1,
    aimError: 1.05,
    preferAngle: [60, 82],
    damageMul: 1,
    fuel: 60,
    loadout: { shell: INFINITE, cluster: 2 },
    look: 'mortar',
    bodyColor: '#e0a030',
  },
  sniper: {
    kind: 'sniper',
    name: 'Ostrostřelec',
    desc: 'Míří velmi přesně, ale vydrží málo.',
    hp: 75,
    scale: 0.95,
    aimError: 0.6,
    preferAngle: [12, 45],
    damageMul: 1,
    fuel: 80,
    loadout: { shell: INFINITE, homing: 1 },
    look: 'sniper',
    bodyColor: '#3fc1a5',
  },
  digger: {
    kind: 'digger',
    name: 'Krtek',
    desc: 'Rád se zahrabává a posílá válce.',
    hp: 110,
    scale: 1,
    aimError: 1,
    preferAngle: [30, 60],
    damageMul: 1,
    fuel: 70,
    loadout: { shell: INFINITE, roller: 3, dirt: 2, digger: 2 },
    look: 'digger',
    bodyColor: '#b07a4a',
  },
  general: {
    kind: 'general',
    name: 'Generál',
    desc: 'Obrovský šéf se spoustou zbraní!',
    hp: 320,
    scale: 1.6,
    aimError: 0.8,
    preferAngle: [30, 70],
    damageMul: 1.15,
    fuel: 30,
    loadout: { shell: INFINITE, big: 3, triple: 3, mega: 1, cluster: 2, homing: 2 },
    look: 'boss',
    bodyColor: '#5c6370',
  },
};

export const TEAM_COLORS = ['#ff4b4b', '#4bb3ff', '#4cd964', '#ffc53d', '#b388ff', '#ff8fd1', '#40e0d0', '#ff9f43'];
export const TEAM_NAMES = ['Červený', 'Modrý', 'Zelený', 'Žlutý', 'Fialový', 'Růžový', 'Tyrkysový', 'Oranžový'];

let nextTankId = 1;

export class Tank {
  readonly id: number;
  name: string;
  team: number;
  color: string;
  kind: TankKind;
  def: TankKindDef;
  control: Control;
  botLevel: BotLevel;
  x: number;
  y = 0;
  vy = 0;
  falling = false;
  fallFrom = 0;
  /** Parachute: slow fall, no fall damage (survival drop-ins). */
  chute = false;
  tilt = 0;
  /** Absolute barrel angle in degrees: 0 = right, 90 = up, 180 = left. */
  angle: number;
  power = 55;
  hp: number;
  maxHp: number;
  shield = 0;
  fuel: number;
  maxFuel: number;
  inventory: Inventory;
  weapon: WeaponId = 'shell';
  alive = true;
  /** Guide line for this (human) tank – duel per-player toggle. */
  guide = true;
  // --- stats
  shots = 0;
  hits = 0;
  damageDealt = 0;
  damageTaken = 0;
  kills = 0;
  // --- visual state (not simulation critical)
  flash = 0;
  hurtT = 0;
  recoil = 0;
  muzzle = 0;
  treadPhase = 0;
  blinkT = 2;
  driving = 0;
  deathT = 0;
  /** Last damage source (tank id) for kill credit. */
  lastHitBy = -1;
  /** Round wins (duel). */
  wins = 0;
  /** Extra damage multiplier (campaign difficulty). */
  dmgMul = 1;

  constructor(opts: {
    x: number;
    team: number;
    kind?: TankKind;
    control?: Control;
    botLevel?: BotLevel;
    name?: string;
    color?: string;
    hp?: number;
    inventory?: Inventory;
  }) {
    this.id = nextTankId++;
    this.kind = opts.kind ?? 'player';
    this.def = TANK_KINDS[this.kind];
    this.team = opts.team;
    this.x = opts.x;
    this.control = opts.control ?? 'human';
    this.botLevel = opts.botLevel ?? 'normal';
    this.color = opts.color ?? this.def.bodyColor ?? TEAM_COLORS[opts.team % TEAM_COLORS.length] ?? '#ff4b4b';
    this.name = opts.name ?? this.def.name;
    this.maxHp = opts.hp ?? this.def.hp;
    this.hp = this.maxHp;
    this.maxFuel = this.def.fuel;
    this.fuel = this.maxFuel;
    this.inventory = { ...(opts.inventory ?? this.def.loadout) };
    this.angle = 45;
    this.blinkT = 1 + Math.random() * 3;
  }

  get scale(): number {
    return this.def.scale;
  }
  get hitR(): number {
    return TANK_HIT_R * this.def.scale;
  }
  /** Center of the hit circle. */
  get cy(): number {
    return this.y - TANK_H * 0.55 * this.def.scale;
  }
  /** Barrel pivot point (turret center). */
  get pivotX(): number {
    return this.x + Math.sin(this.tilt) * TANK_H * this.def.scale;
  }
  get pivotY(): number {
    return this.y - TANK_H * this.def.scale * Math.cos(this.tilt);
  }
  get barrelLen(): number {
    return BARREL_LEN * this.def.scale * (this.def.look === 'sniper' ? 1.25 : this.def.look === 'mortar' ? 0.8 : 1);
  }
  /** Muzzle position. */
  muzzlePos(): { x: number; y: number } {
    const a = degToRad(this.angle);
    return { x: this.pivotX + Math.cos(a) * this.barrelLen, y: this.pivotY - Math.sin(a) * this.barrelLen };
  }
  /** Facing direction for visuals: towards the barrel. */
  get facing(): 1 | -1 {
    return this.angle <= 90 ? 1 : -1;
  }
  ammo(w: WeaponId): number {
    return this.inventory[w] ?? 0;
  }
  hasAmmo(w: WeaponId): boolean {
    return this.ammo(w) > 0;
  }
  useAmmo(w: WeaponId): void {
    const n = this.ammo(w);
    if (n >= INFINITE) return;
    this.inventory[w] = Math.max(0, n - 1);
  }
  addAmmo(w: WeaponId, n: number): void {
    const cur = this.ammo(w);
    if (cur >= INFINITE) return;
    this.inventory[w] = cur + n;
  }
  setAngle(a: number): void {
    this.angle = clamp(a, 0, 180);
  }
  setPower(p: number): void {
    this.power = clamp(p, 5, 100);
  }
  get isBot(): boolean {
    return this.control === 'bot';
  }
}

/** Reset id counter (tests). */
export function resetTankIds(): void {
  nextTankId = 1;
}
