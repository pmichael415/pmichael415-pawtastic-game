// The map: the school year's five areas (named after PAWtastic's real services), then Summer Camp's five.

import { h } from '../dom.js';
import { dogSVG, professorPawsSVG } from '../art.js';
import { dogPhoto } from '../photo.js';
import { bookingLinkEl } from '../booking-links.js';
import { starIcon, lockIcon } from '../icons.js';
import { topBar } from '../topbar.js';
import { AREA_INTROS } from '../tips.js';
import { showDailyRewards } from '../daily.js';
import { showStarterPackOffer } from './results.js';
import { cloudSaveCard } from '../payments.js';
import { installCard } from '../install.js';
import { hubCard } from '../hub-notice.js';
import { friendOfferCard, showInvite } from '../referral.js';
import { isPublicSite } from '../../backend/local.js';
import { AREAS, CHAPTERS, LEVELS, ALL_LEVELS, LAST_LEVEL, isHardLevel, chapterOf, locationChapter, levelNumber } from '../../engine/levels.js';
import { weeklyCard, pickHome, homeChoices, syncProfile, prizeReminderCard } from '../compete.js';
import { COSTUMES } from '../../economy/catalog.js';
import { nextStarMilestone } from '../../economy/progression.js';
import { rewardText } from '../daily.js';

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
  const publicSite = isPublicSite(backend);
  // Two roads: the main one (Academy, then Summer Camp) and the player's home-location adventure.
  const local = locationChapter(state.home);
  const localOpen = !!local && !!state.progress.levels[local.opensAfter];
  const view = params.view === 'local' && local ? 'local' : 'main';
  const unlocked = view === 'local'
    ? (localOpen ? state.progress.side[local.location] : 0)
    : Math.min(state.progress.unlocked, LAST_LEVEL);
  const bar = topBar(app);

  // A level left mid-way is picked up where it was; starting another one drops it, so ask first.
  const inProgress = backend.levelInProgress?.() ?? null;
  const resume = id => app.go('level', { levelId: id, resume: true });
  function openLevel(id) {
    if (!inProgress) { app.go('level', { levelId: id }); return; }
    if (inProgress.levelId === id) { resume(id); return; }
    let sheet;
    sheet = app.modal(h('div', { class: 'stack' },
      h('p', {}, `Leave Level ${levelNumber(inProgress.levelId)}? That board will be lost.`),
      h('div', { class: 'btn-pair' },
        h('button', { class: 'btn', type: 'button', onClick: () => { sheet.close(); app.go('level', { levelId: id }); } }, 'Leave it'),
        h('button', { class: 'btn secondary', type: 'button', onClick: () => { sheet.close(); resume(inProgress.levelId); } }, `Continue Level ${levelNumber(inProgress.levelId)}`))),
    { label: `Leave Level ${inProgress.levelId}?` });
  }
  const continueCard = inProgress
    ? h('div', { class: 'card continue-card' },
      h('p', {}, `You were in the middle of Level ${levelNumber(inProgress.levelId)}.`),
      h('button', { class: 'btn', type: 'button', onClick: () => resume(inProgress.levelId) }, `Continue Level ${levelNumber(inProgress.levelId)}`))
    : null;

  const nav = h('nav', { class: 'map-nav', 'aria-label': 'Academy' },
    h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('shop') }, 'Shop'),
    h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('closet') }, 'Closet'),
    h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('pass') }, 'Pup Pass'),
    h('button', { class: 'btn secondary jar-btn', type: 'button', onClick: () => app.go('jar') }, 'Treat Jar',
      backend.features.jar && jar.canOpen() ? h('span', { class: 'dot', 'aria-label': 'Free open available' }) : null),
    isPublicSite(backend) ? h('button', { class: 'btn gold invite-btn', type: 'button', onClick: () => showInvite(app) }, 'Invite friends') : null,
  );

  // The Star Road: how far to the next star reward.
  const road = nextStarMilestone(state);
  const starRoad = road.target
    ? h('div', { class: 'star-road', role: 'progressbar', 'aria-label': 'Star Road', 'aria-valuemin': '0', 'aria-valuemax': String(road.target), 'aria-valuenow': String(road.stars) },
      h('p', { class: 'small' }, h('strong', {}, `Star Road: ${road.stars} / ${road.target} ★`), ` · next reward: ${rewardText(road.reward)}`),
      h('span', { class: 'star-road-bar', style: `--fill:${Math.round((road.stars / road.target) * 100)}%` }))
    : h('p', { class: 'star-road small' }, h('strong', {}, `Star Road complete: ${road.stars} ★`));
  const signs = h('div', { class: 'signposts', 'aria-label': 'Locations' },
    h('span', { class: 'sign' }, '← Hillsdale'), h('span', { class: 'sign' }, 'Hawthorne →'));

  // Road switcher, and the home pick for players who haven't chosen yet.
  const roads = local
    ? h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Adventures' },
      h('button', { type: 'button', role: 'tab', class: `seg-btn${view === 'main' ? ' on' : ''}`, 'aria-selected': String(view === 'main'), onClick: () => app.go('map', { skipIntro: true }) }, 'Main road'),
      h('button', { type: 'button', role: 'tab', class: `seg-btn${view === 'local' ? ' on' : ''}`, 'aria-selected': String(view === 'local'), onClick: () => app.go('map', { view: 'local', skipIntro: true }) }, local.name))
    : null;
  const homeCard = !state.home && state.dog
    ? h('section', { class: 'card stack home-card' },
      h('p', { class: 'eyebrow' }, 'New: your local adventure'),
      h('h2', {}, 'Which PAWtastic is yours?'),
      h('p', { class: 'small' }, 'Pick your location to unlock its own 16-level adventure and join its team in the leaderboards.'),
      homeChoices(null, async id => { await backend.setHome(id); syncProfile(app).catch(() => null); app.go('map', { view: 'local', skipIntro: true }); }))
    : null;
  const shownAreas = AREAS.filter(a => (view === 'local' ? chapterOf(a.first) === local : !chapterOf(a.first).location));
  const label = levelNumber;

  let currentNode = null;
  const areas = shownAreas.map((area, ai) => {
    const ids = ALL_LEVELS.filter(l => l.area === area.id).map(l => l.id);
    const passed = ids.filter(id => state.progress.levels[id]).length;
    const stars = ids.reduce((s, id) => s + (state.progress.levels[id]?.stars || 0), 0);
    const locked = area.first > unlocked;
    const chapter = chapterOf(area.first);
    const inChapter = AREAS.filter(a => chapterOf(a.first) === chapter);
    const place = `Area ${inChapter.indexOf(area) + 1} of ${inChapter.length}`;
    const banner = h('div', { class: `area-banner card${locked ? ' locked' : ''}` },
      h('p', { class: 'eyebrow' }, chapter.id === 'academy' ? place : chapter.id === 'camp' ? `Summer Camp · ${place}` : `${chapter.name} · ${place}`),
      h('h2', {}, area.name),
      h('p', { class: 'small muted' }, `In real life: ${area.service}`),
      h('p', { class: 'small num' }, locked
        ? (ai === 0 ? `Opens after Orientation (Level ${chapter.opensAfter ?? 8})` : `Unlocks after ${shownAreas[ai - 1].name}`)
        : `${passed}/8 passed · ${stars}/24 stars · Finish to earn the ${costumeName(area.costume)}`),
      backend.features.account && !locked ? bookingLinkEl(app, area.id, state.dog?.name, 'booking-link small') : null,
    );
    const nodes = ids.map((id, i) => {
      const done = state.progress.levels[id];
      const isLocked = id > unlocked;
      const isCurrent = id === unlocked && !done;
      const node = h('button', {
        type: 'button', class: `node${isLocked ? ' locked' : ''}${isCurrent ? ' current' : ''}${done ? ' done' : ''}`,
        disabled: isLocked, 'aria-label': `Level ${label(id)}${isHardLevel(id) ? ', pop quiz' : ''}${done ? `, ${done.stars} stars` : ''}${isLocked ? ', locked' : ''}`,
        onClick: () => openLevel(id),
      }, isLocked ? h('span', { html: lockIcon() }) : h('span', { class: 'node-num' }, String(label(id))));
      const row = h('div', { class: 'node-row' }, h('div', { class: 'node-group', style: `--offset:${OFFSETS[i]}` },
        h('div', { class: 'node-wrap' },
          node,
          done ? h('div', { class: 'node-stars', 'aria-hidden': 'true' }, [1, 2, 3].map(s => h('span', { html: starIcon(s <= done.stars) }))) : null,
          isHardLevel(id) ? h('span', { class: 'quiz-tag' }, 'Pop quiz') : null),
        isCurrent ? (state.dog?.photoUrl
          ? h('span', { class: 'map-dog' }, dogPhoto(state.dog.photoUrl, { size: 52, alt: state.dog.name, look: state.dog }))
          : h('span', { class: 'map-dog', html: dogSVG({ ...state.dog, costume: state.inventory.equipped, skin: state.inventory.skin ?? null, label: state.dog?.name ?? 'Your dog' }) })) : null,
      ));
      if (isCurrent || (id === unlocked)) currentNode = row;
      return row;
    });
    const section = h('section', { class: 'area', 'aria-label': area.name }, banner, h('div', { class: 'path' }, nodes));
    if (chapter.first !== area.first || chapter.id !== 'camp') return section;
    // The start of a new adventure gets its own sign.
    const open = unlocked >= chapter.first;
    return [h('div', { class: `chapter-banner card${open ? '' : ' locked'}`, 'aria-label': chapter.name },
      h('p', { class: 'eyebrow' }, 'New adventure'),
      h('h2', {}, chapter.name),
      h('p', { class: 'small' }, open
        ? '40 new levels with Pinecones, Camp Lanterns and tangled leashes. Five new costumes to earn.'
        : 'For graduates only: pass Level 40 to open camp. 40 new levels, new pieces and five new costumes.')), section];
  }).flat();

  const dogName = state.dog?.name ?? 'Your pup';
  const gradNote = state.progress.levels[LAST_LEVEL]
    ? `${dogName} is a PAWtastic Summer Camp champion!`
    : state.progress.levels[CHAPTERS[0].last] ? `${dogName} graduated from PAWtastic Academy! Summer Camp is open.` : null;
  // One small banner at a time: a friend's offer first; on Graduation Day's own site the way to PAWtastic Games (the one
  // stop); inside the hub, Add to Home Screen (hidden there by the hub), then Save progress to the cloud.
  const nudge = publicSite ? (prizeReminderCard(app) ?? friendOfferCard(app) ?? hubCard() ?? installCard(app) ?? cloudSaveCard(app)) : null;
  const weekly = publicSite && state.dog ? weeklyCard(app) : null;
  app.view.append(...[bar, continueCard, nudge, nav, weekly, homeCard, roads, starRoad, view === 'main' ? signs : null, h('div', { class: 'map' },
    view === 'main' && gradNote ? h('p', { class: 'card grad-note' }, gradNote) : null,
    areas)].filter(Boolean));

  // After a win, the dog hops from the level just passed to the new one.
  const hop = view === 'main' ? app.services.lastWin : null;
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

  const area = shownAreas.find(a => unlocked >= a.first && unlocked <= a.last) ?? (view === 'local' ? null : shownAreas[shownAreas.length - 1]);
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
    .then(() => { if (!gone && area && !state.seenIntros.includes(area.id) && !params.skipIntro) showIntro(app, area); });
  return () => { gone = true; bar.stop(); };
}
