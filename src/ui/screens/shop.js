// The shop: Treat packs, the Starter Pack, lives and boosters, costumes,
// Reward Coin conversion and the household spending view.
// Every price is fixed; nothing here is a chance at anything (spec §3).

import { h } from '../dom.js';
import { dogSVG, tileSVG } from '../art.js';
import { publishMyPup } from '../look.js';
import { skinsOnSale } from '../../economy/catalog.js';
import { serverNow } from '../../net/server-clock.js';
import { treatIcon, heartIcon, shuffleIcon } from '../icons.js';
import { topBar } from '../topbar.js';
import { confirmPurchase, confirmTreatSpend } from '../purchase.js';
import { realPayments, startCheckout, reportSheet, testModeLabel, REFUND_POLICY, KINDS, restorePurchases, pendingDelivery, openPortal, clientOf } from '../payments.js';
import {
  PACKS, ITEMS, COSTUMES, SETS, STARTER_PACK, EVENT, COINS, PASS,
  formatUsd, treatsToUsd,
} from '../../economy/catalog.js';
import { formatLongDate as longDate } from '../../economy/time.js';
import { dayKey, formatLongDate } from '../../economy/time.js';
import { failureText } from '../failure.js';
import { treatPrice } from '../prices.js';

const ERRORS = {
  insufficient: 'Not enough Treats — get more in Treat packs.',
  'lives-full': 'Your lives are already full.',
  owned: 'You already own this.',
  'not-on-sale': 'Season 1 skins were sold until Sat 5 Dec. The ones you bought are yours to keep.',
  'event-over': `${EVENT.name} has ended.`,
  'min-20': `Convert at least ${COINS.min} Reward Coins.`,
  'not-enough-coins': "You don't have that many Reward Coins.",
  'already-bought': 'You already have the Starter Pack.',
  invalid: 'Choose a limit between $1 and $100.',
};
export const errorText = code => ERRORS[code] ?? failureText(code);

const LIMIT_CHOICES = [null, 5, 10, 20, 50, 100]; // null: no limit (the default)
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
  app.services.measure?.track('shop_viewed');

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
    if (realPayments(app)) { await startCheckout(app, pack.id); return; }
    const ok = await confirmPurchase(app, { title: `${pack.treats} Treats`, usd: pack.usd, kind: 'consumable', lines: [`${pack.treats} Treats added to your balance`] });
    if (ok) done(backend.buyPack(pack.id), 'Treats added. Receipt sent (demo).');
  }

  async function buyStarter() {
    if (realPayments(app)) { await startCheckout(app, 'starter'); return; }
    const ok = await confirmPurchase(app, {
      title: 'Starter Pack', usd: STARTER_PACK.usd, kind: 'one-time',
      lines: [`${STARTER_PACK.treats} Treats`, '1 Shuffle, 1 Bone Bomb, 1 Bubble Blaster', 'Bandana costume'],
    });
    if (ok) done(backend.buyStarterPack(), 'Starter Pack added. Receipt sent (demo).');
  }

  async function buyItem(id) {
    const item = ITEMS[id];
    if (backend.balance().total < item.treats) { app.toast(errorText('insufficient')); return; }
    if (await confirmTreatSpend(app, { title: item.name, treats: item.treats })) done(backend.buyItem(id), `${item.name} added.`);
  }

  // Season skins (owner, 10 Nov 2026): the dog's whole look, in every PAWtastic game. Worn right away once bought.
  async function buySkin(k) {
    if (backend.balance().total < k.price) { app.toast(errorText('insufficient')); return; }
    if (!(await confirmTreatSpend(app, { title: `${k.name} skin`, treats: k.price }))) return;
    const res = await backend.buySkin(k.id);
    if (res.ok) await backend.wearSkin(k.id);
    if (res.ok) publishMyPup(backend.state());
    done(res, `${k.name} is on! Change it any time in the Closet.`);
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

  function refundNote(s) {
    if (realPayments(app)) {
      reportSheet(app, {
        kind: 'refund', title: 'Request a refund', intro: REFUND_POLICY, requireMessage: false,
        details: { purchase: spendName(s.what), usd: s.usd, date: new Date(s.at).toISOString() },
      });
      return;
    }
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

    const real = realPayments(app);
    const kindTag = kind => h('span', { class: 'kind-tag' }, KINDS[kind].label);
    const packs = section('Treat packs', h('p', { class: 'muted small kind-note' }, kindTag('consumable'), ` ${KINDS.consumable.note}`),
      h('div', { class: 'shop-grid' }, PACKS.map(p =>
        h('button', { class: 'shop-item', type: 'button', 'aria-label': `${p.treats} Treats for ${formatUsd(p.usd)}, consumable`, onClick: () => buyPack(p) },
          h('span', { class: 'shop-art', html: treatIcon() }),
          h('strong', { class: 'num' }, `${p.treats} Treats`),
          h('span', { class: 'muted small num' }, `${(p.usd / p.treats * 100).toFixed(1)}¢ each`),
          h('span', { class: 'price num' }, formatUsd(p.usd))))),
      real ? h('p', { class: 'muted small' }, 'Secure checkout by Stripe. Treats arrive on your account after Stripe confirms the payment.') : h('p', { class: 'muted small' }, 'Demo — no real charge.'),
      real ? testModeLabel(app) : null);

    const starter = state.starterPack.bought
      ? section('Starter Pack', h('p', { class: 'muted small' }, kindTag('one-time'), ' You have the Starter Pack. The Bandana is in your Closet.'))
      : section('Starter Pack',
        h('p', { class: 'muted small kind-note' }, kindTag('one-time'), ` ${KINDS['one-time'].note}`),
        h('div', { class: 'shop-row' },
          h('div', {}, h('strong', {}, 'Starter Pack'),
            h('p', { class: 'muted small' }, `${STARTER_PACK.treats} Treats (≈ ${formatUsd(treatsToUsd(STARTER_PACK.treats))}), 1 Shuffle, 1 Bone Bomb, 1 Bubble Blaster and the Bandana costume`)),
          h('button', { class: 'btn', type: 'button', 'aria-label': `Buy the Starter Pack for ${formatUsd(STARTER_PACK.usd)}`, onClick: buyStarter }, formatUsd(STARTER_PACK.usd))));

    const passStatus = backend.passStatus?.() ?? { active: false };
    const passCard = backend.features.pass ? section('Pup Pass',
      h('p', { class: 'muted small kind-note' }, kindTag('subscription'), ` ${KINDS.subscription.note}`),
      h('div', { class: 'shop-row' },
        h('div', {}, h('strong', {}, passStatus.active ? (passStatus.autoRenew ? `Active · renews ${longDate(passStatus.renewsOn)}` : `Active · ends ${longDate(passStatus.renewsOn)}`) : `Pup Pass · ${formatUsd(PASS.usd)}/month`),
          h('p', { class: 'muted small' }, 'Unlimited lives while active, premium rewards on all 20 tiers, the Honor Roll Sash at tier 20.')),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('pass') }, passStatus.active ? 'Manage' : 'See the pass'))) : null;

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

    const skinSale = typeof backend.buySkin === 'function' ? skinsOnSale(serverNow()) : [];
    const ownedSkins = new Set(state.inventory.skins ?? []);
    const skins = skinSale.length ? section('Season 1 skins',
      h('p', { class: 'small' }, "Your dog's whole look, in every PAWtastic game. Sold during Season 1, until Sat 5 Dec. Yours to keep."),
      h('div', { class: 'shop-grid' }, skinSale.map(k => {
        const has = ownedSkins.has(k.id);
        return h('button', { class: `shop-item skin-item${has ? ' owned' : ''}`, type: 'button', disabled: has, 'data-skin': k.id, onClick: () => { app.services.measure?.track('product_previewed', { item: k.id }); buySkin(k); } },
          h('span', { class: 'shop-dog', html: dogSVG({ ...state.dog, skin: k.id, label: `${k.name} skin preview` }) }),
          h('strong', {}, k.name),
          h('span', { class: 'price num' }, has ? 'Owned' : treatPrice(app, k.price)));
      }))) : null;
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

    const pay = clientOf(app);
    const waiting = real ? pendingDelivery().get() : null;
    const purchases = real ? section('Your purchases',
      waiting
        ? h('div', { class: 'card nudge-card delivery-card' },
          h('p', {}, h('strong', {}, 'A payment is on its way. '), 'Stripe accepted it, but it has not reached the game yet. It is added automatically, usually within a few minutes.'),
          h('button', { class: 'btn small-btn', type: 'button', onClick: async e => { e.currentTarget.disabled = true; await restorePurchases(app); refresh(); } }, 'Check again'))
        : null,
      h('ul', { class: 'plain-list' },
        h('li', {}, `Starter Pack: ${state.starterPack.bought ? 'owned' : 'not bought'}`),
        h('li', {}, `Pup Pass: ${passStatus.active ? (passStatus.autoRenew ? `active, renews ${longDate(passStatus.renewsOn)}` : `active until ${longDate(passStatus.renewsOn)}`) : 'not active'}`),
        h('li', {}, `Bought Treats still on your balance: ${bal.paid}`)),
      h('p', { class: 'muted small' }, pay?.signedIn
        ? `Purchases are tied to ${pay.email ?? 'your account'}. Signed in on another phone? They come back there too.`
        : 'Purchases are tied to the email you buy with. Sign in to get them back on any phone.'),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn secondary', type: 'button', onClick: async e => { e.currentTarget.disabled = true; await restorePurchases(app); refresh(); } }, 'Restore purchases'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => openPortal(app) }, 'Receipts & Pup Pass'))) : null;

    const history = [...state.spending].reverse();
    const spending = section('Spending',
      h('p', { class: 'num' }, `${realPayments(app) ? 'Spending' : 'Demo spending'} this month: ${formatUsd(spent)}${limit == null ? ' (no limit)' : ` of ${formatUsd(limit)} limit`}`),
      limit != null && spent > limit ? h('p', { class: 'muted small' }, realPayments(app) ? "You've reached your limit for this month." : 'Over your limit — the real app would block more purchases this month.') : null,
      h('div', { class: 'limit-choices', role: 'group', 'aria-label': 'Monthly spending limit' },
        LIMIT_CHOICES.map(v => h('button', {
          class: `chip${v === limit ? ' on' : ''}`, type: 'button', 'aria-pressed': String(v === limit),
          onClick: () => done(backend.setSpendingLimit(v), v == null ? 'No monthly limit.' : `Monthly limit set to ${formatUsd(v)}.`),
        }, v == null ? 'No limit' : formatUsd(v)))),
      history.length
        ? h('ul', { class: 'history' }, history.map(s => h('li', {},
          h('strong', {}, spendName(s.what)),
          h('strong', { class: 'num' }, formatUsd(s.usd)),
          h('span', { class: 'muted small' }, formatLongDate(dayKey(s.at))),
          h('button', { class: 'btn secondary small-btn', type: 'button', onClick: () => refundNote(s) }, 'Request refund'))))
        : h('p', { class: 'muted small' }, 'No purchases yet.'));

    // The free-play release sells nothing for money: only what free Treats buy.
    if (!selling) {
      const soon = section('Coming soon', h('p', {}, 'Buying Treats is coming soon. Free Treats come from your daily gifts.'));
      return h('div', { class: 'shop stack' }, h('h1', {}, 'Shop'), balance, skins, items, costumes, soon);
    }
    // Reward Coins come from real PAWtastic visits, which the public site can't see yet.
    if (real) return h('div', { class: 'shop stack' }, h('h1', {}, 'Shop'), balance, skins, packs, starter, passCard, items, costumes, purchases, spending);
    return h('div', { class: 'shop stack' }, h('h1', {}, 'Shop'), balance, skins, packs, starter, passCard, items, costumes, coins, spending);
  }

  refresh();
  return () => bar?.stop();
}

function section(title, ...children) {
  return h('section', { class: 'card stack', 'aria-label': title }, h('h2', {}, title), ...children);
}
