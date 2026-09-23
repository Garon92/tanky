import { clamp } from '../core/math';
import type { DuelSlotSave } from '../core/storage';
import { BIOMES } from './biomes';
import { WORLD_W } from './constants';
import { levelById, LEVELS, starsFor, type LevelDef } from './levels';
import { buildLevel, flattestNear, randomMap, windMaxFor } from './mapgen';
import { Mode, type HudInfo, type ResultData, type RewardOption, type TurnOutcome } from './match';
import { Tank, TEAM_COLORS, TEAM_NAMES } from './tank';
import type { BiomeId, BotLevel, TankKind, Target, TargetKind, WeaponId } from './types';
import { defaultInventory, INFINITE, WEAPONS } from './weapons';
import type { WorldEvent } from './world';

const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)} %` : '–');

// =============================================================================
// Campaign
// =============================================================================

export class CampaignMode extends Mode {
  readonly id = 'campaign' as const;
  def: LevelDef;
  player!: Tank;
  private tutorialStep = 0;
  private missed = 0;

  constructor(
    levelId: number,
    readonly difficulty: BotLevel,
    readonly playerName: string,
    readonly prevStars: number,
  ) {
    super();
    this.def = levelById(levelId) ?? (LEVELS[0] as LevelDef);
  }

  start(): void {
    const { world, player } = buildLevel(this.def, this.difficulty, this.playerName);
    this.player = player;
    this.match.setWorld(world);
    this.match.firstTank = player;
    if (this.def.windRange) {
      this.match.windRange = this.def.windRange;
      this.match.windMode = 'drift';
      world.wind = this.match.rng.range(-this.def.windRange, this.def.windRange);
    }
    this.match.crateChance = this.def.crateChance ?? 0;
  }

  override introTime(): number {
    return 1.6;
  }

  afterTurn(): TurnOutcome {
    const w = this.match.world;
    if (!this.player.alive || this.player.hp <= 0) return 'over';
    if (!w.tanks.some((t) => t.team !== 0 && t.alive && t.hp > 0)) return 'over';
    if (this.def.tutorial && this.match.active === this.player && this.player.damageDealt === 0) this.missed++;
    return 'continue';
  }

  get won(): boolean {
    return this.player.alive && this.player.hp > 0 && !this.match.world.tanks.some((t) => t.team !== 0 && t.alive && t.hp > 0);
  }

  results(): ResultData {
    const won = this.won;
    const shots = this.player.shots;
    const stars = starsFor(shots, this.def.par, won);
    return {
      mode: 'campaign',
      won,
      title: won ? (stars === 3 ? 'Perfektní!' : 'Vítězství!') : 'Tentokrát to nevyšlo',
      subtitle: won
        ? this.def.id === LEVELS.length
          ? 'Celé tažení je hotové – jsi skutečný velitel!'
          : `Úroveň ${this.def.id}: ${this.def.name}`
        : 'Zkus to znovu – příště to dáš!',
      stars,
      canNext: won && this.def.id < LEVELS.length,
      stats: [
        { label: 'Výstřely', value: String(shots) },
        { label: 'Na ★★★', value: `≤ ${this.def.par}` },
        { label: 'Zásahy', value: `${this.player.hits}/${shots}` },
        { label: 'Životy', value: `${Math.max(0, Math.round(this.player.hp))}` },
      ],
    };
  }

  hud(): HudInfo {
    const enemies = this.match.world.tanks.filter((t) => t.team !== 0 && t.alive).length;
    return {
      title: `${this.def.id}. ${this.def.name}`,
      subtitle: '',
      counters: [
        { label: 'Výstřely', value: `${this.player.shots}`, icon: 'shot' },
        { label: 'Nepřátelé', value: String(enemies), icon: 'tank' },
      ],
    };
  }

  override hint(): string | null {
    if (!this.match.settings.hints) return null;
    if (!this.def.tutorial) {
      if (this.def.id <= 3 && this.match.turn <= 2 && this.match.active === this.player && !this.match.aimTouched.fired) return this.def.tip;
      return null;
    }
    const a = this.match.aimTouched;
    if (this.match.active !== this.player) return null;
    if (this.tutorialStep === 0 && a.angle) this.tutorialStep = 1;
    if (this.tutorialStep === 1 && a.power) this.tutorialStep = 2;
    if (this.tutorialStep <= 2 && a.fired) this.tutorialStep = 3;
    switch (this.tutorialStep) {
      case 0:
        return 'aim';
      case 1:
        return 'power';
      case 2:
        return 'fire';
      default:
        return this.missed > 0 && !a.fired ? 'adjust' : null;
    }
  }
}

// =============================================================================
// Duel (2–4 players, humans and bots)
// =============================================================================

export interface DuelConfig {
  slots: DuelSlotSave[];
  rounds: number;
  hp: 'onehit' | 'normal' | 'tough';
  wind: 'off' | 'weak' | 'strong';
  crates: boolean;
  biome: BiomeId | 'random';
  walls: 'open' | 'bounce';
}

export class DuelMode extends Mode {
  readonly id: 'duel' | 'demo' = 'duel';
  tanks: Tank[] = [];
  lastWinner: Tank | null = null;
  roundDraw = false;

  constructor(readonly cfg: DuelConfig) {
    super();
  }

  start(): void {
    const active = this.cfg.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.control !== 'off');
    let humanN = 0;
    this.tanks = active.map(({ s, i }) => {
      const bot = s.control !== 'human';
      const t = new Tank({
        x: 0,
        team: i,
        kind: 'player',
        control: bot ? 'bot' : 'human',
        botLevel: bot ? (s.control as BotLevel) : 'normal',
        name: bot ? `${TEAM_NAMES[i]} bot` : (TEAM_NAMES[i] ?? `Hráč ${++humanN}`),
        color: TEAM_COLORS[i],
      });
      t.guide = !bot && s.guide;
      return t;
    });
    this.match.firstTank = this.match.rng.pick(this.tanks);
    this.setupRound();
  }

  private hpFor(): number {
    return this.cfg.hp === 'tough' ? 160 : 100;
  }

  protected setupRound(): void {
    const { world, spawns } = randomMap({
      biome: this.cfg.biome,
      slots: this.tanks.length,
      wind: this.cfg.wind,
      walls: this.cfg.walls,
      seed: this.match.rng.int(0, 1e9),
      obstacles: true,
    });
    world.oneHit = this.cfg.hp === 'onehit';
    // shuffle who spawns where each round
    const order = this.match.rng.shuffle(this.tanks.slice());
    order.forEach((t, i) => {
      t.x = spawns[i] as number;
      t.alive = true;
      t.maxHp = this.hpFor();
      t.hp = t.maxHp;
      t.shield = 0;
      t.fuel = t.maxFuel = 120;
      t.inventory = defaultInventory();
      t.weapon = 'shell';
      t.deathT = 0;
      t.lastHitBy = -1;
      t.chute = false;
      world.addTank(t);
      t.angle = t.x < WORLD_W / 2 ? 45 : 135;
    });
    this.match.setWorld(world);
    const windMax = windMaxFor(this.cfg.wind);
    this.match.windRange = windMax;
    this.match.windMode = 'drift';
    this.match.crateChance = this.cfg.crates ? 0.3 : 0;
  }

  afterTurn(): TurnOutcome {
    const aliveTeams = new Set(this.tanks.filter((t) => t.alive && t.hp > 0).map((t) => t.team));
    if (aliveTeams.size > 1) return 'continue';
    const winner = this.tanks.find((t) => t.alive && t.hp > 0) ?? null;
    this.lastWinner = winner;
    this.roundDraw = !winner;
    if (winner) {
      winner.wins++;
      this.match.announce({ text: `${winner.name} vyhrává kolo!`, sub: this.scoreLine(), color: winner.color, kind: 'round' });
    } else this.match.announce({ text: 'Remíza!', sub: 'Nikdo nepřežil', kind: 'round' });
    if (winner && winner.wins >= this.cfg.rounds) return 'over';
    return 'roundOver';
  }

  scoreLine(): string {
    return this.tanks.map((t) => t.wins).join(' : ');
  }

  override nextRound(): boolean {
    // the tank after the winner starts (in a 1v1 the loser starts, like the original)
    const idx = this.lastWinner ? this.tanks.indexOf(this.lastWinner) : -1;
    this.match.firstTank = this.tanks[(idx + 1) % this.tanks.length] ?? null;
    this.setupRound();
    this.match.announce({ text: `Kolo ${this.match.round + 1}`, sub: `${BIOMES[this.match.world.biome].name} · ${this.scoreLine()}`, kind: 'round' });
    return true;
  }

  override turnOrder(): Tank[] {
    return this.tanks;
  }

  override guideRatio(t: Tank): number {
    if (!t.guide) return 0;
    // the original handicap: +20 % of the path for each round behind, −20 % for each round ahead
    const others = this.tanks.filter((o) => o !== t).map((o) => o.wins);
    const lead = t.wins - Math.max(0, ...others);
    return clamp(0.5 * (1 - 0.2 * lead), 0.12, 1);
  }

  results(): ResultData {
    const w = this.lastWinner;
    const humans = this.tanks.filter((t) => t.control === 'human');
    const humanWon = !!w && w.control === 'human';
    return {
      mode: 'duel',
      won: humans.length === 1 ? humanWon : null,
      title: w ? `${w.name} vítězí!` : 'Remíza!',
      subtitle: `Výsledek ${this.scoreLine()}`,
      color: w?.color,
      stats: [],
      tableHead: ['Výhry', 'Výstřely', 'Přesnost', 'Poškození'],
      table: this.tanks.map((t) => ({ name: t.name, color: t.color, cells: [String(t.wins), String(t.shots), pct(t.hits, t.shots), String(t.damageDealt)] })),
    };
  }

  hud(): HudInfo {
    return {
      title: 'Souboj',
      subtitle: `Kolo ${this.match.round} · hraje se na ${this.cfg.rounds} ${this.cfg.rounds === 1 ? 'výhru' : this.cfg.rounds < 5 ? 'výhry' : 'výher'}`,
      counters: [],
    };
  }
}

/** Endless bot-vs-bot duel behind the start screen. */
export class DemoMode extends DuelMode {
  override readonly id = 'demo' as const;
  constructor() {
    super({
      slots: [
        { control: 'normal', guide: false },
        { control: 'hard', guide: false },
        { control: 'off', guide: false },
        { control: 'off', guide: false },
      ],
      rounds: 999,
      hp: 'normal',
      wind: 'weak',
      crates: true,
      biome: 'random',
      walls: 'open',
    });
  }
  override afterTurn(): TurnOutcome {
    const alive = new Set(this.tanks.filter((t) => t.alive && t.hp > 0).map((t) => t.team));
    if (alive.size > 1) return 'continue';
    this.lastWinner = this.tanks.find((t) => t.alive && t.hp > 0) ?? null;
    return 'roundOver';
  }
  override nextRound(): boolean {
    const idx = this.lastWinner ? this.tanks.indexOf(this.lastWinner) : -1;
    this.match.firstTank = this.tanks[(idx + 1) % this.tanks.length] ?? null;
    for (const t of this.tanks) {
      t.shots = t.hits = t.damageDealt = 0;
    }
    this.setupRound();
    return true;
  }
}

// =============================================================================
// Survival
// =============================================================================

const WAVE_POOL: { kind: TankKind; from: number; tier: number }[] = [
  { kind: 'cadet', from: 1, tier: 1 },
  { kind: 'soldier', from: 2, tier: 2 },
  { kind: 'mortar', from: 4, tier: 2 },
  { kind: 'digger', from: 5, tier: 2 },
  { kind: 'heavy', from: 5, tier: 3 },
  { kind: 'sniper', from: 6, tier: 3 },
];

export class SurvivalMode extends Mode {
  readonly id = 'survival' as const;
  player!: Tank;
  wave = 0;
  score = 0;
  kills = 0;
  private offered: RewardOption[] = [];
  private biomeIdx = 0;

  constructor(
    readonly playerName: string,
    readonly best: number,
  ) {
    super();
  }

  start(): void {
    this.player = new Tank({ x: 0, team: 0, kind: 'player', control: 'human', name: this.playerName || 'Ty', color: TEAM_COLORS[0] });
    this.player.inventory = { shell: INFINITE, big: 2, triple: 2, bouncer: 1 };
    this.match.botSpeed = 1.35;
    this.newArena();
    this.nextWave();
  }

  private newArena(): void {
    const biomes: BiomeId[] = ['meadow', 'desert', 'snow', 'night', 'moon', 'volcano'];
    const biome = biomes[this.biomeIdx % biomes.length] as BiomeId;
    this.biomeIdx++;
    const { world, spawns } = randomMap({ biome, slots: 1, wind: 'weak', seed: this.match.rng.int(0, 1e9), obstacles: false });
    this.player.x = flattestNear(world.terrain, clamp((spawns[0] as number) + this.match.rng.range(0, 500), 120, WORLD_W - 120), 90, world.waterY);
    this.player.alive = true;
    world.terrain.flatten(this.player.x - 26, this.player.x + 26, 16);
    world.addTank(this.player);
    this.player.angle = this.player.x < WORLD_W / 2 ? 45 : 135;
    this.match.setWorld(world);
    this.match.windRange = 50;
    this.match.windMode = 'drift';
    this.match.crateChance = 0.18;
    this.match.firstTank = this.player;
  }

  private nextWave(): void {
    this.wave++;
    const w = this.match.world;
    if (this.wave > 1 && (this.wave - 1) % 4 === 0) {
      // fresh arena every 4 waves
      w.tanks = [];
      this.newArena();
    }
    const world = this.match.world;
    world.cleanup();
    world.tanks = world.tanks.filter((t) => t.alive);
    const count = Math.min(1 + Math.floor(this.wave / 2), 4);
    const level: BotLevel = this.wave <= 2 ? 'easy' : this.wave <= 7 ? 'normal' : 'hard';
    const pool = WAVE_POOL.filter((p) => p.from <= this.wave);
    const xs: number[] = [];
    for (let i = 0; i < count; i++) {
      let x = 0;
      for (let tries = 0; tries < 50; tries++) {
        x = this.match.rng.range(80, WORLD_W - 80);
        x = flattestNear(world.terrain, x, 50, world.waterY);
        if (Math.abs(x - this.player.x) > 280 && xs.every((o) => Math.abs(o - x) > 130)) break;
      }
      xs.push(x);
      const kind: TankKind = this.wave % 5 === 0 && i === 0 ? (this.wave % 10 === 0 ? 'general' : 'heavy') : this.match.rng.pick(pool).kind;
      const t = new Tank({ x, team: 1, kind, control: 'bot', botLevel: level });
      if (this.wave > 8) {
        t.maxHp = Math.round(t.maxHp * (1 + (this.wave - 8) * 0.06));
        t.hp = t.maxHp;
      }
      world.tanks.push(t);
      t.y = -40 - i * 45;
      t.falling = true;
      t.chute = true;
      t.fallFrom = t.y;
      t.angle = x > this.player.x ? 135 : 45;
    }
    this.match.setWorld(world);
    this.player.fuel = Math.max(this.player.fuel, this.player.maxFuel);
    this.match.firstTank = this.player;
    this.match.announce({ text: `Vlna ${this.wave}`, sub: count === 1 ? '1 nepřítel' : `${count} nepřátelé`, kind: 'wave' });
  }

  override introTime(): number {
    return 1.4;
  }

  override onWorldEvent(e: WorldEvent): void {
    if (e.t === 'damage' && e.by === this.player.id && e.tank.team !== 0) this.score += e.amount;
    if (e.t === 'death' && e.tank.team !== 0) {
      const tier = WAVE_POOL.find((p) => p.kind === e.tank.kind)?.tier ?? (e.tank.kind === 'general' ? 6 : 3);
      this.score += 50 * tier;
      this.kills++;
    }
  }

  afterTurn(): TurnOutcome {
    if (!this.player.alive || this.player.hp <= 0) return 'over';
    const enemies = this.match.world.tanks.filter((t) => t.team !== 0 && t.alive && t.hp > 0);
    if (enemies.length === 0) {
      this.score += 100 * this.wave;
      this.offered = this.makeOffers();
      this.match.announce({ text: `Vlna ${this.wave} zvládnuta!`, sub: `+${100 * this.wave} bodů`, kind: 'good' });
      this.match.setPhase('reward');
      this.match.onReward?.(this.offered);
      return 'wait';
    }
    return 'continue';
  }

  override rewardOptions(): RewardOption[] {
    return this.offered;
  }

  override chooseReward(i: number): void {
    const o = this.offered[i] ?? this.offered[0];
    o?.apply(this.player);
    this.offered = [];
    this.nextWave();
    this.match.setPhase('intro');
  }

  private makeOffers(): RewardOption[] {
    const rng = this.match.rng;
    const p = this.player;
    const all: RewardOption[] = [
      { id: 'repair', title: 'Oprava', desc: '+45 životů', icon: 'repair', apply: (t) => (t.hp = Math.min(t.maxHp, t.hp + 45)) },
      {
        id: 'maxhp',
        title: 'Pancíř',
        desc: '+25 max. životů a oprava +25',
        icon: 'maxhp',
        apply: (t) => {
          t.maxHp += 25;
          t.hp = Math.min(t.maxHp, t.hp + 25);
        },
      },
      { id: 'shield', title: 'Štít', desc: 'Pohltí 50 poškození', icon: 'shield', apply: (t) => (t.shield = Math.min(100, t.shield + 50)) },
      {
        id: 'fuel',
        title: 'Velká nádrž',
        desc: '+80 paliva navždy',
        icon: 'fuel',
        apply: (t) => {
          t.maxFuel += 80;
          t.fuel = t.maxFuel;
        },
      },
    ];
    const packs: [WeaponId, number][] = [
      ['big', 2],
      ['triple', 3],
      ['bouncer', 2],
      ['roller', 2],
      ['cluster', 2],
      ['homing', 2],
      ['digger', 2],
      ['airstrike', 1],
      ['dirt', 2],
    ];
    if (this.wave >= 4) packs.push(['mega', 1]);
    for (const [w, n] of packs) {
      all.push({ id: `w-${w}`, title: `${n}× ${WEAPONS[w].name}`, desc: WEAPONS[w].desc, icon: w, apply: (t) => t.addAmmo(w, n) });
    }
    // always offer repair when hurt
    const out: RewardOption[] = [];
    if (p.hp < p.maxHp * 0.6) out.push(all[0] as RewardOption);
    const rest = rng.shuffle(all.filter((o) => !out.includes(o)));
    while (out.length < 3 && rest.length) out.push(rest.pop() as RewardOption);
    return out;
  }

  results(): ResultData {
    const newBest = this.score > this.best;
    return {
      mode: 'survival',
      won: null,
      title: 'Konec hry',
      subtitle: `Došel jsi do ${this.wave}. vlny`,
      score: this.score,
      best: Math.max(this.best, this.score),
      newBest,
      stats: [
        { label: 'Vlna', value: String(this.wave) },
        { label: 'Zničené tanky', value: String(this.kills) },
        { label: 'Výstřely', value: String(this.player.shots) },
        { label: 'Přesnost', value: pct(this.player.hits, this.player.shots) },
      ],
    };
  }

  hud(): HudInfo {
    return {
      title: 'Přežití',
      subtitle: '',
      counters: [
        { label: 'Vlna', value: String(this.wave), icon: 'wave' },
        { label: 'Body', value: String(this.score), icon: 'trophy' },
      ],
    };
  }
}

// =============================================================================
// Targets (shooting range, no enemies)
// =============================================================================

const TARGET_POINTS: Record<TargetKind, number> = { balloon: 10, board: 15, bird: 25, ufo: 40 };

export class TargetsMode extends Mode {
  readonly id = 'targets' as const;
  player!: Tank;
  score = 0;
  shotsTotal = 12;
  popsThisShot = 0;
  popped = 0;
  floatScores: { x: number; y: number; pts: number }[] = [];

  constructor(
    readonly playerName: string,
    readonly best: number,
  ) {
    super();
  }

  start(): void {
    const biome = this.match.rng.pick<BiomeId>(['meadow', 'desert', 'snow', 'night']);
    const { world } = randomMap({ biome, slots: 1, wind: 'off', seed: this.match.rng.int(0, 1e9), style: this.match.rng.pick(['hills', 'valley', 'dunes'] as const) });
    const x = flattestNear(world.terrain, this.match.rng.chance(0.5) ? 170 : WORLD_W - 170, 80, world.waterY);
    world.terrain.flatten(x - 26, x + 26, 16);
    this.player = world.addTank(new Tank({ x, team: 0, kind: 'player', control: 'human', name: this.playerName || 'Ty', color: TEAM_COLORS[0] }));
    this.player.inventory = { shell: INFINITE, triple: 2, bouncer: 2, cluster: 1 };
    this.player.angle = x < WORLD_W / 2 ? 45 : 135;
    this.player.fuel = this.player.maxFuel = 200;
    this.match.setWorld(world);
    this.match.firstTank = this.player;
    for (let i = 0; i < 6; i++) this.spawnTarget();
  }

  private spawnTarget(): void {
    const w = this.match.world;
    const rng = this.match.rng;
    const px = this.player.x;
    const kinds: TargetKind[] = ['balloon', 'balloon', 'board', 'board', 'bird', 'ufo'];
    const kind = rng.pick(kinds);
    let x = 0;
    for (let i = 0; i < 40; i++) {
      x = rng.range(120, WORLD_W - 120);
      if (Math.abs(x - px) > 260 && w.targets.every((t) => !t.alive || Math.abs(t.x - x) > 70)) break;
    }
    const ground = w.terrain.heightAt(x);
    const tg: Target = {
      id: w.id(),
      kind,
      x,
      y: 0,
      r: kind === 'board' ? 22 : kind === 'ufo' ? 22 : kind === 'bird' ? 15 : 18,
      vx: kind === 'ufo' ? rng.range(60, 110) * (rng.chance(0.5) ? 1 : -1) : kind === 'bird' ? rng.range(40, 70) * (rng.chance(0.5) ? 1 : -1) : kind === 'balloon' ? rng.range(-12, 12) : 0,
      baseY: 0,
      points: TARGET_POINTS[kind],
      alive: true,
      t: rng.range(0, 10),
      hue: rng.range(0, 360),
    };
    if (kind === 'board') tg.baseY = ground - 34;
    else if (kind === 'balloon') tg.baseY = ground - rng.range(120, 300);
    else if (kind === 'bird') tg.baseY = clamp(ground - rng.range(240, 380), 120, 600);
    else tg.baseY = rng.range(110, 230);
    tg.y = tg.baseY;
    w.targets.push(tg);
  }

  override onTurnStart(): void {
    this.popsThisShot = 0;
  }

  override onWorldEvent(e: WorldEvent): void {
    if (e.t === 'target') {
      this.popsThisShot++;
      this.popped++;
      const mul = 1 + 0.5 * (this.popsThisShot - 1);
      const pts = Math.round(e.target.points * mul);
      this.score += pts;
      this.floatScores.push({ x: e.x, y: e.y, pts });
      if (this.popsThisShot >= 2) this.match.announce({ text: `Kombo ×${mul.toFixed(1).replace('.0', '')}!`, kind: 'good' });
    }
  }

  get shotsLeft(): number {
    return Math.max(0, this.shotsTotal - this.player.shots);
  }

  afterTurn(): TurnOutcome {
    const w = this.match.world;
    w.cleanup();
    while (w.targets.length < 6) this.spawnTarget();
    if (this.shotsLeft <= 0) return 'over';
    return 'continue';
  }

  override hint(): string | null {
    if (!this.match.settings.hints || this.player.shots > 0) return null;
    return 'Sestřel co nejvíc balónků, terčů a létajících cílů. Máš 12 ran!';
  }

  override guideRatio(): number {
    const g = this.match.settings.guide;
    return g === 'off' ? 0 : g === 'short' ? 0.5 : 1;
  }

  static starsFor(score: number): number {
    return score >= 320 ? 3 : score >= 180 ? 2 : score >= 60 ? 1 : 0;
  }

  results(): ResultData {
    const newBest = this.score > this.best;
    return {
      mode: 'targets',
      won: null,
      title: newBest && this.score > 0 ? 'Nový rekord!' : 'Hotovo!',
      subtitle: `Sestřeleno ${this.popped} cílů`,
      score: this.score,
      best: Math.max(this.best, this.score),
      newBest,
      stars: TargetsMode.starsFor(this.score),
      stats: [
        { label: 'Cíle', value: String(this.popped) },
        { label: 'Výstřely', value: String(this.player.shots) },
      ],
    };
  }

  hud(): HudInfo {
    return {
      title: 'Střelnice',
      subtitle: '',
      counters: [
        { label: 'Zbývá ran', value: String(this.shotsLeft), icon: 'shot' },
        { label: 'Body', value: String(this.score), icon: 'target' },
      ],
    };
  }
}
