export type BiomeId = 'meadow' | 'desert' | 'snow' | 'night' | 'moon' | 'volcano';
export type WeaponId =
  | 'shell'
  | 'big'
  | 'triple'
  | 'bouncer'
  | 'roller'
  | 'cluster'
  | 'digger'
  | 'dirt'
  | 'homing'
  | 'mega'
  | 'airstrike';
export type TankKind = 'player' | 'dummy' | 'cadet' | 'soldier' | 'heavy' | 'mortar' | 'sniper' | 'digger' | 'general';
export type Control = 'human' | 'bot' | 'passive';
export type BotLevel = 'easy' | 'normal' | 'hard';
export type CrateKind = 'repair' | 'shield' | 'fuel' | 'ammo';
export type Walls = 'open' | 'bounce';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Block extends Rect {
  id: number;
  mat: 'stone' | 'metal';
}

export interface Wood extends Rect {
  id: number;
  alive: boolean;
  vy: number;
  hp: number;
}

export interface Pad extends Rect {
  id: number;
  squash: number;
}

export interface Portal {
  id: number;
  x: number;
  y: number;
  r: number;
  pair: number;
  hue: number;
}

export interface Crate {
  id: number;
  x: number;
  y: number;
  vy: number;
  kind: CrateKind;
  weapon: WeaponId | null;
  amount: number;
  landed: boolean;
  chute: boolean;
  alive: boolean;
  t: number;
}

export type TargetKind = 'balloon' | 'board' | 'ufo' | 'bird';
export interface Target {
  id: number;
  kind: TargetKind;
  x: number;
  y: number;
  r: number;
  vx: number;
  baseY: number;
  points: number;
  alive: boolean;
  t: number;
  hue: number;
}

export interface Projectile {
  id: number;
  weapon: WeaponId;
  owner: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  radius: number;
  bounces: number;
  mode: 'fly' | 'roll' | 'dig';
  /** Signed speed along the surface while rolling. */
  rollV: number;
  rollSlow: number;
  digLeft: number;
  /** Last x where the digger carved (NaN before the first dig). */
  digLastX: number;
  digLastY: number;
  age: number;
  portalCd: number;
  split: boolean;
  sub: boolean;
  alive: boolean;
  /** Recent positions for the trail (x,y pairs, newest last). */
  trail: number[];
  apexY: number;
}
