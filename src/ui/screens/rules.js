// Game rules & privacy for the free-play release. Plain language; the owner's attorney
// reviews it before the game opens to everyone (until then it says it's a draft).

import { h } from '../dom.js';
import { topBar } from '../topbar.js';

export function render(app) {
  const bar = topBar(app, { title: 'Rules', back: () => app.go('map') });
  app.view.append(bar, h('section', { class: 'rules stack card' },
    h('h1', {}, 'Game rules & privacy'),
    h('h2', {}, 'Treats'),
    h('p', {}, "Treats are play money for Graduation Day. Treats have no cash value. In this version they can't be bought, sold, transferred or cashed out. You earn them free from your daily streak and spend them in the game."),
    h('h2', {}, 'What the game records'),
    h('p', {}, 'Your progress, plus simple play events: when you opened the game, levels played, shares and booking-link taps. We use them to run the game and improve PAWtastic.'),
    h('h2', {}, 'Your dog'),
    h('p', {}, "The game uses your dog's name, breed and photo from your PAWtastic account. It never sees health or care notes."),
    h('h2', {}, 'Questions?'),
    h('p', {}, 'Message us in the PAWtastic app.'),
    h('p', { class: 'demo-label' }, 'Draft — pending attorney review'),
  ));
  return () => bar.stop();
}
