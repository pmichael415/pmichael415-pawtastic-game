import { describe, expect, it } from "vitest";
import { CUSTOMER_APP_URL, LOCATIONS, bookingUrl, directionsUrl } from "./locations";

describe("visiting PAWtastic", () => {
  it("directions search for the location's own address", () => {
    const [hawthorne, hillsdale] = LOCATIONS;
    const h = new URL(directionsUrl(hawthorne!));
    expect(h.origin + h.pathname).toBe("https://www.google.com/maps/search/");
    expect(h.searchParams.get("api")).toBe("1");
    expect(h.searchParams.get("query")).toBe("PAWtastic Academy, 100 Braen Ave, Hawthorne");
    expect(new URL(directionsUrl(hillsdale!)).searchParams.get("query")).toBe(
      "PAWtastic Academy, 550 Piermont Ave, Hillsdale",
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
