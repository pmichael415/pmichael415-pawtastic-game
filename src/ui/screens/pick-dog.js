// "Who's going to school?" — for families with more than one dog on file. Reached at start-up
// (no dog chosen yet) or from the Closet (switching dogs keeps all progress).

import { h } from '../dom.js';
import { logoImg, COATS } from '../art.js';
import { dogPhoto, shortName } from '../photo.js';
import { lookForBreed } from '../../net/breed.js';
import { withBusy, showFailure } from '../failure.js';

export function render(app, { from = 'boot' } = {}) {
  const { backend } = app.services;
  const current = backend.state().dog;

  async function choose(dog, button) {
    const look = lookForBreed(dog.breed);
    const res = await withBusy(button, () => backend.setDog({ dogId: dog.id, name: dog.name, breed: look, coat: current?.coat ?? COATS[0].hex }));
    if (!res.ok) { showFailure(app, res.error, () => choose(dog, button)); return; }
    if (from === 'closet') { app.toast(`${dog.name} is going to school!`); app.go('closet'); return; }
    const opened = await backend.open();
    app.services.openResult = opened.ok ? opened : null;
    app.go('loading');
  }

  app.view.append(h('section', { class: 'setup pick-dog' },
    h('div', { class: 'row' }, logoImg({ size: 48 }), h('div', {},
      h('p', { class: 'eyebrow' }, 'PAWtastic Academy'), h('h1', { class: 'caps' }, "Who's going to school?"))),
    h('p', { class: 'muted' }, 'Pick the student. You can switch any time in the Closet.'),
    h('div', { class: 'dog-choices' }, backend.dogs().map(dog => h('button', {
      type: 'button', class: `choice dog-choice${current?.dogId === dog.id ? ' on' : ''}`,
      'aria-pressed': String(current?.dogId === dog.id),
      onClick: e => choose(dog, e.currentTarget),
    }, dogPhoto(dog.photoUrl, { size: 72, alt: dog.name, look: { breed: lookForBreed(dog.breed), coat: COATS[0].hex } }), h('span', { class: 'dog-choice-name' }, shortName(dog.name))))),
    from === 'closet' ? h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('closet') }, 'Back') : null,
  ));
}
