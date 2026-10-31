// The top bar: Academy wordmark, Treats balance (with dollar value) and lives.

import { h } from './dom.js';
import { logoImg } from './art.js';
import { heartIcon, treatIcon, speakerIcon } from './icons.js';
import { showSoundSheet } from './sound-sheet.js';
import { formatUsd } from '../economy/catalog.js';
import { showsDollars } from './prices.js';

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = n => String(n).padStart(2, '0');
  if (total >= 3600) return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export function livesText(lives) {
  if (lives.unlimited) return lives.unlimitedMs ? `∞ · ${formatCountdown(lives.unlimitedMs)}` : '∞';
  if (lives.count >= lives.max) return String(lives.count);
  return `${lives.count} · ${formatCountdown(lives.nextInMs)}`;
}

// Chips stack a small second line (dollar value, refill timer) so the header stays one line on phones.
const stacked = (main, sub) => h('span', { class: 'chip-stack' }, h('span', { class: 'chip-main' }, main), sub ? h('span', { class: 'chip-sub' }, sub) : null);
const livesStack = l => stacked(l.unlimited ? '∞' : String(l.count),
  l.unlimited ? (l.unlimitedMs ? formatCountdown(l.unlimitedMs) : '') : l.count < l.max ? formatCountdown(l.nextInMs) : '');

export function livesLabel(lives) {
  if (lives.unlimited) return lives.unlimitedMs ? `Unlimited lives for ${formatCountdown(lives.unlimitedMs)}` : 'Unlimited lives with the Pup Pass';
  if (lives.count >= lives.max) return `${lives.count} lives`;
  return `${lives.count} lives, next free life in ${formatCountdown(lives.nextInMs)}`;
}

// shopLink: false shows the balance as plain text (the Treat Jar screen must not lead to a purchase).
export function topBar(app, { title = 'Graduation Day', back = null, shopLink = true } = {}) {
  const { backend } = app.services;
  const bal = backend.balance();
  const dollars = showsDollars(app);
  const treatsLabel = dollars ? `${bal.total} Treats, about ${formatUsd(bal.usd)}` : `${bal.total} Treats`;
  const treatsSub = dollars ? `≈ ${formatUsd(bal.usd)}` : 'Treats';
  const lives = backend.lives();
  const livesChip = h('span', { class: 'chip num', role: 'img', 'aria-label': livesLabel(lives) }, h('span', { html: heartIcon() }), livesStack(lives));
  const { settings } = app.services;
  const muted = v => !v.music && !v.sfx;
  const speaker = settings
    ? h('button', { class: 'btn secondary icon-btn speaker', type: 'button', 'aria-label': 'Sound and effects', onClick: () => showSoundSheet(app), html: speakerIcon(muted(settings.get())) })
    : null;
  const offSettings = settings?.onChange(v => { speaker.innerHTML = speakerIcon(muted(v)); });
  const bar = h('header', { class: 'topbar' },
    back
      ? h('button', { class: 'btn secondary icon-btn', type: 'button', onClick: back, 'aria-label': 'Back' }, h('span', { 'aria-hidden': 'true' }, '←'))
      : h('div', { class: 'wordmark' }, logoImg({ size: 36 }), h('div', { class: 'sub caps' }, title)),
    h('span', { class: 'spacer' }),
    speaker,
    shopLink
      ? h('button', { class: 'chip num', type: 'button', onClick: () => app.go('shop'), 'aria-label': `${treatsLabel}. Open the shop.` },
        h('span', { html: treatIcon() }), stacked(String(bal.total), treatsSub))
      : h('span', { class: 'chip num', role: 'img', 'aria-label': treatsLabel },
        h('span', { html: treatIcon() }), stacked(String(bal.total), treatsSub)),
    livesChip,
  );
  const timer = setInterval(() => {
    const l = backend.lives();
    livesChip.lastChild.replaceWith(livesStack(l));
    livesChip.setAttribute('aria-label', livesLabel(l));
  }, 1000);
  bar.stop = () => { clearInterval(timer); offSettings?.(); };
  return bar;
}
