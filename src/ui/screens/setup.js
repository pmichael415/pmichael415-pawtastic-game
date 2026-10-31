// Enroll your pup: name, breed look and coat colour, with a live preview.

import { h } from '../dom.js';
import { dogSVG, BREEDS, BREED_NAMES, COATS, logoImg } from '../art.js';
import { withBusy, showFailure } from '../failure.js';

export function render(app) {
  const { backend } = app.services;
  const existing = backend.state().dog;
  let breed = existing?.breed ?? 'lab';
  let coat = existing?.coat ?? COATS[0].hex;

  const preview = h('div', { class: 'preview' });
  const nameInput = h('input', { type: 'text', id: 'dog-name', maxlength: '20', autocomplete: 'off', value: existing?.name ?? '' });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const startBtn = h('button', { class: 'btn block', type: 'submit' }, 'Start school');

  const breedButtons = BREEDS.map(b => h('button', {
    type: 'button', class: 'choice', role: 'radio', 'aria-checked': String(b === breed),
    onClick: () => { breed = b; refresh(); },
  }, h('span', { html: dogSVG({ breed: b, coat, label: BREED_NAMES[b] }) }), BREED_NAMES[b]));

  const coatButtons = COATS.map(c => h('button', {
    type: 'button', class: 'swatch', role: 'radio', 'aria-label': c.name, 'aria-checked': String(c.hex === coat),
    style: `background:${c.hex}`, onClick: () => { coat = c.hex; refresh(); },
  }));

  function refresh() {
    const name = nameInput.value.trim();
    preview.innerHTML = dogSVG({ breed, coat, label: name || 'Your dog' });
    breedButtons.forEach((btn, i) => {
      btn.setAttribute('aria-checked', String(BREEDS[i] === breed));
      btn.firstChild.innerHTML = dogSVG({ breed: BREEDS[i], coat, label: BREED_NAMES[BREEDS[i]] });
    });
    coatButtons.forEach((btn, i) => btn.setAttribute('aria-checked', String(COATS[i].hex === coat)));
    startBtn.disabled = name.length === 0;
  }

  const form = h('form', { class: 'setup', onSubmit: async e => {
    e.preventDefault();
    const res = await withBusy(startBtn, () => backend.setDog({ name: nameInput.value, breed, coat }));
    if (res.error === 'invalid-name') { error.hidden = false; error.textContent = "Give your pup a name (up to 20 letters)."; return; }
    if (!res.ok) { showFailure(app, res.error); return; }
    app.go('map');
  } },
    h('div', { class: 'row' }, logoImg({ size: 48 }), h('div', {},
      h('p', { class: 'eyebrow' }, 'PAWtastic Academy'), h('h1', { class: 'caps' }, 'Enroll your pup'))),
    preview,
    h('div', { class: 'field' }, h('label', { for: 'dog-name' }, "Your dog's name"), nameInput, error),
    h('div', { class: 'field', role: 'radiogroup', 'aria-label': 'Breed look' }, h('span', { class: 'eyebrow' }, 'Breed look'), h('div', { class: 'choices' }, breedButtons)),
    h('div', { class: 'field', role: 'radiogroup', 'aria-label': 'Coat colour' }, h('span', { class: 'eyebrow' }, 'Coat colour'), h('div', { class: 'swatches' }, coatButtons)),
    startBtn,
  );
  nameInput.addEventListener('input', refresh);
  app.view.append(form);
  refresh();
}
