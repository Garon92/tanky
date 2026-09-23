/**
 * Keyboard + gamepad input. Game code reads abstract actions, never raw keys.
 * Both key sets (arrows and WASD) control whichever human tank is on turn –
 * the original game gave red WASD and blue arrows; accepting both keeps that muscle memory
 * while letting any player use any side of the keyboard.
 */
export type HoldAction = 'aimLeft' | 'aimRight' | 'powerUp' | 'powerDown' | 'driveLeft' | 'driveRight' | 'fine';
export type PressAction =
  | 'fire'
  | 'nextWeapon'
  | 'prevWeapon'
  | 'pause'
  | 'help'
  | `weapon${number}`;

const HOLD_KEYS: Record<string, HoldAction> = {
  ArrowLeft: 'aimLeft',
  KeyA: 'aimLeft',
  ArrowRight: 'aimRight',
  KeyD: 'aimRight',
  ArrowUp: 'powerUp',
  KeyW: 'powerUp',
  ArrowDown: 'powerDown',
  KeyS: 'powerDown',
  KeyQ: 'driveLeft',
  KeyE: 'driveRight',
  ShiftLeft: 'fine',
  ShiftRight: 'fine',
};

const PRESS_KEYS: Record<string, PressAction> = {
  Space: 'fire',
  Enter: 'fire',
  NumpadEnter: 'fire',
  Tab: 'nextWeapon',
  KeyX: 'nextWeapon',
  KeyZ: 'prevWeapon',
  Escape: 'pause',
  KeyP: 'pause',
  KeyH: 'help', // M sound, F fullscreen, ? help: <g92-appbar keys>
};

export class Input {
  private held = new Map<HoldAction, number>(); // action -> seconds held
  private sources = new Map<HoldAction, Set<string>>(); // action -> which keys/buttons hold it
  private pressed: PressAction[] = [];
  /** When false, keys are not captured (menus use native focus/keyboard). */
  captureGameplay = false;
  private padPrev: boolean[] = [];
  padAxes = { x: 0, y: 0 };
  lastDevice: 'keyboard' | 'pointer' | 'touch' | 'gamepad' = 'keyboard';
  onAnyPress?: (a: PressAction) => void;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onDown, { capture: true });
    target.addEventListener('keyup', this.onUp, { capture: true });
    target.addEventListener('blur', () => this.reset());
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const inField = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    if (inField) return;
    this.lastDevice = 'keyboard';
    const hold = HOLD_KEYS[e.code];
    const press: PressAction | undefined =
      PRESS_KEYS[e.code] ?? (/^Digit[1-9]$/.test(e.code) ? (`weapon${e.code.slice(5)}` as PressAction) : undefined);
    // Global actions work everywhere (menus too) but only while no dialog input is focused.
    if (press === 'pause' || press === 'help') {
      if (!e.repeat) {
        this.pressed.push(press);
        this.onAnyPress?.(press);
      }
      if (press === 'pause' && this.captureGameplay) e.preventDefault();
      return;
    }
    if (!this.captureGameplay) return;
    if (hold || press) e.preventDefault();
    if (hold) this.setHold(hold, `key:${e.code}`, true);
    if (press && !e.repeat) {
      if (press === 'nextWeapon' && e.code === 'Tab' && e.shiftKey) this.pressed.push('prevWeapon');
      else this.pressed.push(press);
    }
  };

  private onUp = (e: KeyboardEvent): void => {
    const hold = HOLD_KEYS[e.code];
    if (hold) this.setHold(hold, `key:${e.code}`, false);
  };

  /** Hold/release an action from a named source (key, gamepad button, on-screen button). */
  setHold(a: HoldAction, source: string, on: boolean): void {
    let set = this.sources.get(a);
    if (on) {
      if (!set) this.sources.set(a, (set = new Set()));
      set.add(source);
      if (!this.held.has(a)) this.held.set(a, 0);
    } else if (set) {
      set.delete(source);
      if (set.size === 0) {
        this.sources.delete(a);
        this.held.delete(a);
      }
    }
  }

  reset(): void {
    this.held.clear();
    this.sources.clear();
    this.pressed.length = 0;
  }

  /** Advance hold timers; poll gamepads. Call once per simulation step. */
  tick(dt: number): void {
    for (const [k, v] of this.held) this.held.set(k, v + dt);
    this.pollPad(dt);
  }

  isHeld(a: HoldAction): boolean {
    return this.held.has(a);
  }

  heldFor(a: HoldAction): number {
    return this.held.get(a) ?? 0;
  }

  /** Drain queued presses. */
  takePresses(): PressAction[] {
    if (this.pressed.length === 0) return [];
    const out = this.pressed.slice();
    this.pressed.length = 0;
    return out;
  }

  /** Programmatic press (HUD buttons, gamepad). */
  push(a: PressAction): void {
    this.pressed.push(a);
  }

  private pollPad(dt: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) {
      this.padAxes.x = 0;
      this.padAxes.y = 0;
      if (this.padPrev.length) {
        for (const a of ['aimLeft', 'aimRight', 'powerUp', 'powerDown', 'driveLeft', 'driveRight'] as HoldAction[]) this.setHold(a, 'pad', false);
        this.padPrev = [];
      }
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const ax = dz(pad.axes[0] ?? 0);
    const ay = dz(pad.axes[1] ?? 0);
    this.padAxes.x = ax;
    this.padAxes.y = ay;
    const b = pad.buttons.map((x) => x.pressed);
    const edge = (i: number) => !!b[i] && !this.padPrev[i];
    if (b.some(Boolean) || ax !== 0 || ay !== 0) this.lastDevice = 'gamepad';
    if (edge(0)) this.pressed.push('fire');
    if (edge(5) || edge(3)) this.pressed.push('nextWeapon');
    if (edge(4) || edge(2)) this.pressed.push('prevWeapon');
    if (edge(9) || edge(8)) this.pressed.push('pause');
    // D-pad as hold actions
    const setHold = (a: HoldAction, on: boolean) => this.setHold(a, 'pad', on);
    setHold('aimLeft', !!b[14]);
    setHold('aimRight', !!b[15]);
    setHold('powerUp', !!b[12]);
    setHold('powerDown', !!b[13]);
    setHold('driveLeft', !!b[6]);
    setHold('driveRight', !!b[7]);
    this.padPrev = b;
    void dt;
  }
}
