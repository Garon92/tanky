import { Input, type PressAction } from './core/input';
import { FixedLoop } from './core/loop';
import { Save } from './core/storage';
import { Sound } from './audio/sound';
import { SIM_DT } from './game/constants';
import { levelById, LEVELS } from './game/levels';
import { Match, type ResultData, type RewardOption } from './game/match';
import { CampaignMode, DemoMode, DuelMode, SurvivalMode, TargetsMode, type DuelConfig } from './game/modes';
import type { BiomeId } from './game/types';
import { Renderer } from './render/renderer';
import { recordActivity } from './kit/activity';
import { openDialog, openSettingsDialog } from './kit/dialog';
import { UI_ICONS } from './kit/dom';
import { autoPause, showPause, showResults, showStart } from './kit/overlay';
import { getSettings, prefersReducedMotion, setSettings, subscribeSettings } from './kit/settings';
import { sfx } from './kit/sfx';
import { toast } from './kit/toast';
import { Hud } from './ui/hud';
import { ICON } from './ui/icons';
import { PointerAim } from './ui/pointer';
import {
  DIFFICULTIES,
  helpContent,
  levelIntroExtra,
  settingsExtra,
  showCampaign,
  showDuelSetup,
  showHome,
  showReward,
  type DuelSetup,
} from './ui/screens';

type Spec = { mode: 'campaign'; level: number } | { mode: 'duel'; cfg: DuelSetup } | { mode: 'survival' } | { mode: 'targets' };
type State = 'menu' | 'intro' | 'play' | 'paused' | 'reward' | 'results';

export class App {
  readonly save = new Save();
  readonly input = new Input();
  readonly sound = new Sound();
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly pointer: PointerAim;
  readonly loop: FixedLoop;
  private demo!: Match;
  private match: Match | null = null;
  private spec: Spec | null = null;
  state: State = 'menu';
  private overlays: { close: (v: never) => void }[] = [];
  private appbar: HTMLElement | null;
  private lastAim = { angle: 0, power: 0, id: 0 };
  private resultTimer = 0;
  private dialogOpen = false;
  private rotateTipShown = false;

  constructor(
    private stage: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.appbar = document.querySelector('g92-appbar');
    this.renderer = new Renderer(canvas);
    this.renderer.onHitStop = (s) => this.loop.hitStop(s);
    this.hud = new Hud(stage, this.input, {
      pause: () => this.pause(),
      fire: () => {
        if (this.state === 'play' && this.match?.fire()) this.pointer.cancel();
      },
    });
    this.pointer = new PointerAim(canvas, this.renderer);
    this.loop = new FixedLoop({ update: (dt) => this.update(dt), render: (dt) => this.render(dt) }, SIM_DT);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(stage);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.applyPrefs();
    subscribeSettings(() => this.applyPrefs());
    matchMedia('(pointer: coarse)').matches && (document.documentElement.dataset.input = 'touch');
    window.addEventListener('touchstart', () => (document.documentElement.dataset.input = 'touch'), { passive: true, capture: true });

    this.input.onAnyPress = (a) => this.globalPress(a);
    autoPause(() => {
      if (this.state === 'play') this.pause();
    });

    this.appbar?.addEventListener('g92-help', () => this.openHelp());
    this.appbar?.addEventListener('g92-settings', (e) => {
      e.preventDefault();
      this.openSettings();
    });
    window.matchMedia('(max-height: 540px)').addEventListener('change', () => this.updateChrome());
  }

  boot(): void {
    this.newDemo();
    this.loop.start();
    recordActivity('tanky', this.activity());
    this.goHome();
    if (!this.save.data.seenHelp) {
      this.save.data.seenHelp = true;
      this.save.commit('seenHelp');
    }
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  private get current(): Match {
    return this.match ?? this.demo;
  }

  private resize(): void {
    const r = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    // Portrait: keep the battlefield between the HUD bars instead of under them.
    const portrait = r.height > r.width * 1.05;
    const playing = this.state === 'play' || this.state === 'paused' || this.state === 'reward' || this.state === 'results';
    const cam = this.renderer.cam;
    if (portrait) {
      cam.insetTop = 96;
      cam.insetBottom = playing ? Math.max(150, this.hud.dockHeight() + 20) : r.height * 0.18;
    } else {
      cam.insetTop = 0;
      cam.insetBottom = 0;
    }
    this.renderer.resize(r.width, r.height, dpr);
  }

  private applyPrefs(): void {
    const reduce = prefersReducedMotion();
    this.renderer.cam.enabled = this.save.data.prefs.shake && !reduce;
    this.renderer.fx.intensity = reduce ? 0.5 : 1;
  }

  private updateChrome(): void {
    const compact = window.matchMedia('(max-height: 540px)').matches;
    const hideBar = compact && this.state !== 'menu';
    if (this.appbar) this.appbar.hidden = hideBar;
    document.body.classList.toggle('is-playing', this.state === 'play' || this.state === 'paused' || this.state === 'reward');
    requestAnimationFrame(() => this.resize());
  }

  private setState(s: State): void {
    this.state = s;
    this.input.captureGameplay = s === 'play';
    if (s !== 'play') {
      this.input.reset();
      this.pointer.cancel();
      this.sound.drive(false);
    }
    this.updateChrome();
  }

  private closeOverlays(): void {
    for (const o of this.overlays) o.close(undefined as never);
    this.overlays = [];
    clearTimeout(this.resultTimer);
  }

  private track<T>(o: { close: (v: T) => void }): void {
    this.overlays.push(o as unknown as { close: (v: never) => void });
  }

  private newDemo(): void {
    const m = new Match(new DemoMode(), { guide: 'off', hints: false });
    m.botSpeed = 1.3;
    m.begin();
    this.demo = m;
  }

  private settings() {
    return { guide: this.save.data.prefs.guide, hints: this.save.data.prefs.hints };
  }

  private playerName(): string {
    return getSettings().playerName.trim() || 'Ty';
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  private update(dt: number): void {
    this.input.tick(dt);
    const presses = this.input.takePresses();
    const m = this.current;
    if (this.state === 'play' && this.match) {
      for (const p of presses) {
        if (p === 'pause' || p === 'fullscreen' || p === 'mute' || p === 'help') continue;
        if (p === 'fire' && this.hud.pickerOpen) {
          this.hud.closePicker();
          continue;
        }
        this.match.handlePress(p);
      }
      this.match.applyHumanInput(this.input, dt);
    }
    const run = this.state === 'menu' || this.state === 'play' || this.state === 'results';
    if (run) m.update(dt);
    // events → visuals & sound
    const isDemo = m === this.demo;
    for (const e of m.drainEvents()) {
      this.renderer.handleEvent(e, m);
      if (!isDemo) this.sound.handle(e);
    }
    if (!isDemo && this.state === 'play') {
      const t = m.active;
      this.sound.drive(!!t && t.driving > 0 && m.isHumanTurn);
      if (t && m.isHumanTurn) {
        if (this.lastAim.id === t.id && (Math.abs(t.angle - this.lastAim.angle) >= 1 || Math.abs(t.power - this.lastAim.power) >= 1)) {
          this.sound.tick(t.power > this.lastAim.power || t.angle > this.lastAim.angle);
          this.lastAim.angle = Math.round(t.angle);
          this.lastAim.power = Math.round(t.power);
        }
        if (this.lastAim.id !== t.id) this.lastAim = { angle: Math.round(t.angle), power: Math.round(t.power), id: t.id };
      }
    }
  }

  private render(dt: number): void {
    const m = this.current;
    this.renderer.showLabels = this.state !== 'menu';
    this.renderer.draw(m, dt, this.state === 'paused');
    this.hud.update();
  }

  private globalPress(a: PressAction): void {
    if (a === 'fullscreen') this.toggleFullscreen();
    else if (a === 'mute') {
      const on = !getSettings().sound;
      setSettings({ sound: on });
      toast(on ? 'Zvuk zapnut' : 'Zvuk vypnut', { icon: on ? UI_ICONS.soundOn : UI_ICONS.soundOff, duration: 1200 });
    } else if (a === 'help') {
      if (!this.dialogOpen && (this.state === 'play' || this.state === 'menu')) this.openHelp();
    } else if (a === 'pause' && this.state === 'play' && !this.dialogOpen) {
      if (this.hud.pickerOpen) this.hud.closePicker();
      else this.pause();
    }
  }

  private toggleFullscreen(): void {
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (d.fullscreenElement ?? d.webkitFullscreenElement) void (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    else void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  }

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------

  goHome(): void {
    this.closeOverlays();
    this.match = null;
    this.spec = null;
    this.hud.hide();
    this.pointer.match = null;
    this.sound.setMuted(true);
    if (this.demo.phase === 'over' || !this.demo.world) this.newDemo();
    this.setState('menu');
    const s = showHome(this.save);
    this.track(s);
    void s.done.then((choice) => {
      if (choice === undefined) return;
      switch (choice) {
        case 'campaign':
          this.openCampaign();
          break;
        case 'duel':
          this.openDuel();
          break;
        case 'survival':
          void this.start({ mode: 'survival' });
          break;
        case 'targets':
          void this.start({ mode: 'targets' });
          break;
        case 'help':
          this.openHelp().then(() => this.goHome());
          break;
      }
    });
  }

  private openCampaign(): void {
    this.closeOverlays();
    this.setState('menu');
    const s = showCampaign(this.save);
    this.track(s);
    void s.done.then((id) => {
      if (id === undefined) return;
      if (id === null) this.goHome();
      else void this.start({ mode: 'campaign', level: id });
    });
  }

  private openDuel(): void {
    this.closeOverlays();
    this.setState('menu');
    const s = showDuelSetup(this.save);
    this.track(s);
    void s.done.then((cfg) => {
      if (cfg === undefined) return;
      if (cfg === null) this.goHome();
      else void this.start({ mode: 'duel', cfg }, false);
    });
  }

  openHelp(): Promise<void> {
    const wasPlaying = this.state === 'play';
    if (wasPlaying) this.pause();
    this.dialogOpen = true;
    const d = openDialog({ title: 'Jak hrát', icon: UI_ICONS.help, content: helpContent(), wide: true, actions: [{ label: 'Rozumím', value: 'ok' }] });
    return d.closed.then(() => {
      this.dialogOpen = false;
    });
  }

  private openSettings(): void {
    if (this.state === 'play') this.pause();
    this.dialogOpen = true;
    const d = openSettingsDialog({ extra: settingsExtra(this.save, () => this.applyPrefsAndMatch()) });
    void d.closed.then(() => {
      this.dialogOpen = false;
    });
  }

  private applyPrefsAndMatch(): void {
    this.applyPrefs();
    if (this.match) {
      const s = this.settings();
      this.match.settings.guide = s.guide;
      this.match.settings.hints = s.hints;
    }
  }

  // ---------------------------------------------------------------------------
  // Games
  // ---------------------------------------------------------------------------

  private createMatch(spec: Spec): Match {
    const d = this.save.data;
    let mode;
    switch (spec.mode) {
      case 'campaign':
        mode = new CampaignMode(spec.level, d.campaign.difficulty, this.playerName(), d.campaign.stars[spec.level - 1] ?? 0);
        break;
      case 'duel': {
        const cfg: DuelConfig = { ...spec.cfg, biome: spec.cfg.biome as BiomeId | 'random' };
        mode = new DuelMode(cfg);
        break;
      }
      case 'survival':
        mode = new SurvivalMode(this.playerName(), d.survival.bestScore);
        break;
      case 'targets':
        mode = new TargetsMode(this.playerName(), d.targets.bestScore);
        break;
    }
    const m = new Match(mode, this.settings());
    m.onAnnounce = (a) => this.hud.announce(a);
    m.onOver = (r) => this.onOver(m, r);
    m.onReward = (opts) => this.onReward(m, opts);
    m.onTurn = (t) => {
      if (m !== this.match) return;
      const humans = m.world.tanks.filter((x) => x.control === 'human').length;
      if (t.control === 'human' && humans > 1) this.hud.announce({ text: `Na tahu: ${t.name}`, color: t.color, kind: 'turn' });
      if (t.control === 'human') this.sound.turn();
    };
    m.begin();
    return m;
  }

  /** Build the match (visible behind the start panel), show the intro, then play. */
  async start(spec: Spec, intro = true): Promise<void> {
    this.closeOverlays();
    this.spec = spec;
    let m = this.createMatch(spec);
    this.match = m;
    this.pointer.match = m;
    this.hud.hide();
    this.sound.setMuted(false);
    this.setState('intro');
    if (intro) {
      const choice = await this.showIntro(spec);
      if (this.match !== m) return; // replaced meanwhile
      if (choice === 'back') {
        if (spec.mode === 'campaign') this.openCampaign();
        else this.goHome();
        return;
      }
      if (spec.mode === 'campaign' && choice !== this.save.data.campaign.difficulty && (choice === 'easy' || choice === 'normal' || choice === 'hard')) {
        this.save.update('campaign', (c) => (c.difficulty = choice));
        m = this.createMatch(spec);
        this.match = m;
        this.pointer.match = m;
      }
    }
    this.hud.show(m);
    this.setState('play');
    this.lastAim.id = 0;
    if (!this.rotateTipShown && window.innerHeight > window.innerWidth * 1.1 && window.innerWidth < 700) {
      this.rotateTipShown = true;
      toast('Tip: otoč zařízení na šířku – bojiště bude větší.', { icon: UI_ICONS.restart, duration: 4500 });
    }
    if (spec.mode === 'campaign') {
      this.save.update('campaign', (c) => (c.last = spec.level));
      const lv = levelById(spec.level);
      if (lv) this.hud.announce({ text: `${lv.id}. ${lv.name}`, sub: this.save.data.campaign.difficulty === 'easy' ? 'Lehká obtížnost' : this.save.data.campaign.difficulty === 'hard' ? 'Těžká obtížnost' : undefined, kind: 'round' });
    } else if (spec.mode === 'duel') {
      this.hud.announce({ text: 'Kolo 1', sub: `Hraje se na ${spec.cfg.rounds} ${spec.cfg.rounds === 1 ? 'výhru' : spec.cfg.rounds < 5 ? 'výhry' : 'výher'}`, kind: 'round' });
    }
  }

  private showIntro(spec: Spec): Promise<string> {
    const d = this.save.data;
    let p: ReturnType<typeof showStart>;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'g92-btn g92-btn--ghost g92-btn--sm tk-intro-back';
    back.innerHTML = `${UI_ICONS.back}<span>${spec.mode === 'campaign' ? 'Zpět na úrovně' : 'Zpět'}</span>`;
    let backed = false;
    back.addEventListener('click', () => {
      backed = true;
      sfx.tap();
      p.close({ difficulty: 'back' });
    });
    const keysCommon = [
      { keys: ['←', '→'], text: 'otáčení hlavně' },
      { keys: ['↑', '↓'], text: 'síla' },
      { keys: ['Mezerník'], text: 'výstřel' },
      { keys: ['Q', 'E'], text: 'jízda' },
      { keys: ['Tab'], text: 'zbraň' },
    ];
    const howTo = [
      { icon: '👆', text: 'Táhni prstem nebo myší – hlaveň míří k prstu. Dál = silněji.' },
      { icon: '💥', text: 'Vystřel tlačítkem PAL! nebo mezerníkem.' },
      { icon: '🔴', text: 'Tečka ukáže, kam jsi dopadl. Oprav míření!' },
      { icon: '🎁', text: 'Sestřel bednu s padákem a dostaneš dárek.' },
    ];
    let extra: HTMLElement | null = null;
    if (spec.mode === 'campaign') {
      const lv = levelById(spec.level) ?? LEVELS[0]!;
      extra = levelIntroExtra(lv);
      const stars = d.campaign.stars[lv.id - 1] ?? 0;
      p = showStart({
        backdrop: 'blur',
        title: `${lv.id}. ${lv.name}`,
        subtitle: lv.intro,
        icon: ICON.campaign,
        playLabel: 'Do boje!',
        difficulties: DIFFICULTIES,
        difficulty: d.campaign.difficulty,
        best: stars ? { label: 'Tvoje hvězdy', value: '★'.repeat(stars) + '☆'.repeat(3 - stars) } : null,
        howTo,
        keys: keysCommon,
        showHowTo: lv.tutorial && !d.campaign.stars.some((s) => s > 0),
        compact: true,
      });
    } else if (spec.mode === 'survival') {
      p = showStart({
        backdrop: 'blur',
        title: 'Přežití',
        subtitle: 'Nepřátelé padají z nebe na padácích. Vydrž co nejvíc vln! Mezi vlnami si vybereš odměnu.',
        icon: ICON.survival,
        best: d.survival.bestScore ? { label: `Rekord (vlna ${d.survival.bestWave})`, value: d.survival.bestScore } : null,
        howTo,
        keys: keysCommon,
      });
    } else {
      p = showStart({
        backdrop: 'blur',
        title: 'Střelnice',
        subtitle: 'Máš 12 ran. Sestřel co nejvíc balónků, terčů, ptáků a UFO. Víc cílů jednou ranou = kombo!',
        icon: ICON.range,
        playLabel: 'Střílet!',
        best: d.targets.bestScore ? { label: 'Rekord', value: d.targets.bestScore } : null,
        howTo,
        keys: keysCommon,
      });
    }
    // Kit showStart({ extra }) can't insert into the start view yet (see kit-requests.md) → insert manually.
    const actions = p.el.querySelector('.g92-overlay__view .g92-overlay__actions');
    if (actions && actions.parentElement) {
      if (extra) actions.parentElement.insertBefore(extra, actions);
      actions.parentElement.append(back);
    }
    this.track(p);
    return p.then((r) => (backed ? 'back' : (r?.difficulty ?? '')));
  }

  pause(): void {
    if (this.state !== 'play' || !this.match) return;
    this.setState('paused');
    this.hud.closePicker();
    const m = this.match;
    const info = m.mode.hud();
    const p = showPause({
      subtitle: info.title,
      menuHref: null,
      menuLabel: 'Nabídka',
      stats: info.counters.map((c) => ({ label: c.label, value: c.value })),
    });
    this.track(p);
    void p.then((choice) => {
      if (choice === undefined || this.match !== m) return;
      this.overlays = this.overlays.filter((o) => o !== (p as unknown));
      if (choice === 'resume') this.setState('play');
      else if (choice === 'restart' && this.spec) void this.start(this.spec, false);
      else if (choice === 'menu') {
        if (this.spec?.mode === 'campaign') this.openCampaignFromGame();
        else this.goHome();
      }
    });
  }

  private openCampaignFromGame(): void {
    this.match = null;
    this.hud.hide();
    this.sound.setMuted(true);
    this.openCampaign();
  }

  private onReward(m: Match, opts: RewardOption[]): void {
    if (m !== this.match) return;
    const mode = m.mode as SurvivalMode;
    this.setState('reward');
    sfx.levelUp();
    const s = showReward(mode.wave, opts);
    this.track(s);
    void s.done.then((i) => {
      if (i === undefined || this.match !== m) return;
      m.mode.chooseReward(i);
      this.setState('play');
    });
  }

  // ---------------------------------------------------------------------------
  // Results & progress
  // ---------------------------------------------------------------------------

  private onOver(m: Match, r: ResultData): void {
    if (m !== this.match) return;
    this.setState('results');
    this.hud.hide();
    const d = this.save.data;
    // global stats
    const humans = m.world.tanks.filter((t) => t.control === 'human');
    this.save.update('stats', (s) => {
      s.games++;
      for (const t of humans) {
        s.shots += t.shots;
        s.hits += t.hits;
        s.kills += t.kills;
      }
      if (r.won) s.wins++;
    });
    let isNewBest = false;
    let best: number | undefined;
    if (m.mode instanceof CampaignMode) {
      const lvl = m.mode.def.id;
      const prev = d.campaign.stars[lvl - 1] ?? 0;
      if ((r.stars ?? 0) > prev) {
        this.save.update('campaign', (c) => {
          while (c.stars.length < lvl) c.stars.push(0);
          c.stars[lvl - 1] = r.stars ?? 0;
        });
      }
      if (r.won) {
        const shots = m.mode.player.shots;
        this.save.update('campaign', (c) => {
          while (c.bestShots.length < lvl) c.bestShots.push(0);
          const b = c.bestShots[lvl - 1] ?? 0;
          if (!b || shots < b) c.bestShots[lvl - 1] = shots;
        });
      }
    } else if (m.mode instanceof SurvivalMode) {
      const mode = m.mode;
      isNewBest = mode.score > d.survival.bestScore;
      this.save.update('survival', (s) => {
        s.bestScore = Math.max(s.bestScore, mode.score);
        s.bestWave = Math.max(s.bestWave, mode.wave);
      });
      best = this.save.data.survival.bestScore;
    } else if (m.mode instanceof TargetsMode) {
      const mode = m.mode;
      isNewBest = mode.score > d.targets.bestScore;
      this.save.update('targets', (s) => (s.bestScore = Math.max(s.bestScore, mode.score)));
      best = this.save.data.targets.bestScore;
    }
    recordActivity('tanky', this.activity());

    this.resultTimer = window.setTimeout(() => {
      if (this.match !== m) return;
      let extra: HTMLElement | undefined;
      if (r.table && r.tableHead) {
        extra = document.createElement('div');
        extra.className = 'tk-table-wrap';
        const table = document.createElement('table');
        table.className = 'tk-table';
        table.innerHTML =
          `<thead><tr><th>Hráč</th>${r.tableHead.map((x) => `<th>${x}</th>`).join('')}</tr></thead>` +
          `<tbody>${r.table
            .map((row) => `<tr><td><span class="tk-dot" style="--c:${row.color}"></span>${row.name}</td>${row.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('')}</tbody>`;
        extra.append(table);
      }
      const isCampaign = m.mode instanceof CampaignMode;
      const actions: { label: string; value: string; variant?: 'primary' | 'secondary' | 'ghost' | 'soft'; icon?: string }[] = [];
      // won a campaign level → the big button continues, replay is secondary
      const nextFirst = isCampaign && !!r.canNext;
      if (nextFirst) actions.push({ label: 'Znovu', value: 'retry', variant: 'secondary', icon: UI_ICONS.restart });
      const p = showResults({
        title: r.title,
        subtitle: r.subtitle,
        score: r.score,
        best: r.score !== undefined ? best : undefined,
        isNewBest: isNewBest && (r.score ?? 0) > 0,
        stars: r.stars,
        stats: r.stats.map((s) => ({ label: s.label, value: s.value })),
        againLabel: nextFirst ? 'Další úroveň' : r.won === false ? 'Zkusit znovu' : 'Hrát znovu',
        againIcon: nextFirst ? UI_ICONS.arrowRight : undefined,
        menuHref: null,
        menuLabel: isCampaign ? 'Úrovně' : 'Nabídka',
        actions,
        lost: r.won === false,
        extra,
      });
      this.track(p);
      void p.then((choice) => {
        if (choice === undefined || this.match !== m) return;
        if (choice === 'again' && nextFirst && m.mode instanceof CampaignMode) void this.start({ mode: 'campaign', level: m.mode.def.id + 1 });
        else if ((choice === 'again' || choice === 'retry') && this.spec) void this.start(this.spec, this.spec.mode === 'campaign');
        else if (choice === 'menu') {
          if (isCampaign) this.openCampaignFromGame();
          else this.goHome();
        }
      });
    }, r.won === false ? 1300 : 1600);
  }

  private activity() {
    const d = this.save.data;
    const stars = this.save.totalStars;
    const levels = d.campaign.stars.filter((s) => s > 0).length;
    return {
      metric: stars > 0 ? { label: 'Hvězdy', value: `${stars}/${LEVELS.length * 3}` } : d.survival.bestScore ? { label: 'Rekord', value: d.survival.bestScore } : undefined,
      progress: stars / (LEVELS.length * 3),
      note: levels > 0 ? (levels >= LEVELS.length ? 'Tažení dokončeno!' : `Tažení: úroveň ${levels + 1}`) : undefined,
    };
  }
}
