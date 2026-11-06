// Leaderboards: this week's Weekly Challenge (the prizes) and all-time (stars, then best scores),
// for everyone or one location, with Hawthorne vs Hillsdale team totals. Players show as their
// dog's name and location only. During a season (Season 1: Top Dog) the Season board comes first: season
// scores (each chapter's best added up), the prizes at the season's end, and the team bar (the average of
// each location's top 10); the week's board is then the chapter's.

import { h, fill } from '../dom.js';
import { topBar } from '../topbar.js';
import { clientOf, signInThenReload } from '../payments.js';
import { LOCATIONS } from '../../engine/levels.js';
import { CHALLENGES, CHALLENGE_IDS } from '../../engine/challenge.js';
import { prizeLine, prizeForRank, endsInText, homeName, pickHome, prizeCard, syncProfile, sendPendingRun, loadWeekPrizes, weekRules, formatTeaser, weekSeason, competitionLine, playWeek } from '../compete.js';
import { seasonHeadline, seasonCountdown, seasonPhase, teamBar, TEAM_BAR_NOTE, SEASON_TEXT } from '../season.js';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const num = n => Number(n || 0).toLocaleString('en-US');

/** The team bar: Hawthorne vs Hillsdale, each side's average of its top 10 season scores. */
function teamBarCard(teams) {
  const { sides, leader } = teamBar(teams);
  return h('div', { class: 'card teams team-bar', 'aria-label': 'Team bar: Hawthorne vs Hillsdale' },
    h('p', { class: 'eyebrow' }, 'Team bar · Hawthorne vs Hillsdale'),
    h('div', { class: 'team-bar-track', role: 'img', 'aria-label': sides.map(s => `${s.name} ${num(s.average)}`).join(', ') },
      sides.map(s => h('span', { class: `team-bar-fill team-${s.id}${leader === s.id ? ' leading' : ''}`, style: `width: ${s.share}%` }))),
    h('div', { class: 'team-row' }, sides.map(s => h('div', { class: `team${leader === s.id ? ' leading' : ''}` },
      h('strong', {}, s.name), h('span', { class: 'num' }, num(s.average)),
      h('span', { class: 'small muted' }, `${s.players} ${s.players === 1 ? 'player' : 'players'}`)))),
    h('p', { class: 'small muted' }, TEAM_BAR_NOTE));
}

export function render(app, { board: wanted, location = 'all' } = {}) {
  const { backend } = app.services;
  const pay = clientOf(app);
  const bar = topBar(app, { title: 'Leaderboard', back: () => app.go('map') });
  const go = (b, l) => app.go('leaderboard', { board: b, location: l });
  const week = playWeek();
  const season = weekSeason(week);
  let alive = true;
  // In a season the Season board comes first; outside one there is no season tab (and the screen is as before).
  const board = season ? (['season', 'weekly', 'alltime'].includes(wanted) ? wanted : 'season') : (wanted === 'alltime' ? 'alltime' : 'weekly');
  const tabList = season ? [['season', 'Season'], ['weekly', 'This chapter'], ['alltime', 'All-time']] : [['weekly', 'This week'], ['alltime', 'All-time']];
  const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Leaderboard' },
    tabList.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: `seg-btn${board === id ? ' on' : ''}`, 'aria-selected': String(board === id), onClick: () => go(id, location),
    }, label)));
  const chips = h('div', { class: 'seg small-seg', role: 'tablist', 'aria-label': 'Location' },
    [['all', 'Everyone'], ...Object.entries(LOCATIONS)].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: `seg-btn${location === id ? ' on' : ''}`, 'aria-selected': String(location === id), onClick: () => go(board, id),
    }, label)));
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading the leaderboard…'));
  const formatLine = h('p', { class: 'small muted' });
  const playRow = h('div', { class: 'btn-pair' });
  const showFormat = () => {
    const rules = weekRules(week);
    if (rules.version === 2) {
      formatLine.textContent = 'Three challenges this week: High score, Combo and Cleanup. Your best in each is added up; the total is what ranks. No boosters, and every try is free.';
      fill(playRow, ...CHALLENGE_IDS.map((id, i) => h('button', { class: `btn ${i === 0 ? 'gold' : 'secondary'} small-btn`, type: 'button', onClick: () => app.go('challenge', { challenge: id }) }, CHALLENGES[id].short)));
    } else {
      formatLine.textContent = formatTeaser(rules);
      formatLine.hidden = !formatLine.textContent;
      fill(playRow, h('button', { class: 'btn gold', type: 'button', onClick: () => app.go('challenge') }, 'Play the challenge'));
    }
  };
  showFormat();
  // The season's header and countdown (from the server's end time once it answers).
  const seasonHead = h('p', { class: 'eyebrow season-head' });
  const seasonCount = h('p', { class: 'small num season-countdown' });
  const seasonPrizes = h('p', { class: 'small' });
  const paintSeason = () => {
    const s = weekSeason(week);
    if (!s) return;
    seasonHead.textContent = board === 'weekly' ? `${s.name} · Chapter ${s.chapter} of ${s.chapters} · ${endsInText(week)}` : seasonHeadline(s);
    seasonCount.textContent = seasonCountdown(s);
    seasonCount.hidden = seasonPhase(s) !== 'running';
    seasonPrizes.textContent = competitionLine(week);
    playRow.hidden = seasonPhase(s) !== 'running';
  };
  const intro = season && board === 'season'
    ? h('div', { class: 'card stack weekly-card season-card' }, seasonHead, seasonCount, seasonPrizes, h('p', { class: 'small muted' }, SEASON_TEXT.how), playRow)
    : season && board === 'weekly'
      ? h('div', { class: 'card stack weekly-card season-card' }, seasonHead, h('p', { class: 'small' }, SEASON_TEXT.chapterBoard), playRow)
      : board === 'weekly'
        ? h('div', { class: 'card stack weekly-card' },
          h('p', { class: 'eyebrow' }, `Weekly Challenge · ${endsInText(week)}`),
          h('p', { class: 'small' }, prizeLine()),
          formatLine,
          playRow)
        : h('p', { class: 'small muted' }, 'All-time: most stars, then the highest best scores added up. Just for bragging rights.');
  paintSeason();
  app.view.append(bar, h('section', { class: 'leaderboard stack' }, h('h1', {}, 'Leaderboard'), tabs, chips, intro, body));

  (async () => {
    if (!pay?.accounts) { fill(body, h('p', { class: 'card' }, 'The leaderboard needs the internet. Open the game at play.pawtasticacademy.com.')); return; }
    if (pay.signedIn) { await syncProfile(app).catch(() => null); await sendPendingRun(app).catch(() => null); }
    const [res, prizes] = await Promise.all([pay.leaderboard({ board, location }), pay.signedIn ? pay.prizes() : Promise.resolve(null), loadWeekPrizes(app).catch(() => null)]);
    // The server's week differs from the guess this screen was drawn with (a wrong phone clock): draw it again.
    if (playWeek() !== week) { if (alive) app.go('leaderboard', { board: wanted, location }); return; }
    showFormat();
    paintSeason();
    if (!res.ok) { fill(body, h('p', { class: 'card' }, "Couldn't load the leaderboard. Try again in a moment.")); return; }
    const state = backend.state();
    // During a season the chapter board has no team battle and no prize places: those are the Season board's.
    const ranked = board === 'season' || (board === 'weekly' && !season);
    const scoreBoard = board !== 'alltime';
    const teams = board === 'season' ? teamBarCard(res.teams) : season && board === 'weekly' ? null : res.teams && h('div', { class: 'card teams' },
      h('p', { class: 'eyebrow' }, board === 'weekly' ? 'Team battle this week' : 'Team battle, all-time'),
      h('div', { class: 'team-row' }, Object.entries(LOCATIONS).map(([id, name]) => {
        const leader = Object.entries(res.teams).sort((a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0))[0]?.[0];
        return h('div', { class: `team${leader === id && (res.teams[id]?.total ?? 0) > 0 ? ' leading' : ''}` },
          h('strong', {}, name), h('span', { class: 'num' }, num(res.teams[id]?.total)), h('span', { class: 'small muted' }, `${res.teams[id]?.players ?? 0} ${(res.teams[id]?.players ?? 0) === 1 ? 'player' : 'players'}`));
      })));
    const unit = scoreBoard ? 'pts' : '★';
    const rows = (res.entries ?? []).map(e => h('li', { class: `lb-row${e.me ? ' me' : ''}` },
      h('span', { class: 'lb-rank num' }, MEDALS[e.rank] && location !== 'all' && ranked ? MEDALS[e.rank] : `#${e.rank}`),
      h('span', { class: 'lb-name' }, h('strong', {}, e.dogName), h('span', { class: 'small muted' }, ` · ${LOCATIONS[e.location] ?? ''}`), e.me ? h('span', { class: 'you-tag' }, 'You') : null),
      h('span', { class: 'lb-score num' }, scoreBoard ? `${num(e.score)} ${unit}` : `${num(e.stars)} ${unit}`)));
    const bests = board === 'weekly' && res.me?.bests && typeof res.me.bests === 'object' ? res.me.bests : null;
    // A season's places name its prizes only once the server confirmed the lineup (never the weekly prizes).
    const seasonPrizeList = season ? weekSeason(week)?.prizes ?? null : undefined;
    const me = res.me
      ? h('p', { class: 'card small num me-line' }, h('strong', {}, `You: #${res.me.rank}`), location === 'all' ? '' : ` at ${LOCATIONS[location]}`,
        ` · ${scoreBoard ? `${num(res.me.score)} pts` : `${num(res.me.stars)} ★`}`,
        ranked && location !== 'all' && res.me.rank <= 3 ? ` · in the prizes: ${board === 'season' ? prizeForRank(res.me.rank, seasonPrizeList) : prizeForRank(res.me.rank)}` : '',
        bests ? h('span', { class: 'small muted' }, ` (${CHALLENGE_IDS.map(id => `${CHALLENGES[id].short} ${num(bests[id] ?? 0)}`).join(' · ')})`) : '')
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
      rows.length ? h('ol', { class: 'lb-list', 'aria-label': `${tabList.find(t => t[0] === board)?.[1] ?? 'Leaderboard'}${location === 'all' ? '' : `, ${LOCATIONS[location]}`}` }, rows)
        : h('p', { class: 'card muted' }, board === 'season' ? SEASON_TEXT.noScores : board === 'weekly' ? `No scores yet this ${season ? 'chapter' : 'week'}. Be the first!` : 'No players yet. Be the first!'),
      state.home ? h('p', { class: 'small muted' }, `Your team: ${homeName(state)}. Players show as their dog's name and location only.`) : null);
  })();
  return () => { alive = false; bar.stop(); };
}
