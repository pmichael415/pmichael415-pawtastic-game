// Daily rewards shown on the first map visit of the day:
// the welcome-back gift first (after a long break), then the 7-day streak.
// The rewards were already granted by backend.onAppOpen; these sheets only show them.

import { h } from './dom.js';
import { professorPawsSVG } from './art.js';
import { pawStampSVG } from './icons.js';
import { STREAK, COSTUMES } from '../economy/catalog.js';

const BOOSTER_NAMES = { shuffle: 'Shuffle', bomb: 'Bone Bomb', blaster: 'Bubble Blaster' };

export function rewardText(reward) {
  const parts = [];
  if (reward.treats) parts.push(`${reward.treats} Treats`);
  if (reward.booster) parts.push(`1 ${BOOSTER_NAMES[reward.booster]}`);
  if (reward.costume) parts.push(COSTUMES.find(c => c.id === reward.costume)?.name ?? reward.costume);
  return parts.join(' + ');
}

function sheet(app, label, ...children) {
  return new Promise(resolve => {
    let s;
    s = app.modal(h('div', { class: 'stack daily' }, ...children,
      h('button', { class: 'btn block', type: 'button', onClick: () => s.close() }, 'Collect')),
    { label, onClose: resolve });
  });
}

export async function showDailyRewards(app, openResult) {
  if (!openResult) return;
  const dogName = app.services.backend.state().dog?.name || 'pup';
  if (openResult.welcomeBack) {
    await sheet(app, 'Welcome back',
      h('span', { class: 'intro-prof', html: professorPawsSVG() }),
      h('h2', {}, `Welcome back, ${dogName}!`),
      h('p', {}, `We missed you at the Academy. Here's ${rewardText(openResult.welcomeBack)} to get you going.`));
  }
  if (openResult.streak) {
    const { day, reward } = openResult.streak;
    app.services.audio?.sfx('stamp');
    await sheet(app, 'Daily reward',
      h('p', { class: 'eyebrow' }, 'Daily attendance'),
      h('h2', {}, `Day ${day} of ${STREAK.length}`),
      h('ol', { class: 'streak', 'aria-label': 'This week' }, STREAK.map((r, i) => h('li', {
        class: i + 1 < day ? 'done' : i + 1 === day ? 'today' : '',
        'aria-current': i + 1 === day ? 'step' : null,
      }, h('span', { class: 'streak-day' }, `Day ${i + 1}`), h('span', { class: 'streak-reward' }, rewardText(r)),
        i + 1 === day ? h('span', { class: 'stamp', html: pawStampSVG() }) : null))),
      h('p', {}, `Today: ${rewardText(reward)}. Come back tomorrow for Day ${day % STREAK.length + 1}.`));
  }
}
