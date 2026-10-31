// Game rules & privacy. Two versions:
//   - the public site: plain facts about how it works, with a purchases section when Stripe is on;
//   - the customer release (signed in): the owner's attorney reviews it before the game opens to everyone
//     (until then it says it's a draft).

import { h } from '../dom.js';
import { topBar } from '../topbar.js';
import { isPublicSite } from '../../backend/local.js';
import { REFUND_POLICY } from '../payments.js';
import { PASS, formatUsd } from '../../economy/catalog.js';

const SITE_URL = 'https://pawtasticacademy.com';

function publicRules(paid) {
  if (!paid) {
    return [
      h('h1', {}, 'Game rules & privacy'),
      h('h2', {}, 'Treats'),
      h('p', {}, "Treats are play money for Graduation Day. They have no cash value and can't be bought, sold, transferred or cashed out. You earn them free from your daily streak and spend them in the game."),
      h('h2', {}, 'Your progress'),
      h('p', {}, "There's no sign-in, and the game never asks for your name, email or other personal details. Your dog's name and your progress are saved only in this browser on this device. Clearing your browser data erases them."),
      h('p', {}, 'Our website host counts visits, such as page views, so we know how many people play.'),
      ...questions(),
    ];
  }
  return [
    h('h1', {}, 'Game rules & privacy'),
    h('h2', {}, 'Treats'),
    h('p', {}, "Treats are play money for Graduation Day. They have no cash value and can't be sold, transferred or cashed out. You earn them free from your daily streak, and you can also buy them. Buying never changes how levels play out."),
    h('h2', {}, 'Buying'),
    h('p', {}, `Prices are in US dollars and shown before you pay. Payments are handled by Stripe; PAWtastic never sees your card number. The Pup Pass costs ${formatUsd(PASS.usd)} a month and renews automatically until you cancel. Cancel anytime from the Pup Pass screen or the menu (Manage Pup Pass & receipts); your benefits continue until the end of the month you paid for.`),
    h('p', {}, `${REFUND_POLICY} Ask from Shop → Spending → Request refund, or the menu → Report a problem.`),
    h('p', {}, 'You choose a monthly spending limit in the Shop, and purchases can never go over $100 a month.'),
    h('h2', {}, 'Your progress and privacy'),
    h('p', {}, "You can play without signing in: your dog's name and progress are then saved only in this browser on this device."),
    h('p', {}, 'To buy, you sign in with your email and a one-time code. We then keep your email address, your purchases and your saved game, so you can pick up on another device. We use your email only for sign-in codes, receipts and replies to your questions.'),
    h('p', {}, 'Our website host counts visits, such as page views, so we know how many people play.'),
    ...questions(),
  ];
}

function questions() {
  return [
    h('h2', {}, 'Questions?'),
    h('p', {}, 'Use Report a problem in the menu, or visit ', h('a', { href: SITE_URL, target: '_blank', rel: 'noopener' }, 'pawtasticacademy.com'), '.'),
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
  const { backend } = app.services;
  const body = isPublicSite(backend) ? publicRules(!!backend.payments) : customerRules();
  app.view.append(bar, h('section', { class: 'rules stack card' }, ...body));
  return () => bar.stop();
}
