// Report card for a finished area: stars, grade and Professor Paws' comment.

import { h } from '../dom.js';
import { dogSVG, logoImg, professorPawsSVG } from '../art.js';
import { dogPhoto } from '../photo.js';
import { bookingLinkEl } from '../booking-links.js';
import { starIcon } from '../icons.js';
import { topBar } from '../topbar.js';
import { shareDog } from '../share-card.js';
import { AREAS, chapterOf } from '../../engine/levels.js';
import { COSTUMES } from '../../economy/catalog.js';

const costumeName = id => COSTUMES.find(c => c.id === id)?.name ?? id;

export function render(app, { areaId = 'orientation' } = {}) {
  const { backend } = app.services;
  const area = AREAS.find(a => a.id === areaId) ?? AREAS[0];
  const card = backend.reportCard(area.id);
  const dog = backend.state().dog;
  const bar = topBar(app, { title: 'Report card', back: () => app.go('map') });
  const kind = area.id === 'graduation' ? 'graduation' : area.id === 'talent' ? 'camp' : 'area';

  const share = h('button', { class: 'btn gold', type: 'button' }, 'Share');
  share.addEventListener('click', async () => {
    share.disabled = true;
    share.textContent = 'Making your card…';
    await shareDog(app, { kind, areaName: area.name, costume: area.costume });
    share.disabled = false;
    share.textContent = 'Share';
  });

  app.view.append(bar, h('section', { class: 'report stack' },
    h('div', { class: 'report-head' },
      logoImg({ size: 48 }),
      h('div', {},
        h('p', { class: 'eyebrow' }, chapterOf(area.first).name),
        h('h1', { class: 'caps' }, `Report Card — ${area.name}`))),
    h('div', { class: 'results-dog', html: dogSVG({ ...dog, costume: area.costume, label: `${card.dogName} wearing the ${costumeName(area.costume)}` }) }),
    h('p', { class: 'report-student' }, dog?.photoUrl ? dogPhoto(dog.photoUrl, { size: 36, alt: card.dogName, look: dog }) : null, `Student: ${card.dogName}`),
    h('div', { class: 'report-grid' },
      h('div', { class: 'card report-cell' },
        h('span', { class: 'muted small' }, 'Stars'),
        h('strong', { class: 'num report-stars' }, h('span', { html: starIcon(true) }), `${card.stars} / ${card.maxStars}`)),
      h('div', { class: 'card report-cell' },
        h('span', { class: 'muted small' }, 'Grade'),
        h('strong', { class: 'report-grade' }, card.grade))),
    h('div', { class: 'card tip' },
      h('span', { class: 'tip-prof', html: professorPawsSVG({ mood: card.stars >= 19 ? 'cheer' : 'happy' }) }),
      h('p', {}, h('strong', {}, 'Professor Paws: '), card.comment)),
    h('div', { class: 'btn-pair' },
      share,
      h('button', { class: 'btn secondary', type: 'button', onClick: () => app.go('map') }, 'Continue')),
    backend.features.account ? bookingLinkEl(app, area.id, card.dogName, 'booking-link card') : null,
  ));
  return () => bar.stop();
}
