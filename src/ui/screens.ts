import type { Difficulty, DuelSlotSave, Save } from '../core/storage';
import { BIOME_ORDER, BIOMES } from '../game/biomes';
import { levelById, LEVELS, unlockedLevel, WORLDS, type LevelDef } from '../game/levels';
import type { RewardOption } from '../game/match';
import { BADGES } from '../game/badges';
import { TANK_KINDS, TEAM_COLORS, TEAM_NAMES } from '../game/tank';
import { WEAPON_ORDER, WEAPONS } from '../game/weapons';
import { clearActivity } from '../kit/activity';
import { getApp } from '../kit/apps';
import { confirmDialog } from '../kit/dialog';
import { h, starsHTML, UI_ICONS } from '../kit/dom';
import { sfx } from '../kit/sfx';
import { ICON, PICKUP_ICONS, tankIcon, WEAPON_ICONS } from './icons';

// -----------------------------------------------------------------------------
// Overlay helper (same structure & classes as the kit overlays)
// -----------------------------------------------------------------------------

export interface Screen<T> {
  el: HTMLElement;
  panel: HTMLElement;
  done: Promise<T>;
  close(v: T): void;
}

export function screen<T>(kind: string, opts: { backdrop?: 'blur' | 'solid' | 'clear'; wide?: boolean; onEsc?: T } = {}): Screen<T> {
  const root = h('div', { class: `g92-overlay g92-overlay--${opts.backdrop ?? 'blur'} tk-screen tk-screen--${kind}`, role: 'dialog', 'aria-modal': 'true' });
  const bar = document.querySelector('g92-appbar');
  if (bar && !bar.hasAttribute('hidden')) root.style.top = 'var(--g92-appbar-total)';
  const panel = h('div', { class: `g92-overlay__panel tk-panel${opts.wide ? ' tk-panel--wide' : ''}` });
  root.append(panel);
  let resolve!: (v: T) => void;
  const done = new Promise<T>((r) => (resolve = r));
  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (closed || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && opts.onEsc !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      close(opts.onEsc);
    }
  };
  function close(v: T): void {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 200);
    resolve(v);
  }
  window.addEventListener('keydown', onKey, true);
  document.body.append(root);
  return { el: root, panel, done, close };
}

const btn = (label: string, cls: string, icon = '', onClick?: () => void, attrs: Record<string, string | number | boolean> = {}): HTMLButtonElement => {
  const b = h('button', { type: 'button', class: `g92-btn ${cls}`, html: icon, ...attrs }) as HTMLButtonElement;
  b.append(label);
  if (onClick) b.addEventListener('click', onClick);
  return b;
};

function focusFirst(panel: HTMLElement): void {
  requestAnimationFrame(() => (panel.querySelector('[data-primary]') as HTMLElement | null)?.focus({ preventScroll: true }));
}

// -----------------------------------------------------------------------------
// Home
// -----------------------------------------------------------------------------

export type HomeChoice = 'campaign' | 'duel' | 'survival' | 'targets' | 'help' | 'stats';

/** "Odznaky a statistiky" dialog content. */
export function statsContent(save: Save): HTMLElement {
  const d = save.data;
  const s = d.stats;
  const acc = s.shots > 0 ? `${Math.round((s.hits / s.shots) * 100)} %` : '–';
  const stat = (label: string, value: string, icon = '') => h('div', { class: 'g92-overlay__stat' }, h('dt', { html: icon + label }), h('dd', null, value));
  const statsGrid = h(
    'dl',
    { class: 'g92-overlay__stats tk-stats' },
    stat('Hry', String(s.games)),
    stat('Výhry', String(s.wins)),
    stat('Výstřely', String(s.shots)),
    stat('Přesnost', acc),
    stat('Zničené tanky', String(s.kills)),
    stat('Hvězdy', `${save.totalStars}/${LEVELS.length * 3}`),
    stat('Přežití', d.survival.bestScore ? `${d.survival.bestScore} (vlna ${d.survival.bestWave})` : '–'),
    stat('Střelnice', d.targets.bestScore ? String(d.targets.bestScore) : '–'),
  );
  const list = h('ul', { class: 'tk-badges' });
  for (const b of BADGES) {
    const got = d.badges.includes(b.id);
    list.append(
      h(
        'li',
        { class: `tk-badge${got ? ' is-got' : ''}`, title: b.desc },
        h('span', { class: 'tk-badge__icon', 'aria-hidden': 'true' }, got ? b.icon : '🔒'),
        h('span', { class: 'tk-badge__text' }, h('b', null, b.name), h('small', null, b.desc)),
        h('span', { class: 'g92-sr-only' }, got ? 'získáno' : 'zatím nezískáno'),
      ),
    );
  }
  return h(
    'div',
    { class: 'tk-statsdlg' },
    h('h3', null, `Odznaky (${d.badges.length} z ${BADGES.length})`),
    list,
    h('h3', null, 'Statistiky'),
    statsGrid,
  );
}

export function showHome(save: Save): Screen<HomeChoice> {
  const s = screen<HomeChoice>('home', { backdrop: 'clear', wide: true });
  const app = getApp('tanky');
  const d = save.data;
  const stars = save.totalStars;
  const maxStars = LEVELS.length * 3;
  const nextLevel = unlockedLevel(d.campaign.stars);

  const hero = h(
    'div',
    { class: 'tk-hero' },
    h('div', { class: 'g92-overlay__icon tk-hero__icon', html: app?.icon ?? '', 'aria-hidden': 'true' }),
    h('div', { class: 'tk-hero__text' }, h('h1', { class: 'g92-overlay__title tk-hero__title' }, 'Tanky'), h('p', { class: 'g92-overlay__subtitle' }, 'Zamiř, vystřel a přechytrač soupeře!')),
  );

  const card = (id: HomeChoice, title: string, desc: string, icon: string, meta: string, color: string, primary = false) => {
    const b = h(
      'button',
      { type: 'button', class: `g92-card g92-card--interactive tk-mode${primary ? ' tk-mode--primary' : ''}`, style: `--mc:${color}`, 'data-primary': primary || undefined },
      h('span', { class: 'tk-mode__icon', html: icon, 'aria-hidden': 'true' }),
      h('span', { class: 'tk-mode__body' }, h('span', { class: 'tk-mode__title' }, title), h('span', { class: 'tk-mode__desc' }, desc)),
      h('span', { class: 'tk-mode__meta', html: meta }),
    );
    b.addEventListener('click', () => {
      sfx.pop();
      s.close(id);
    });
    return b;
  };

  const grid = h(
    'div',
    { class: 'tk-modes' },
    card(
      'campaign',
      'Tažení',
      stars === 0 ? `${LEVELS.length} úrovní v ${WORLDS.length} světech – začni tady!` : `Pokračuj úrovní ${nextLevel}: ${levelById(nextLevel)?.name ?? ''}`,
      ICON.campaign,
      `${ICON.star}<b>${stars}</b>/${maxStars}`,
      '#ef5350',
      true,
    ),
    card('duel', 'Souboj', '2–4 hráči nebo boti na jedné obrazovce', ICON.duel, `${ICON.person}${ICON.robot}`, '#4bb3ff'),
    card('survival', 'Přežití', 'Vydrž co nejvíc vln nepřátel', ICON.survival, d.survival.bestScore ? `${UI_ICONS.trophy}<b>${d.survival.bestScore}</b>` : 'Nový', '#ffb300'),
    card('targets', 'Střelnice', 'Balónky, terče a UFO – pro nejmenší', ICON.range, d.targets.bestScore ? `${UI_ICONS.trophy}<b>${d.targets.bestScore}</b>` : 'Nový', '#4cd964'),
  );

  const help = btn('Jak hrát', 'g92-btn--secondary g92-btn--lg', UI_ICONS.help, () => {
    sfx.tap();
    s.close('help');
  });
  const badges = d.badges.length;
  const stats = btn(badges ? `Odznaky ${badges}/${BADGES.length}` : 'Odznaky a statistiky', 'g92-btn--secondary g92-btn--lg', UI_ICONS.trophy, () => {
    sfx.tap();
    s.close('stats');
  });
  s.panel.append(hero, grid, h('div', { class: 'tk-home__foot' }, help, stats));
  focusFirst(s.panel);
  return s;
}

// -----------------------------------------------------------------------------
// Campaign map
// -----------------------------------------------------------------------------

export function showCampaign(save: Save): Screen<number | null> {
  const s = screen<number | null>('campaign', { backdrop: 'blur', wide: true, onEsc: null });
  const d = save.data.campaign;
  const unlockedUpTo = unlockedLevel(d.stars);
  const head = h(
    'div',
    { class: 'tk-head' },
    btn('Domů', 'g92-btn--ghost g92-btn--sm tk-back', UI_ICONS.home, () => s.close(null)),
    h('h2', { class: 'tk-head__title' }, 'Tažení'),
    h('span', { class: 'tk-head__stars', html: `${ICON.star}<b>${save.totalStars}</b> / ${LEVELS.length * 3}` }),
  );
  const worlds = h('div', { class: 'tk-worlds' });
  let firstOpen: HTMLElement | null = null;
  for (const wdef of WORLDS) {
    const biome = BIOMES[wdef.biome];
    const list = h('div', { class: 'tk-levels' });
    for (const id of wdef.levels) {
      const lv = levelById(id) as LevelDef;
      const locked = id > unlockedUpTo;
      const st = d.stars[id - 1] ?? 0;
      const b = h(
        'button',
        {
          type: 'button',
          class: `tk-level${locked ? ' is-locked' : ''}${id === unlockedUpTo && st === 0 ? ' is-next' : ''}`,
          'aria-label': locked ? `Úroveň ${id} – zamčeno` : `Úroveň ${id}: ${lv.name}, ${st} z 3 hvězd`,
          disabled: locked,
        },
        h('span', { class: 'tk-level__num' }, String(id)),
        h('span', { class: 'tk-level__name' }, lv.name),
        locked ? h('span', { class: 'tk-level__lock', html: ICON.lock }) : h('span', { class: 'tk-level__stars', html: starsHTML(st, 3) }),
      );
      if (!locked) {
        b.addEventListener('click', () => {
          sfx.pop();
          s.close(id);
        });
        if (id === unlockedUpTo) firstOpen = b;
      }
      list.append(b);
    }
    worlds.append(
      h(
        'section',
        { class: 'tk-world', style: `--w1:${biome.sky[0]};--w2:${biome.sky[2]};--wg:${biome.top}` },
        h('h3', { class: 'tk-world__title' }, h('span', { class: 'tk-world__num' }, String(wdef.id)), wdef.name),
        list,
      ),
    );
  }
  s.panel.append(head, worlds);
  requestAnimationFrame(() => {
    const el = firstOpen as HTMLElement | null;
    el?.focus({ preventScroll: true });
    // open the map at the level to play next (not at world 1) – only when it isn't visible already
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight - 16 || r.top < 0) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  });
  return s;
}

/** Extra content for the level start panel: enemies + tip + par. */
export function levelIntroExtra(lv: LevelDef): { info: HTMLElement; par: HTMLElement } {
  const enemies = h('ul', { class: 'tk-enemies' });
  const kinds = new Map<string, number>();
  for (const e of lv.enemies) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  for (const [kind, n] of kinds) {
    const k = TANK_KINDS[kind as keyof typeof TANK_KINDS];
    enemies.append(
      h(
        'li',
        { class: 'tk-enemy' },
        h('span', { class: 'tk-enemy__icon', html: tankIcon(k.bodyColor ?? '#4bb3ff', k.look) }),
        h('span', { class: 'tk-enemy__text' }, h('b', null, `${n > 1 ? `${n}× ` : ''}${k.name}`), h('small', null, k.desc)),
      ),
    );
  }
  const weapons = h('div', { class: 'tk-loadout', 'aria-label': 'Tvoje zbraně' });
  for (const w of WEAPON_ORDER) {
    const n = lv.player.weapons?.[w];
    if (!n) continue;
    weapons.append(h('span', { class: 'tk-loadout__item', title: WEAPONS[w].name }, h('span', { html: WEAPON_ICONS[w] }), h('b', null, n >= 999 ? '∞' : `×${n}`)));
  }
  // info goes under the title (hero column), the 3-star goal sits right above "Hrát"
  return {
    info: h(
      'div',
      { class: 'tk-intro' },
      h('p', { class: 'tk-intro__tip' }, h('span', { 'aria-hidden': 'true' }, '💡 '), lv.tip),
      h('div', { class: 'tk-intro__cols' }, h('div', null, h('span', { class: 'g92-eyebrow' }, 'Nepřátelé'), enemies), h('div', null, h('span', { class: 'g92-eyebrow' }, 'Tvoje zbraně'), weapons)),
    ),
    par: h('p', { class: 'tk-intro__par', html: `${ICON.star}${ICON.star}${ICON.star} když zvítězíš nejvýš na <b>${lv.par}</b> ${lv.par < 5 ? 'výstřely' : 'výstřelů'}` }),
  };
}

export const DIFFICULTIES: { id: Difficulty; label: string; icon: string; hint: string }[] = [
  { id: 'easy', label: 'Lehká', icon: '🐢', hint: 'Nepřátelé často míjí' },
  { id: 'normal', label: 'Normální', icon: '🐇', hint: 'Férový souboj' },
  { id: 'hard', label: 'Těžká', icon: '🔥', hint: 'Míří velmi přesně' },
];

// -----------------------------------------------------------------------------
// Duel setup
// -----------------------------------------------------------------------------

export type DuelSetup = Save['data']['duel'];

export function showDuelSetup(save: Save): Screen<DuelSetup | null> {
  const s = screen<DuelSetup | null>('duel', { backdrop: 'blur', wide: true, onEsc: null });
  const cfg: DuelSetup = JSON.parse(JSON.stringify(save.data.duel)) as DuelSetup;
  const head = h(
    'div',
    { class: 'tk-head' },
    btn('Domů', 'g92-btn--ghost g92-btn--sm tk-back', UI_ICONS.home, () => s.close(null)),
    h('h2', { class: 'tk-head__title' }, 'Souboj'),
    h('span'),
  );

  const CONTROLS: { v: DuelSlotSave['control']; label: string; icon: string }[] = [
    { v: 'human', label: 'Hráč', icon: ICON.person },
    { v: 'easy', label: 'Bot 🐢', icon: ICON.robot },
    { v: 'normal', label: 'Bot 🐇', icon: ICON.robot },
    { v: 'hard', label: 'Bot 🔥', icon: ICON.robot },
    { v: 'off', label: 'Nehraje', icon: ICON.off },
  ];
  const slots = h('div', { class: 'tk-slots' });
  const startBtn = btn('Hrát', 'g92-btn--xl g92-btn--block', UI_ICONS.play, () => {
    save.data.duel = cfg;
    save.commit('duel');
    s.close(cfg);
  }, { 'data-primary': true });
  const warn = h('p', { class: 'tk-warn', hidden: true }, 'Hrát musí aspoň dva.');
  const refresh = () => {
    const on = cfg.slots.map((x) => x.control !== 'off');
    const n = on.filter(Boolean).length;
    const teamsOk = !cfg.teams || ((on[0] || on[2]) && (on[1] || on[3]));
    startBtn.disabled = n < 2 || !teamsOk;
    warn.hidden = !startBtn.disabled;
    warn.textContent = n < 2 ? 'Hrát musí aspoň dva.' : 'Každý tým potřebuje aspoň jeden tank.';
    slots.classList.toggle('is-teams', !!cfg.teams);
  };
  cfg.slots.forEach((slot, i) => {
    const color = TEAM_COLORS[i] as string;
    const tank = h('span', { class: 'tk-slot__tank', html: tankIcon(color) });
    const seg = h('div', { class: 'g92-segmented tk-slot__seg', role: 'radiogroup', 'aria-label': `${TEAM_NAMES[i]} – kdo hraje` });
    const guide = h('input', { type: 'checkbox', class: 'g92-toggle', role: 'switch', 'aria-label': 'Pomocná čára' }) as HTMLInputElement;
    guide.checked = slot.guide;
    guide.addEventListener('change', () => {
      slot.guide = guide.checked;
      sfx.click();
    });
    const guideRow = h('label', { class: 'tk-slot__guide', title: 'Ukazuje kus dráhy střely. Kdo vede, má čáru kratší.' }, h('span', { html: ICON.guide }), h('span', null, 'Pomocná čára'), guide);
    const card = h('div', { class: 'tk-slot', style: `--c:${color}` });
    const sync = () => {
      card.classList.toggle('is-off', slot.control === 'off');
      guideRow.hidden = slot.control !== 'human';
      for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === slot.control));
      refresh();
    };
    for (const c of CONTROLS) {
      const b = h('button', { type: 'button', 'data-v': c.v, 'aria-pressed': 'false', title: c.label, html: c.icon }, h('span', null, c.label));
      b.addEventListener('click', () => {
        slot.control = c.v;
        sfx.click();
        sync();
      });
      seg.append(b);
    }
    card.append(h('div', { class: 'tk-slot__head' }, tank, h('b', null, TEAM_NAMES[i] ?? '')), seg, guideRow);
    slots.append(card);
    sync();
  });

  const option = <T extends string | number | boolean>(label: string, value: T, options: { v: T; label: string }[], set: (v: T) => void) => {
    const seg = h('div', { class: 'g92-segmented g92-segmented--block', role: 'radiogroup', 'aria-label': label });
    const buttons: HTMLButtonElement[] = [];
    for (const o of options) {
      const b = h('button', { type: 'button', 'aria-pressed': String(o.v === value) }, o.label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        set(o.v);
        sfx.click();
        for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
      });
      buttons.push(b);
      seg.append(b);
    }
    return h('div', { class: 'g92-field tk-opt' }, h('span', { class: 'g92-label' }, label), seg);
  };
  const opts = h(
    'div',
    { class: 'tk-opts' },
    option('Týmy', cfg.teams, [
      { v: false, label: 'Každý sám' },
      { v: true, label: '🔴🟢 proti 🔵🟡' },
    ], (v) => {
      cfg.teams = v;
      refresh();
    }),
    option('Hraje se na', cfg.rounds, [1, 3, 5, 10].map((v) => ({ v, label: v === 1 ? '1 výhru' : v < 5 ? `${v} výhry` : `${v} výher` })), (v) => (cfg.rounds = v)),
    option('Životy', cfg.hp, [
      { v: 'onehit' as const, label: 'Jeden zásah' },
      { v: 'normal' as const, label: 'Normální' },
      { v: 'tough' as const, label: 'Odolné' },
    ], (v) => (cfg.hp = v)),
    option('Vítr', cfg.wind, [
      { v: 'off' as const, label: 'Bez větru' },
      { v: 'weak' as const, label: 'Slabý' },
      { v: 'strong' as const, label: 'Silný' },
    ], (v) => (cfg.wind = v)),
    option('Bedny s dárky', cfg.crates, [
      { v: true, label: 'Ano' },
      { v: false, label: 'Ne' },
    ], (v) => (cfg.crates = v)),
    option('Okraje', cfg.walls, [
      { v: 'open' as const, label: 'Otevřené' },
      { v: 'bounce' as const, label: 'Odrazné' },
    ], (v) => (cfg.walls = v)),
  );
  // environment: chips that wrap (7 options don't fit a segmented control)
  const biomeChips = h('div', { class: 'tk-chips', role: 'radiogroup', 'aria-label': 'Prostředí' });
  const biomeOpts = [{ v: 'random', label: '🎲 Náhodně', sky: '' }, ...BIOME_ORDER.map((b) => ({ v: b as string, label: BIOMES[b].name, sky: BIOMES[b].sky[0] }))];
  for (const o of biomeOpts) {
    const b = h('button', { type: 'button', class: 'g92-chip tk-biome-chip', 'aria-pressed': String(cfg.biome === o.v), style: o.sky ? `--sky:${o.sky}` : '' }, o.label);
    b.addEventListener('click', () => {
      cfg.biome = o.v;
      sfx.click();
      for (const x of biomeChips.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    });
    biomeChips.append(b);
  }
  opts.append(h('div', { class: 'g92-field tk-opt tk-opt--wide' }, h('span', { class: 'g92-label' }, 'Prostředí'), biomeChips));
  s.panel.append(head, h('span', { class: 'g92-eyebrow' }, 'Kdo hraje'), slots, h('span', { class: 'g92-eyebrow' }, 'Pravidla'), opts, warn, h('div', { class: 'g92-overlay__actions' }, startBtn));
  refresh();
  focusFirst(s.panel);
  return s;
}

// -----------------------------------------------------------------------------
// Survival reward
// -----------------------------------------------------------------------------

export function showReward(wave: number, options: RewardOption[]): Screen<number> {
  const s = screen<number>('reward', { backdrop: 'blur' });
  s.panel.append(
    h('div', { class: 'g92-overlay__icon g92-overlay__icon--sm', html: UI_ICONS.trophy, 'aria-hidden': 'true' }),
    h('h2', { class: 'g92-overlay__title g92-overlay__title--sm' }, `Vlna ${wave} zvládnuta!`),
    h('p', { class: 'g92-overlay__subtitle' }, 'Vyber si odměnu:'),
  );
  const grid = h('div', { class: 'tk-rewards' });
  options.forEach((o, i) => {
    const icon = o.icon in WEAPONS ? WEAPON_ICONS[o.icon as keyof typeof WEAPON_ICONS] : PICKUP_ICONS[o.icon as keyof typeof PICKUP_ICONS];
    const b = h(
      'button',
      { type: 'button', class: 'g92-card g92-card--interactive tk-reward', 'data-primary': i === 0 || undefined },
      h('span', { class: 'tk-reward__icon', html: icon ?? '' }),
      h('b', { class: 'tk-reward__title' }, o.title),
      h('span', { class: 'tk-reward__desc' }, o.desc),
      h('kbd', { class: 'g92-kbd' }, String(i + 1)),
    );
    b.addEventListener('click', () => {
      sfx.coin();
      s.close(i);
    });
    grid.append(b);
  });
  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (n >= 1 && n <= options.length) {
      e.preventDefault();
      sfx.coin();
      s.close(n - 1);
    }
  };
  window.addEventListener('keydown', onKey, true);
  void s.done.then(() => window.removeEventListener('keydown', onKey, true));
  s.panel.append(grid);
  focusFirst(s.panel);
  return s;
}

// -----------------------------------------------------------------------------
// Help ("Jak hrát")
// -----------------------------------------------------------------------------

export function helpContent(): HTMLElement {
  const kbd = (...k: string[]) => k.map((x) => `<kbd class="g92-kbd">${x}</kbd>`).join(' ');
  const section = (title: string, ...children: (Node | string)[]) => h('section', { class: 'tk-help__sec' }, h('h3', null, title), ...children);
  const steps = h(
    'ol',
    { class: 'g92-howto tk-help__steps' },
    ...[
      ['🎯', 'Natoč hlaveň a nastav sílu.'],
      ['💥', 'Vystřel a sleduj, kam střela letí.'],
      ['🔴', 'Barevná tečka ukáže, kam jsi dopadl – příště se oprav.'],
      ['🏆', 'Zničíš všechny nepřátele = vyhráváš!'],
    ].map(([icon, text], i) =>
      h(
        'li',
        { class: 'g92-howto__step', style: `--i:${i}` },
        h('span', { class: 'g92-howto__icon', 'aria-hidden': 'true', html: `<span class="g92-emoji">${icon as string}</span>` }),
        h('span', { class: 'g92-howto__text' }, text as string),
      ),
    ),
  );
  const keys = h('ul', { class: 'g92-keys' });
  for (const [k, t] of [
    [kbd('←', '→') + ' ' + kbd('A', 'D'), 'otáčení hlavně'],
    [kbd('↑', '↓') + ' ' + kbd('W', 'S'), 'síla výstřelu'],
    [kbd('Mezerník') + ' ' + kbd('Enter'), 'výstřel'],
    [kbd('Q', 'E'), 'jízda doleva / doprava (spotřebuje palivo)'],
    [kbd('Tab') + ' ' + kbd('1') + '–' + kbd('9'), 'výběr zbraně'],
    [kbd('Shift'), 'jemné míření (drž)'],
    [kbd('Esc') + ' ' + kbd('P'), 'pauza'],
    [kbd('F') + ' ' + kbd('M'), 'celá obrazovka / zvuk'],
  ]) {
    keys.append(h('li', null, h('span', { class: 'g92-keys__keys', html: k as string }), h('span', null, t as string)));
  }
  const touch = h(
    'ul',
    { class: 'tk-help__list' },
    h('li', { html: `${ICON.touch}<span><b>Táhni prstem</b> po obrazovce – hlaveň míří k prstu. Čím dál od tanku, tím větší síla.</span>` }),
    h('li', { html: `${ICON.fire}<span>Velké tlačítko <b>PAL!</b> vystřelí. Šipkami dole doladíš úhel a sílu.</span>` }),
    h('li', { html: `${ICON.gamepad}<span><b>Gamepad:</b> páčka = míření, A = výstřel, LB/RB = zbraň, spouště = jízda.</span>` }),
  );
  const weapons = h('ul', { class: 'tk-help__weapons' });
  for (const w of WEAPON_ORDER) {
    weapons.append(h('li', null, h('span', { class: 'tk-help__wicon', html: WEAPON_ICONS[w] }), h('span', null, h('b', null, WEAPONS[w].name), ' – ', WEAPONS[w].desc)));
  }
  const things = h(
    'ul',
    { class: 'tk-help__list' },
    h('li', { html: `${PICKUP_ICONS.repair}<span><b>Bedny s padákem</b> – sestřel je nebo přejeď: oprava, štít, palivo nebo nové zbraně.</span>` }),
    h('li', { html: `${ICON.wind}<span><b>Vítr</b> – šipka nahoře ukazuje, kam a jak silně fouká.</span>` }),
    h('li', { html: `<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" fill="#8a8f98"/><path d="M4 9h16M4 15h16M12 3v6M8 9v6M16 15v6" stroke="#5c6068"/></svg><span><b>Kámen a kov</b> se rozbít nedají. <b>Dřevěné bedny</b> ano.</span>` }),
    h('li', { html: `<svg viewBox="0 0 24 24"><rect x="3" y="13" width="18" height="4" rx="2" fill="#ff6ec7"/><path d="M7 17l-1 4M17 17l1 4" stroke="#455a64" stroke-width="2"/></svg><span><b>Trampolína</b> vystřelí střelu zpátky nahoru.</span>` }),
    h('li', { html: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#b388ff" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="#4a148c"/></svg><span><b>Kouzelné brány</b> – co vletí do jedné, vyletí z druhé.</span>` }),
    h('li', { html: `<svg viewBox="0 0 24 24"><path d="M2 14q5-4 10 0t10 0v7H2Z" fill="#3aa0e8"/></svg><span><b>Voda</b> střelu zhasne – nevybuchne.</span>` }),
  );
  const modes = h(
    'ul',
    { class: 'tk-help__list' },
    h('li', { html: `${ICON.campaign}<span><b>Tažení</b> – ${LEVELS.length} úrovní v ${WORLDS.length} světech. Čím méně výstřelů, tím víc hvězd.</span>` }),
    h('li', { html: `${ICON.duel}<span><b>Souboj</b> – 2–4 hráči nebo boti na jedné klávesnici či tabletu. Hraje se na kola.</span>` }),
    h('li', { html: `${ICON.survival}<span><b>Přežití</b> – vlny nepřátel padají na padácích. Mezi vlnami si vybereš odměnu.</span>` }),
    h('li', { html: `${ICON.range}<span><b>Střelnice</b> – 12 ran na balónky, terče a UFO. Víc cílů jednou ranou = kombo!</span>` }),
  );
  // hidden on touch-only devices (same rule as the kit's .g92-keys)
  const keysSection = section('Klávesnice', keys, h('p', { class: 'g92-hint' }, 'Na tahu je vždy jen jeden tank, takže šipky i WASD ovládají toho, kdo je právě na řadě.'));
  keysSection.classList.add('tk-help__keys');
  return h(
    'div',
    { class: 'tk-help' },
    section('Jak se hraje', steps),
    keysSection,
    section('Dotyk, myš a gamepad', touch),
    section('Zbraně', weapons),
    section('Na bojišti', things),
    section('Režimy', modes),
  );
}

// -----------------------------------------------------------------------------
// Settings (extra section for the kit settings dialog)
// -----------------------------------------------------------------------------

export function settingsExtra(save: Save, onChange: () => void): HTMLElement {
  const p = save.data.prefs;
  const seg = <T extends string | boolean>(label: string, value: T, options: { v: T; label: string }[], set: (v: T) => void, hint?: string) => {
    const g = h('div', { class: 'g92-segmented g92-segmented--block', role: 'radiogroup', 'aria-label': label });
    const bs: HTMLButtonElement[] = [];
    for (const o of options) {
      const b = h('button', { type: 'button', 'aria-pressed': String(o.v === value) }, o.label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        set(o.v);
        save.commit('prefs');
        onChange();
        sfx.click();
        for (const x of bs) x.setAttribute('aria-pressed', String(x === b));
      });
      bs.push(b);
      g.append(b);
    }
    return h('div', { class: 'g92-field' }, h('span', { class: 'g92-label' }, label), g, hint ? h('span', { class: 'g92-hint' }, hint) : null);
  };
  const reset = btn('Smazat postup a rekordy', 'g92-btn--ghost g92-btn--sm', UI_ICONS.restart, () => {
    void confirmDialog({ title: 'Smazat postup?', message: 'Opravdu smazat všechny hvězdy a rekordy v Tancích? Nejde to vrátit.', confirmLabel: 'Smazat', danger: true }).then((ok) => {
      if (!ok) return;
      save.resetAll();
      clearActivity('tanky'); // the menu must not keep showing "Pokračovat · Tanky" with old stars
      sfx.error();
      onChange();
      window.setTimeout(() => location.reload(), 250);
    });
  });
  return h(
    'div',
    { class: 'tk-settings' },
    h('h3', { class: 'tk-settings__title' }, 'Tanky'),
    seg('Pomocná čára', p.guide, [
      { v: 'off' as const, label: 'Vypnutá' },
      { v: 'short' as const, label: 'Krátká' },
      { v: 'long' as const, label: 'Celá' },
    ], (v) => (p.guide = v), 'Tečkovaná dráha střely (Tažení, Přežití, Střelnice).'),
    seg('Otřesy obrazovky', p.shake, [
      { v: true, label: 'Zapnuté' },
      { v: false, label: 'Vypnuté' },
    ], (v) => (p.shake = v)),
    seg('Nápovědy ve hře', p.hints, [
      { v: true, label: 'Ukazovat' },
      { v: false, label: 'Skrýt' },
    ], (v) => (p.hints = v)),
    reset,
  );
}
