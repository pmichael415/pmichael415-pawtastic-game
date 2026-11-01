export type Location = { id: "hawthorne" | "hillsdale"; name: string; address: string; form: string };

export const LOCATIONS: Location[] = [
  { id: "hawthorne", name: "Hawthorne", address: "100 Braen Ave", form: "https://pawtasticacademy.com/booking-page-ht" },
  { id: "hillsdale", name: "Hillsdale", address: "550 Piermont Ave", form: "https://pawtasticacademy.com/booking-page" },
];

export function bookingUrl(l: Location) {
  const u = new URL(l.form);
  u.searchParams.set("utm_source", "pawtastic_tycoon");
  u.searchParams.set("utm_medium", "game");
  u.searchParams.set("utm_campaign", "free_evaluation");
  u.searchParams.set("utm_content", l.id);
  return u.toString();
}

/** Directions in Google Maps (opens the Maps app on phones that have it). */
export function directionsUrl(l: Location) {
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  u.searchParams.set("query", `PAWtastic Academy, ${l.address}, ${l.name}`);
  return u.toString();
}

/** PAWtastic Academy's customer app. Only ever linked to: the games share no accounts, bookings or rewards with it. */
export const CUSTOMER_APP_URL = new URL("https://app.pawtasticacademy.com").toString();
