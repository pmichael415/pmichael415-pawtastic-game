import { describe, expect, it } from "vitest";
import { inQuietHours, nyWeekStart } from "./schedule";

const at = (iso: string) => Date.parse(iso);

describe("New York weeks (Monday to Sunday) across daylight-saving changes", () => {
  it("Sunday 1 Nov 2026 (the day clocks fall back) belongs to the week of Monday 26 Oct", () => {
    expect(nyWeekStart(at("2026-11-01T12:00:00Z"))).toBe("2026-10-26");
  });
  it("Sunday 23:30 EST is still last week; Monday 00:30 EST is the new week", () => {
    expect(nyWeekStart(at("2026-11-02T04:30:00Z"))).toBe("2026-10-26");
    expect(nyWeekStart(at("2026-11-02T05:30:00Z"))).toBe("2026-11-02");
  });
  it("Monday 00:30 EDT just after clocks spring forward starts the new week", () => {
    expect(nyWeekStart(at("2026-03-09T04:30:00Z"))).toBe("2026-03-09");
    expect(nyWeekStart(at("2026-03-09T03:30:00Z"))).toBe("2026-03-02"); // Sun 23:30 EDT
  });
  it("weeks cross month and year ends", () => {
    expect(nyWeekStart(at("2027-01-01T17:00:00Z"))).toBe("2026-12-28");
  });
});

describe("quiet hours: nothing between 8 pm and 9 am New York time", () => {
  it("in winter (EST)", () => {
    expect(inQuietHours(at("2026-11-02T15:00:00Z"))).toBe(false); // 10:00
    expect(inQuietHours(at("2026-11-02T13:59:00Z"))).toBe(true); // 08:59
    expect(inQuietHours(at("2026-11-02T14:00:00Z"))).toBe(false); // 09:00
    expect(inQuietHours(at("2026-11-03T00:59:00Z"))).toBe(false); // 19:59
    expect(inQuietHours(at("2026-11-03T01:00:00Z"))).toBe(true); // 20:00
  });
  it("in summer (EDT)", () => {
    expect(inQuietHours(at("2026-07-06T13:00:00Z"))).toBe(false); // 09:00
    expect(inQuietHours(at("2026-07-06T12:59:00Z"))).toBe(true); // 08:59
    expect(inQuietHours(at("2026-07-07T00:00:00Z"))).toBe(true); // 20:00
  });
});
