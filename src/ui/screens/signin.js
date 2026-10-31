// Email sign-in for the game site. People who tap Play in the PAWtastic app arrive signed in.

import { h } from '../dom.js';
import { logoImg } from '../art.js';
import { withBusy } from '../failure.js';

const APP_URL = 'https://app.pawtasticacademy.com';
const NOTES = {
  expired: 'That link expired. Tap Play in the PAWtastic app again',
  offline: 'Connect to the internet to keep playing',
};

export function render(app, { reason } = {}) {
  const email = h('input', { type: 'email', id: 'signin-email', autocomplete: 'email', required: true });
  const password = h('input', { type: 'password', id: 'signin-password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Sign in');

  const form = h('form', { class: 'setup signin', onSubmit: async e => {
    e.preventDefault();
    error.hidden = true;
    const res = await withBusy(submit, () => app.services.api.auth.signInWithPassword(email.value.trim(), password.value));
    if (!res.ok) {
      error.hidden = false;
      error.textContent = "That email and password don't match. Try again, or reset your password.";
      return;
    }
    await app.services.reboot();
  } },
    h('div', { class: 'row' }, logoImg({ size: 48 }), h('div', {},
      h('p', { class: 'eyebrow' }, 'PAWtastic Academy'), h('h1', { class: 'caps' }, 'Graduation Day'))),
    NOTES[reason] ? h('p', { class: 'card note', role: 'status' }, NOTES[reason]) : null,
    h('p', {}, 'Sign in with your PAWtastic account.'),
    h('div', { class: 'field' }, h('label', { for: 'signin-email' }, 'Email'), email),
    h('div', { class: 'field' }, h('label', { for: 'signin-password' }, 'Password'), password, error),
    submit,
    h('a', { class: 'small', href: `${APP_URL}/reset-password` }, 'Forgot password?'),
    h('p', { class: 'muted small' }, 'Signed up with Google? Open the PAWtastic app and tap Play.'),
  );
  app.view.append(form);
}
