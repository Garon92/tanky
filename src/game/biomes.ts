import type { BiomeId } from './types';

export interface Biome {
  id: BiomeId;
  name: string;
  night: boolean;
  gravity: number;
  sky: [string, string, string];
  /** Far and near background hill colours. */
  far: string;
  mid: string;
  /** Surface layer (grass/sand/snow). */
  top: string;
  topLight: string;
  /** Ground body gradient (upper → lower). */
  ground: [string, string];
  /** Dirt specks / strata tint. */
  speck: string;
  rock: string;
  water: string;
  sun: 'sun' | 'moon' | 'earth' | 'none';
  /** Ambient particles drifting in the air. */
  ambient: 'none' | 'snow' | 'dust' | 'ash' | 'fireflies' | 'pollen';
  stars: boolean;
}

export const BIOMES: Record<BiomeId, Biome> = {
  meadow: {
    id: 'meadow',
    name: 'Louka',
    night: false,
    gravity: 800,
    sky: ['#5fb8f5', '#a6dcff', '#e9f7ff'],
    far: '#9cc9e8',
    mid: '#7fbf8c',
    top: '#4caf50',
    topLight: '#8bdc5a',
    ground: ['#8a5a3b', '#4e3222'],
    speck: '#6f4630',
    rock: '#9e9e9e',
    water: '#3aa0e8',
    sun: 'sun',
    ambient: 'pollen',
    stars: false,
  },
  desert: {
    id: 'desert',
    name: 'Poušť',
    night: false,
    gravity: 800,
    sky: ['#ff9a5a', '#ffc98a', '#fff0cf'],
    far: '#e8a878',
    mid: '#d9a35f',
    top: '#e9c46a',
    topLight: '#fbe29b',
    ground: ['#d19a55', '#8f5d2c'],
    speck: '#b57e40',
    rock: '#b08968',
    water: '#3cb4c8',
    sun: 'sun',
    ambient: 'dust',
    stars: false,
  },
  snow: {
    id: 'snow',
    name: 'Sníh',
    night: false,
    gravity: 800,
    sky: ['#8ec5f2', '#c7e5fb', '#f4fbff'],
    far: '#b9d3ea',
    mid: '#9fb9cf',
    top: '#f4f8ff',
    topLight: '#ffffff',
    ground: ['#7f8ea6', '#46506a'],
    speck: '#9aa8bf',
    rock: '#6b778d',
    water: '#6fc3ec',
    sun: 'sun',
    ambient: 'snow',
    stars: false,
  },
  night: {
    id: 'night',
    name: 'Noc',
    night: true,
    gravity: 800,
    sky: ['#070b18', '#0e1630', '#1b2548'],
    far: '#1a2444',
    mid: '#16301f',
    top: '#2e8f3c',
    topLight: '#45b653',
    ground: ['#23602b', '#123a1a'],
    speck: '#1a4a22',
    rock: '#44505e',
    water: '#1d4f8a',
    sun: 'moon',
    ambient: 'fireflies',
    stars: true,
  },
  moon: {
    id: 'moon',
    name: 'Měsíc',
    night: true,
    gravity: 380,
    sky: ['#02030a', '#07091a', '#12152b'],
    far: '#2a2d3d',
    mid: '#3a3d4f',
    top: '#cfd2da',
    topLight: '#eef0f5',
    ground: ['#a4a8b4', '#5c606e'],
    speck: '#8a8e9b',
    rock: '#6f7382',
    water: '#555',
    sun: 'earth',
    ambient: 'none',
    stars: true,
  },
  volcano: {
    id: 'volcano',
    name: 'Sopka',
    night: true,
    gravity: 820,
    sky: ['#1a0a0a', '#4a1a12', '#b3471f'],
    far: '#3d1812',
    mid: '#2c1410',
    top: '#4a3b36',
    topLight: '#6d5750',
    ground: ['#3b2b27', '#1d1412'],
    speck: '#ff6a1f',
    rock: '#2a201e',
    water: '#ff5a1a',
    sun: 'none',
    ambient: 'ash',
    stars: false,
  },
};

export const BIOME_ORDER: BiomeId[] = ['meadow', 'desert', 'snow', 'night', 'moon', 'volcano'];
