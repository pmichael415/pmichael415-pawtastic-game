// The Pup Pass: Paw Points from playing (never from winning), 20 tiers of
// free and premium rewards, and an honest sign-up and one-tap cancel (spec §6.5).

import { h } from '../dom.js';
import { lockIcon } from '../icons.js';
import { topBar } from '../topbar.js';
import { rewardText } from '../daily.js';
import { PASS, formatUsd } from '../../economy/catalog.js';
import { rewardFor } from '../../economy/progression.js';
import { dayKey, addDays, formatLongDate } from '../../economy/time.js';
import { showFailure } from '../failure.js';
import { render as comingSoon } from './coming-soon.js';
import { realPayments, startCheckout, openPortal, testModeLabel } from '../payments.js';
import { dogSVG } from '../art.js';

const PRICE = formatUsd(PASS.usd);
const ERRORS = {
  locked: 'Keep playing to reach this tier.',
  claimed: 'Already claimed.',
  'pass-required': 'Premium rewards need an active Pup Pass.',
};

export function render(app) {
  const { backend } = app.services;
  if (!backend.features.pass) {
    return comingSoon(app, { title: 'Pup Pass', body: 'A monthly pass with rewards for playing is on its way. Your daily gift still pays free Treats every day you play.' });
  }
  let bar = null;

  function refresh() {
    const y = window.scrollY;
    bar?.stop();
    bar = topBar(app, { title: 'Pup Pass', back: () => app.go('map') });
    app.view.replaceChildren(bar, body());
    window.scrollTo(0, y);
  }

  function signUp(renewsOn) {
    let s;
    const real = realPayments(app);
    // Real payments: resuming a cancelled pass happens on Stripe's account page.
    if (real && backend.passStatus().active) { openPortal(app); return; }
    app.services.measure?.track('product_previewed', { product: 'pass', kind: 'subscription' });
    const start = h('button', { class: 'btn', type: 'button', disabled: true }, real ? 'Continue to checkout' : 'Start Pup Pass');
    const agree = h('input', { type: 'checkbox', id: 'pass-agree' });
    agree.addEventListener('change', () => { start.disabled = !agree.checked; });
    start.addEventListener('click', async () => {
      if (!agree.checked) return;
      s.close();
      if (real) { await startCheckout(app, 'pass', { confirmed: true }); return; }
      const res = await backend.startPass();
      if (res.ok || res.error === 'already-active') app.toast(res.ok ? "You're in! A confirmation email would be sent now (demo)." : 'Your Pup Pass is already active.');
      else showFailure(app, res.error);
      refresh();
    });
    s = app.modal(h('div', { class: 'stack pass-sheet' },
      real ? testModeLabel(app) : h('span', { class: 'demo-label' }, 'Demo — no real charge'),
      h('h2', {}, 'Pup Pass'),
      h('p', { class: 'pass-price' }, `${PRICE} every month until you cancel`),
      h('p', {}, `Renews ${formatLongDate(renewsOn)}`),
      h('ul', { class: 'plain-list' },
        h('li', {}, 'Unlimited lives'),
        h('li', {}, 'Premium rewards on all 20 tiers'),
        h('li', {}, 'The Honor Roll Sash costume at tier 20')),
      h('p', {}, real ? 'Cancel anytime from this screen or the menu: Manage Pup Pass & receipts.' : 'Cancel anytime in Pup Pass settings — one tap.'),
      h('label', { class: 'consent', for: 'pass-agree' }, agree, h('span', {}, `I agree to be charged ${PRICE} every month until I cancel.`)),
      real
        ? h('p', { class: 'muted small' }, "You'll enter your card on Stripe's secure checkout page. PAWtastic never sees your card number.")
        : h('fieldset', { class: 'demo-card', disabled: true },
          h('legend', {}, 'Demo — no card needed'),
          h('label', {}, 'Card number', h('input', { type: 'text', placeholder: '•••• •••• •••• ••••', disabled: true })),
          h('label', {}, 'Expiry', h('input', { type: 'text', placeholder: 'MM / YY', disabled: true }))),
      h('div', { class: 'btn-pair' },
        start,
        h('button', { class: 'btn secondary', type: 'button', onClick: () => s.close() }, 'No thanks')),
    ), { label: 'Pup Pass sign-up' });
  }

  function cancel(renewsOn) {
    let s;
    if (realPayments(app)) {
      s = app.modal(h('div', { class: 'stack' },
        h('h2', {}, 'Cancel Pup Pass?'),
        h('p', {}, `You'll cancel on Stripe's secure account page. You won't be charged again, and your benefits continue until ${formatLongDate(renewsOn)}.`),
        h('div', { class: 'btn-pair' },
          h('button', { class: 'btn', type: 'button', onClick: () => { s.close(); openPortal(app); } }, 'Continue to cancel'),
          h('button', { class: 'btn secondary', type: 'button', onClick: () => s.close() }, 'Keep it'))),
      { label: 'Cancel Pup Pass' });
      return;
    }
    const yes = async () => {
      s.close();
      const res = await backend.cancelPass();
      if (res.ok) app.toast(`Cancelled. Your benefits continue until ${formatLongDate(renewsOn)}.`);
      else showFailure(app, res.error);
      refresh();
    };
    s = app.modal(h('div', { class: 'stack' },
      h('h2', {}, 'Cancel Pup Pass?'),
      h('p', {}, `You won't be charged again. Your benefits continue until ${formatLongDate(renewsOn)}.`),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: yes }, 'Cancel Pup Pass'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => s.close() }, 'Keep it'))),
    { label: 'Cancel Pup Pass' });
  }

  async function claim(track, tier) {
    const res = await backend.claimTier(track, tier);
    app.toast(res.ok ? `Claimed ${rewardText(res.reward)}!` : (ERRORS[res.error] ?? 'Something went wrong.'));
    refresh();
  }

  function cell(track, tier, status, state) {
    const reward = rewardFor(track, tier);
    if (!reward) return h('div', { class: 'tier-cell empty' }, h('span', { class: 'muted' }, '—'));
    const claimed = (track === 'free' ? state.pass.claimedFree : state.pass.claimedPremium).includes(tier);
    const reached = tier <= status.tier;
    const needsPass = track === 'premium' && !status.active;
    let control;
    if (claimed) control = h('span', { class: 'tier-state' }, '✓ Claimed');
    else if (!reached) control = h('span', { class: 'tier-state', html: lockIcon(), 'aria-label': 'Locked' });
    else if (needsPass) control = h('span', { class: 'tier-state' }, 'Pass needed');
    else control = h('button', { class: 'btn small-btn', type: 'button', onClick: () => claim(track, tier) }, 'Claim');
    return h('div', { class: `tier-cell${reached && !needsPass ? '' : ' locked'}${claimed ? ' claimed' : ''}` },
      h('span', { class: 'tier-reward' }, rewardText(reward)), control);
  }

  function body() {
    const state = backend.state();
    const status = backend.passStatus();
    const intoTier = status.tier >= PASS.tiers ? PASS.pointsPerTier : status.points % PASS.pointsPerTier;
    const renewsOn = status.active ? status.renewsOn : addDays(dayKey(Date.now()), 30);

    const head = h('section', { class: 'card stack pass-head' },
      h('div', { class: 'pass-points' },
        h('strong', { class: 'num' }, `${status.points} Paw Points`),
        h('span', { class: 'muted num' }, `Tier ${status.tier} of ${PASS.tiers}`)),
      h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Progress to the next tier', 'aria-valuemin': 0, 'aria-valuemax': PASS.pointsPerTier, 'aria-valuenow': intoTier },
        h('span', { style: `width:${(intoTier / PASS.pointsPerTier) * 100}%` })),
      h('p', { class: 'small muted' }, `Earn Paw Points just by playing, win or lose: ${PASS.points.first} for your first level each day, then ${PASS.points.each} per level (up to ${PASS.points.maxLevelsPerDay} levels a day; a level counts after ${PASS.points.minMoves} moves). Points start fresh each month.`),
      status.active
        ? h('div', { class: 'stack tight' },
          h('p', { class: 'pass-on' }, status.autoRenew ? `Pup Pass active · Renews ${formatLongDate(status.renewsOn)}` : `Pup Pass active · Ends ${formatLongDate(status.renewsOn)}`),
          status.autoRenew
            ? h('button', { class: 'btn secondary block', type: 'button', onClick: () => cancel(status.renewsOn) }, 'Cancel Pup Pass')
            : h('button', { class: 'btn secondary block', type: 'button', onClick: () => signUp(status.renewsOn) }, 'Keep my Pup Pass'))
        : h('button', { class: 'btn gold block', type: 'button', onClick: () => signUp(renewsOn) }, `Get the Pup Pass · ${PRICE}/month`));

    // What the pass is, plainly: what's included, what it never does, what this player has earned, what's next.
    const nextTier = status.tier < PASS.tiers ? status.tier + 1 : null;
    const nextPremium = nextTier ? rewardFor('premium', nextTier) : null;
    const nextFree = nextTier ? rewardFor('free', nextTier) : null;
    const toNext = nextTier ? PASS.pointsPerTier - intoTier : 0;
    const claimedPremium = state.pass.claimedPremium.length;
    const claimedFree = state.pass.claimedFree.length;
    const unclaimedPremium = Array.from({ length: status.tier }, (_, i) => i + 1).filter(t => rewardFor('premium', t) && !state.pass.claimedPremium.includes(t)).length;
    const summary = h('section', { class: 'card stack pass-summary', 'aria-label': 'About the Pup Pass' },
      h('div', { class: 'pass-summary-row' },
        h('span', { class: 'pass-preview', 'aria-hidden': 'true', html: dogSVG({ ...state.dog, costume: 'honor-roll-sash', label: state.dog?.name ?? 'Your dog' }) }),
        h('div', { class: 'stack tight' },
          h('h2', {}, "What's in the Pup Pass"),
          h('ul', { class: 'plain-list small' },
            h('li', {}, 'Unlimited lives in Academy and Summer Camp levels'),
            h('li', {}, `Premium rewards on all ${PASS.tiers} tiers (Treats and boosters)`),
            h('li', {}, 'The Honor Roll Sash costume at tier 20 — pictured on your pup')),
          h('p', { class: 'small muted' }, 'The Pup Pass never helps in the Weekly Challenge: competition runs use no lives or boosters, so everyone plays the same game. Nothing in the pass is a real-world prize.'))),
      h('div', { class: 'pass-facts' },
        h('div', {}, h('strong', { class: 'num' }, `${status.tier}/${PASS.tiers}`), h('span', { class: 'small muted' }, 'tiers reached')),
        h('div', {}, h('strong', { class: 'num' }, String(claimedFree + claimedPremium)), h('span', { class: 'small muted' }, 'rewards claimed')),
        h('div', {}, h('strong', { class: 'num' }, nextTier ? `${toNext} pts` : '—'), h('span', { class: 'small muted' }, nextTier ? `to tier ${nextTier}` : 'all tiers reached'))),
      nextTier
        ? h('p', { class: 'small' }, `Next tier: ${nextFree ? `${rewardText(nextFree)} free` : 'no free reward'}${nextPremium ? ` · ${rewardText(nextPremium)} with the pass` : ''}.`)
        : h('p', { class: 'small' }, 'You have reached every tier this month.'),
      status.active && unclaimedPremium ? h('p', { class: 'small' }, `${unclaimedPremium} premium ${unclaimedPremium === 1 ? 'reward is' : 'rewards are'} ready to claim below.`) : null,
      !status.active && status.tier > 0 ? h('p', { class: 'small muted' }, `With the pass, the ${status.tier} premium ${status.tier === 1 ? 'reward' : 'rewards'} on the tiers you have already reached ${status.tier === 1 ? 'is' : 'are'} yours to claim right away.`) : null,
      h('p', { class: 'small muted' }, `${PRICE} a month, renews until you cancel; cancel anytime from this screen. Tiers and points reset each month.`));

    const tiers = h('section', { class: 'card stack', 'aria-label': 'Reward tiers' },
      h('h2', {}, 'Rewards'),
      h('div', { class: 'tier-grid' },
        h('div', { class: 'tier-head' }, h('span', {}, 'Tier'), h('span', {}, 'Free'), h('span', {}, 'Pup Pass')),
        Array.from({ length: PASS.tiers }, (_, i) => i + 1).map(tier => h('div', { class: `tier-row${tier <= status.tier ? ' reached' : ''}` },
          h('span', { class: 'tier-num num' }, tier),
          cell('free', tier, status, state),
          cell('premium', tier, status, state)))));

    return h('div', { class: 'pass stack' }, h('h1', {}, 'Pup Pass'), head, summary, tiers);
  }

  refresh();
  return () => bar?.stop();
}
