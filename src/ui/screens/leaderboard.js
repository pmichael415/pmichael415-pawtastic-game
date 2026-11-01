// Leaderboards: this week's Weekly Challenge (the prizes) and all-time (stars, then best scores),
// for everyone or one location, with Hawthorne vs Hillsdale team totals. Players show as their
// dog's name and location only.

import { h, fill } from '../dom.js';
import { topBar } from '../topbar.js';
import { clientOf, signInThenReload } from '../payments.js';
import { LOCATIONS } from '../../engine/levels.js';
import { weekKey } from '../../engine/challenge.js';
import { prizeLine, prizeForRank, endsInText, homeName, pickHome, prizeCard, syncProfile, sendPendingRun } from '../compete.js';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const num = n => Number(n || 0).toLocaleString('en-US');

export function render(app, { board = 'weekly', location = 'all' } = {}) {
  const { backend } = app.services;
  const pay = clientOf(app);
  const bar = topBar(app, { title: 'Leaderboard', back: () => app.go('map') });
  const go = (b, l) => app.go('leaderboard', { board: b, location: l });
  const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Leaderboard' },
    [['weekly', 'This week'], ['alltime', 'All-time']].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: `seg-btn${board === id ? ' on' : ''}`, 'aria-selected': String(board === id), onClick: () => go(id, location),
    }, label)));
  const chips = h('div', { class: 'seg small-seg', role: 'tablist', 'aria-label': 'Location' },
    [['all', 'Everyone'], ...Object.entries(LOCATIONS)].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: `seg-btn${location === id ? ' on' : ''}`, 'aria-selected': String(location === id), onClick: () => go(board, id),
    }, label)));
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading the leaderboard…'));
  const week = weekKey(Date.now());
  const intro = board === 'weekly'
    ? h('div', { class: 'card stack weekly-card' },
      h('p', { class: 'eyebrow' }, `Weekly Challenge · ${endsInText(week)}`),
      h('p', { class: 'small' }, prizeLine()),
      h('button', { class: 'btn gold', type: 'button', onClick: () => app.go('challenge') }, 'Play the challenge'))
    : h('p', { class: 'small muted' }, 'All-time: most stars, then the highest best scores added up. Just for bragging rights.');
  app.view.append(bar, h('section', { class: 'leaderboard stack' }, h('h1', {}, 'Leaderboard'), tabs, chips, intro, body));

  (async () => {
    if (!pay?.accounts) { fill(body, h('p', { class: 'card' }, 'The leaderboard needs the internet. Open the game at play.pawtasticacademy.com.')); return; }
    if (pay.signedIn) { await syncProfile(app).catch(() => null); await sendPendingRun(app).catch(() => null); }
    const [res, prizes] = await Promise.all([pay.leaderboard({ board, location }), pay.signedIn ? pay.prizes() : Promise.resolve(null)]);
    if (!res.ok) { fill(body, h('p', { class: 'card' }, "Couldn't load the leaderboard. Try again in a moment.")); return; }
    const state = backend.state();
    const teams = res.teams && h('div', { class: 'card teams' },
      h('p', { class: 'eyebrow' }, board === 'weekly' ? 'Team battle this week' : 'Team battle, all-time'),
      h('div', { class: 'team-row' }, Object.entries(LOCATIONS).map(([id, name]) => {
        const leader = Object.entries(res.teams).sort((a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0))[0]?.[0];
        return h('div', { class: `team${leader === id && (res.teams[id]?.total ?? 0) > 0 ? ' leading' : ''}` },
          h('strong', {}, name), h('span', { class: 'num' }, num(res.teams[id]?.total)), h('span', { class: 'small muted' }, `${res.teams[id]?.players ?? 0} ${(res.teams[id]?.players ?? 0) === 1 ? 'player' : 'players'}`));
      })));
    const unit = board === 'weekly' ? 'pts' : '★';
    const rows = (res.entries ?? []).map(e => h('li', { class: `lb-row${e.me ? ' me' : ''}` },
      h('span', { class: 'lb-rank num' }, MEDALS[e.rank] && location !== 'all' && board === 'weekly' ? MEDALS[e.rank] : `#${e.rank}`),
      h('span', { class: 'lb-name' }, h('strong', {}, e.dogName), h('span', { class: 'small muted' }, ` · ${LOCATIONS[e.location] ?? ''}`), e.me ? h('span', { class: 'you-tag' }, 'You') : null),
      h('span', { class: 'lb-score num' }, board === 'weekly' ? `${num(e.score)} ${unit}` : `${num(e.stars)} ${unit}`)));
    const me = res.me
      ? h('p', { class: 'card small num me-line' }, h('strong', {}, `You: #${res.me.rank}`), location === 'all' ? '' : ` at ${LOCATIONS[location]}`,
        ` · ${board === 'weekly' ? `${num(res.me.score)} pts` : `${num(res.me.stars)} ★`}`,
        board === 'weekly' && location !== 'all' && res.me.rank <= 3 ? ` · in the prizes: ${prizeForRank(res.me.rank)}` : '')
      : null;
    const join = !pay.signedIn
      ? h('div', { class: 'card stack' }, h('p', {}, 'Sign in to put your pup on the leaderboard and play for prizes.'),
        h('button', { class: 'btn', type: 'button', onClick: () => signInThenReload(app, { reason: 'Sign in with your email to join the leaderboard. Your progress is saved to the cloud too.' }) }, 'Join the leaderboard'))
      : !state.home
        ? h('div', { class: 'card stack' }, h('p', {}, 'Pick your PAWtastic to join its team.'),
          h('button', { class: 'btn', type: 'button', onClick: async () => { if (await pickHome(app)) { await syncProfile(app).catch(() => null); go(board, location); } } }, 'Pick my PAWtastic'))
        : null;
    const mine = (prizes?.ok && Array.isArray(prizes.prizes) ? prizes.prizes : []).filter(p => p.status === 'won');
    fill(body,
      mine.length ? h('div', { class: 'stack' }, h('h2', {}, 'Your prizes'), ...mine.map(prizeCard)) : null,
      teams, join, me,
      rows.length ? h('ol', { class: 'lb-list', 'aria-label': `${board === 'weekly' ? 'This week' : 'All-time'}${location === 'all' ? '' : `, ${LOCATIONS[location]}`}` }, rows)
        : h('p', { class: 'card muted' }, board === 'weekly' ? 'No scores yet this week. Be the first!' : 'No players yet. Be the first!'),
      state.home ? h('p', { class: 'small muted' }, `Your team: ${homeName(state)}. Players show as their dog's name and location only.`) : null);
  })();
  return () => bar.stop();
}
