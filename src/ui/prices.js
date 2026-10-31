// How Treat prices read. Dollar equivalents show only where Treats can be bought; in the
// free-play release Treats are free and have no cash value, so they never get a dollar figure.

import { formatTreatPrice } from '../economy/catalog.js';

export const showsDollars = app => !!app.services.backend?.features?.purchases;

export function treatPrice(app, treats) {
  return showsDollars(app) ? formatTreatPrice(treats) : `${treats} Treats`;
}
