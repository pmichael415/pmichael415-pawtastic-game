// Graduation Day's own site points players to the PAWtastic Games hub, the one stop (owner, 7 Nov 2026). On the old
// site the map's banner is this notice (instead of "add to your Home Screen", which would keep players on the old
// site). Inside the hub, where the game runs in the hub's frame, there is no notice.
import { h } from './dom.js';
import { embedded, HUB_GRADUATION } from '../net/embed.js';

export { HUB_GRADUATION };

/** The notice for Graduation Day's own site, or null inside the hub. */
export function hubCard(win = globalThis) {
  if (embedded(win)) return null;
  return h('div', { class: 'card nudge-card hub-card' },
    h('p', {}, 'Graduation Day now lives in PAWtastic Games, with all our games in one place. ',
      h('span', { class: 'small' }, 'Sign in to keep your progress: it follows your account.')),
    h('a', { class: 'btn small-btn', href: HUB_GRADUATION }, 'Open'));
}
