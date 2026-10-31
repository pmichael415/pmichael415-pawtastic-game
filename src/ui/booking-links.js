// Each area's link to the real PAWtastic service it's named after. Links never earn anything
// in the game and never appear on a loss screen. The customer app's booking pages can't be
// pre-filled from a link yet, so these open the right page.

import { h } from './dom.js';

const APP_URL = 'https://app.pawtasticacademy.com';

export const BOOKING_LINKS = {
  orientation: { text: dog => `Plan ${dog}'s next visit`, href: `${APP_URL}/portal` },
  recess: { text: dog => `Book ${dog} a real daycare day`, href: `${APP_URL}/portal/shop` },
  spa: { text: dog => `Book ${dog} a real Ivy-League Wash`, href: `${APP_URL}/portal/shop` },
  dorms: { text: dog => `Book ${dog} a real Dorm night`, href: `${APP_URL}/book` },
  graduation: { text: dog => `Plan ${dog}'s next visit`, href: `${APP_URL}/portal` },
};

export function bookingLink(areaId, dogName) {
  const link = BOOKING_LINKS[areaId] ?? BOOKING_LINKS.orientation;
  return { text: link.text(dogName || 'your pup'), href: link.href };
}

// The link element; a tap is counted (booking_tap) for the staff stats.
export function bookingLinkEl(app, areaId, dogName, className = 'booking-link') {
  const { text, href } = bookingLink(areaId, dogName);
  return h('a', {
    class: className, href, target: '_blank', rel: 'noopener',
    onClick: () => { app.services.backend.logEvent('booking_tap', { area: areaId }); },
  }, text);
}
