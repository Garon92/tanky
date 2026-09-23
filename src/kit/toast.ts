/**
 * Toasts — short, non-blocking messages at the bottom of the screen.
 *   toast('Uloženo');
 *   toast('Nový rekord!', { variant: 'success', icon: UI_ICONS.trophy, duration: 3000 });
 */
import { h } from './dom';

export type ToastVariant = 'default' | 'success' | 'danger' | 'accent';

export interface ToastOptions {
  variant?: ToastVariant;
  /** ms; 0 = stays until dismissed via the returned function */
  duration?: number;
  /** SVG string */
  icon?: string;
}

let region: HTMLElement | null = null;

function getRegion(): HTMLElement {
  if (region && region.isConnected) return region;
  region = h('div', { class: 'g92-toasts', role: 'status', 'aria-live': 'polite' });
  document.body.append(region);
  return region;
}

/** Show a toast; returns a function that dismisses it. */
export function toast(message: string, opts: ToastOptions = {}): () => void {
  const el = h('div', { class: `g92-toast${opts.variant && opts.variant !== 'default' ? ` g92-toast--${opts.variant}` : ''}` });
  if (opts.icon) el.append(h('span', { html: opts.icon, style: 'width:22px;height:22px;flex:none;display:grid' }));
  el.append(h('span', null, message));
  const r = getRegion();
  r.append(el);
  while (r.children.length > 3) r.firstElementChild?.remove();
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  const duration = opts.duration ?? 2600;
  if (duration > 0) setTimeout(dismiss, duration);
  el.addEventListener('click', dismiss);
  return dismiss;
}
