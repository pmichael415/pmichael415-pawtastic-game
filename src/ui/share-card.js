// Share cards: a branded 1080×1350 picture of the player's dog.
// Sharing earns nothing (spec §5). In the artifact, saving goes through the
// `downloads` capability; everywhere else the viewer presses and holds the image.

import { h } from './dom.js';
import { dogSVG, LOGO_SRC } from './art.js';
import { shareLink } from './referral.js';
import { isPublicSite } from '../backend/local.js';
import { gameLink } from '../net/embed.js';
import { CHALLENGES, isChallengeId, isWeekKey, TIER_NAMES } from '../engine/challenge.js';
import { LOCATIONS } from '../engine/levels.js';

const CAMP_AREAS = new Set(['Cabin Check-in', 'Lake Day', 'Trail Hike', 'Campfire Night', 'Talent Show']);
const W = 1080, H = 1350;
const BRAND = '#0055D4', NAVY = '#31271F', GOLD = '#F6A823', PAPER = '#FAF8F5';
export const SHARE_FOOTER = 'Daycare · Boarding · Grooming · Hawthorne · Hillsdale';

export function shareCaption(kind, { dogName, areaName } = {}) {
  const dog = dogName || 'Your pup';
  if (kind === 'graduation') return `${dog} just graduated from PAWtastic Academy!`;
  if (kind === 'camp') return `${dog} is a PAWtastic Summer Camp champion!`;
  if (kind === 'area' && areaName && CAMP_AREAS.has(areaName)) return `${dog} aced ${areaName} at PAWtastic Summer Camp!`;
  if (kind === 'area') return `${dog} aced ${areaName} at PAWtastic Academy!`;
  return `${dog} is styling at PAWtastic Academy!`;
}

/** Beat My Pup: the caption for a server-checked Weekly Challenge result (in a season, the season and its chapter). */
/** The place a share card may show: a confirmed rank that belongs to the card's score (not a three-challenge week's total). */
export const sharePlace = ({ rank, threeChallenge }) => (!threeChallenge && Number.isInteger(rank) && rank > 0 ? rank : null);

export function resultCaption({ dogName, challenge, score, tier = null, season = null, rank = null, location = null }) {
  const dog = dogName || 'My pup';
  const name = CHALLENGES[challenge]?.name ?? 'Weekly Challenge';
  const badge = tier ? ` (${TIER_NAMES[tier]} badge)` : '';
  const where = season ? `${season.name} (Chapter ${season.chapter})` : `this week's ${name}`;
  const pts = Number(score).toLocaleString('en-US');
  // A place the server confirmed is worth bragging about (owner, 10 Nov 2026): "#2 at PAWtastic Hawthorne".
  const place = Number.isInteger(rank) && rank > 0 && Object.hasOwn(LOCATIONS, location ?? '') ? `#${rank} at PAWtastic ${LOCATIONS[location]}` : null;
  if (place) return `${dog} is ${place} with ${pts} in ${where}${badge}. Can your pup beat it?`;
  return `${dog} scored ${pts} in ${where} at PAWtastic Academy${badge}. Can your pup beat it?`;
}

/**
 * The link on a Beat My Pup card: opens the same challenge of the same week. It carries no score (scores are never
 * trusted from a link). With the player's friend code (owner, 10 Nov 2026) a friend who joins through it is credited:
 * both get 20 Treats.
 */
export function beatLink({ challenge, week }, deps) {
  const params = new URLSearchParams();
  params.set('beat', isChallengeId(challenge) ? challenge : 'high-score');
  if (isWeekKey(week)) params.set('week', week);
  const code = deps && 'code' in deps ? deps.code : shareLink().code;
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(code ?? '')) params.set('ref', code);
  return gameLink(params.toString());
}

export function shareFilename(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug ? `${slug}-pawtastic-academy.png` : 'pawtastic-academy.png';
}

function loadImage(src, { crossOrigin } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}
const loadSvg = svg => loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function fontsReadyInPage() {
  try {
    await Promise.all([document.fonts.load('700 58px "DM Sans"'), document.fonts.load('500 34px "DM Sans"')]);
  } catch { /* system fallbacks are fine */ }
}

const PAGE = { fontsReady: fontsReadyInPage, createCanvas: () => document.createElement('canvas'), loadImage, loadSvg };

// The real photo when it loads and can be saved; otherwise the cartoon. A photo from another
// site can load but still block saving the picture ("tainted" canvas), so that redraws too.
export async function renderShareCard({ dogSvg, caption, photoUrl = null, stamp = null }, deps = PAGE) {
  if (photoUrl) {
    try {
      return await drawCard({ dogSvg, caption, photoUrl, stamp }, deps);
    } catch { /* fall back to the cartoon */ }
  }
  return drawCard({ dogSvg, caption, photoUrl: null, stamp }, deps);
}

async function drawCard({ dogSvg, caption, photoUrl, stamp }, { fontsReady, createCanvas, loadImage, loadSvg }) {
  await fontsReady();
  const photo = photoUrl ? await loadImage(photoUrl, { crossOrigin: 'anonymous' }) : null;
  const canvas = createCanvas();
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Header: the real logo on logo blue, a reward-amber rule underneath.
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 300, W, 14);
  const logo = await loadImage(LOGO_SRC);
  ctx.drawImage(logo, (W - 260) / 2, 20, 260, 260);
  ctx.textBaseline = 'alphabetic';

  // The dog, large, in a gold-ringed portrait medallion: the photo (cropped square) or the cartoon.
  const cx = W / 2, cy = 660, r = 330;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#E3EEFB';
  ctx.fill();
  ctx.clip();
  if (photo) {
    const side = Math.min(photo.width, photo.height);
    ctx.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.drawImage(await loadSvg(dogSvg), 200, 340, 680, 680);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 12;
  ctx.strokeStyle = GOLD;
  ctx.stroke();

  // A result stamp (Beat My Pup): the checked score in a gold pill under the medallion.
  if (stamp) {
    ctx.textAlign = 'center';
    ctx.font = '700 54px "DM Sans", system-ui, sans-serif';
    const pw = Math.min(980, ctx.measureText(stamp).width + 120);
    const px = (W - pw) / 2, py = 1012, ph = 84;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 42) : ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.fillStyle = NAVY;
    ctx.fillText(stamp, W / 2, py + 60);
  }

  // Caption, centred, up to three lines (two under a stamp).
  ctx.fillStyle = NAVY;
  ctx.textAlign = 'center';
  ctx.font = stamp ? '700 46px "DM Sans", system-ui, sans-serif' : '700 58px "DM Sans", system-ui, sans-serif';
  const lines = wrapLines(ctx, caption, 940).slice(0, 3);
  const step = stamp ? 54 : 68;
  const top = stamp ? 1150 : 1110 - (lines.length - 1) * 34;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * step));

  // Footer band.
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, H - 80, W, 80);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '500 34px "DM Sans", system-ui, sans-serif';
  ctx.fillText(SHARE_FOOTER, W / 2, H - 28);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('could not encode the picture'))), 'image/png');
    } catch (err) {
      reject(err); // SecurityError when a photo tainted the canvas
    }
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let downloadsPromise = null;
function getDownloads() {
  if (!downloadsPromise) {
    downloadsPromise = Promise.resolve()
      .then(() => window.claude?.use?.('downloads') ?? null)
      .catch(() => null);
  }
  return downloadsPromise;
}

// The phone's share sheet, with the picture when the phone can attach files. The link is the
// family's own PAWtastic referral link (the real app only; the demo has none).
async function systemShare(app, blob, caption, dogName, link, code = null, kind = 'card') {
  const text = code ? `${caption} New PAWtastic clients get $10 off their first visit with my code ${code}.` : caption;
  const data = { text, url: link };
  const file = typeof File === 'function' ? new File([blob], shareFilename(dogName), { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) data.files = [file];
  try {
    await navigator.share(data);
    app.services.measure?.track('share', { kind, how: 'share-sheet' });
  } catch (err) {
    if (err?.name !== 'AbortError') app.toast('Sharing isn’t available here. Press and hold the image instead.');
  }
}

/** Copies text to the clipboard: the fallback when the phone has no share sheet. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return !!ok;
  } catch { return false; }
}

export async function shareCard(app, blob, caption, dogName) {
  const src = await blobToDataUrl(blob);
  let sheet;
  // The public site shares the game with the player's friend code (the $10 off invite) when they have one.
  const invite = isPublicSite(app.services.backend) ? shareLink() : null;
  const link = app.services.backend?.referralLink?.() ?? invite?.url ?? null;
  const canShare = !!link && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareBtn = canShare ? h('button', { class: 'btn gold', type: 'button', onClick: () => systemShare(app, blob, caption, dogName, link, invite?.code) }, 'Share') : null;
  const save = h('button', { class: 'btn', type: 'button', hidden: true }, 'Save image');
  sheet = app.modal(h('div', { class: 'stack share' },
    h('p', { class: 'eyebrow' }, 'Share card'),
    h('img', { class: 'share-img', src, alt: caption }),
    h('p', { class: 'muted small' }, 'Press and hold the image to save it.'),
    h('div', { class: 'btn-pair' },
      shareBtn,
      save,
      h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Done')),
  ), { label: 'Share card' });

  const downloads = await getDownloads();
  if (!downloads) return;
  save.hidden = false;
  save.addEventListener('click', async () => {
    try {
      const res = await downloads.save({ filename: shareFilename(dogName), data: blob });
      if (res?.status === 'saved') { app.toast('Picture saved.'); app.services.measure?.track('share', { kind: 'card', how: 'saved' }); }
    } catch (err) {
      if (err?.code === 'declined') return;
      if (err?.code === 'rate_limited') { app.toast('One moment, then try again.'); return; }
      save.hidden = true;
      app.toast('Saving isn’t available here. Press and hold the image instead.');
    }
  });
}

// Builds the card for the player's dog and opens it. `kind` picks the caption.
export async function shareDog(app, { kind, areaName, costume }) {
  app.services.backend.logEvent('share_tap', { kind });
  const dog = app.services.backend.state().dog;
  const dogName = dog?.name || 'Your pup';
  const caption = shareCaption(kind, { dogName, areaName });
  try {
    const blob = await renderShareCard({ dogSvg: dogSVG({ ...dog, costume, label: dogName }), caption, photoUrl: dog?.photoUrl ?? null });
    await shareCard(app, blob, caption, dogName);
  } catch {
    app.toast('Couldn’t make the picture on this device.');
  }
}

/**
 * Beat My Pup: a branded card with the pup's name and a server-checked Weekly Challenge result, and a link that
 * opens the same challenge. `score` must be the number the server returned, never one from this phone or a URL.
 * Native share when the phone has it (with the picture when it can attach files); otherwise copy the link.
 */
export async function shareResult(app, { challenge, week, score, tier = null, rank = null, players = null, season = null, location = null }) {
  const { backend, measure } = app.services;
  backend.logEvent?.('share_tap', { kind: 'beat-my-pup' });
  const dog = backend.state().dog;
  const dogName = dog?.name || 'My pup';
  const def = CHALLENGES[challenge] ?? CHALLENGES['high-score'];
  const caption = resultCaption({ dogName, challenge, score, tier, season, rank, location });
  const link = beatLink({ challenge, week });
  const period = season ? 'chapter' : 'week'; // in a season, each week is a chapter
  const stamp = `${Number(score).toLocaleString('en-US')} pts · ${def.short}${tier ? ` · ${TIER_NAMES[tier]}` : ''}`;
  let blob = null;
  try {
    blob = await renderShareCard({ dogSvg: dogSVG({ ...dog, costume: backend.state().inventory?.equipped ?? null, skin: backend.state().inventory?.skin ?? null, label: dogName }), caption, photoUrl: dog?.photoUrl ?? null, stamp });
  } catch { /* the link still shares without the picture */ }
  const src = blob ? await blobToDataUrl(blob) : null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  let sheet;
  const copy = h('button', { class: canShare ? 'btn secondary' : 'btn gold', type: 'button', onClick: async () => {
    const ok = await copyText(`${caption} ${link}`);
    app.toast(ok ? 'Challenge link copied.' : 'Couldn’t copy. Press and hold the link to copy it.');
    if (ok) measure?.track('share', { kind: 'beat-my-pup', how: 'copied' });
  } }, 'Copy link');
  const shareBtn = canShare && blob ? h('button', { class: 'btn gold', type: 'button', onClick: () => systemShare(app, blob, caption, dogName, link, null, 'beat-my-pup') }, 'Share') : null;
  sheet = app.modal(h('div', { class: 'stack share' },
    h('p', { class: 'eyebrow' }, 'Beat My Pup'),
    src ? h('img', { class: 'share-img', src, alt: caption }) : h('p', { class: 'card' }, caption),
    h('p', { class: 'small muted num' }, rank && players ? `Checked by PAWtastic: #${rank} of ${players}${Object.hasOwn(LOCATIONS, location ?? '') ? ` at ${LOCATIONS[location]}` : ''} this ${period}. ` : 'Checked by PAWtastic. ', `Friends who open the link play the same challenge, this ${period} only.`),
    h('p', { class: 'small link-line num' }, h('a', { href: link, target: '_blank', rel: 'noopener' }, link)),
    h('div', { class: 'btn-pair' },
      shareBtn,
      copy,
      h('button', { class: 'btn secondary', type: 'button', onClick: () => sheet.close() }, 'Done')),
  ), { label: 'Beat My Pup' });
}
