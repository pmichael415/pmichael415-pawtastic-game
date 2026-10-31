// Staff-only weekly numbers: who plays, who comes back, shares and bookings that followed a
// booking-link tap. Staff accounts and test families are left out on the server.

import { h } from '../dom.js';
import { topBar } from '../topbar.js';
import { failureText } from '../failure.js';

const COLUMNS = [
  ['Players', 'players'], ['Returning', 'returning_players'], ['New', 'new_players'], ['Levels won', 'levels_won'],
  ['Shares', 'share_taps'], ['Booking taps', 'booking_taps'], ['Booked within 7 days', 'booking_follow_through'], ['New families', 'new_families'],
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekLabel = key => { const [, m, d] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };

export function render(app) {
  const bar = topBar(app, { title: 'Stats', back: () => app.go('map') });
  const body = h('section', { class: 'stats stack', 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Loading…'));
  app.view.append(bar, body);
  let gone = false;

  app.services.backend.stats().then(res => {
    if (gone) return;
    if (!res.ok) {
      body.replaceChildren(h('p', {}, res.error === 'not-staff' ? 'Only PAWtastic staff can see this.' : failureText(res.error)));
      return;
    }
    body.replaceChildren(
      h('h1', {}, 'Graduation Day stats'),
      h('p', { class: 'muted small' }, 'Weeks start on Monday (Eastern time). Staff and test families are not counted.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'num' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Week of'), COLUMNS.map(([label]) => h('th', { scope: 'col' }, label)))),
        h('tbody', {}, res.weeks.map(w => h('tr', {},
          h('th', { scope: 'row' }, weekLabel(w.week_start)), COLUMNS.map(([, key]) => h('td', {}, String(w[key])))))))),
    );
  });
  return () => { gone = true; bar.stop(); };
}
