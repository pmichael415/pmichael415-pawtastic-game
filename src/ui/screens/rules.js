// Game rules & privacy. Two versions:
//   - the public free-play site (no sign-in, everything stays in this browser): plain facts about how it works;
//   - the customer release (signed in): the owner's attorney reviews it before the game opens to everyone
//     (until then it says it's a draft).

import { h } from '../dom.js';
import { topBar } from '../topbar.js';
import { isPublicFreePlay } from '../../backend/local.js';

const SITE_URL = 'https://pawtasticacademy.com';

function publicRules() {
  return [
    h('h1', {}, 'Game rules & privacy'),
    h('h2', {}, 'Treats'),
    h('p', {}, "Treats are play money for Graduation Day. They have no cash value and can't be bought, sold, transferred or cashed out. You earn them free from your daily streak and spend them in the game."),
    h('h2', {}, 'Your progress'),
    h('p', {}, "There's no sign-in, and the game never asks for your name, email or other personal details. Your dog's name and your progress are saved only in this browser on this device. Clearing your browser data erases them."),
    h('p', {}, 'Our website host counts visits, such as page views, so we know how many people play.'),
    h('h2', {}, 'Questions?'),
    h('p', {}, 'Visit ', h('a', { href: SITE_URL, target: '_blank', rel: 'noopener' }, 'pawtasticacademy.com'), '.'),
  ];
}

function customerRules() {
  return [
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
  ];
}

export function render(app) {
  const bar = topBar(app, { title: 'Rules', back: () => app.go('map') });
  const body = isPublicFreePlay(app.services.backend) ? publicRules() : customerRules();
  app.view.append(bar, h('section', { class: 'rules stack card' }, ...body));
  return () => bar.stop();
}
