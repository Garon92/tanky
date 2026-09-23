/** Colourful SVG icons for weapons, pickups and controls (24×24 viewBox). */
import type { WeaponId } from '../game/types';

const svg = (body: string, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
const line = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const WEAPON_ICONS: Record<WeaponId, string> = {
  shell: svg('<circle cx="12" cy="12" r="6" fill="#ffd54a" stroke="#b8860b" stroke-width="1.5"/><circle cx="10" cy="10" r="2" fill="#fff" opacity=".8"/>'),
  big: svg(
    '<circle cx="11" cy="14" r="7.5" fill="#37474f"/><circle cx="8.5" cy="11.5" r="2.2" fill="#fff" opacity=".35"/><rect x="13.5" y="4.5" width="4" height="4" rx="1" transform="rotate(35 15.5 6.5)" fill="#78909c"/><path d="M17 4.5q2-2.5 4-1" stroke="#ff8a3d" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="21" cy="3.2" r="1.4" fill="#ffd54a"/>',
  ),
  triple: svg('<circle cx="6" cy="16" r="3.4" fill="#ffe066" stroke="#b8860b"/><circle cx="12" cy="9" r="3.4" fill="#ffe066" stroke="#b8860b"/><circle cx="18" cy="16" r="3.4" fill="#ffe066" stroke="#b8860b"/>'),
  bouncer: svg('<path d="M2 20q4-12 8 0q3-8 6 0q2-5 5 0" fill="none" stroke="#7cf29c" stroke-width="1.8" stroke-dasharray="2 2"/><circle cx="18.5" cy="8" r="4.5" fill="#43c465" stroke="#1b7a37" stroke-width="1.2"/><circle cx="17" cy="6.5" r="1.4" fill="#fff" opacity=".8"/>'),
  roller: svg('<circle cx="12" cy="12" r="8" fill="#90a4ae" stroke="#455a64" stroke-width="1.6"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" stroke="#455a64" stroke-width="1.2"/><circle cx="12" cy="12" r="2.4" fill="#eceff1"/>'),
  cluster: svg(
    '<circle cx="12" cy="12" r="3" fill="#ff6bd6"/><g stroke-width="2" stroke-linecap="round"><path d="M12 2v4" stroke="#ffd54a"/><path d="M12 18v4" stroke="#4bb3ff"/><path d="M2 12h4" stroke="#4cd964"/><path d="M18 12h4" stroke="#ff4b4b"/><path d="m4.9 4.9 2.8 2.8" stroke="#b388ff"/><path d="m16.3 16.3 2.8 2.8" stroke="#ffc53d"/><path d="m4.9 19.1 2.8-2.8" stroke="#ff8fd1"/><path d="m16.3 7.7 2.8-2.8" stroke="#40e0d0"/></g>',
  ),
  digger: svg('<path d="M3 20h18" stroke="#8d6e63" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="12" cy="13" rx="6.5" ry="5.5" fill="#6d4c41"/><circle cx="9.5" cy="12" r="1.1" fill="#111"/><circle cx="14.5" cy="12" r="1.1" fill="#111"/><ellipse cx="12" cy="15" rx="2" ry="1.4" fill="#f48fb1"/>'),
  dirt: svg('<path d="M2 20q3-11 10-11t10 11Z" fill="#a0703f" stroke="#6d4523" stroke-width="1.4"/><circle cx="9" cy="15" r="1.2" fill="#6d4523"/><circle cx="14" cy="13" r="1" fill="#6d4523"/><circle cx="16" cy="17" r="1.1" fill="#6d4523"/>'),
  homing: svg('<path d="M4 20c3-8 8-13 16-16" fill="none" stroke="#5ad1ff" stroke-width="1.6" stroke-dasharray="2 2.5"/><g transform="rotate(-40 14 10)"><rect x="8" y="8" width="11" height="4.5" rx="2.2" fill="#eceff1" stroke="#607d8b"/><path d="M19 8l3.5 2.2L19 12.5Z" fill="#5ad1ff"/><path d="M8 8.3 5.5 6.5v6l2.5-1.3" fill="#ff7043"/></g>'),
  mega: svg('<circle cx="12" cy="13" r="9" fill="#d32f2f" stroke="#7f0000" stroke-width="1.2"/><path d="M12 7.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L12 15.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4Z" fill="#ffd54a"/><path d="M15 3q2-1.5 3.5.5" stroke="#ff8a3d" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  airstrike: svg('<path d="M2 7.5h13l4-3h2l-2 3h2.5l-2 2H2Z" fill="#90a4ae" stroke="#455a64" stroke-width="1"/><circle cx="6" cy="14" r="2" fill="#37474f"/><circle cx="11" cy="16.5" r="2" fill="#37474f"/><circle cx="16" cy="19" r="2" fill="#37474f"/>'),
};

export const PICKUP_ICONS = {
  repair: svg('<path d="M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z" fill="#ef5350" stroke="#b71c1c" stroke-width="1.2"/><path d="M12 9v6M9 12h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'),
  shield: svg('<path d="M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6Z" fill="#29b6f6" stroke="#01579b" stroke-width="1.2"/><path d="M12 5v14" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>'),
  fuel: svg('<rect x="5" y="6" width="12" height="15" rx="2.5" fill="#fb8c00" stroke="#8a4b00" stroke-width="1.2"/><path d="M8 6V3.5h5V6" fill="none" stroke="#8a4b00" stroke-width="1.4"/><path d="M11 10q-3 4 0 6.5q3-2.5 0-6.5Z" fill="#fff"/><path d="M17 9l3 2v7" fill="none" stroke="#8a4b00" stroke-width="1.4"/>'),
  maxhp: svg('<path d="M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6Z" fill="#8e7cc3" stroke="#4527a0" stroke-width="1.2"/><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
};

export const ICON = {
  pause: line('<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor"/>'),
  fire: svg('<path d="M12 2c1 4 6 5.5 6 11a6 6 0 0 1-12 0c0-2.6 1.3-4.3 2.6-5.4.2 1.8 1.1 3 2.3 3-.5-3.5.4-6.4 1.1-8.6Z" fill="#fff"/>'),
  rotLeft: line('<path d="M5 13a7 7 0 1 1 3 5.7"/><path d="M5 8v5h5"/>'),
  rotRight: line('<path d="M19 13a7 7 0 1 0-3 5.7"/><path d="M19 8v5h-5"/>'),
  up: line('<path d="M6 15l6-6 6 6"/>'),
  down: line('<path d="M6 9l6 6 6-6"/>'),
  left: line('<path d="M15 5l-7 7 7 7"/>'),
  right: line('<path d="M9 5l7 7-7 7"/>'),
  arrow: line('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  tank: svg('<path d="M13 9.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="2" y="15" width="20" height="5.5" rx="2.75" fill="currentColor" fill-opacity=".55"/><path d="M3.5 15.5 6 11h14l2 4.5Z" fill="currentColor"/><path d="M8.5 11a4.5 4.5 0 0 1 9 0Z" fill="currentColor"/>'),
  wind: line('<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/>'),
  calm: line('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6c.4 0 .8.2 1 .6l2.4 4.9 5.4.8c.9.1 1.3 1.2.6 1.9l-3.9 3.8.9 5.4c.2.9-.8 1.6-1.6 1.2L12 18.6l-4.8 2.6c-.8.4-1.8-.3-1.6-1.2l.9-5.4-3.9-3.8c-.7-.7-.3-1.8.6-1.9l5.4-.8L11 3.2c.2-.4.6-.6 1-.6Z"/></svg>',
  lock: line('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fill-opacity=".15"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  shot: line('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  skull: line('<path d="M5 11a7 7 0 1 1 14 0v3.5a1.5 1.5 0 0 1-1.5 1.5H16v3H8v-3H6.5A1.5 1.5 0 0 1 5 14.5Z" fill="currentColor" fill-opacity=".15"/><circle cx="9.3" cy="11.5" r="1.6" fill="currentColor"/><circle cx="14.7" cy="11.5" r="1.6" fill="currentColor"/>'),
  wave: line('<path d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/><path d="M2 9c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/>'),
  trophy: line('<path d="M8 4h8v5a4 4 0 0 1-8 0Z" fill="currentColor" fill-opacity=".2"/><path d="M8 5.5H5a2.5 2.5 0 0 0 3 4M16 5.5h3a2.5 2.5 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5"/>'),
  target: line('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
  fuel: line('<path d="M6 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M4 21h14"/><path d="M8 9h6"/><path d="M16 8l3 2v7a1.5 1.5 0 0 1-3 0v-3"/>'),
  campaign: svg('<path d="M4 20V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 5h11l-2.5 3.5L16 12H5Z" fill="currentColor"/>'),
  duel: svg('<path d="M4 4l9 9M6.5 13.5 4 16l4 4 2.5-2.5M20 4l-9 9M17.5 13.5 20 16l-4 4-2.5-2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  survival: svg('<path d="M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6Z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 7l1.4 2.9 3.1.4-2.3 2.1.6 3.1L12 14l-2.8 1.5.6-3.1-2.3-2.1 3.1-.4Z" fill="currentColor"/>'),
  range: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>'),
  robot: line('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1" fill="currentColor"/><circle cx="9.5" cy="13" r="1.4" fill="currentColor"/><circle cx="14.5" cy="13" r="1.4" fill="currentColor"/>'),
  person: line('<circle cx="12" cy="8" r="3.8" fill="currentColor" fill-opacity=".2"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  off: line('<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>'),
  guide: line('<path d="M3 18c4-9 10-12 18-12" stroke-dasharray="2.5 3"/><circle cx="21" cy="6" r="1.5" fill="currentColor"/>'),
  keyboard: line('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>'),
  touch: line('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.5-2.1L4 14.8a1.5 1.5 0 0 1 2.3-1.9L9 15"/>'),
  gamepad: line('<path d="M7 7h10a4 4 0 0 1 4 4v3.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V11a4 4 0 0 1 4-4Z"/><path d="M7.5 10v3M6 11.5h3"/><circle cx="15.5" cy="10.5" r=".8" fill="currentColor"/><circle cx="17.5" cy="12.5" r=".8" fill="currentColor"/>'),
};

/** Small tank silhouette in a given colour (for lists, setup cards). */
export function tankIcon(color: string, look: 'standard' | 'light' | 'heavy' | 'boss' | 'mortar' | 'sniper' | 'digger' | 'dummy' = 'standard'): string {
  const barrel = look === 'sniper' ? 'M13 9.5h10' : look === 'mortar' ? 'M13 9l5-4' : 'M13 9.5h8';
  const hat = look === 'boss' ? '<rect x="9" y="3" width="8" height="2.6" rx="1.2" fill="#263238"/><circle cx="13" cy="4.3" r=".9" fill="#ffd54a"/>' : '';
  return svg(
    `<path d="${barrel}" stroke="#555d66" stroke-width="${look === 'heavy' || look === 'boss' ? 2.6 : 2}" stroke-linecap="round"/>` +
      `<rect x="2" y="15" width="20" height="5.5" rx="2.75" fill="#2b2f36"/>` +
      `<path d="M3.5 15.5 6 11h14l2 4.5Z" fill="${color}"/>` +
      `<path d="M8.5 11a4.5 4.5 0 0 1 9 0Z" fill="${color}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>` +
      `<circle cx="11.6" cy="9.4" r="1" fill="#fff"/><circle cx="14.2" cy="9.4" r="1" fill="#fff"/>` +
      hat,
  );
}
