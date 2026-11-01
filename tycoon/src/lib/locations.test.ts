import { describe, expect, it } from "vitest";
import { CUSTOMER_APP_URL, LOCATIONS, bookingUrl, directionsUrl } from "./locations";

describe("visiting PAWtastic", () => {
  it("directions search for the location's own address", () => {
    const [hawthorne, hillsdale] = LOCATIONS;
    const h = new URL(directionsUrl(hawthorne!));
    expect(h.origin + h.pathname).toBe("https://www.google.com/maps/search/");
    expect(h.searchParams.get("api")).toBe("1");
    expect(h.searchParams.get("query")).toBe("PAWtastic Academy, 100 Braen Ave, Hawthorne, NJ");
    expect(new URL(directionsUrl(hillsdale!)).searchParams.get("query")).toBe(
      "PAWtastic Academy, 550 Piermont Ave, Hillsdale, NJ",
    );
  });

  it("booking still opens the verified evaluation forms", () => {
    expect(bookingUrl(LOCATIONS[0]!)).toMatch(/^https:\/\/pawtasticacademy\.com\/booking-page-ht\?/);
    expect(bookingUrl(LOCATIONS[1]!)).toMatch(/^https:\/\/pawtasticacademy\.com\/booking-page\?/);
  });

  it("the PAWtastic app link is the plain customer-app address", () => {
    expect(CUSTOMER_APP_URL).toBe("https://app.pawtasticacademy.com/");
  });
});

// The original booking-link checks, kept.
describe("booking links", () => {
  it("Hawthorne opens booking-page-ht with game UTM", () => {
    const u = new URL(bookingUrl(LOCATIONS[0]!));
    expect(u.origin + u.pathname).toBe("https://pawtasticacademy.com/booking-page-ht");
    expect(u.searchParams.get("utm_medium")).toBe("game");
  });
  it("Hillsdale opens booking-page", () => {
    expect(bookingUrl(LOCATIONS[1]!).startsWith("https://pawtasticacademy.com/booking-page?")).toBe(true);
  });
});
