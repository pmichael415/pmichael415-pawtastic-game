// Purchase confirmation sheets. Every real-money purchase shows the exact total; in the
// claude.ai demo it is clearly labelled as a demo. Buttons are the same size.
// `real` ({ mode: 'test' | 'live' }): the public site, where paying happens on Stripe's page.

import { h } from './dom.js';
import { formatUsd } from '../economy/catalog.js';
import { treatPrice } from './prices.js';

const KIND_LINE = {
  consumable: 'Consumable: used up as you spend it.',
  'one-time': 'One-time purchase: kept on your account.',
  subscription: 'Subscription: renews every month until you cancel.',
};

export function confirmPurchase(app, { title, usd, lines = [], kind = null, real = null }) {
  return new Promise(resolve => {
    let done = false;
    // The register sound marks a purchase made; a real one is only made on Stripe's page.
    const finish = value => { if (done) return; done = true; sheet.close(); if (value && !real) app.services.audio?.sfx('purchase'); resolve(value); };
    const content = h('div', { class: 'stack' },
      real
        ? (real.mode === 'test' ? h('span', { class: 'demo-label' }, 'Test mode — no real charge. Card 4242 4242 4242 4242.') : null)
        : h('span', { class: 'demo-label' }, 'Demo — no real charge'),
      h('h2', {}, title),
      kind && KIND_LINE[kind] ? h('p', { class: 'kind-line small' }, KIND_LINE[kind]) : null,
      lines.length ? h('ul', { class: 'plain-list' }, lines.map(l => h('li', {}, l))) : null,
      h('div', { class: 'total-row' }, h('span', {}, kind === 'subscription' ? 'Total today, then monthly' : 'Total'), h('strong', { class: 'num' }, formatUsd(usd))),
      h('p', { class: 'muted small' }, real
        ? "You'll pay on Stripe's secure checkout page. PAWtastic never sees your card number."
        : "In the real app you'll confirm with your password or purchase PIN."),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => finish(true) }, real ? 'Continue to checkout' : 'Confirm purchase'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => finish(false) }, 'Cancel')),
    );
    const sheet = app.modal(content, { label: title, onClose: () => finish(false) });
  });
}

export function confirmTreatSpend(app, { title, treats }) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; sheet.close(); if (value) app.services.audio?.sfx('purchase'); resolve(value); };
    const content = h('div', { class: 'stack' },
      h('h2', {}, title),
      h('p', {}, `Spend ${treatPrice(app, treats)}?`),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => finish(true) }, 'Confirm'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => finish(false) }, 'Cancel')),
    );
    const sheet = app.modal(content, { label: title, onClose: () => finish(false) });
  });
}
