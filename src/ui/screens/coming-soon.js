// Parts of the game that aren't in the free-play release yet (Pup Pass, Treat Jar).

import { h } from '../dom.js';
import { professorPawsSVG } from '../art.js';
import { topBar } from '../topbar.js';

export function render(app, { title, body }) {
  const bar = topBar(app, { title, back: () => app.go('map') });
  app.view.append(bar, h('section', { class: 'results stack coming-soon' },
    h('div', { class: 'results-prof', html: professorPawsSVG({ mood: 'think' }) }),
    h('h1', {}, title),
    h('p', { class: 'eyebrow' }, 'Coming soon'),
    h('p', { class: 'muted' }, body),
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('map') }, 'Back to the map'),
  ));
  return () => bar.stop();
}
