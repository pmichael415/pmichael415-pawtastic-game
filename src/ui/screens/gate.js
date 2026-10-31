// When someone can't play right now: the game is switched off, it's still in its pilot,
// they aren't a PAWtastic family yet, or the server can't be reached.

import { h } from '../dom.js';
import { professorPawsSVG } from '../art.js';
import { failureText } from '../failure.js';

const APP_URL = 'https://app.pawtasticacademy.com';

function message(reason) {
  if (reason === 'game-off') return { title: 'Graduation Day is taking a short break', body: 'Check back soon.' };
  if (reason === 'pilot-only') return { title: 'Graduation Day is in a small test right now. It opens to all PAWtastic families soon.' };
  if (reason === 'not-customer') return { title: 'Graduation Day is for PAWtastic families', body: 'Book a free evaluation to join the Academy, then come back and play.' };
  return { title: failureText(reason) };
}

export function render(app, { reason = 'server' } = {}) {
  const { title, body } = message(reason);
  const signOut = async () => { await app.services.api.auth.signOut(); app.go('signin'); };
  const actions = [];
  if (reason === 'not-customer') actions.push(h('a', { class: 'btn', href: `${APP_URL}/portal` }, 'Book an evaluation'));
  if (reason === 'offline' || reason === 'server' || reason === 'game-off') {
    actions.push(h('button', { class: 'btn', type: 'button', onClick: () => app.services.reboot() }, 'Try again'));
  }
  if (reason !== 'game-off') actions.push(h('button', { class: 'btn secondary', type: 'button', onClick: signOut }, 'Sign out'));

  app.view.append(h('section', { class: 'results stack gate', 'data-reason': reason },
    h('div', { class: 'results-prof', html: professorPawsSVG({ mood: reason === 'game-off' ? 'think' : 'happy' }) }),
    h('h1', {}, title),
    body ? h('p', { class: 'muted' }, body) : null,
    h('div', { class: 'btn-pair' }, actions),
  ));
}
