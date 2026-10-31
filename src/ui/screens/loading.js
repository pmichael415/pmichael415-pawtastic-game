// Brand splash: the real logo, the game name and Professor Paws. Tap or wait to continue.

import { h } from '../dom.js';
import { logoImg, professorPawsSVG } from '../art.js';

export function render(app) {
  const next = () => app.go(app.services.backend.state().dog ? 'map' : 'setup');
  const splash = h('section', { class: 'splash', onClick: () => next(), 'aria-label': 'Tap to start' },
    logoImg({ size: 160 }),
    h('h1', { class: 'subtitle caps' }, 'Graduation Day'),
    h('div', { class: 'tagline' }, 'Match. Play. Graduate.'),
    h('div', { class: 'prof', html: professorPawsSVG() }),
    h('p', { class: 'muted small tap-hint' }, 'Tap to start'),
  );
  app.view.append(splash);
  const timer = setTimeout(next, 1200);
  return () => clearTimeout(timer);
}
