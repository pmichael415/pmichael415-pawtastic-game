// Purchase confirmation sheets. Every real-money purchase shows the exact total
// and is clearly labelled as a demo; buttons are the same size.

import { h } from './dom.js';
import { formatUsd } from '../economy/catalog.js';
import { treatPrice } from './prices.js';

export function confirmPurchase(app, { title, usd, lines = [] }) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; sheet.close(); if (value) app.services.audio?.sfx('purchase'); resolve(value); };
    const content = h('div', { class: 'stack' },
      h('span', { class: 'demo-label' }, 'Demo — no real charge'),
      h('h2', {}, title),
      lines.length ? h('ul', { class: 'plain-list' }, lines.map(l => h('li', {}, l))) : null,
      h('div', { class: 'total-row' }, h('span', {}, 'Total'), h('strong', { class: 'num' }, formatUsd(usd))),
      h('p', { class: 'muted small' }, "In the real app you'll confirm with your password or purchase PIN."),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => finish(true) }, 'Confirm purchase'),
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
