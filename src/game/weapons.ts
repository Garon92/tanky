import type { WeaponId } from './types';

export type WeaponBehavior = 'shell' | 'triple' | 'bounce' | 'roll' | 'cluster' | 'dig' | 'dirt' | 'homing' | 'airstrike';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** One short sentence for kids. */
  desc: string;
  behavior: WeaponBehavior;
  damage: number;
  radius: number;
  /** Visual projectile radius. */
  size: number;
  color: string;
  /** Screen shake strength 0..1 on explosion. */
  shake: number;
  bounces?: number;
  count?: number;
  spreadDeg?: number;
  subCount?: number;
  subDamage?: number;
  subRadius?: number;
  digLen?: number;
  /** Relative rarity for crates / rewards (higher = more common). */
  weight: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  shell: {
    id: 'shell',
    name: 'Střela',
    desc: 'Obyčejná střela. Nikdy nedojde.',
    behavior: 'shell',
    damage: 34,
    radius: 36,
    size: 4.5,
    color: '#ffd54a',
    shake: 0.35,
    weight: 0,
  },
  big: {
    id: 'big',
    name: 'Velká bomba',
    desc: 'Velký výbuch, velká díra.',
    behavior: 'shell',
    damage: 52,
    radius: 66,
    size: 6.5,
    color: '#ff8a3d',
    shake: 0.7,
    weight: 10,
  },
  triple: {
    id: 'triple',
    name: 'Trojstřela',
    desc: 'Tři střely najednou do vějíře.',
    behavior: 'triple',
    damage: 22,
    radius: 30,
    size: 4,
    color: '#ffe066',
    shake: 0.3,
    count: 3,
    spreadDeg: 4.5,
    weight: 10,
  },
  bouncer: {
    id: 'bouncer',
    name: 'Skákačka',
    desc: 'Třikrát se odrazí, pak bouchne.',
    behavior: 'bounce',
    damage: 36,
    radius: 38,
    size: 6,
    color: '#7cf29c',
    shake: 0.4,
    bounces: 3,
    weight: 8,
  },
  roller: {
    id: 'roller',
    name: 'Válec',
    desc: 'Po dopadu se kutálí z kopce.',
    behavior: 'roll',
    damage: 40,
    radius: 42,
    size: 6.5,
    color: '#b0bec5',
    shake: 0.45,
    weight: 7,
  },
  cluster: {
    id: 'cluster',
    name: 'Ohňostroj',
    desc: 'Nahoře se rozprskne na pět barevných bombiček.',
    behavior: 'cluster',
    damage: 20,
    radius: 26,
    size: 5.5,
    color: '#ff6bd6',
    shake: 0.3,
    subCount: 5,
    subDamage: 19,
    subRadius: 28,
    weight: 6,
  },
  digger: {
    id: 'digger',
    name: 'Krtek',
    desc: 'Proleze zemí a vyhrabe tunel.',
    behavior: 'dig',
    damage: 30,
    radius: 30,
    size: 5,
    color: '#c58b5a',
    shake: 0.3,
    digLen: 190,
    weight: 6,
  },
  dirt: {
    id: 'dirt',
    name: 'Hlína',
    desc: 'Nasype kopec hlíny. Postav si zeď!',
    behavior: 'dirt',
    damage: 0,
    radius: 62,
    size: 7,
    color: '#a0703f',
    shake: 0.2,
    weight: 6,
  },
  homing: {
    id: 'homing',
    name: 'Chytrá raketa',
    desc: 'Za letu se sama natáčí k nepříteli.',
    behavior: 'homing',
    damage: 38,
    radius: 38,
    size: 5,
    color: '#5ad1ff',
    shake: 0.45,
    weight: 4,
  },
  mega: {
    id: 'mega',
    name: 'Megabomba',
    desc: 'Obrovský výbuch! Pozor, ať nejsi blízko.',
    behavior: 'shell',
    damage: 85,
    radius: 118,
    size: 9,
    color: '#ff4b4b',
    shake: 1,
    weight: 2,
  },
  airstrike: {
    id: 'airstrike',
    name: 'Nálet',
    desc: 'Kam dopadne, tam spadne pět bomb z nebe.',
    behavior: 'airstrike',
    damage: 0,
    radius: 0,
    size: 5,
    color: '#ffffff',
    shake: 0.1,
    subCount: 5,
    subDamage: 26,
    subRadius: 34,
    weight: 3,
  },
};

export const WEAPON_ORDER: WeaponId[] = [
  'shell',
  'big',
  'triple',
  'bouncer',
  'roller',
  'cluster',
  'digger',
  'dirt',
  'homing',
  'airstrike',
  'mega',
];

export type Inventory = Partial<Record<WeaponId, number>>;

export const INFINITE = 999;

export function defaultInventory(): Inventory {
  return { shell: INFINITE, big: 2, triple: 2, bouncer: 1, roller: 1, dirt: 1 };
}

/** Pick a random weapon (never shell) weighted by rarity. */
export function randomWeapon(r: () => number, exclude: WeaponId[] = []): WeaponId {
  const list = WEAPON_ORDER.filter((w) => WEAPONS[w].weight > 0 && !exclude.includes(w));
  const total = list.reduce((s, w) => s + WEAPONS[w].weight, 0);
  let x = r() * total;
  for (const w of list) {
    x -= WEAPONS[w].weight;
    if (x <= 0) return w;
  }
  return list[list.length - 1] as WeaponId;
}
