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
