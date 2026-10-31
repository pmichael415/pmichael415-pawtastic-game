import { describe, expect, it } from "vitest";
import { LOCATIONS, bookingUrl } from "./locations";

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
