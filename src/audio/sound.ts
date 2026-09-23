/**
 * Game sound effects synthesized with WebAudio (no files). Follows the shared g92 settings
 * (sound on/off + volume). UI sounds (clicks, win/lose jingles) come from the kit's `sfx`.
 */
import { getSettings, subscribeSettings } from '../kit/settings';
import type { WorldEvent } from '../game/world';

type AC = AudioContext;

export class Sound {
  private ctx: AC | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private lastTick = 0;
  /** Game-level mute (attract mode behind the menu). */
  muted = false;

  constructor() {
    subscribeSettings(() => this.syncVolume());
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  private ensure(): AC | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.syncVolume();
    return this.ctx;
  }

  private syncVolume(): void {
    if (!this.ctx || !this.master) return;
    const s = getSettings();
    const v = s.sound && !this.muted ? Math.pow(s.volume, 1.6) * 0.85 : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.syncVolume();
    if (m) this.drive(false);
  }

  private ready(): AC | null {
    if (this.muted) return null;
    const s = getSettings();
    if (!s.sound || s.volume <= 0) return null;
    const c = this.ensure();
    if (!c || !this.master) return null;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    return c;
  }

  private tone(freq: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const c = this.ready();
    if (!c || !this.master) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private burst(dur: number, gain: number, filterType: BiquadFilterType, f0: number, f1: number, q = 0.8, delay = 0): void {
    const c = this.ready();
    if (!c || !this.master || !this.noise) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 1);
    src.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------------------

  shoot(power: number, heavy = false): void {
    // the original "pew" + a punchy low thump
    this.tone(220 + Math.min(280, power * 3), 110, 0.16, 'square', 0.18);
    this.tone(heavy ? 90 : 130, 40, 0.22, 'sine', 0.55);
    this.burst(0.18, 0.35, 'lowpass', 2400, 300);
  }

  explosion(size: number): void {
    const k = Math.min(1.6, Math.max(0.4, size / 40));
    this.burst(0.5 + 0.5 * k, 0.8, 'lowpass', 900 * k + 300, 80);
    this.tone(90, 30, 0.35 + 0.3 * k, 'sine', 0.6 * Math.min(1, k));
    if (k > 1.1) this.burst(1.3, 0.45, 'bandpass', 400, 120, 0.7, 0.05);
  }

  hit(): void {
    // metallic clank for a direct hit
    this.tone(900, 280, 0.16, 'triangle', 0.35);
    this.tone(1340, 600, 0.1, 'square', 0.08);
    this.burst(0.12, 0.3, 'highpass', 3000, 1500);
  }

  bigBoom(): void {
    // the original long "shattery" burst for a destroyed tank
    this.burst(1.6, 0.8, 'bandpass', 260, 90, 0.7);
    for (let i = 0; i < 5; i++) this.tone(600 + i * 80, 180, 0.14, 'square', 0.12, 0.1 + i * 0.22);
    this.tone(70, 25, 1.0, 'sine', 0.7);
  }

  bounce(): void {
    this.tone(180, 520, 0.14, 'sine', 0.35);
    this.tone(360, 900, 0.1, 'triangle', 0.08, 0.02);
  }

  splash(): void {
    this.burst(0.5, 0.5, 'bandpass', 1400, 300, 1.2);
    this.tone(500, 160, 0.2, 'sine', 0.15);
  }

  portal(): void {
    this.tone(300, 1200, 0.25, 'sine', 0.2);
    this.tone(450, 1800, 0.25, 'triangle', 0.08, 0.05);
  }

  pickup(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.22, i * 0.06));
  }

  pop(): void {
    this.tone(700, 1400, 0.08, 'sine', 0.35);
    this.burst(0.08, 0.25, 'highpass', 2000, 4000);
    [880, 1175].forEach((f, i) => this.tone(f, f, 0.09, 'triangle', 0.12, 0.06 + i * 0.06));
  }

  thud(): void {
    this.tone(120, 50, 0.2, 'sine', 0.45);
    this.burst(0.2, 0.3, 'lowpass', 700, 100);
  }

  crack(): void {
    this.burst(0.18, 0.5, 'bandpass', 1800, 700, 2);
    this.tone(260, 120, 0.1, 'square', 0.1);
  }

  dig(): void {
    this.burst(0.07, 0.18, 'bandpass', 500, 300, 1.5);
  }

  shieldHit(): void {
    this.tone(1200, 700, 0.2, 'sine', 0.2);
    this.tone(1800, 1400, 0.15, 'triangle', 0.08);
  }

  parachute(): void {
    this.burst(0.5, 0.2, 'bandpass', 600, 1400, 0.6);
  }

  turn(): void {
    this.tone(660, 660, 0.08, 'sine', 0.14);
    this.tone(990, 990, 0.1, 'sine', 0.1, 0.07);
  }

  split(): void {
    for (let i = 0; i < 5; i++) this.tone(1200 + i * 200, 2000 + i * 150, 0.12, 'triangle', 0.08, i * 0.03);
  }

  /** Soft tick while aiming (rate-limited). */
  tick(up: boolean): void {
    const now = performance.now();
    if (now - this.lastTick < 55) return;
    this.lastTick = now;
    this.tone(up ? 1500 : 1100, up ? 1500 : 1100, 0.025, 'square', 0.025);
  }

  /** Engine hum while a tank drives. */
  drive(on: boolean): void {
    const c = on ? this.ready() : this.ctx;
    if (!c || !this.master) return;
    if (on && !this.engine) {
      const osc = c.createOscillator();
      const osc2 = c.createOscillator();
      const gain = c.createGain();
      const filter = c.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      osc2.type = 'square';
      osc2.frequency.value = 27.5;
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.13, c.currentTime, 0.05);
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain, filter };
    } else if (!on && this.engine) {
      const e = this.engine;
      this.engine = null;
      e.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.06);
      e.osc.stop(c.currentTime + 0.3);
      e.osc2.stop(c.currentTime + 0.3);
    }
    if (on && this.engine) this.engine.osc.frequency.setTargetAtTime(55 + Math.random() * 8, c.currentTime, 0.05);
  }

  handle(e: WorldEvent): void {
    switch (e.t) {
      case 'fire':
        this.shoot(e.power, e.weapon === 'big' || e.weapon === 'mega');
        break;
      case 'explosion':
        if (e.kind === 'dirt') this.thud();
        else if (e.kind === 'small') this.tone(400, 200, 0.2, 'sawtooth', 0.12);
        else if (e.kind === 'death') this.bigBoom();
        else this.explosion(e.r);
        if (e.direct) this.hit();
        break;
      case 'bounce':
        if (e.on === 'terrain' || e.on === 'pad' || e.on === 'wall' || e.on === 'block') this.bounce();
        break;
      case 'splash':
        this.splash();
        break;
      case 'portal':
        this.portal();
        break;
      case 'crate':
        if (e.tank) this.pickup();
        else this.crack();
        break;
      case 'crateSpawn':
        this.parachute();
        break;
      case 'wood':
        this.crack();
        break;
      case 'land':
        if (e.fall > 30) this.thud();
        break;
      case 'dig':
        this.dig();
        break;
      case 'target':
        this.pop();
        break;
      case 'split':
        this.split();
        break;
      case 'shield':
        this.shieldHit();
        break;
      default:
        break;
    }
  }
}
