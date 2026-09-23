import type { Inventory } from './weapons';
import type { BiomeId, CrateKind, TankKind, Walls } from './types';

export interface LevelDef {
  id: number;
  name: string;
  biome: BiomeId;
  /** Short story line. */
  intro: string;
  /** What is new / how to win – for kids. */
  tip: string;
  terrain: { pts: [number, number][]; noise?: number; seed?: number; craters?: [number, number][] };
  player: { x: number; weapons?: Inventory; hp?: number };
  enemies: { kind: TankKind; x: number; weapons?: Inventory }[];
  /** Constant wind (accel). */
  wind?: number;
  /** Random wind per turn in ±range. */
  windRange?: number;
  gravity?: number;
  water?: number;
  walls?: Walls;
  /** y omitted → stands on the ground (h = visible height). */
  blocks?: { x: number; w: number; h: number; y?: number; mat?: 'stone' | 'metal' }[];
  woods?: { x: number; cols: number; rows: number }[];
  pads?: { x: number; w: number }[];
  portals?: { a: [number, number]; b: [number, number]; hue?: number }[];
  crates?: { x: number; kind: CrateKind }[];
  crateChance?: number;
  par: number;
  tutorial?: boolean;
}

export const WORLDS = [
  { id: 1, name: 'Louka', biome: 'meadow' as BiomeId, levels: [1, 2, 3] },
  { id: 2, name: 'Poušť', biome: 'desert' as BiomeId, levels: [4, 5, 6] },
  { id: 3, name: 'Sníh', biome: 'snow' as BiomeId, levels: [7, 8, 9] },
  { id: 4, name: 'Noc', biome: 'night' as BiomeId, levels: [10, 11, 12] },
  { id: 5, name: 'Měsíc a sopka', biome: 'moon' as BiomeId, levels: [13, 14, 15] },
  { id: 6, name: 'Výzvy', biome: 'volcano' as BiomeId, levels: [16, 17, 18, 19, 20] },
];

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'První výstřel',
    biome: 'meadow',
    intro: 'Tohle je cvičný tank. Nestřílí, takže si můžeš v klidu vyzkoušet míření.',
    tip: 'Natoč hlaveň, nastav sílu a vystřel. Tečka na zemi ukáže, kam jsi naposledy dopadl.',
    terrain: { pts: [[0, 600], [300, 612], [800, 585], [1300, 610], [1600, 598]], noise: 5, seed: 11 },
    player: { x: 260, weapons: { shell: 999 } },
    enemies: [{ kind: 'dummy', x: 1150 }],
    par: 2,
    tutorial: true,
  },
  {
    id: 2,
    name: 'Přes kopec',
    biome: 'meadow',
    intro: 'Kadet se schoval za kopec. Tenhle už střílí zpátky!',
    tip: 'Mezi vámi je kopec. Zvedni hlaveň výš a přidej sílu.',
    terrain: { pts: [[0, 620], [380, 605], [650, 470], [800, 400], [950, 470], [1220, 610], [1600, 620]], noise: 6, seed: 22 },
    player: { x: 220, weapons: { shell: 999, big: 1 } },
    enemies: [{ kind: 'cadet', x: 1360 }],
    par: 3,
  },
  {
    id: 3,
    name: 'Dva na jednoho',
    biome: 'meadow',
    intro: 'Dva kadeti na kopcích. Uprostřed leží bedna s dárkem.',
    tip: 'Sestřel nebo přejeď bednu a dostaneš odměnu. Jezdí se šipkami u paliva (nebo klávesami Q a E).',
    terrain: { pts: [[0, 560], [330, 600], [700, 650], [1000, 570], [1240, 470], [1600, 520]], noise: 6, seed: 33 },
    player: { x: 200, weapons: { shell: 999, triple: 2 } },
    enemies: [
      { kind: 'cadet', x: 1010 },
      { kind: 'cadet', x: 1420 },
    ],
    crates: [{ x: 620, kind: 'repair' }],
    par: 4,
  },
  {
    id: 4,
    name: 'Vítr v zádech',
    biome: 'desert',
    intro: 'V poušti fouká vítr. Vojín míří docela slušně.',
    tip: 'Šipka nahoře ukazuje vítr. Když fouká doprava, střela doletí dál.',
    terrain: { pts: [[0, 600], [200, 570], [400, 622], [600, 580], [800, 632], [1000, 580], [1200, 622], [1400, 572], [1600, 600]], noise: 4, seed: 44 },
    player: { x: 200, weapons: { shell: 999, big: 1, bouncer: 1 } },
    enemies: [{ kind: 'soldier', x: 1350 }],
    wind: 60,
    par: 3,
  },
  {
    id: 5,
    name: 'Pevnost',
    biome: 'desert',
    intro: 'Nepřátelé se opevnili na plošině za kamennou zdí.',
    tip: 'Kámen se rozbít nedá. Přestřel zeď vysokým obloukem.',
    terrain: { pts: [[0, 640], [480, 640], [780, 610], [980, 480], [1090, 452], [1600, 450]], noise: 3, seed: 55 },
    player: { x: 200, weapons: { shell: 999, big: 3, triple: 1 } },
    enemies: [
      { kind: 'soldier', x: 1260 },
      { kind: 'cadet', x: 1470 },
    ],
    blocks: [{ x: 1110, w: 34, h: 90 }],
    windRange: 45,
    par: 4,
  },
  {
    id: 6,
    name: 'Skákací pole',
    biome: 'desert',
    intro: 'V údolí stojí trampolíny. Minomet střílí vysoko do oblouku.',
    tip: 'Trampolína vystřelí střelu zpátky nahoru. Skákačka se odrazí třikrát!',
    terrain: { pts: [[0, 500], [300, 520], [560, 680], [1040, 680], [1300, 520], [1600, 500]], noise: 3, seed: 66 },
    player: { x: 180, weapons: { shell: 999, bouncer: 3, big: 1 } },
    enemies: [{ kind: 'mortar', x: 1430 }],
    blocks: [{ x: 1290, w: 30, h: 110 }],
    pads: [
      { x: 680, w: 90 },
      { x: 860, w: 90 },
    ],
    windRange: 30,
    par: 4,
  },
  {
    id: 7,
    name: 'Ledové údolí',
    biome: 'snow',
    intro: 'Na druhé straně údolí čeká Obr. Je velký a vydrží hodně.',
    tip: 'Velká bomba udělá velkou díru – a Obrovi pořádně ubere.',
    terrain: { pts: [[0, 420], [250, 440], [500, 620], [800, 760], [1100, 620], [1350, 440], [1600, 420]], noise: 6, seed: 77 },
    player: { x: 180, weapons: { shell: 999, big: 3, triple: 1 } },
    enemies: [{ kind: 'heavy', x: 1420 }],
    windRange: 50,
    par: 4,
  },
  {
    id: 8,
    name: 'Dřevěná hradba',
    biome: 'snow',
    intro: 'Za hradbou z dřevěných beden se krčí dva tanky.',
    tip: 'Dřevěné bedny se dají rozstřílet. Válec se kutálí po zemi až k cíli.',
    terrain: { pts: [[0, 600], [600, 612], [1000, 592], [1600, 602]], noise: 3, seed: 88 },
    player: { x: 200, weapons: { shell: 999, roller: 3, big: 2, triple: 1 }, hp: 110 },
    enemies: [
      { kind: 'soldier', x: 1210 },
      { kind: 'cadet', x: 1420 },
    ],
    woods: [{ x: 1030, cols: 2, rows: 5 }],
    windRange: 35,
    par: 5,
  },
  {
    id: 9,
    name: 'Lavina',
    biome: 'snow',
    intro: 'Nepřátelé stojí vysoko na útesu. Ty jsi dole.',
    tip: 'Když podkopeš zem pod tankem, spadne – a pád bolí! Zkus Krtka.',
    terrain: { pts: [[0, 700], [400, 692], [700, 610], [980, 430], [1180, 330], [1600, 305]], noise: 5, seed: 99 },
    player: { x: 260, weapons: { shell: 999, digger: 2, big: 2, triple: 2 }, hp: 110 },
    enemies: [
      { kind: 'sniper', x: 1260 },
      { kind: 'soldier', x: 1470 },
    ],
    windRange: 60,
    par: 5,
  },
  {
    id: 10,
    name: 'Kouzelné brány',
    biome: 'night',
    intro: 'Nepřítel se zavřel v kovovém bunkru. Ale má tam kouzelnou bránu…',
    tip: 'Co vletí do jedné brány, vyletí z druhé stejným směrem. Miř do té na obloze!',
    terrain: { pts: [[0, 600], [700, 600], [1100, 600], [1600, 600]], noise: 0, seed: 1010 },
    player: { x: 230, weapons: { shell: 999, triple: 2 } },
    enemies: [{ kind: 'soldier', x: 1400 }],
    blocks: [
      { x: 1250, y: 380, w: 26, h: 226, mat: 'metal' },
      { x: 1474, y: 380, w: 26, h: 226, mat: 'metal' },
      { x: 1250, y: 356, w: 250, h: 26, mat: 'metal' },
    ],
    portals: [{ a: [720, 320], b: [1300, 470], hue: 285 }],
    par: 3,
  },
  {
    id: 11,
    name: 'Jezero',
    biome: 'night',
    intro: 'Přes jezero na tebe míří Ostrostřelec. Je velmi přesný!',
    tip: 'Co spadne do vody, nevybuchne. Střílej přes jezero a buď rychlý.',
    terrain: { pts: [[0, 560], [350, 572], [520, 720], [1080, 720], [1250, 560], [1600, 552]], noise: 4, seed: 1111 },
    player: { x: 200, weapons: { shell: 999, big: 2, triple: 2 } },
    enemies: [{ kind: 'sniper', x: 1400 }],
    water: 650,
    crates: [{ x: 330, kind: 'shield' }],
    windRange: 40,
    par: 4,
  },
  {
    id: 12,
    name: 'Noční hlídka',
    biome: 'night',
    intro: 'Tři hlídky najednou. Z nebe občas spadne bedna.',
    tip: 'Nejdřív se zbav nejbližšího nepřítele. Bedny sbírej!',
    terrain: { pts: [[0, 580], [250, 540], [500, 622], [800, 520], [1100, 602], [1350, 540], [1600, 582]], noise: 6, seed: 1212 },
    player: { x: 150, weapons: { shell: 999, big: 2, triple: 2, cluster: 1 }, hp: 140 },
    enemies: [
      { kind: 'cadet', x: 720 },
      { kind: 'soldier', x: 1110 },
      { kind: 'mortar', x: 1480 },
    ],
    crateChance: 0.35,
    windRange: 60,
    par: 6,
  },
  {
    id: 13,
    name: 'Malý skok pro tank',
    biome: 'moon',
    intro: 'Na Měsíci je slabá gravitace. Všechno letí dál a pomaleji.',
    tip: 'Střely tu doletí mnohem dál – ubírej sílu!',
    terrain: { pts: [[0, 620], [500, 600], [800, 642], [1100, 590], [1600, 620]], noise: 5, seed: 1313, craters: [[520, 50], [900, 70], [1260, 45]] },
    player: { x: 200, weapons: { shell: 999, big: 2, bouncer: 2, triple: 1 }, hp: 120 },
    enemies: [
      { kind: 'soldier', x: 1150 },
      { kind: 'soldier', x: 1460 },
    ],
    crateChance: 0.25,
    par: 4,
  },
  {
    id: 14,
    name: 'Kráterové pole',
    biome: 'moon',
    intro: 'Mezi krátery se schovává Ostrostřelec a Obr.',
    tip: 'Chytrá raketa se za letu sama stáčí k nepříteli.',
    terrain: { pts: [[0, 560], [300, 620], [600, 560], [900, 640], [1200, 540], [1600, 600]], noise: 8, seed: 1414, craters: [[300, 60], [640, 55], [900, 80], [1050, 40]] },
    player: { x: 180, weapons: { shell: 999, homing: 2, big: 2, cluster: 1 }, hp: 120 },
    enemies: [
      { kind: 'sniper', x: 1000 },
      { kind: 'heavy', x: 1450 },
    ],
    portals: [{ a: [520, 260], b: [1150, 220], hue: 190 }],
    par: 5,
  },
  {
    id: 15,
    name: 'Generál',
    biome: 'volcano',
    intro: 'Obrovský Generál hlídá sopku. Tohle je poslední bitva!',
    tip: 'Generál vydrží hodně a má spoustu zbraní. Sbírej bedny a použij všechno!',
    terrain: { pts: [[0, 600], [340, 612], [560, 740], [760, 740], [960, 600], [1150, 452], [1600, 440]], noise: 5, seed: 1515 },
    player: { x: 180, weapons: { shell: 999, big: 3, mega: 1, homing: 2, triple: 3, cluster: 2 }, hp: 160 },
    enemies: [
      { kind: 'general', x: 1420 },
      { kind: 'cadet', x: 1240 },
    ],
    blocks: [{ x: 1170, w: 30, h: 60, mat: 'metal' }],
    water: 700,
    crateChance: 0.3,
    windRange: 40,
    par: 8,
  },
  // ---------------------------------------------------------------- bonus world: Výzvy
  {
    id: 16,
    name: 'Ostrovy',
    biome: 'meadow',
    intro: 'Tři ostrůvky uprostřed jezera. Na každém někdo čeká.',
    tip: 'Tank neumí plavat – do vody nejezdi. Bedny na ostrovech se hodí!',
    terrain: {
      pts: [[0, 560], [250, 562], [330, 700], [520, 720], [600, 568], [900, 560], [980, 720], [1200, 720], [1280, 566], [1600, 560]],
      noise: 4,
      seed: 1616,
    },
    player: { x: 150, weapons: { shell: 999, big: 2, triple: 2, bouncer: 1 }, hp: 120 },
    enemies: [
      { kind: 'soldier', x: 750 },
      { kind: 'mortar', x: 1450 },
    ],
    water: 655,
    pads: [{ x: 800, w: 70 }],
    crates: [{ x: 660, kind: 'shield' }],
    crateChance: 0.25,
    windRange: 40,
    par: 5,
  },
  {
    id: 17,
    name: 'Odrazná aréna',
    biome: 'desert',
    intro: 'Aréna s odraznými stěnami a vysokou kovovou zdí uprostřed.',
    tip: 'Okraje světa tu střely odrážejí zpátky. Zkus trefu od stěny!',
    terrain: { pts: [[0, 620], [400, 612], [800, 600], [1200, 612], [1600, 620]], noise: 5, seed: 1717 },
    player: { x: 250, weapons: { shell: 999, bouncer: 3, big: 2, homing: 1 }, hp: 120 },
    enemies: [
      { kind: 'soldier', x: 1250 },
      { kind: 'sniper', x: 1480 },
    ],
    blocks: [{ x: 785, w: 30, h: 250, mat: 'metal' }],
    walls: 'bounce',
    par: 5,
  },
  {
    id: 18,
    name: 'Krtčí noc',
    biome: 'night',
    intro: 'V noci se vyhrabali Krtci. Jejich válce se kutálí z kopců.',
    tip: 'Nasyp si před sebe kopec z Hlíny – válec se o něj zastaví.',
    terrain: { pts: [[0, 520], [300, 540], [600, 640], [850, 560], [1100, 480], [1350, 540], [1600, 470]], noise: 7, seed: 1818 },
    player: { x: 220, weapons: { shell: 999, dirt: 3, roller: 2, big: 2, digger: 1 }, hp: 130 },
    enemies: [
      { kind: 'digger', x: 1100 },
      { kind: 'digger', x: 1470 },
    ],
    crateChance: 0.2,
    windRange: 30,
    par: 6,
  },
  {
    id: 19,
    name: 'Vánice',
    biome: 'snow',
    intro: 'Sněhová bouře! Vítr je silný a každým tahem se mění.',
    tip: 'Než vystřelíš, podívej se na šipku větru nahoře.',
    terrain: { pts: [[0, 660], [420, 650], [700, 560], [900, 470], [1200, 452], [1600, 455]], noise: 5, seed: 1919 },
    player: { x: 240, weapons: { shell: 999, big: 2, triple: 3, homing: 2 }, hp: 130 },
    enemies: [
      { kind: 'sniper', x: 1180 },
      { kind: 'mortar', x: 1460 },
    ],
    windRange: 130,
    crateChance: 0.3,
    par: 6,
  },
  {
    id: 20,
    name: 'Návrat generála',
    biome: 'moon',
    intro: 'Generál se vrátil – tentokrát na Měsíci a s posilami!',
    tip: 'Poslední výzva. Na Měsíci letí střely daleko – použij všechno, co máš.',
    terrain: { pts: [[0, 600], [400, 620], [700, 580], [1000, 620], [1300, 540], [1600, 520]], noise: 7, seed: 2020, craters: [[560, 55], [850, 60]] },
    player: { x: 180, weapons: { shell: 999, big: 3, mega: 2, homing: 3, airstrike: 2, cluster: 2, triple: 3 }, hp: 180 },
    enemies: [
      { kind: 'heavy', x: 1150 },
      { kind: 'general', x: 1470 },
    ],
    portals: [{ a: [420, 250], b: [1000, 200], hue: 320 }],
    crateChance: 0.3,
    par: 8,
  },
];

export const levelById = (id: number): LevelDef | undefined => LEVELS.find((l) => l.id === id);

/** Highest playable level: one past the furthest level that has at least one star. */
export function unlockedLevel(stars: readonly number[]): number {
  let last = 0;
  stars.forEach((s, i) => {
    if ((s ?? 0) > 0) last = i + 1;
  });
  return Math.min(LEVELS.length, last + 1);
}

/** Stars for a won level: 3 = at most par shots, 2 = at most 1.5 × par, 1 = any win. */
export function starsFor(shots: number, par: number, won: boolean): number {
  if (!won) return 0;
  if (shots <= par) return 3;
  if (shots <= Math.ceil(par * 1.5)) return 2;
  return 1;
}
