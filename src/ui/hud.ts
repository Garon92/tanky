import type { HoldAction, Input } from '../core/input';
import type { Announcement, Match } from '../game/match';
import type { Tank } from '../game/tank';
import type { WeaponId } from '../game/types';
import { INFINITE, WEAPONS } from '../game/weapons';
import { WIND_UNIT } from '../game/constants';
import { h } from '../kit/dom';
import { sfx } from '../kit/sfx';
import { ICON, WEAPON_ICONS } from './icons';

export interface HudCallbacks {
  pause(): void;
  fire(): void;
}

/** In-game HUD (DOM overlay above the canvas). Updates only what changed each frame. */
export class Hud {
  readonly el: HTMLElement;
  private players: HTMLElement;
  private counters: HTMLElement;
  private wind: HTMLElement;
  private windArrow: HTMLElement;
  private windVal: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private dock: HTMLElement;
  private turnLabel: HTMLElement;
  private weaponBtn: HTMLButtonElement;
  private angleVal: HTMLElement;
  private angleArrow: HTMLElement;
  private powerVal: HTMLElement;
  private powerBar: HTMLElement;
  private fuelBar: HTMLElement;
  private driveBox: HTMLElement;
  private fireBtn: HTMLButtonElement;
  private picker: HTMLElement;
  private cache = new Map<string, string>();
  private pillTanks: Tank[] = [];
  private pillEls: HTMLElement[] = [];
  private bannerTimer = 0;
  private match: Match | null = null;
  private lastWeapons = '';

  constructor(
    stage: HTMLElement,
    private input: Input,
    private cb: HudCallbacks,
  ) {
    const pauseBtn = h('button', { type: 'button', class: 'tk-iconbtn tk-pause', 'aria-label': 'Pauza (Esc)', title: 'Pauza (Esc)', html: ICON.pause });
    pauseBtn.addEventListener('click', () => this.cb.pause());
    this.players = h('div', { class: 'tk-players' });
    this.counters = h('div', { class: 'tk-counters' });
    this.windArrow = h('span', { class: 'tk-wind__arrow', html: ICON.wind });
    this.windVal = h('span', { class: 'tk-wind__val' });
    this.wind = h('div', { class: 'tk-wind', title: 'Vítr' }, this.windArrow, this.windVal);
    const top = h('div', { class: 'tk-top' }, pauseBtn, this.players, h('div', { class: 'tk-right' }, this.counters, this.wind));
    this.banner = h('div', { class: 'tk-banner', 'aria-live': 'polite' });
    this.hint = h('div', { class: 'tk-hint', hidden: true });

    // --- dock
    this.turnLabel = h('div', { class: 'tk-turn' });
    this.weaponBtn = h('button', { type: 'button', class: 'tk-weapon', 'aria-haspopup': 'true', title: 'Zbraň (Tab nebo 1–9)' }) as HTMLButtonElement;
    this.weaponBtn.addEventListener('click', () => this.togglePicker());
    this.angleVal = h('b', { class: 'tk-val' });
    this.angleArrow = h('span', { class: 'tk-dir', html: ICON.arrow });
    this.powerVal = h('b', { class: 'tk-val' });
    this.powerBar = h('i');
    this.fuelBar = h('i');
    const angle = this.ctrl('Úhel', 'aimLeft', 'aimRight', ICON.rotLeft, ICON.rotRight, h('span', { class: 'tk-readout__row' }, this.angleVal, this.angleArrow), 'tk-ctrl--angle');
    const power = this.ctrl('Síla', 'powerDown', 'powerUp', ICON.down, ICON.up, h('span', { class: 'tk-readout__col' }, this.powerVal, h('span', { class: 'tk-bar tk-bar--power' }, this.powerBar)), 'tk-ctrl--power');
    this.driveBox = this.ctrl('Jízda', 'driveLeft', 'driveRight', ICON.left, ICON.right, h('span', { class: 'tk-bar tk-bar--fuel', title: 'Palivo' }, this.fuelBar), 'tk-ctrl--drive');
    this.fireBtn = h('button', { type: 'button', class: 'tk-fire', 'aria-label': 'Vystřelit (mezerník)', html: `${ICON.fire}<span>PAL!</span>` }) as HTMLButtonElement;
    this.fireBtn.addEventListener('click', () => this.cb.fire());
    const controls = h('div', { class: 'tk-controls' }, this.weaponBtn, angle, power, this.driveBox, this.fireBtn);
    this.dock = h('div', { class: 'tk-dock' }, this.turnLabel, controls);
    this.picker = h('div', { class: 'tk-picker', role: 'dialog', 'aria-label': 'Výběr zbraně', hidden: true });

    this.el = h('div', { class: 'tk-hud', hidden: true }, top, this.banner, this.hint, this.picker, this.dock);
    stage.append(this.el);
    document.addEventListener('pointerdown', (e) => {
      if (!this.picker.hidden && !this.picker.contains(e.target as Node) && e.target !== this.weaponBtn && !this.weaponBtn.contains(e.target as Node)) this.closePicker();
    });
  }

  private ctrl(label: string, minus: HoldAction, plus: HoldAction, minusIcon: string, plusIcon: string, readout: HTMLElement, cls: string): HTMLElement {
    const mk = (a: HoldAction, icon: string, aria: string) => {
      const b = h('button', { type: 'button', class: 'tk-hold', tabindex: -1, 'aria-label': aria, html: icon }) as HTMLButtonElement;
      const src = `ui:${a}`;
      const off = () => {
        this.input.setHold(a, src, false);
        b.classList.remove('is-down');
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.input.setHold(a, src, true);
        b.classList.add('is-down');
      });
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    const aria = label === 'Úhel' ? ['Hlaveň doleva', 'Hlaveň doprava'] : label === 'Síla' ? ['Menší síla', 'Větší síla'] : ['Jet doleva', 'Jet doprava'];
    return h(
      'div',
      { class: `tk-ctrl ${cls}` },
      mk(minus, minusIcon, aria[0] as string),
      h('span', { class: 'tk-readout' }, h('span', { class: 'tk-label' }, label), readout),
      mk(plus, plusIcon, aria[1] as string),
    );
  }

  /** Height of the control dock in CSS px (for camera insets on portrait screens). */
  dockHeight(): number {
    const c = this.dock.querySelector('.tk-controls') as HTMLElement | null;
    return (c?.offsetHeight ?? 0) + 12;
  }

  show(match: Match): void {
    this.match = match;
    this.el.hidden = false;
    this.cache.clear();
    this.pillTanks = [];
    this.lastWeapons = '';
    this.closePicker();
    this.banner.className = 'tk-banner';
  }

  hide(): void {
    this.el.hidden = true;
    this.closePicker();
    this.match = null;
  }

  private set(key: string, value: string, apply: (v: string) => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  announce(a: Announcement): void {
    const el = this.banner;
    el.innerHTML = '';
    el.append(h('span', { class: 'tk-banner__text' }, a.text));
    if (a.sub) el.append(h('span', { class: 'tk-banner__sub' }, a.sub));
    el.style.setProperty('--c', a.color ?? 'var(--accent)');
    el.className = `tk-banner tk-banner--${a.kind}`;
    void el.offsetWidth;
    el.classList.add('is-on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.remove('is-on'), a.kind === 'turn' ? 1100 : a.kind === 'good' ? 1300 : 2100);
  }

  // ---------------------------------------------------------------------------

  update(): void {
    const m = this.match;
    if (!m || this.el.hidden) return;
    const w = m.world;
    const mode = m.mode;
    const hud = mode.hud();
    this.set('dockh', String(this.dock.offsetHeight), (v) => this.el.style.setProperty('--dock-h', `${v}px`));

    // players strip (rebuilt when the tank list changes)
    const tanks = this.stripTanks(m);
    if (tanks.length !== this.pillTanks.length || tanks.some((t, i) => t !== this.pillTanks[i])) this.buildPills(tanks, m);
    tanks.forEach((t, i) => {
      const el = this.pillEls[i] as HTMLElement;
      const k = Math.max(0, t.hp / t.maxHp);
      const state = `${Math.round(k * 100)}|${t.alive}|${t === m.active}|${t.wins}|${t.shield > 0}`;
      this.set(`pill${i}`, state, () => {
        (el.querySelector('.tk-pill__hp i') as HTMLElement).style.width = `${k * 100}%`;
        el.classList.toggle('is-dead', !t.alive);
        el.classList.toggle('is-active', t === m.active);
        el.classList.toggle('has-shield', t.shield > 0);
        el.classList.toggle('is-low', k < 0.3);
        const wins = el.querySelector('.tk-pill__wins');
        if (wins && mode.id === 'duel') {
          const need = (mode as unknown as { cfg: { rounds: number } }).cfg.rounds;
          wins.innerHTML = need <= 5 ? Array.from({ length: need }, (_, j) => `<span class="${j < t.wins ? 'on' : ''}"></span>`).join('') : `<b>${t.wins}</b>`;
        }
        el.setAttribute('aria-label', `${t.name}: ${Math.max(0, Math.round(t.hp))} životů`);
      });
    });

    // counters
    const cstr = hud.counters.map((c) => `${c.icon}:${c.value}`).join('|');
    this.set('counters', cstr, () => {
      this.counters.innerHTML = '';
      for (const c of hud.counters) {
        this.counters.append(h('span', { class: 'tk-counter', title: c.label }, h('span', { class: 'tk-counter__icon', html: ICON[c.icon] }), h('b', null, c.value), h('span', { class: 'g92-sr-only' }, c.label)));
      }
    });

    // wind
    const wv = Math.round(w.wind / WIND_UNIT);
    this.set('wind', String(wv), () => {
      this.wind.classList.toggle('is-calm', wv === 0);
      this.windVal.textContent = wv === 0 ? 'Bezvětří' : String(Math.abs(wv));
      this.windArrow.innerHTML = wv === 0 ? ICON.calm : ICON.wind;
      this.windArrow.style.transform = wv < 0 ? 'scaleX(-1)' : '';
      this.wind.style.setProperty('--strength', String(Math.min(1, Math.abs(wv) / 10)));
      this.wind.title = wv === 0 ? 'Bezvětří' : `Vítr ${Math.abs(wv)} ${wv > 0 ? 'doprava' : 'doleva'}`;
    });

    // dock
    const t = m.active;
    const human = m.isHumanTurn && !!t;
    const phaseKey = `${m.phase}|${t?.id ?? 0}|${human}`;
    this.set('phase', phaseKey, () => {
      this.dock.classList.toggle('is-human', human);
      this.dock.classList.toggle('is-waiting', !human);
      if (!human) this.closePicker();
      if (t && m.phase === 'aim') {
        this.turnLabel.innerHTML = '';
        this.turnLabel.style.setProperty('--c', t.color);
        const label = t.control === 'bot' ? `${t.name} míří…` : t.control === 'passive' ? `${t.name} čeká` : `Na tahu: ${t.name}`;
        this.turnLabel.append(h('span', { class: 'tk-turn__dot' }), h('span', null, label));
      } else if (m.phase === 'flight') this.turnLabel.textContent = '';
      else this.turnLabel.textContent = '';
      this.turnLabel.hidden = !this.turnLabel.textContent;
      this.dock.style.setProperty('--c', t?.color ?? 'var(--accent)');
    });
    if (t) {
      const rel = t.angle <= 90 ? t.angle : 180 - t.angle;
      this.set('angle', `${Math.round(rel)}|${t.facing}`, () => {
        this.angleVal.textContent = `${Math.round(rel)}°`;
        this.angleArrow.style.transform = `rotate(${t.facing > 0 ? -rel : 180 + rel}deg)`;
      });
      this.set('power', String(Math.round(t.power)), () => {
        this.powerVal.textContent = `${Math.round(t.power)} %`;
        this.powerBar.style.width = `${t.power}%`;
      });
      const fuelK = t.maxFuel > 0 ? t.fuel / Math.max(t.maxFuel, 1) : 0;
      this.set('fuel', `${Math.round(fuelK * 100)}|${t.maxFuel > 0}`, () => {
        this.fuelBar.style.width = `${fuelK * 100}%`;
        this.driveBox.classList.toggle('is-empty', t.fuel <= 0);
        this.driveBox.hidden = t.maxFuel <= 0;
      });
      const wdef = WEAPONS[t.weapon];
      const ammo = t.ammo(t.weapon);
      this.set('weapon', `${t.weapon}|${ammo}`, () => {
        this.weaponBtn.innerHTML = `<span class="tk-weapon__icon">${WEAPON_ICONS[t.weapon]}</span><span class="tk-weapon__name">${wdef.name}</span><span class="tk-weapon__ammo">${ammo >= INFINITE ? '∞' : `×${ammo}`}</span><span class="tk-weapon__more" aria-hidden="true">▾</span>`;
        this.weaponBtn.setAttribute('aria-label', `Zbraň: ${wdef.name}, ${ammo >= INFINITE ? 'neomezeně' : `${ammo} kusů`}. Změnit.`);
      });
      const wl = m.availableWeapons(t).map((x) => `${x}${t.ammo(x)}`).join(',');
      if (!this.picker.hidden && wl !== this.lastWeapons) this.buildPicker();
    }

    // hint
    const hint = human ? mode.hint() : null;
    this.set('hint', hint ?? '', (v) => {
      this.hint.hidden = !v;
      if (v) this.renderHint(v);
    });
  }

  private stripTanks(m: Match): Tank[] {
    const tanks = m.world.tanks;
    if (m.mode.id === 'duel' || m.mode.id === 'demo') return tanks.slice().sort((a, b) => a.team - b.team);
    // player first, then enemies (alive first, max 5)
    const me = tanks.filter((t) => t.team === 0);
    const foes = tanks.filter((t) => t.team !== 0).sort((a, b) => Number(b.alive) - Number(a.alive));
    return [...me, ...foes].slice(0, 6);
  }

  private buildPills(tanks: Tank[], m: Match): void {
    this.pillTanks = tanks;
    this.players.innerHTML = '';
    this.pillEls = tanks.map((t, i) => {
      const el = h(
        'div',
        { class: `tk-pill${t.team !== 0 && m.mode.id !== 'duel' && m.mode.id !== 'demo' ? ' tk-pill--foe' : ''}`, style: `--c:${t.color}`, role: 'img' },
        h('span', { class: 'tk-pill__dot' }),
        h('span', { class: 'tk-pill__name' }, t.name),
        h('span', { class: 'tk-pill__hp' }, h('i')),
        m.mode.id === 'duel' ? h('span', { class: 'tk-pill__wins' }) : null,
      );
      this.players.append(el);
      this.cache.delete(`pill${i}`);
      return el;
    });
  }

  private renderHint(v: string): void {
    const touch = document.documentElement.dataset.input === 'touch';
    const kbd = (keys: string[]) => keys.map((k) => `<kbd class="g92-kbd">${k}</kbd>`).join('');
    let html = '';
    switch (v) {
      case 'aim':
        html = touch
          ? `<b>1.</b> Natoč hlaveň – táhni prstem po obrazovce, kam chceš mířit.`
          : `<b>1.</b> Natoč hlaveň: ${kbd(['←', '→'])} nebo táhni myší po obrazovce.`;
        break;
      case 'power':
        html = touch ? `<b>2.</b> Čím dál od tanku táhneš, tím větší síla. Nebo tlačítka ▲▼.` : `<b>2.</b> Nastav sílu: ${kbd(['↑', '↓'])}`;
        break;
      case 'fire':
        html = touch ? `<b>3.</b> Vystřel velkým tlačítkem <b>PAL!</b>` : `<b>3.</b> Vystřel: ${kbd(['Mezerník'])} nebo tlačítko <b>PAL!</b>`;
        break;
      case 'adjust':
        html = `Vedle! Barevná tečka ukazuje, kam jsi dopadl. Uprav úhel nebo sílu a zkus to znovu.`;
        break;
      default:
        html = v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
    }
    this.hint.innerHTML = `<span class="tk-hint__icon" aria-hidden="true">💡</span><span>${html}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Weapon picker
  // ---------------------------------------------------------------------------

  togglePicker(): void {
    if (this.picker.hidden) this.openPicker();
    else this.closePicker();
  }

  openPicker(): void {
    const m = this.match;
    if (!m || !m.isHumanTurn) return;
    this.buildPicker();
    this.picker.hidden = false;
    this.weaponBtn.setAttribute('aria-expanded', 'true');
    sfx.tap();
    (this.picker.querySelector('.is-selected') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  closePicker(): void {
    if (this.picker.hidden) return;
    this.picker.hidden = true;
    this.weaponBtn.setAttribute('aria-expanded', 'false');
  }

  get pickerOpen(): boolean {
    return !this.picker.hidden;
  }

  private buildPicker(): void {
    const m = this.match;
    const t = m?.active;
    if (!m || !t) return;
    const list = m.availableWeapons(t);
    this.lastWeapons = list.map((x) => `${x}${t.ammo(x)}`).join(',');
    this.picker.innerHTML = '';
    this.picker.append(h('div', { class: 'tk-picker__title' }, 'Vyber zbraň'));
    const grid = h('div', { class: 'tk-picker__grid' });
    list.forEach((wid: WeaponId, i) => {
      const def = WEAPONS[wid];
      const n = t.ammo(wid);
      const b = h(
        'button',
        { type: 'button', class: `tk-wpn${wid === t.weapon ? ' is-selected' : ''}`, 'aria-pressed': String(wid === t.weapon), title: def.desc },
        h('span', { class: 'tk-wpn__icon', html: WEAPON_ICONS[wid] }),
        h('span', { class: 'tk-wpn__name' }, def.name),
        h('span', { class: 'tk-wpn__desc' }, def.desc),
        h('span', { class: 'tk-wpn__ammo' }, n >= INFINITE ? '∞' : `×${n}`),
        i < 9 ? h('kbd', { class: 'tk-wpn__key' }, String(i + 1)) : null,
      );
      b.addEventListener('click', () => {
        m.selectWeapon(wid);
        sfx.click();
        this.closePicker();
      });
      grid.append(b);
    });
    this.picker.append(grid);
  }
}
