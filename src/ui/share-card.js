// Share cards: a branded 1080×1350 picture of the player's dog.
// Sharing earns nothing (spec §5). In the artifact, saving goes through the
// `downloads` capability; everywhere else the viewer presses and holds the image.

import { h } from './dom.js';
import { dogSVG, LOGO_SRC } from './art.js';
import { shareLink } from './referral.js';
import { isPublicSite } from '../backend/local.js';

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
export async function renderShareCard({ dogSvg, caption, photoUrl = null }, deps = PAGE) {
  if (photoUrl) {
    try {
      return await drawCard({ dogSvg, caption, photoUrl }, deps);
    } catch { /* fall back to the cartoon */ }
  }
  return drawCard({ dogSvg, caption, photoUrl: null }, deps);
}

async function drawCard({ dogSvg, caption, photoUrl }, { fontsReady, createCanvas, loadImage, loadSvg }) {
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

  // Caption, centred, up to three lines.
  ctx.fillStyle = NAVY;
  ctx.textAlign = 'center';
  ctx.font = '700 58px "DM Sans", system-ui, sans-serif';
  const lines = wrapLines(ctx, caption, 940).slice(0, 3);
  const top = 1110 - (lines.length - 1) * 34;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * 68));

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
async function systemShare(app, blob, caption, dogName, link, code = null) {
  const text = code ? `${caption} New PAWtastic clients get $10 off their first visit with my code ${code}.` : caption;
  const data = { text, url: link };
  const file = typeof File === 'function' ? new File([blob], shareFilename(dogName), { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) data.files = [file];
  try {
    await navigator.share(data);
    app.services.measure?.track('share', { kind: 'card', how: 'share-sheet' });
  } catch (err) {
    if (err?.name !== 'AbortError') app.toast('Sharing isn’t available here. Press and hold the image instead.');
  }
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
