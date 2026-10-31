// The demo Treat Jar: one free open a day, no purchase anywhere on this screen.
// The result view never carries shop, pass or purchase buttons (spec §3).

import { h } from '../dom.js';
import { jarCelebration } from '../../fx/celebrate.js';
import { createParticleLayer } from '../../fx/particles.js';
import { jarSVG, professorPawsSVG } from '../art.js';
import { topBar } from '../topbar.js';
import { JAR_HOST } from '../tips.js';
import { JAR_PRIZES } from '../../prize/jar-demo.js';
import { render as comingSoon } from './coming-soon.js';

const COME_BACK = 'Come back tomorrow for your free open.';

export function showOfficialRules(app) {
  let s;
  s = app.modal(h('div', { class: 'stack rules' },
    h('span', { class: 'demo-label' }, 'Draft — for attorney review'),
    h('h2', {}, 'Treat Jar official rules'),
    h('ul', { class: 'plain-list' },
      h('li', {}, 'Sponsor: PAWtastic Academy, Hawthorne and Hillsdale, New Jersey.'),
      h('li', {}, 'Free to enter. No purchase or booking is necessary, and being a customer is not required.'),
      h('li', {}, 'Open to anyone 18 or older who lives in an eligible state (New Jersey; others to be confirmed).'),
      h('li', {}, 'Two free ways to enter, with the same odds: open the jar with a free PAWtastic account and dog profile, or use the free web entry form.'),
      h('li', {}, 'One open per person per day (Eastern Time), across both ways to enter.'),
      h('li', {}, 'Purchases, Treats, the Pup Pass and Reward Coins never add opens or change the odds or the prizes.'),
      h('li', {}, 'Demo odds: 1 in 10. In the real promotion, odds depend on the number of entries.'),
      h('li', {}, ['Prizes: ', JAR_PRIZES.map(p => `${p.name} (retail value $${p.retailUsd}, good for ${p.use})`).join('; '), '. Use within 60 days.']),
      h('li', {}, 'No payment is required to claim or use a prize. Dogs need current vaccines and a signed agreement; first-time dogs get a free evaluation.')),
    h('p', { class: 'muted small' }, 'Demo — no real prizes. The final rules will be approved by a New Jersey attorney before launch.'),
    h('button', { class: 'btn block', type: 'button', onClick: () => s.close() }, 'Close'),
  ), { label: 'Treat Jar official rules' });
}

export function render(app) {
  if (!app.services.backend.features.jar) {
    return comingSoon(app, { title: 'Treat Jar', body: 'Soon, PAWtastic families can open the Treat Jar once a day for a chance at a free bath, daycare day or boarding night.' });
  }
  const { jar } = app.services;
  const bar = topBar(app, { title: 'Treat Jar', back: () => app.go('map'), shopLink: false });
  const jarArt = h('div', { class: 'jar-art', html: jarSVG() });
  const action = h('div', { class: 'jar-action stack', 'aria-live': 'polite' });
  let timer = null;

  function showResult(res) {
    const party = jarCelebration(res);
    if (res.won) {
      const [headline, ...rest] = res.notice;
      const card = h('div', { class: 'card jar-win stack rise' },
        h('p', { class: 'eyebrow' }, 'Demo prize'),
        h('h2', {}, headline),
        rest.map(line => h('p', {}, line)));
      action.replaceChildren(card);
      if (party.sound) app.services.audio?.jingle(party.sound);
      if (party.sparkle && layer) {
        const host = section.getBoundingClientRect(), r = card.getBoundingClientRect();
        for (const [fx, fy] of [[0.15, 0.1], [0.85, 0.1], [0.5, 0], [0.1, 0.6], [0.9, 0.6]]) {
          layer.burst(r.left - host.left + r.width * fx, r.top - host.top + r.height * fy, ['#F6A823', '#0055D4', '#45A167'][Math.floor(Math.random() * 3)], 8);
        }
      }
    } else {
      action.replaceChildren(h('p', { class: 'card jar-none' }, 'No prize today — come back tomorrow.'));
    }
  }

  function open(btn) {
    btn.disabled = true;
    btn.textContent = 'Opening…';
    const reveal = () => {
      jarArt.classList.remove('shaking');
      jarArt.classList.add('lid-pop');
      const res = jar.open();
      if (!res.ok) { action.replaceChildren(h('p', { class: 'card' }, COME_BACK)); return; }
      showResult(res);
    };
    if (!app.effects()) { reveal(); return; }
    jarArt.classList.add('shaking');
    timer = setTimeout(reveal, 1200);
  }

  if (jar.canOpen()) {
    const btn = h('button', { class: 'btn gold block', type: 'button' }, 'Open the Treat Jar');
    btn.addEventListener('click', () => open(btn));
    action.append(btn);
  } else {
    action.append(h('p', { class: 'card' }, COME_BACK));
  }

  const section = h('section', { class: 'jar stack' },
    h('h1', {}, 'Treat Jar'),
    h('span', { class: 'demo-label' }, 'Demo — no real prizes'),
    h('div', { class: 'card tip' }, h('span', { class: 'tip-prof', html: professorPawsSVG() }), h('p', {}, JAR_HOST)),
    jarArt,
    action,
    h('p', { class: 'small muted' }, 'Free to enter. No purchase necessary. Buying things never changes the odds.'),
    h('button', { class: 'linkish', type: 'button', onClick: () => showOfficialRules(app) }, 'Official rules (draft)'),
  );
  app.view.append(bar, section);
  const layer = createParticleLayer(section, { enabled: () => app.effects() });
  return () => { clearTimeout(timer); layer.destroy(); bar.stop(); };
}
