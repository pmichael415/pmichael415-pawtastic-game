// The school-year map: five areas named after PAWtastic's real services.

import { h } from '../dom.js';
import { dogSVG, professorPawsSVG } from '../art.js';
import { dogPhoto } from '../photo.js';
import { bookingLinkEl } from '../booking-links.js';
import { starIcon, lockIcon } from '../icons.js';
import { topBar } from '../topbar.js';
import { AREA_INTROS } from '../tips.js';
import { showDailyRewards } from '../daily.js';
import { showStarterPackOffer } from './results.js';
import { AREAS, LEVELS, isHardLevel } from '../../engine/levels.js';
import { COSTUMES } from '../../economy/catalog.js';

const OFFSETS = [0, 1, 2, 1, 0, -1, -2, -1];
const costumeName = id => COSTUMES.find(c => c.id === id)?.name ?? id;

function showIntro(app, area) {
  let sheet;
  sheet = app.modal(h('div', { class: 'stack intro' },
    h('span', { class: 'intro-prof', html: professorPawsSVG() }),
    h('p', { class: 'eyebrow' }, 'Professor Paws'),
    h('h2', {}, area.name),
    h('p', {}, AREA_INTROS[area.id]),
    h('button', { class: 'btn block', type: 'button', onClick: () => sheet.close() }, "Let's go"),
  ), { label: `${area.name} introduction`, onClose: () => app.services.backend.markIntroSeen(area.id) });
}

export function render(app, params = {}) {
  const { backend, jar } = app.services;
  const state = backend.state();
  const unlocked = Math.min(state.progress.unlocked, LEVELS.length);
  const bar = topBar(app);

  // A level left mid-way is picked up where it was; starting another one drops it, so ask first.
  const inProgress = backend.levelInProgress?.() ?? null;
  const resume = id => app.go('level', { levelId: id, resume: true });
  function openLevel(id) {
    if (!inProgress) { app.go('level', { levelId: id }); return; }
    if (inProgress.levelId === id) { resume(id); return; }
    let sheet;
    sheet = app.modal(h('div', { class: 'stack' },
      h('p', {}, `Leave Level ${inProgress.levelId}? That board will be lost.`),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => { sheet.close(); app.go('level', { levelId: id }); } }, 'Leave it'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => { sheet.close(); resume(inProgress.levelId); } }, `Continue Level ${inProgress.levelId}`))),
    { label: `Leave Level ${inProgress.levelId}?` });
  }
  const continueCard = inProgress
    ? h('div', { class: 'card continue-card' },
      h('p', {}, `You were in the middle of Level ${inProgress.levelId}.`),
      h('button', { class: 'btn', type: 'button', onClick: () => resume(inProgress.levelId) }, `Continue Level ${inProgress.levelId}`))
    : null;

  const nav = h('nav', { class: 'map-nav', 'aria-label': 'Academy' },
    h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('shop') }, 'Shop'),
    h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('closet') }, 'Closet'),
    h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('pass') }, 'Pup Pass'),
    h('button', { class: 'btn secondary jar-btn', type: 'button', onClick: () => app.go('jar') }, 'Treat Jar',
      backend.features.jar && jar.canOpen() ? h('span', { class: 'dot', 'aria-label': 'Free open available' }) : null),
  );

  const signs = h('div', { class: 'signposts', 'aria-label': 'Locations' },
    h('span', { class: 'sign' }, '← Hillsdale'), h('span', { class: 'sign' }, 'Hawthorne →'));

  let currentNode = null;
  const areas = AREAS.map((area, ai) => {
    const ids = LEVELS.filter(l => l.area === area.id).map(l => l.id);
    const passed = ids.filter(id => state.progress.levels[id]).length;
    const stars = ids.reduce((s, id) => s + (state.progress.levels[id]?.stars || 0), 0);
    const locked = area.first > unlocked;
    const banner = h('div', { class: `area-banner card${locked ? ' locked' : ''}` },
      h('p', { class: 'eyebrow' }, `Area ${ai + 1} of ${AREAS.length}`),
      h('h2', {}, area.name),
      h('p', { class: 'small muted' }, `In real life: ${area.service}`),
      h('p', { class: 'small num' }, locked
        ? `Unlocks after ${AREAS[ai - 1].name}`
        : `${passed}/8 passed · ${stars}/24 stars · Finish to earn the ${costumeName(area.costume)}`),
      backend.features.account && !locked ? bookingLinkEl(app, area.id, state.dog?.name, 'booking-link small') : null,
    );
    const nodes = ids.map((id, i) => {
      const done = state.progress.levels[id];
      const isLocked = id > unlocked;
      const isCurrent = id === unlocked && !done;
      const node = h('button', {
        type: 'button', class: `node${isLocked ? ' locked' : ''}${isCurrent ? ' current' : ''}${done ? ' done' : ''}`,
        disabled: isLocked, 'aria-label': `Level ${id}${isHardLevel(id) ? ', pop quiz' : ''}${done ? `, ${done.stars} stars` : ''}${isLocked ? ', locked' : ''}`,
        onClick: () => openLevel(id),
      }, isLocked ? h('span', { html: lockIcon() }) : h('span', { class: 'node-num' }, String(id)));
      const row = h('div', { class: 'node-row' }, h('div', { class: 'node-group', style: `--offset:${OFFSETS[i]}` },
        h('div', { class: 'node-wrap' },
          node,
          done ? h('div', { class: 'node-stars', 'aria-hidden': 'true' }, [1, 2, 3].map(s => h('span', { html: starIcon(s <= done.stars) }))) : null,
          isHardLevel(id) ? h('span', { class: 'quiz-tag' }, 'Pop quiz') : null),
        isCurrent ? (state.dog?.photoUrl
          ? h('span', { class: 'map-dog' }, dogPhoto(state.dog.photoUrl, { size: 52, alt: state.dog.name, look: state.dog }))
          : h('span', { class: 'map-dog', html: dogSVG({ ...state.dog, costume: state.inventory.equipped, label: state.dog?.name ?? 'Your dog' }) })) : null,
      ));
      if (isCurrent || (id === unlocked)) currentNode = row;
      return row;
    });
    return h('section', { class: 'area', 'aria-label': area.name }, banner, h('div', { class: 'path' }, nodes));
  });

  const allDone = state.progress.levels[40];
  app.view.append(...[bar, continueCard, nav, signs, h('div', { class: 'map' },
    allDone ? h('p', { class: 'card grad-note' }, `${state.dog?.name ?? 'Your pup'} graduated from PAWtastic Academy!`) : null,
    areas)].filter(Boolean));

  // After a win, the dog hops from the level just passed to the new one.
  const hop = app.services.lastWin;
  app.services.lastWin = null;
  if (hop) {
    const opened = AREAS.find(a => a.first === hop.to && a.first > 1);
    if (opened && app.effects()) app.view.querySelector(`.area[aria-label="${opened.name}"] .area-banner`)?.classList.add('just-unlocked');
  }
  requestAnimationFrame(() => {
    const box = currentNode?.getBoundingClientRect();
    if (box && box.bottom > window.innerHeight) currentNode.scrollIntoView({ block: 'center' });
    const dog = app.view.querySelector('.map-dog');
    const from = hop && app.view.querySelector(`.node[aria-label^="Level ${hop.from}"]`);
    if (!dog || !from || !app.effects() || !dog.animate) return;
    const a = from.getBoundingClientRect(), b = dog.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    dog.classList.add('hopping');
    const anim = dog.animate([
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 34}px)`, offset: 0.5 },
      { transform: 'none' },
    ], { duration: 600, easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)' });
    anim.onfinish = () => dog.classList.remove('hopping');
  });

  const area = AREAS.find(a => unlocked >= a.first && unlocked <= a.last) ?? AREAS[AREAS.length - 1];
  // Daily rewards come first, once per app open; then this area's intro.
  const daily = app.services.dailyShown || params.skipIntro ? Promise.resolve() : showDailyRewards(app, app.services.openResult);
  app.services.dailyShown = true;
  let gone = false;
  daily
    .then(() => {
      if (gone || !app.services.pendingStarterOffer) return null;
      app.services.pendingStarterOffer = false;
      return backend.state().starterPack.bought ? null : showStarterPackOffer(app);
    })
    .then(() => { if (!gone && !state.seenIntros.includes(area.id) && !params.skipIntro) showIntro(app, area); });
  return () => { gone = true; bar.stop(); };
}
