// Progression: level results, badges, Paw Points, the Pup Pass, the daily
// streak and report cards. Pure functions over wallet state.
//
// Guardrail (spec §3): a single level win never pays Treats, lives, boosters or moves, and Paw
// Points depend only on playing. The exception, asked for by the owner: milestone rewards for
// finishing an area or an adventure and for star totals (catalog MILESTONES), each granted once.

import { dayKey, monthKey, daysBetween, addDays } from './time.js';
import { PASS, STREAK, WELCOME_BACK, REPORT_GRADES, MILESTONES } from './catalog.js';
import { AREAS, CHAPTERS, areaOf } from '../engine/levels.js';

function ensureMonth(state, nowMs) {
  const month = monthKey(nowMs);
  const p = state.pass;
  if (p.month !== month) {
    p.month = month;
    p.points = 0;
    p.claimedFree = [];
    p.claimedPremium = [];
  }
}

function grant(state, reward, nowMs = Date.now()) {
  if (reward.treats) state.treats.free += reward.treats;
  if (reward.booster) state.inventory.boosters[reward.booster] += 1;
  for (const b of reward.boosters ?? []) state.inventory.boosters[b] += 1;
  if (reward.unlimitedMin) state.lives.unlimitedUntil = Math.max(state.lives.unlimitedUntil || 0, nowMs) + reward.unlimitedMin * 60000;
  if (reward.costume && !state.inventory.costumes.includes(reward.costume)) state.inventory.costumes.push(reward.costume);
}

function addBadge(state, summary, badge) {
  if (state.progress.badges.includes(badge)) return;
  state.progress.badges.push(badge);
  summary.newBadges.push(badge);
}

export function applyLevelResult(state, { levelId, won, stars, score, movesMade }, nowMs) {
  ensureMonth(state, nowMs);
  const summary = { newBadges: [], unlockedCostume: null, areaCompleted: null, pawPoints: 0, starterPackOffer: false, milestones: [] };

  // Paw Points: participation only.
  const p = state.pass;
  const today = dayKey(nowMs);
  if (p.countedDay !== today) { p.countedDay = today; p.countedToday = 0; }
  if (movesMade >= PASS.points.minMoves && p.countedToday < PASS.points.maxLevelsPerDay) {
    const points = p.countedToday === 0 ? PASS.points.first : PASS.points.each;
    p.countedToday += 1;
    p.points += points;
    summary.pawPoints = points;
  }

  if (won) {
    const levels = state.progress.levels;
    const firstWin = !levels[levelId];
    const prev = levels[levelId] || { stars: 0, score: 0 };
    levels[levelId] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score) };
    state.progress.unlocked = Math.max(state.progress.unlocked, levelId + 1);
    if (stars === 3) addBadge(state, summary, 'first-three-stars');
    if (Object.keys(levels).length >= 10) addBadge(state, summary, 'ten-wins');
    const area = areaOf(levelId);
    if (firstWin && levelId === area.last) {
      addBadge(state, summary, `grad-${area.id}`);
      grant(state, { costume: area.costume });
      summary.unlockedCostume = area.costume;
      summary.areaCompleted = area.id;
    }
  }

  summary.milestones = claimMilestones(state, nowMs);

  const sp = state.starterPack;
  if (!sp.bought && !sp.offerShown && (!won || levelId === 5)) {
    sp.offerShown = true;
    summary.starterPackOffer = true;
  }
  return summary;
}

export function totalStars(state) {
  return Object.values(state.progress.levels).reduce((sum, l) => sum + (l?.stars || 0), 0);
}

/** Every milestone this save has reached: areas and adventures finished, and Star Road totals. */
export function earnedMilestones(state) {
  const levels = state.progress.levels;
  const out = [];
  for (const a of AREAS) if (levels[a.last]) out.push({ id: `area-${a.id}`, title: `Finished ${a.name}`, reward: MILESTONES.area });
  for (const ch of CHAPTERS) {
    if (levels[ch.last]) out.push({ id: `adventure-${ch.id}`, title: ch.id === 'academy' ? 'Graduated from PAWtastic Academy' : 'PAWtastic Summer Camp champion', reward: MILESTONES.adventure });
  }
  const stars = totalStars(state);
  for (const [n, reward] of MILESTONES.starRoad) if (stars >= n) out.push({ id: `stars-${n}`, title: `${n} stars on the Star Road`, reward });
  return out;
}

/** Grants the milestones reached but not yet rewarded (also catches up saves from before milestones). */
export function claimMilestones(state, nowMs) {
  const claimed = state.milestones.claimed;
  const fresh = earnedMilestones(state).filter(m => !claimed.includes(m.id));
  for (const m of fresh) { claimed.push(m.id); grant(state, m.reward, nowMs); }
  return fresh;
}

/** The next Star Road reward: { stars, target, reward } (target null once all are earned). */
export function nextStarMilestone(state) {
  const stars = totalStars(state);
  const next = MILESTONES.starRoad.find(([n]) => n > stars);
  return { stars, target: next?.[0] ?? null, reward: next?.[1] ?? null };
}

export function passActive(state, nowMs) {
  const p = state.pass;
  return !!p.active && (p.autoRenew || dayKey(nowMs) <= p.renewsOn);
}

export function startPass(state, nowMs) {
  const today = dayKey(nowMs);
  Object.assign(state.pass, { active: true, autoRenew: true, startedOn: today, renewsOn: addDays(today, 30) });
}

export function cancelPass(state) {
  state.pass.autoRenew = false;
}

export function tierReached(state, nowMs) {
  ensureMonth(state, nowMs);
  return Math.min(PASS.tiers, Math.floor(state.pass.points / PASS.pointsPerTier));
}

export function rewardFor(track, tier) {
  if (track === 'free') return PASS.free[tier] || null;
  if (tier === PASS.tiers) return PASS.premiumTop;
  if (tier >= 1 && tier < PASS.tiers) return PASS.premiumCycle[(tier - 1) % PASS.premiumCycle.length];
  return null;
}

export function claimTier(state, track, tier, nowMs) {
  const reached = tierReached(state, nowMs);
  const reward = rewardFor(track, tier);
  if (!reward) return { ok: false, error: 'no-reward' };
  if (tier > reached) return { ok: false, error: 'locked' };
  const claimed = track === 'free' ? state.pass.claimedFree : state.pass.claimedPremium;
  if (claimed.includes(tier)) return { ok: false, error: 'claimed' };
  if (track === 'premium' && !passActive(state, nowMs)) return { ok: false, error: 'pass-required' };
  claimed.push(tier);
  grant(state, reward);
  return { ok: true, reward };
}

export function applyDailyOpen(state, nowMs) {
  const out = { streak: null, welcomeBack: null, passRenewed: false };
  ensureMonth(state, nowMs);
  const today = dayKey(nowMs);

  const p = state.pass;
  if (p.active && p.renewsOn && today > p.renewsOn) {
    if (p.autoRenew) {
      while (p.renewsOn < today) p.renewsOn = addDays(p.renewsOn, 30);
      out.passRenewed = true;
    } else {
      p.active = false;
    }
  }

  const s = state.streak;
  let day;
  if (s.lastOpenDay === null) {
    day = 1;
  } else {
    const gap = daysBetween(s.lastOpenDay, today);
    if (gap <= 0) return out;
    day = gap === 1 ? (s.day % STREAK.length) + 1 : 1;
    if (gap >= WELCOME_BACK.afterDays) {
      grant(state, WELCOME_BACK);
      out.welcomeBack = WELCOME_BACK;
    }
  }
  const reward = STREAK[day - 1];
  grant(state, reward);
  s.day = day;
  s.lastOpenDay = today;
  out.streak = { day, reward };
  return out;
}

export function reportCard(state, areaId) {
  const area = AREAS.find(a => a.id === areaId);
  let stars = 0;
  for (let id = area.first; id <= area.last; id++) stars += state.progress.levels[id]?.stars || 0;
  const [, grade, comment] = REPORT_GRADES.find(([min]) => stars >= min);
  return {
    areaId, areaName: area.name, dogName: state.dog?.name ?? 'Your pup',
    stars, maxStars: (area.last - area.first + 1) * 3, grade, comment,
  };
}
