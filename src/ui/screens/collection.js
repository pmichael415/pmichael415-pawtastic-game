// Badges & trophies: a compact collection of what the Weekly Challenge has earned the player. Badges are
// bronze/silver/gold milestones per challenge per week; trophies are one-off feats. Everything here is
// digital and free — nothing can be bought, and nothing here is a prize (prizes come from the leaderboard).

import { h } from '../dom.js';
import { topBar } from '../topbar.js';
import { TROPHIES } from '../../economy/wallet.js';
import { CHALLENGES, CHALLENGE_IDS, weekKey, TIER_NAMES, TIER_ORDER } from '../../engine/challenge.js';
import { weekRules, tierMark, challengeName, formatTeaser, weekSeason } from '../compete.js';
import { seasonFor, chapterOf } from '../../engine/challenge.js';

const num = n => Number(n || 0).toLocaleString('en-US');
const weekLabel = key => {
  const season = seasonFor(key); // a season's weeks are its chapters
  if (season) return `${season.name} · Chapter ${chapterOf(key)}`;
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y) return key;
  return `Week of ${new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
};

/** Badges grouped by week, newest first; each week's badges in challenge order. */
export function groupBadges(badges) {
  const byWeek = new Map();
  for (const b of badges) {
    if (!byWeek.has(b.week)) byWeek.set(b.week, []);
    byWeek.get(b.week).push(b);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([week, list]) => ({ week, badges: list.slice().sort((a, b) => CHALLENGE_IDS.indexOf(a.challenge) - CHALLENGE_IDS.indexOf(b.challenge)) }));
}

/** The next badge to aim for in a challenge, given this week's best. */
export function nextTarget(challenge, best) {
  const tiers = CHALLENGES[challenge].tiers;
  const names = ['bronze', 'silver', 'gold'];
  const i = tiers.findIndex(t => t > best);
  return i < 0 ? null : { tier: names[i], at: tiers[i], need: tiers[i] - best };
}

export function render(app) {
  const { backend } = app.services;
  const state = backend.state();
  const bar = topBar(app, { title: 'Badges & trophies', back: () => app.go('map') });
  const week = weekKey(Date.now());
  const rules = weekRules(week);
  const season = weekSeason(week);
  const collection = state.collection ?? { badges: [], trophies: [], runs: 0 };
  const results = backend.weeklyResults?.(week) ?? {};
  const goldCount = collection.badges.filter(b => b.tier === 'gold').length;

  const summary = h('section', { class: 'card stack collection-summary' },
    h('p', { class: 'eyebrow' }, 'Your collection'),
    h('div', { class: 'collection-stats' },
      h('div', {}, h('strong', { class: 'num' }, String(collection.badges.length)), h('span', { class: 'small muted' }, collection.badges.length === 1 ? 'badge' : 'badges')),
      h('div', {}, h('strong', { class: 'num' }, `${collection.trophies.length}/${TROPHIES.length}`), h('span', { class: 'small muted' }, 'trophies')),
      h('div', {}, h('strong', { class: 'num' }, String(collection.runs)), h('span', { class: 'small muted' }, collection.runs === 1 ? 'run' : 'runs'))),
    goldCount ? h('p', { class: 'small muted' }, `${goldCount} gold ${goldCount === 1 ? 'badge' : 'badges'} so far.`) : h('p', { class: 'small muted' }, 'Badges are earned by score in each Weekly Challenge: bronze at 15,000, silver at 25,000, gold at 38,000.'));

  // This week: each challenge in play, the best so far, the badge held and the next target.
  const thisWeek = h('section', { class: 'card stack', 'aria-label': season ? 'This chapter' : 'This week' },
    h('h2', {}, season ? `This chapter (${season.chapter} of ${season.chapters})` : 'This week'),
    ...rules.challenges.map(id => {
      const best = results[id]?.best ?? (id === 'high-score' && state.weekly.week === week ? state.weekly.best : 0);
      const badge = collection.badges.find(b => b.week === week && b.challenge === id);
      const next = nextTarget(id, best);
      return h('div', { class: 'collection-row' },
        h('span', { class: 'collection-mark', 'aria-hidden': 'true' }, badge ? tierMark(badge.tier) : '○'),
        h('div', { class: 'collection-text' },
          h('strong', {}, CHALLENGES[id].name),
          h('span', { class: 'small muted num' }, best ? `Best ${num(best)}` : 'Not played yet', badge ? ` · ${TIER_NAMES[badge.tier]} badge` : '', next ? ` · ${num(next.need)} to ${TIER_NAMES[next.tier]}` : best ? ' · gold, the top!' : '')),
        h('button', { class: 'btn small-btn', type: 'button', onClick: () => app.go('challenge', { challenge: id }) }, best ? 'Again' : 'Play'));
    }),
    formatTeaser(rules) ? h('p', { class: 'small muted' }, formatTeaser(rules)) : null);

  const groups = groupBadges(collection.badges);
  const badges = h('section', { class: 'card stack', 'aria-label': 'Badges' },
    h('h2', {}, 'Badges'),
    groups.length
      ? groups.map(g => h('div', { class: 'badge-week' },
        h('p', { class: 'small muted' }, weekLabel(g.week)),
        h('div', { class: 'badge-row' }, g.badges.map(b => h('span', { class: `badge-chip ${b.tier}`, title: `${TIER_NAMES[b.tier]} · ${challengeName(b.challenge)} · ${num(b.score)}` },
          h('span', { 'aria-hidden': 'true' }, tierMark(b.tier)),
          h('span', { class: 'small' }, `${CHALLENGES[b.challenge]?.short ?? b.challenge} ${num(b.score)}`))))))
      : h('p', { class: 'small muted' }, 'No badges yet. Finish a Weekly Challenge run with 15,000 points or more for your first bronze.'));

  const trophies = h('section', { class: 'card stack', 'aria-label': 'Trophies' },
    h('h2', {}, 'Trophies'),
    h('ul', { class: 'plain-list trophy-list' }, TROPHIES.map(t => {
      const got = collection.trophies.includes(t.id);
      return h('li', { class: `trophy${got ? ' earned' : ' locked'}` },
        h('span', { class: 'trophy-mark', 'aria-hidden': 'true' }, got ? '🏆' : '·'),
        h('span', { class: 'trophy-text' }, h('strong', {}, t.name), h('span', { class: 'small muted' }, ` — ${t.how}`)),
        h('span', { class: 'small tier-state' }, got ? 'Earned' : 'Locked'));
    })));

  app.view.append(bar, h('section', { class: 'collection stack' }, h('h1', {}, 'Badges & trophies'), summary, thisWeek, badges, trophies,
    h('p', { class: 'small muted center' }, `Badges and trophies are yours to keep and can’t be bought. Real prizes come from the ${season ? 'season' : 'weekly'} leaderboard, where boosters never count.`)));
  return () => bar.stop();
}

export const highestTier = badges => badges.reduce((top, b) => (TIER_ORDER[b.tier] > (TIER_ORDER[top] ?? 0) ? b.tier : top), null);
