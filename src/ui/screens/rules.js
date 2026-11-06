// Game rules & privacy. Two versions:
//   - the public site: plain facts about how it works, with a purchases section when Stripe is on;
//   - the customer release (signed in): the owner's attorney reviews it before the game opens to everyone
//     (until then it says it's a draft).

import { h } from '../dom.js';
import { topBar } from '../topbar.js';
import { isPublicSite } from '../../backend/local.js';
import { REFUND_POLICY } from '../payments.js';
import { PASS, formatUsd } from '../../economy/catalog.js';
import { playWeek, serverWeekKnown, loadWeekPrizes } from '../compete.js';
import { seasonOf } from '../season.js';

const SITE_URL = 'https://pawtasticacademy.com';
// The player counter (src/net/player-count.js).
const COUNTING = "The game counts how many phones and computers open it each day, so we know how many people play. It uses a random number saved in this browser, which isn't linked to your name, email or account.";

function publicRules(paid, accounts) {
  if (!paid) {
    return [
      h('h1', {}, 'Game rules & privacy'),
      h('h2', {}, 'Treats'),
      h('p', {}, "Treats are play money for Graduation Day. They have no cash value and can't be bought, sold, transferred or cashed out. You earn them free from your daily streak and spend them in the game."),
      h('h2', {}, 'Your progress'),
      ...(accounts
        ? [
          h('p', {}, "You can play without signing in: your dog's name and progress are then saved only in this browser on this device, and clearing your browser data erases them."),
          h('p', {}, 'If you choose Save progress to the cloud, you sign in with your email and a one-time code. We then keep your email address and your saved game, so you can pick up on any device. We use your email only for sign-in and for replies to your questions.'),
        ]
        : [h('p', {}, "There's no sign-in, and the game never asks for your name, email or other personal details. Your dog's name and your progress are saved only in this browser on this device. Clearing your browser data erases them.")]),
      h('p', {}, COUNTING),
      ...(accounts ? referralTerms() : []),
      ...(accounts ? competeTerms() : []),
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
    h('p', {}, 'To buy, or to save your progress to the cloud, you sign in with your email and a one-time code. We then keep your email address, your purchases and your saved game, so you can pick up on another device. We use your email only for sign-in codes, receipts and replies to your questions.'),
    h('p', {}, COUNTING),
    ...referralTerms(),
    ...competeTerms(),
    ...questions(),
  ];
}

// Invite a friend: real-world rewards given by PAWtastic's front desk, never anything in the game.
function referralTerms() {
  return [
    h('h2', {}, 'Invite friends'),
    h('p', {}, 'Signed-in players get a friend code. A person who is new to PAWtastic Academy and shows a friend code at the front desk on their first visit gets $10 off that visit (daycare, boarding or grooming). After that first visit, the player whose code it was gets one free bath for their dog. One $10 discount per new client, and one free bath for each new client.'),
    h('p', {}, "Front desk staff confirm who is a new client. The discount and the bath have no cash value, can't be exchanged for money or Treats, and sharing never earns anything inside the game. PAWtastic Academy may change or end this offer at any time."),
    h('p', {}, 'When a friend uses your code, the front desk records their name and their dog\'s name with your code, so we know who earned the bath.'),
  ];
}

// The Weekly Challenge and leaderboards. Prizes are real-world services given at the front desk.
// During a season (Season 1: Top Dog) its terms come first: they replace the weekly prizes for its weeks.
function seasonTerms() {
  const season = seasonOf(playWeek());
  if (!season) return [];
  return [
    h('h2', {}, season.name),
    h('p', {}, `${season.name} runs from Monday 9 November 2026, 12:00 am, to Saturday 5 December 2026, 11:59 pm (New York time), in four chapters. Each chapter is one week (the last ends on Saturday) and plays the same Weekly Challenge board for everyone that week, under the rules below. Your best score in each chapter is added up to make your season score; a chapter you don't play adds nothing. No purchase necessary, and buying anything never helps.`),
    h('p', {}, "No weekly prizes are given during the season. When it ends, the top 3 players at each location by season score win the season's prizes shown in the game, for one dog. Your location for the season is the one of your first run in the season. Ties go to the player who reached their latest counted score first. The team bar compares the average of each location's top 10 season scores; it wins no PAWtastic prize."),
  ];
}

function competeTerms() {
  return [
    ...seasonTerms(),
    h('h2', {}, 'Weekly Challenge and leaderboards'),
    h('p', {}, 'No purchase necessary. Every week (Monday 12:00 am to Sunday 11:59 pm, New York time) everyone plays the same Weekly Challenge board with 25 moves. Boosters and extra moves cannot be used, and tries are free, so buying anything never helps. Your best score of the week counts.'),
    h('p', {}, "To be ranked you sign in and pick your PAWtastic (Hawthorne or Hillsdale). When the week ends, the top 3 players at each location win that week's prizes, for one dog. Each week's prizes are shown in the game during that week (for example a free day of daycare or a free bath); a week without other prizes shown awards 1st place a free day of daycare and 2nd and 3rd place a free bath. Ties go to the player who reached the score first. Scores are checked by our server, which replays every move."),
    h('p', {}, "Prizes show in the game with a code. Show the code at that location's front desk within 30 days. New clients complete PAWtastic's usual evaluation, vaccination and paperwork requirements first. Prizes have no cash value and can't be transferred or exchanged. PAWtastic Academy may disqualify a player for cheating or abuse, and may change or end the Weekly Challenge at any time."),
    h('p', {}, "Leaderboards show your dog's name and your location, never your email. The all-time board ranks stars and best scores, for bragging rights only."),
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
  const body = isPublicSite(backend) ? publicRules(!!backend.payments, !!app.services.pay?.accounts) : customerRules();
  app.view.append(bar, h('section', { class: 'rules stack card' }, ...body));
  // The season's rules follow the server's week (a phone's clock can be wrong): until the server has said which week
  // it is, ask it, then draw the page again.
  let alive = true;
  if (app.services.pay?.accounts && !serverWeekKnown()) loadWeekPrizes(app).then(() => { if (alive && serverWeekKnown()) app.go('rules'); }).catch(() => {});
  return () => { alive = false; bar.stop(); };
}
