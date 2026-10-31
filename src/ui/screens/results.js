// Level results and the one-time Starter Pack offer.
// Win screens never carry purchase buttons (spec §3).

import { h } from '../dom.js';
import { starIcon } from '../icons.js';
import { dogSVG, professorPawsSVG } from '../art.js';
import { winTimeline, playWin, countUp } from '../../fx/celebrate.js';
import { createParticleLayer } from '../../fx/particles.js';
import { AREAS, getLevel, areaOf, LAST_LEVEL } from '../../engine/levels.js';
import { COSTUMES, STARTER_PACK, formatUsd, treatsToUsd } from '../../economy/catalog.js';
import { confirmPurchase } from '../purchase.js';
import { realPayments, startCheckout } from '../payments.js';
import { shareDog } from '../share-card.js';
import { showFailure } from '../failure.js';
import { milestoneList } from '../daily.js';

const BADGE_NAMES = {
  'first-three-stars': 'First 3-star level',
  'ten-wins': '10 levels passed',
  'grad-orientation': 'Finished Orientation',
  'grad-recess': 'Finished Recess Yard',
  'grad-spa': 'Finished the Ivy-League Spa',
  'grad-dorms': 'Finished Dorms & Graduate Suites',
  'grad-graduation': 'Graduated from PAWtastic Academy',
  'grad-cabins': 'Checked in at Summer Camp',
  'grad-lake': 'Finished Lake Day',
  'grad-trail': 'Finished the Trail Hike',
  'grad-campfire': 'Finished Campfire Night',
  'grad-talent': 'Summer Camp champion',
};

const costumeName = id => COSTUMES.find(c => c.id === id)?.name ?? id;

// Resolves when the sheet closes.
export function showStarterPackOffer(app) {
  if (!app.services.backend.features.purchases) return Promise.resolve();
  return new Promise(resolve => {
    const { backend } = app.services;
    let sheet;
    let buying = false;
    const buy = async () => {
      buying = true;
      sheet.close();
      if (realPayments(app)) { await startCheckout(app, 'starter'); resolve(); return; }
      const ok = await confirmPurchase(app, {
        title: 'Starter Pack', usd: STARTER_PACK.usd,
        lines: [`${STARTER_PACK.treats} Treats`, '1 Shuffle, 1 Bone Bomb, 1 Bubble Blaster', 'Bandana costume'],
      });
      if (ok) {
        const res = await backend.buyStarterPack();
        if (res.ok) app.toast('Starter Pack added. Receipt sent (demo).');
        else if (res.error === 'already-bought') app.toast('You already have the Starter Pack.');
        else showFailure(app, res.error);
      }
      resolve();
    };
    sheet = app.modal(h('div', { class: 'stack' },
      realPayments(app) ? null : h('span', { class: 'demo-label' }, 'Demo — no real charge'),
      h('p', { class: 'eyebrow' }, 'One-time offer'),
      h('h2', {}, 'Starter Pack'),
      h('ul', { class: 'plain-list' },
        h('li', {}, `${STARTER_PACK.treats} Treats (worth about ${formatUsd(treatsToUsd(STARTER_PACK.treats))})`),
        h('li', {}, '1 Shuffle, 1 Bone Bomb and 1 Bubble Blaster'),
        h('li', {}, 'Bandana costume for your pup')),
      h('div', { class: 'total-row' }, h('span', {}, 'Price'), h('strong', { class: 'num' }, formatUsd(STARTER_PACK.usd))),
      h('p', { class: 'muted small' }, 'You can find it again in the Shop.'),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: buy }, 'Buy Starter Pack'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'No thanks')),
    ), { label: 'Starter Pack offer', onClose: () => { if (!buying) resolve(); } });
  });
}

function areaDone(app, areaId) {
  const area = AREAS.find(a => a.id === areaId);
  const kind = areaId === 'graduation' ? 'graduation' : areaId === 'talent' ? 'camp' : 'area';
  return h('div', { class: 'btn-pair' },
    h('button', { class: 'btn gold', type: 'button', onClick: () => app.go('report', { areaId }) }, 'See your report card'),
    h('button', { class: 'btn secondary', type: 'button', onClick: () => shareDog(app, { kind, areaName: area.name, costume: area.costume }) }, 'Share'));
}

// The win screen builds its final layout, then the celebration fills it in cue by cue
// (tap to skip). Returns { destroy } so the level can stop it when the player leaves.
export function renderWin(app, { levelId, score, starsEarned, summary, bonus = 0 }) {
  const { backend, audio } = app.services;
  const dog = backend.state().dog;
  const next = levelId < LAST_LEVEL ? getLevel(levelId + 1) : null;
  const area = summary.areaCompleted ? AREAS.find(a => a.id === summary.areaCompleted) : null;
  const effects = app.effects();

  const banner = h('h1', { class: 'win-banner caps' }, 'Level complete!');
  const prof = h('div', { class: 'results-prof', html: professorPawsSVG({ mood: 'happy' }) });
  const starEls = [1, 2, 3].map(() => h('span', { html: starIcon(false) }));
  const scoreEl = h('span', { class: 'num' }, (score - bonus).toLocaleString('en-US'));
  // Space is reserved for the bonus line from the start so nothing shifts under a tap mid-celebration.
  const bonusLine = bonus > 0 ? h('p', { class: 'bonus-line num waiting' }, `Graduation bonus +${bonus.toLocaleString('en-US')}`) : null;
  const diploma = area ? h('div', { class: 'diploma' },
    h('p', { class: 'eyebrow' }, 'Diploma'),
    h('p', { class: 'diploma-title caps' }, `${dog?.name ?? 'Your pup'} finished ${area.name}`),
    h('div', { class: 'diploma-dog', html: dogSVG({ ...dog, costume: area.costume, label: `${dog?.name ?? 'Your dog'} wearing the ${costumeName(area.costume)}` }) }),
    h('p', { class: 'small' }, `New costume: ${costumeName(area.costume)}`)) : null;

  const section = h('section', { class: 'results stack', 'data-stars': String(starsEarned) },
    h('p', { class: 'eyebrow' }, `Level ${levelId} · ${areaOf(levelId).name}`),
    banner,
    h('div', { class: 'results-hero' }, prof,
      h('div', { class: 'results-dog', html: dogSVG({ ...dog, costume: summary.unlockedCostume ?? backend.state().inventory.equipped, label: dog?.name ?? 'Your dog' }) })),
    h('div', { class: 'stars-row', 'aria-label': `${starsEarned} of 3 stars` }, starEls),
    h('p', { class: 'score-line' }, 'Score ', scoreEl),
    bonusLine,
    diploma,
    summary.unlockedCostume && !area ? h('p', { class: 'card' }, `New costume earned: ${costumeName(summary.unlockedCostume)}`) : null,
    summary.newBadges.length ? h('ul', { class: 'plain-list badges' }, summary.newBadges.map(b => h('li', {}, `Badge: ${BADGE_NAMES[b] ?? b}`))) : null,
    summary.milestones?.length ? h('div', { class: 'card milestone-card' }, h('p', { class: 'eyebrow' }, 'Milestone reward!'), milestoneList(summary.milestones)) : null,
    summary.areaCompleted ? areaDone(app, summary.areaCompleted) : null,
    h('div', { class: 'btn-pair' },
      next ? h('button', { class: 'btn', type: 'button', onClick: () => app.go('level', { levelId: next.id }) }, 'Next level') : null,
      h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('map') }, 'School map')),
  );
  app.view.replaceChildren(section);
  const layer = createParticleLayer(section, { enabled: () => app.effects() });
  let stopCount = () => {};

  const run = playWin(section, winTimeline({ stars: starsEarned, bonus, areaCompleted: !!area }), {
    effects,
    onCue: (cue, { skipped }) => {
      if (cue.cue === 'jingle') audio?.jingle('graduation-jingle');
      if (cue.cue === 'banner') banner.classList.add('show');
      if (cue.cue === 'cheer') { prof.innerHTML = professorPawsSVG({ mood: 'cheer' }); prof.classList.add('cheering'); }
      if (cue.cue === 'bark' && !skipped) audio?.jingle('happy-bark');
      if (cue.cue === 'star') {
        starEls[cue.n - 1].innerHTML = starIcon(true);
        starEls[cue.n - 1].classList.add('pop');
        if (!skipped) audio?.sfx('star', cue.n);
      }
      if (cue.cue === 'confetti' && !skipped) layer.confetti(120);
      if (cue.cue === 'bonus') { bonusLine.classList.remove('waiting'); stopCount = countUp(scoreEl, score - bonus, score, 600, { effects: effects && !skipped }); }
      if (cue.cue === 'diploma') diploma?.classList.add('unrolled');
    },
  });

  // Never on a win screen: the map shows it on the next visit.
  if (summary.starterPackOffer) app.services.pendingStarterOffer = true;
  return { destroy() { run.destroy(); stopCount(); layer.destroy(); } };
}

export function renderLoss(app, { levelId, summary }) {
  app.view.replaceChildren(h('section', { class: 'results stack' },
    h('p', { class: 'eyebrow' }, `Level ${levelId} · ${areaOf(levelId).name}`),
    h('div', { class: 'results-prof', html: professorPawsSVG({ mood: 'sympathy' }) }),
    h('h1', {}, 'Level not passed'),
    h('p', { class: 'muted' }, 'Every pup learns at their own pace. Try again when you are ready.'),
    h('div', { class: 'btn-pair' },
      h('button', { class: 'btn', type: 'button', onClick: () => app.go('level', { levelId }) }, 'Try again'),
      h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('map') }, 'School map')),
  ));
  app.services.audio?.sfx('lose');
  if (summary.starterPackOffer) showStarterPackOffer(app);
}
