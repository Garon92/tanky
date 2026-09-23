/**
 * Persistent save data on top of the kit store (`g92:tanky:<key>` in localStorage).
 * Every key is merged onto its defaults on load, so older / partial data never crashes the game.
 * (The pre-2026 version of Tanky stored nothing, so there is nothing to migrate.)
 */
import { createStore, type Store } from '../kit/store';

export type GuideLength = 'off' | 'short' | 'long';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DuelSlotSave {
  control: 'human' | 'easy' | 'normal' | 'hard' | 'off';
  guide: boolean;
}

export interface SaveData {
  campaign: { stars: number[]; bestShots: number[]; difficulty: Difficulty; last: number };
  survival: { bestScore: number; bestWave: number };
  targets: { bestScore: number };
  duel: {
    slots: DuelSlotSave[];
    rounds: number;
    hp: 'onehit' | 'normal' | 'tough';
    wind: 'off' | 'weak' | 'strong';
    crates: boolean;
    biome: string;
    walls: 'open' | 'bounce';
  };
  prefs: { guide: GuideLength; shake: boolean; hints: boolean };
  stats: { shots: number; hits: number; kills: number; games: number; wins: number };
  seenHelp: boolean;
}

export const defaultSave = (): SaveData => ({
  campaign: { stars: [], bestShots: [], difficulty: 'normal', last: 1 },
  survival: { bestScore: 0, bestWave: 0 },
  targets: { bestScore: 0 },
  duel: {
    slots: [
      { control: 'human', guide: true },
      { control: 'normal', guide: false },
      { control: 'off', guide: false },
      { control: 'off', guide: false },
    ],
    rounds: 3,
    hp: 'normal',
    wind: 'weak',
    crates: true,
    biome: 'random',
    walls: 'open',
  },
  prefs: { guide: 'short', shake: true, hints: true },
  stats: { shots: 0, hits: 0, kills: 0, games: 0, wins: 0 },
  seenHelp: false,
});

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge `src` onto `base`, keeping only keys that exist in base and values of the same type. */
export function mergeDefaults<T>(base: T, src: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(src) ? src : base) as T;
  if (isObj(base)) {
    if (!isObj(src)) return base;
    const out: Record<string, unknown> = { ...base };
    for (const k of Object.keys(base)) if (k in src) out[k] = mergeDefaults((base as Record<string, unknown>)[k], src[k]);
    return out as T;
  }
  return (typeof src === typeof base && src !== null && src !== undefined ? src : base) as T;
}

type Keys = keyof SaveData;

export class Save {
  data: SaveData;
  private store: Store<SaveData & Record<string, unknown>>;

  constructor() {
    const defaults = defaultSave();
    this.store = createStore<SaveData & Record<string, unknown>>('tanky', { version: 1, defaults: defaults as SaveData & Record<string, unknown> });
    const d = defaultSave();
    for (const k of Object.keys(d) as Keys[]) (d as unknown as Record<string, unknown>)[k] = mergeDefaults(d[k], this.store.get(k));
    while (d.duel.slots.length < 4) d.duel.slots.push({ control: 'off', guide: false });
    d.duel.slots = d.duel.slots.slice(0, 4);
    this.data = d;
  }

  /** Persist one or more sections. */
  commit(...keys: Keys[]): void {
    const list = keys.length ? keys : (Object.keys(this.data) as Keys[]);
    for (const k of list) this.store.set(k, this.data[k] as never);
  }

  update<K extends Keys>(key: K, fn: (v: SaveData[K]) => void): void {
    fn(this.data[key]);
    this.commit(key);
  }

  resetAll(): void {
    this.data = defaultSave();
    this.commit();
  }

  get totalStars(): number {
    return this.data.campaign.stars.reduce((s, n) => s + (n || 0), 0);
  }
}
