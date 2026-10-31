// The speaker sheet: music, sound effects and celebration effects switches (and, in the real
// app, the account options).

import { h, reducedMotion } from './dom.js';
import { effectsEnabled } from '../audio/settings.js';

function switchRow(label, on, onToggle) {
  const btn = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label },
    h('span', { class: 'knob', 'aria-hidden': 'true' }));
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onToggle(next);
  });
  return h('div', { class: 'switch-row' }, h('span', {}, label), btn);
}

// Signed-in players (the real app) also get their account options here.
function accountSection(app, close) {
  const signOut = async () => {
    close();
    await app.services.api.auth.signOut();
    app.go('signin');
  };
  const go = screen => () => { close(); app.go(screen); };
  return h('div', { class: 'stack account' },
    h('h3', { class: 'eyebrow' }, 'Account'),
    app.services.backend.features.stats ? h('button', { class: 'btn secondary block', type: 'button', onClick: go('stats') }, 'Stats') : null,
    h('button', { class: 'btn secondary block', type: 'button', onClick: go('rules') }, 'Game rules & privacy'),
    h('button', { class: 'btn secondary block', type: 'button', onClick: signOut }, 'Sign out'));
}

export function showSoundSheet(app) {
  const { settings } = app.services;
  const now = settings.get();
  let sheet;
  sheet = app.modal(h('div', { class: 'stack' },
    h('h2', {}, 'Sound and effects'),
    switchRow('Music', now.music, on => settings.set({ music: on })),
    switchRow('Sound effects', now.sfx, on => settings.set({ sfx: on })),
    switchRow('Celebration effects', effectsEnabled(now, reducedMotion()), on => settings.set({ effects: on ? 'on' : 'off' })),
    app.services.backend?.features.account ? accountSection(app, () => sheet.close()) : null,
    h('button', { class: 'btn block', type: 'button', onClick: () => sheet.close() }, 'Done'),
  ), { label: 'Sound and effects' });
}
