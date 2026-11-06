// The staff page's season panel (Season 1: Top Dog): what the server says about the season's close, in plain words,
// with its details (staff only; players never see why a close is blocked), and the two actions: "Send pending
// emails" ({ action: 'send-emails' }) and "Close season now" ({ action: 'close-season' }, only once the season end +
// 5 minutes has passed by the server's clock). The server's `season` object is the one in the Season 1 fixes contract:
// { id, name, status, reason, details, lineupConfirmed, endsAt, closedAt, prizeWeek, winners, emails }.

import { h } from '../ui/dom.js';

export const SEASON_GRACE_MS = 5 * 60000; // runs are accepted until the end + 5 minutes; the close runs after that
const ny = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/ /g, ' ');
const n = v => Number(v || 0).toLocaleString('en-US');
const shortName = s => String(s.name ?? 'the season').split(':')[0];

/** The season's status in plain words. */
export function seasonStatusText(s) {
  if (s.status === 'running') return `Running: it ends ${ny(s.endsAt)} (New York time).`;
  if (s.status === 'awaiting-close') return 'Ended: waiting for the season close (it can run from 5 minutes after the end).';
  if (s.status === 'blocked') return 'Ended, but the season close is blocked.';
  if (s.status === 'closed') return `Closed on ${s.closedAt ? ny(s.closedAt) : 'an earlier day'} (New York time): ${n(s.winners)} ${Number(s.winners) === 1 ? 'winner' : 'winners'}.`;
  return `Status: ${s.status ?? 'unknown'}.`;
}

/** Why the season can't close (or a warning that it won't), whenever the server gives a reason, whatever the status. */
export function seasonReasonText(s) {
  if (!s.reason) return null;
  if (s.reason === 'prize-week-occupied') {
    const d = s.details ?? {};
    const weeks = (Array.isArray(d.prize_weeks) && d.prize_weeks.length ? d.prize_weeks : Array.isArray(d.weeks) ? d.weeks : []).join(', ') || 'unknown';
    return `Warning: the old game already gave prizes under a ${shortName(s)} week (${n(d.prizes?.total)} prizes, ${n(d.redeemed ?? d.prizes?.redeemed)} redeemed, weeks ${weeks}). The season will not close until the owner follows docs/season-1-recovery.md.`;
  }
  if (s.reason === 'lineup-not-confirmed') return `The season's prize lineup (week of ${s.prizeWeek}) is not approved in full, so the season can't close. Approve all three prizes for that week, then close the season.`;
  return `The season close is blocked (${s.reason}).`;
}

const SUMMARY = { sent: 'sent', pending: 'waiting', retrying: 'retrying', suppressed: 'suppressed (will not be sent)', none: 'not yet' };
/** The prize emails and the owner's summary email. */
export function seasonEmailsText(s) {
  const p = s.emails?.prizes ?? {};
  const summary = SUMMARY[s.emails?.summary] ?? String(s.emails?.summary ?? 'unknown');
  if (!Number(p.total) && (s.emails?.summary ?? 'none') === 'none') return 'Prize emails: none yet (they go out after the season close). Owner summary: not yet.';
  return `Prize emails: ${n(p.sent)} sent, ${n(p.pending)} waiting, ${n(p.retrying)} retrying, ${n(p.suppressed)} suppressed (will not be sent) of ${n(p.total)}. Owner summary: ${summary}.`;
}

/** "Close season now" is offered once the season end + 5 minutes has passed by the server's clock, until it is closed. */
export const canCloseSeason = (s, now) => s.status !== 'closed' && now >= Date.parse(s.endsAt) + SEASON_GRACE_MS;

function detailLines(s) {
  const d = s.details;
  if (!d || typeof d !== 'object') return [];
  if (s.reason === 'prize-week-occupied') {
    const p = d.prizes ?? {};
    return [
      `${n(p.total)} prizes: ${n(p.won)} not used yet, ${n(p.redeemed)} redeemed, ${n(p.void)} voided, ${n(p.emailed)} emailed.`,
      `Season weeks with old prizes: ${(d.prize_weeks ?? []).join(', ') || 'none'} · already closed by the old game: ${(d.closed_weeks ?? []).join(', ') || 'none'}.`,
    ];
  }
  return [`Details: ${JSON.stringify(d)}`];
}

/**
 * The panel. `now`: the server's time; `act(body)`: posts a staff action and resolves the answer ({ ok, season });
 * `onDone(season)`: after an action (e.g. reload the page); `confirmFn`: asks before closing.
 */
export function seasonPanel(s, { now, act, onDone = null, confirmFn = q => globalThis.confirm?.(q) ?? true } = {}) {
  const note = h('p', { class: 'note', role: 'status' });
  const reason = seasonReasonText(s);
  const closable = canCloseSeason(s, now);
  const run = (body, button) => async () => {
    if (body.action === 'close-season' && !confirmFn(`Close ${s.name} now? The top 3 at each location by season score win the season's prizes.`)) return;
    button.disabled = true; note.textContent = body.action === 'close-season' ? 'Closing the season…' : 'Sending…';
    const r = await act(body);
    button.disabled = false;
    if (!r?.ok) { note.textContent = "That didn't work. Please try again."; return; }
    note.textContent = '';
    onDone?.(r.season ?? null);
  };
  const send = h('button', { class: 'btn', type: 'button' }, 'Send pending emails');
  const close = h('button', { class: 'btn', type: 'button', disabled: !closable }, 'Close season now');
  send.addEventListener('click', run({ action: 'send-emails' }, send));
  close.addEventListener('click', run({ action: 'close-season' }, close));
  return h('section', { class: 'card stack season-panel', 'aria-label': `${s.name}: season close` },
    h('h2', {}, `${s.name}: season close`),
    h('p', { class: 'season-status' }, seasonStatusText(s)),
    reason ? h('p', { class: 'card warning season-reason', role: 'alert' }, reason) : null,
    ...detailLines(s).map(t => h('p', { class: 'muted season-details' }, t)),
    h('ul', { class: 'list' },
      h('li', { class: 'row' }, `Prize lineup (week of ${s.prizeWeek}): ${s.lineupConfirmed ? 'confirmed' : 'not confirmed'}`),
      h('li', { class: 'row' }, `Winners: ${n(s.winners)}`),
      h('li', { class: 'row' }, seasonEmailsText(s))),
    h('div', { class: 'row-side' }, send, close),
    !closable && s.status !== 'closed' ? h('p', { class: 'muted' }, `"Close season now" is available from ${ny(Date.parse(s.endsAt) + SEASON_GRACE_MS)} (New York time).`) : null,
    note);
}
