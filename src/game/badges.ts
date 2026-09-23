import { LEVELS } from './levels';
import type { Match, ResultData } from './match';
import type { WorldEvent } from './world';

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-hit', name: 'První zásah', desc: 'Traf nepřítele.', icon: '🎯' },
  { id: 'direct', name: 'Přímo do černého', desc: 'Traf tank přímým zásahem.', icon: '💥' },
  { id: 'crate', name: 'Dárek z nebe', desc: 'Seber bednu s padákem.', icon: '🎁' },
  { id: 'portal', name: 'Kouzelník', desc: 'Proleť střelou kouzelnou bránou.', icon: '🌀' },
  { id: 'fall', name: 'Bác!', desc: 'Shoď nepřítele z výšky – podkopej ho.', icon: '🪂' },
  { id: 'dirt', name: 'Stavitel', desc: 'Nasyp kopec z hlíny.', icon: '⛰️' },
  { id: 'mega', name: 'Velký třesk', desc: 'Odpal Megabombu.', icon: '💣' },
  { id: 'long-shot', name: 'Dalekonosný', desc: 'Traf nepřítele na druhém konci bojiště.', icon: '🔭' },
  { id: 'first-win', name: 'První vítězství', desc: 'Vyhraj úroveň tažení.', icon: '🏅' },
  { id: 'perfect', name: 'Perfektní', desc: 'Získej v úrovni 3 hvězdy.', icon: '⭐' },
  { id: 'untouched', name: 'Nedotknutelný', desc: 'Vyhraj úroveň (od 2.) bez jediného zranění.', icon: '✨' },
  { id: 'boss', name: 'Přemožitel generála', desc: 'Poraz Generála v poslední úrovni.', icon: '🎖️' },
  { id: 'campaign', name: 'Velitel', desc: 'Dokonči celé tažení.', icon: '🏆' },
  { id: 'all-stars', name: 'Hvězdný velitel', desc: `Posbírej všech ${LEVELS.length * 3} hvězd.`, icon: '🌟' },
  { id: 'duel-win', name: 'Vítěz souboje', desc: 'Vyhraj souboj proti botovi.', icon: '⚔️' },
  { id: 'wave5', name: 'Nezdolný', desc: 'V Přežití zvládni 5 vln.', icon: '🛡️' },
  { id: 'wave10', name: 'Legenda', desc: 'V Přežití zvládni 10 vln.', icon: '👑' },
  { id: 'combo', name: 'Kombo!', desc: 'Na střelnici sestřel 2 cíle jednou ranou.', icon: '🎈' },
  { id: 'targets-300', name: 'Mistr střelnice', desc: 'Získej na střelnici 300 bodů.', icon: '🎪' },
];

export const badgeById = (id: string): BadgeDef | undefined => BADGES.find((b) => b.id === id);

/**
 * Watches world events and match results and reports newly earned badges.
 * Only human players earn badges (demo and bots never do).
 */
export class BadgeTracker {
  private earned: Set<string>;
  private pops = 0;
  private turnKey = -1;

  constructor(
    earned: readonly string[],
    private onUnlock: (b: BadgeDef) => void,
  ) {
    this.earned = new Set(earned);
  }

  get list(): string[] {
    return [...this.earned];
  }

  has(id: string): boolean {
    return this.earned.has(id);
  }

  private give(id: string): void {
    if (this.earned.has(id)) return;
    const b = badgeById(id);
    if (!b) return;
    this.earned.add(id);
    this.onUnlock(b);
  }

  event(e: WorldEvent, m: Match): void {
    const human = (id: number) => m.world.tankById(id)?.control === 'human';
    switch (e.t) {
      case 'damage':
        if (human(e.by) && !human(e.tank.id) && e.tank.team !== m.world.tankById(e.by)?.team && e.amount > 0) {
          this.give('first-hit');
          if (e.direct) this.give('direct');
          const shooter = m.world.tankById(e.by);
          if (shooter && Math.abs(shooter.x - e.tank.x) > 1250) this.give('long-shot');
        }
        break;
      case 'crate':
        if (e.tank && e.tank.control === 'human') this.give('crate');
        break;
      case 'portal':
        if (m.active?.control === 'human') this.give('portal');
        break;
      case 'land':
        if (e.fall > 60 && e.tank.control !== 'human' && m.active?.control === 'human' && e.damage > 0) this.give('fall');
        break;
      case 'explosion': {
        const owner = m.world.tankById(e.owner);
        if (owner?.control === 'human') {
          if (e.kind === 'dirt') this.give('dirt');
          if (e.weapon === 'mega' && e.kind === 'normal') this.give('mega');
        }
        break;
      }
      case 'target':
        if (m.turn !== this.turnKey) {
          this.turnKey = m.turn;
          this.pops = 0;
        }
        this.pops++;
        if (this.pops >= 2) this.give('combo');
        break;
      default:
        break;
    }
  }

  waveCleared(wave: number): void {
    if (wave >= 5) this.give('wave5');
    if (wave >= 10) this.give('wave10');
  }

  result(r: ResultData, m: Match, ctx: { level?: number; totalStars?: number; maxStars?: number; campaignDone?: boolean; wave?: number; score?: number; damageTaken?: number; vsBot?: boolean }): void {
    if (r.mode === 'campaign' && r.won) {
      this.give('first-win');
      if ((r.stars ?? 0) >= 3) this.give('perfect');
      if ((ctx.level ?? 0) >= 2 && ctx.damageTaken === 0) this.give('untouched');
      if (ctx.level === LEVELS.length) this.give('boss');
      if (ctx.campaignDone) this.give('campaign');
      if (ctx.totalStars !== undefined && ctx.maxStars !== undefined && ctx.totalStars >= ctx.maxStars) this.give('all-stars');
    }
    if (r.mode === 'duel' && ctx.vsBot) {
      const winner = m.world.tanks.find((t) => t.alive && t.hp > 0);
      if (winner?.control === 'human') this.give('duel-win');
    }
    if (r.mode === 'survival' && ctx.wave !== undefined) {
      // the wave in progress when the player fell doesn't count
      const cleared = ctx.wave - 1;
      if (cleared >= 5) this.give('wave5');
      if (cleared >= 10) this.give('wave10');
    }
    if (r.mode === 'targets' && (ctx.score ?? 0) >= 300) this.give('targets-300');
  }
}
