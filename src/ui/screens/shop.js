// The shop: Treat packs, the Starter Pack, lives and boosters, costumes,
// Reward Coin conversion and the household spending view.
// Every price is fixed; nothing here is a chance at anything (spec §3).

import { h } from '../dom.js';
import { dogSVG, tileSVG } from '../art.js';
import { treatIcon, heartIcon, shuffleIcon } from '../icons.js';
import { topBar } from '../topbar.js';
import { confirmPurchase, confirmTreatSpend } from '../purchase.js';
import {
  PACKS, ITEMS, COSTUMES, SETS, STARTER_PACK, EVENT, COINS,
  formatUsd, treatsToUsd,
} from '../../economy/catalog.js';
import { dayKey, formatLongDate } from '../../economy/time.js';
import { failureText } from '../failure.js';
import { treatPrice } from '../prices.js';

const ERRORS = {
  insufficient: 'Not enough Treats — get more in Treat packs.',
  'lives-full': 'Your lives are already full.',
  owned: 'You already own this costume.',
  'event-over': `${EVENT.name} has ended.`,
  'min-20': `Convert at least ${COINS.min} Reward Coins.`,
  'not-enough-coins': "You don't have that many Reward Coins.",
  'already-bought': 'You already have the Starter Pack.',
  invalid: 'Choose a limit between $1 and $100.',
};
export const errorText = code => ERRORS[code] ?? failureText(code);

const LIMIT_CHOICES = [25, 50, 100];
const REFUND_NOTE = 'In the real app, unspent purchased Treats can be refunded within 7 days, and purchases made by a child or by accident can be reported for a refund.';
const ITEM_ART = {
  lives: () => heartIcon(),
  shuffle: () => shuffleIcon(),
  bomb: () => tileSVG('bone', 'bomb'),
  blaster: () => tileSVG(null, 'blaster'),
};

function spendName(what) {
  const pack = PACKS.find(p => p.id === what);
  if (pack) return `${pack.treats} Treats`;
  if (what === 'starter-pack') return 'Starter Pack';
  if (what === 'pass') return 'Pup Pass (1 month)';
  return what;
}

const eventOn = now => {
  const today = dayKey(now);
  return today >= EVENT.start && today <= EVENT.end;
};

export function render(app) {
  const { backend } = app.services;
  let bar = null;

  function refresh() {
    const y = window.scrollY;
    bar?.stop();
    bar = topBar(app, { title: 'Shop', back: () => app.go('map') });
    app.view.replaceChildren(bar, body());
    window.scrollTo(0, y);
  }

  async function done(pending, success) {
    const res = await pending;
    if (res.ok) app.toast(success);
    else app.toast(errorText(res.error));
    refresh();
  }

  async function buyPack(pack) {
    const ok = await confirmPurchase(app, { title: `${pack.treats} Treats`, usd: pack.usd, lines: [`${pack.treats} Treats added to your balance`] });
    if (ok) done(backend.buyPack(pack.id), 'Treats added. Receipt sent (demo).');
  }

  async function buyStarter() {
    const ok = await confirmPurchase(app, {
      title: 'Starter Pack', usd: STARTER_PACK.usd,
      lines: [`${STARTER_PACK.treats} Treats`, '1 Shuffle, 1 Bone Bomb, 1 Bubble Blaster', 'Bandana costume'],
    });
    if (ok) done(backend.buyStarterPack(), 'Starter Pack added. Receipt sent (demo).');
  }

  async function buyItem(id) {
    const item = ITEMS[id];
    if (backend.balance().total < item.treats) { app.toast(errorText('insufficient')); return; }
    if (await confirmTreatSpend(app, { title: item.name, treats: item.treats })) done(backend.buyItem(id), `${item.name} added.`);
  }

  async function buyCostume(c) {
    if (backend.balance().total < c.price) { app.toast(errorText('insufficient')); return; }
    if (!(await confirmTreatSpend(app, { title: c.name, treats: c.price }))) return;
    const res = await backend.buyCostume(c.id);
    const bonus = res.ok && res.bonusCostume ? COSTUMES.find(x => x.id === res.bonusCostume).name : null;
    done(res, bonus ? `Set complete! ${bonus} added to your closet.` : `${c.name} added to your closet.`);
  }

  function convert(input) {
    const n = Number(input.value);
    if (!Number.isInteger(n) || n < COINS.min) { app.toast(errorText('min-20')); return; }
    if (n > backend.state().demoCoins) { app.toast(errorText('not-enough-coins')); return; }
    let sheet;
    const go = () => { sheet.close(); done(backend.convertCoins(n), `${n} Reward Coins converted to ${n} Treats.`); };
    sheet = app.modal(h('div', { class: 'stack' },
      h('h2', {}, 'Convert Reward Coins'),
      h('p', {}, `Turn ${n} Reward Coins into ${n} Treats?`),
      h('p', { class: 'muted small' }, "This is one-way. Treats can't be turned back into Reward Coins."),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: go }, 'Convert'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Cancel')),
    ), { label: 'Convert Reward Coins' });
  }

  function refundNote() {
    let sheet;
    sheet = app.modal(h('div', { class: 'stack' },
      h('span', { class: 'demo-label' }, 'Demo'),
      h('h2', {}, 'Request a refund'),
      h('p', {}, REFUND_NOTE),
      h('button', { class: 'btn block', type: 'button', onClick: () => sheet.close() }, 'OK'),
    ), { label: 'Request a refund' });
  }

  function body() {
    const selling = backend.features.purchases;
    const state = backend.state();
    const bal = backend.balance();
    const owned = new Set(state.inventory.costumes);
    const now = Date.now();
    const spent = backend.monthSpendUsd();
    const limit = backend.spendingLimit;

    const balance = h('section', { class: 'card shop-balance', 'aria-label': 'Your Treats' },
      h('div', { class: 'shop-total' }, h('span', { html: treatIcon() }),
        h('strong', { class: 'num' }, `${bal.total} Treats`), selling ? h('span', { class: 'muted num' }, `≈ ${formatUsd(bal.usd)}`) : null),
      selling ? h('dl', { class: 'shop-split num' },
        h('div', {}, h('dt', {}, 'Earned'), h('dd', {}, bal.free)),
        h('div', {}, h('dt', {}, 'From coins'), h('dd', {}, bal.converted)),
        h('div', {}, h('dt', {}, 'Bought'), h('dd', {}, bal.paid))) : null);

    const packs = section('Treat packs', h('div', { class: 'shop-grid' }, PACKS.map(p =>
      h('button', { class: 'shop-item', type: 'button', onClick: () => buyPack(p) },
        h('span', { class: 'shop-art', html: treatIcon() }),
        h('strong', { class: 'num' }, `${p.treats} Treats`),
        h('span', { class: 'price num' }, formatUsd(p.usd))))),
    h('p', { class: 'muted small' }, 'Demo — no real charge.'));

    const starter = state.starterPack.bought ? null : section('Starter Pack',
      h('div', { class: 'shop-row' },
        h('div', {}, h('strong', {}, 'One-time Starter Pack'),
          h('p', { class: 'muted small' }, `${STARTER_PACK.treats} Treats (≈ ${formatUsd(treatsToUsd(STARTER_PACK.treats))}), 3 boosters and a Bandana`)),
        h('button', { class: 'btn', type: 'button', onClick: buyStarter }, formatUsd(STARTER_PACK.usd))));

    const lives = backend.lives();
    const items = section('Lives & boosters', h('div', { class: 'stack tight' },
      ['lives', 'shuffle', 'bomb', 'blaster'].map(id => h('div', { class: 'shop-row' },
        h('span', { class: 'shop-art small', html: ITEM_ART[id]() }),
        h('div', { class: 'grow' }, h('strong', {}, ITEMS[id].name),
          h('p', { class: 'muted small num' }, id === 'lives'
            ? (lives.unlimited ? 'Unlimited with Pup Pass' : `${lives.count} of ${lives.max} lives`)
            : `You have ${state.inventory.boosters[id]}`)),
        h('button', { class: 'btn secondary', type: 'button', disabled: id === 'lives' && (lives.unlimited || lives.count >= lives.max), onClick: () => buyItem(id) },
          treatPrice(app, ITEMS[id].treats))))));

    const forSale = COSTUMES.filter(c => c.source === 'shop' && (c.set !== 'event' || eventOn(now)));
    const costumes = section('Costumes', h('div', { class: 'shop-grid' }, forSale.map(c => {
      const has = owned.has(c.id);
      return h('button', { class: `shop-item${has ? ' owned' : ''}`, type: 'button', disabled: has, onClick: () => buyCostume(c) },
        h('span', { class: 'shop-dog', html: dogSVG({ ...state.dog, costume: c.id, label: `${c.name} preview` }) }),
        h('strong', {}, c.name),
        c.set === 'event' ? h('span', { class: 'event-tag' }, `${EVENT.name} · ends ${formatLongDate(EVENT.end)}`) : null,
        h('span', { class: 'price num' }, has ? 'Owned' : treatPrice(app, c.price)));
    })), h('p', { class: 'muted small' }, `Collect sets for a bonus: ${SETS.map(s => `${s.name} → ${COSTUMES.find(c => c.id === s.bonus).name}`).join(', ')}.`));

    const input = h('input', { type: 'number', inputmode: 'numeric', min: COINS.min, step: 1, max: Math.max(COINS.min, state.demoCoins), value: COINS.min, id: 'coin-amount', class: 'num' });
    const coins = section('Reward Coins',
      h('p', {}, 'You have ', h('strong', { class: 'num' }, `${state.demoCoins} demo Reward Coins`), ' from your PAWtastic visits.'),
      h('div', { class: 'coin-row' },
        h('label', { for: 'coin-amount' }, 'Coins to convert'), input,
        h('button', { class: 'btn', type: 'button', disabled: state.demoCoins < COINS.min, onClick: () => convert(input) }, 'Convert to Treats (one-way)')),
      h('p', { class: 'muted small' }, `1 Reward Coin = 1 Treat. Minimum ${COINS.min}. Treats can't be turned back into Reward Coins.`));

    const history = [...state.spending].reverse();
    const spending = section('Spending',
      h('p', { class: 'num' }, `Demo spending this month: ${formatUsd(spent)} of ${formatUsd(limit)} limit`),
      spent > limit ? h('p', { class: 'muted small' }, 'Over your limit — the real app would block more purchases this month.') : null,
      h('div', { class: 'limit-choices', role: 'group', 'aria-label': 'Monthly spending limit' },
        LIMIT_CHOICES.map(v => h('button', {
          class: `chip${v === limit ? ' on' : ''}`, type: 'button', 'aria-pressed': String(v === limit),
          onClick: () => done(backend.setSpendingLimit(v), `Monthly limit set to ${formatUsd(v)}.`),
        }, formatUsd(v)))),
      history.length
        ? h('ul', { class: 'history' }, history.map(s => h('li', {},
          h('strong', {}, spendName(s.what)),
          h('strong', { class: 'num' }, formatUsd(s.usd)),
          h('span', { class: 'muted small' }, formatLongDate(dayKey(s.at))),
          h('button', { class: 'btn secondary small-btn', type: 'button', onClick: refundNote }, 'Request refund'))))
        : h('p', { class: 'muted small' }, 'No purchases yet.'));

    // The free-play release sells nothing for money: only what free Treats buy.
    if (!selling) {
      const soon = section('Coming soon', h('p', {}, 'Buying Treats is coming soon. Free Treats come from your daily streak.'));
      return h('div', { class: 'shop stack' }, h('h1', {}, 'Shop'), balance, items, costumes, soon);
    }
    return h('div', { class: 'shop stack' }, h('h1', {}, 'Shop'), balance, packs, starter, items, costumes, coins, spending);
  }

  refresh();
  return () => bar?.stop();
}

function section(title, ...children) {
  return h('section', { class: 'card stack', 'aria-label': title }, h('h2', {}, title), ...children);
}
