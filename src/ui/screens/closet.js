// The closet: dress your dog, see what's left to earn, and the collection book.

import { h } from '../dom.js';
import { dogSVG } from '../art.js';
import { topBar } from '../topbar.js';
import { shareDog } from '../share-card.js';
import { AREAS } from '../../engine/levels.js';
import { COSTUMES, SETS, EVENT, STARTER_PACK, formatUsd } from '../../economy/catalog.js';
import { dayKey } from '../../economy/time.js';
import { withBusy, showFailure } from '../failure.js';
import { treatPrice } from '../prices.js';

const costumeName = id => COSTUMES.find(c => c.id === id)?.name ?? id;

function lockedNote(c, app) {
  if (c.source === 'area') return `Finish ${AREAS.find(a => a.costume === c.id).name} to earn`;
  if (c.source === 'pass') return 'Pup Pass reward';
  if (c.source === 'collection') return 'Collection bonus';
  return `In the Shop · ${treatPrice(app, c.price)}`;
}

export function render(app) {
  const { backend } = app.services;
  let bar = null;

  function refresh() {
    const y = window.scrollY;
    bar?.stop();
    bar = topBar(app, { title: 'Closet', back: () => app.go('map') });
    app.view.replaceChildren(bar, body());
    window.scrollTo(0, y);
  }

  async function equip(id, button) {
    const res = await withBusy(button, () => backend.equip(id));
    if (res.ok) app.toast(id ? `${costumeName(id)} on!` : 'Costume off.');
    else showFailure(app, res.error, () => equip(id, button));
    refresh();
  }

  function body() {
    const state = backend.state();
    const owned = new Set(state.inventory.costumes);
    const equipped = state.inventory.equipped;
    const dogName = state.dog?.name || 'Your pup';
    const today = dayKey(Date.now());
    const eventOn = today >= EVENT.start && today <= EVENT.end;

    const share = h('button', { class: 'btn gold', type: 'button' }, 'Share');
    share.addEventListener('click', async () => {
      share.disabled = true;
      await shareDog(app, { kind: 'costume', costume: equipped });
      share.disabled = false;
    });

    const preview = h('section', { class: 'closet-preview stack' },
      h('div', { class: 'results-dog', html: dogSVG({ ...state.dog, costume: equipped, label: `${dogName}${equipped ? ` wearing the ${costumeName(equipped)}` : ''}` }) }),
      h('p', { class: 'closet-wearing' }, equipped ? `${dogName} is wearing the ${costumeName(equipped)}` : `${dogName} isn't wearing a costume`),
      h('div', { class: 'btn-pair' },
        share,
        h('button', { class: 'btn secondary', type: 'button', disabled: !equipped, onClick: e => equip(null, e.currentTarget) }, 'Take it off')),
      backend.dogs().length > 1 ? h('button', { class: 'btn secondary block', type: 'button', onClick: () => app.go('pick-dog', { from: 'closet' }) }, 'Switch dog') : null);

    const mine = COSTUMES.filter(c => owned.has(c.id));
    const wardrobe = h('section', { class: 'card stack', 'aria-label': 'Your costumes' },
      h('h2', {}, 'Your costumes'),
      mine.length
        ? h('div', { class: 'shop-grid' }, mine.map(c => h('button', {
          class: `shop-item${c.id === equipped ? ' equipped' : ''}`, type: 'button', 'aria-pressed': String(c.id === equipped),
          onClick: e => equip(c.id, e.currentTarget),
        },
        h('span', { class: 'shop-dog', html: dogSVG({ ...state.dog, costume: c.id, label: `${c.name} preview` }) }),
        h('strong', {}, c.name),
        h('span', { class: 'price' }, c.id === equipped ? 'Wearing' : 'Tap to wear'))))
        : h('p', { class: 'muted' }, 'No costumes yet. Finish an area or visit the Shop.'));

    const locked = COSTUMES.filter(c => !owned.has(c.id) && (c.set !== 'event' || eventOn));
    const toEarn = h('section', { class: 'card stack', 'aria-label': 'Still to earn' },
      h('h2', {}, 'Still to earn'),
      locked.length
        ? h('ul', { class: 'locked-list' }, locked.map(c => h('li', {},
          h('span', { class: 'shop-dog small locked', html: dogSVG({ ...state.dog, costume: c.id, label: `${c.name} preview` }) }),
          h('div', { class: 'grow' }, h('strong', {}, c.name), h('span', { class: 'muted small' }, lockedNote(c, app))),
          c.source === 'shop' ? h('button', { class: 'btn secondary small-btn', type: 'button', onClick: () => app.go('shop') }, 'Shop') : null)))
        : h('p', { class: 'muted' }, 'You have every costume. Valedictorian!'));

    const book = h('section', { class: 'card stack', 'aria-label': 'Collection book' },
      h('h2', {}, 'Collection book'),
      SETS.map(set => {
        const have = set.costumes.filter(id => owned.has(id)).length;
        const bonusOwned = owned.has(set.bonus);
        return h('div', { class: 'set stack tight' },
          h('div', { class: 'set-head' }, h('strong', {}, `${set.name} set`), h('span', { class: 'num muted' }, `${have} / ${set.costumes.length}`)),
          h('ul', { class: 'set-pieces' }, set.costumes.map(id => h('li', { class: owned.has(id) ? 'have' : '' },
            h('span', { 'aria-hidden': 'true' }, owned.has(id) ? '✓' : '○'), ` ${costumeName(id)}`, h('span', { class: 'sr-only' }, owned.has(id) ? ' (owned)' : ' (needed)')))),
          h('p', { class: 'small' }, bonusOwned
            ? `Bonus earned: ${costumeName(set.bonus)}`
            : `Collect all ${set.costumes.length} to earn the ${costumeName(set.bonus)}.`));
      }));

    // One quiet suggestion at the customizing moment (never on a loss, never blocking anything):
    // the one-time Starter Pack, which brings the Bandana. Hidden once bought or when purchases are off.
    const starter = backend.features.purchases && !state.starterPack.bought
      ? h('section', { class: 'card nudge-card', 'aria-label': 'Starter Pack' },
        h('p', {}, h('strong', {}, 'Starter Pack · one-time.'), ` The Bandana costume, ${STARTER_PACK.treats} Treats and 3 boosters for ${formatUsd(STARTER_PACK.usd)}. Yours to keep.`),
        h('button', { class: 'btn secondary small-btn', type: 'button', onClick: () => app.go('shop') }, 'See it'))
      : null;

    return h('div', { class: 'closet stack' }, h('h1', {}, 'Closet'), preview, wardrobe, starter, toEarn, book);
  }

  refresh();
  return () => bar?.stop();
}
