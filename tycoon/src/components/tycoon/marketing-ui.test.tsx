// The Marketing screen (customer-growth requirement §2, §3, §5) and the desk's choices for a family it can't take (§4).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    success: () => {},
    error: () => {},
    warning: () => {},
    info: () => {},
  }),
}));
import { MarketingSheet } from "./MarketingSheet";
import { FrontDesk } from "./FrontDesk";
import { KEY, tycoonStore, useTycoon } from "@/tycoon/store";
import { caps } from "@/tycoon/connect";
import { createArrival } from "@/tycoon/run";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { ok, richState } from "@/tycoon/testkit";
import { TROPHIES } from "@/tycoon/trophies";
import { ownerFor } from "@/tycoon/visit";
import type { Booking, CampaignRun, Facility, TRegular, TycoonState } from "@/tycoon/types";

const load = (s: TycoonState) => localStorage.setItem(KEY, JSON.stringify(s));
const now = () => tycoonStore.getState()!;
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
function Sheet() {
  const { state, act } = useTycoon();
  return state ? <MarketingSheet open state={state} act={act} onClose={() => {}} /> : null;
}
function Desk() {
  const { state, act } = useTycoon();
  return state ? (
    <FrontDesk f={fac(state)} act={act} onSelect={() => {}} onCheckout={() => {}} />
  ) : null;
}
const fam = (over: Partial<TRegular> = {}): TRegular => ({
  name: "Biscuit",
  breed: 1,
  size: "small",
  temper: "gentle",
  visits: 1,
  friendship: 10,
  lastDay: 3,
  sat: 90,
  firstDay: 3,
  source: { kind: "walk-in" },
  ...over,
});
function daycare(over: Partial<Facility> = {}): TycoonState {
  // trophies already earned, so an action's coins are only its own
  const s = { ...richState(), lastSeen: Date.now(), trophies: TROPHIES.map((t) => t.id) };
  return withFac(s, {
    ...fac(s),
    open: true,
    day: 3,
    introDay: 0,
    clockMin: 9 * 60,
    dogs: [],
    guestBook: [],
    bookings: [],
    campaignRuns: [],
    footfall: [],
    ...over,
  });
}

describe("the Marketing screen", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });

  it("Customers: each family's status and story, and a free thank-you that may bring a booking — never coins", () => {
    const s = daycare({
      guestBook: [fam(), fam({ name: "Daisy", breed: 4, lastDay: 1, visits: 2 })],
    });
    load(s);
    const { unmount } = render(<Sheet />);
    const before = now().coins; // (loading may pay what the save is owed — compare from here)
    const panel = screen.getByRole("tabpanel", { name: "Customers" });
    expect(within(panel).getByText(/1 new/)).toBeTruthy();
    expect(within(panel).getByText(/1 returning/)).toBeTruthy();
    expect(within(panel).getByText(/First visit on day 3 — walked in\./)).toBeTruthy();
    expect(within(panel).getByText(/2 free calls left today/)).toBeTruthy();
    const owner = ownerFor({ name: "Biscuit", breed: 1 });
    fireEvent.click(within(panel).getByRole("button", { name: `Say thank you to ${owner}` }));
    expect(now().coins).toBe(before);
    expect(fac(now()).outreach!.stats.calls).toBe(1);
    expect(
      within(screen.getByRole("tabpanel", { name: "Customers" })).getByText(
        /1 free call left today/,
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("tabpanel", { name: "Customers" })).queryByRole("button", {
        name: `Say thank you to ${owner}`,
      }),
    ).toBeNull();
    unmount();
  });

  it("Campaigns: cost, who, days, an estimate that isn't guaranteed and readiness — launching spends coins once", () => {
    const s = daycare();
    load(s);
    const { unmount } = render(<Sheet />);
    const before = now().coins;
    tab("Campaigns");
    const card = screen.getByRole("article", { name: "Local flyers" });
    expect(within(card).getByText("150 coins")).toBeTruthy();
    expect(within(card).getByText("Families nearby who've never visited")).toBeTruthy();
    expect(within(card).getByText(/3 active days/)).toBeTruthy();
    expect(
      within(card).getByText(/About 3–9 families may respond — not guaranteed\./),
    ).toBeTruthy();
    expect(within(card).getByText(/Rooms/)).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Open house" })).getByText("Unlocks at level 8."),
    ).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Launch Local flyers · 150 coins" }));
    expect(now().coins).toBe(before - 150);
    expect(screen.getByText(/Local flyers is running — day 1 of 3/)).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Online ads" }))
        .getByRole("button", { name: /Launch Online ads/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    unmount();
  });

  it("Campaigns: one the daycare can't serve says why before you pay", () => {
    const s = daycare();
    load(withFac(s, { ...fac(s), items: fac(s).items.filter((i) => i.kind !== "boarding_bed") }));
    const { unmount } = render(<Sheet />);
    tab("Campaigns");
    const card = screen.getByRole("article", { name: "Boarding awareness" });
    expect(within(card).getByText(/You need a boarding bed first/)).toBeTruthy();
    expect(
      within(card)
        .getByRole("button", { name: /Launch Boarding awareness/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    unmount();
  });

  it("Results: what a campaign brought, its contribution after cost, and overhead shown apart", () => {
    const run: CampaignRun = {
      uid: "c1",
      id: "flyers",
      name: "Local flyers",
      startDay: 1,
      untilDay: 3,
      cost: 150,
      reached: 400,
      responses: 6,
      booked: 4,
      declined: { "no Large & Active playroom": 2 },
      arrivals: 4,
      visits: 3,
      revenue: 120,
      costs: 6,
      drawn: [1, 2],
    };
    load(
      daycare({
        campaignRuns: [run],
        outreach: {
          day: 3,
          used: 0,
          stats: { calls: 2, booked: 1, arrivals: 1, visits: 1, revenue: 38, costs: 2 },
        },
      }),
    );
    const { unmount } = render(<Sheet />);
    tab("Results");
    const card = screen.getByRole("article", { name: "Local flyers results" });
    const row = (label: string) => within(card).getByText(label).closest("div")!.textContent;
    expect(row("Coins spent")).toMatch(/150/);
    expect(row("Families reached")).toMatch(/400/);
    expect(row("Responses")).toMatch(/6 \(4 booked, 2 declined\)/);
    expect(row("Arrivals")).toMatch(/4/);
    expect(row("Completed paid visits")).toMatch(/3/);
    expect(row("Attributed service revenue")).toMatch(/120/);
    expect(row("Direct service costs")).toMatch(/6/);
    expect(row("Contribution after campaign cost")).toMatch(/−36/);
    expect(within(card).getByText(/Overhead on those days/)).toBeTruthy();
    expect(within(card).getByText(/not proof/)).toBeTruthy();
    expect(card.textContent).not.toMatch(/profit/i);
    expect(screen.getByRole("article", { name: "Outreach results" }).textContent).toMatch(
      /2 calls/,
    );
    unmount();
  });

  it("Results: new vs returning, regulars, inactive, unmet demand and why families couldn't come", () => {
    load(
      daycare({
        day: 9,
        guestBook: [
          fam({ lastDay: 9 }),
          fam({ name: "Rex", breed: 2, visits: 4, friendship: 40, lastDay: 8 }),
          fam({ name: "Old", breed: 3, visits: 2, lastDay: 2 }),
        ],
        footfall: [
          {
            day: 8,
            newWalkIns: 3,
            returning: 2,
            booked: 1,
            turned: { "no Large & Active playroom": 2, "lobby full": 1, "no bath room": 1 },
            campaign: null,
          },
        ],
      }),
    );
    const { unmount } = render(<Sheet />);
    tab("Results");
    const panel = screen.getByRole("tabpanel", { name: "Results" });
    expect(panel.textContent).toMatch(/3 first-time walk-ins/);
    expect(panel.textContent).toMatch(/2 came back on their own/);
    expect(panel.textContent).toMatch(/1 regular/);
    expect(panel.textContent).toMatch(/1 inactive/);
    expect(within(panel).getByText(/no Large & Active playroom/)).toBeTruthy();
    expect(panel.textContent).toMatch(/Daycare 3/);
    expect(panel.textContent).toMatch(/Bath 1/);
    unmount();
  });
});

describe("the desk", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("a booked family shows how they came; with no spot for them, 'Another day' books the next active day — free", () => {
    const s0 = daycare();
    const room = caps(fac(s0)).playrooms[0]!;
    const full = Array.from({ length: room.spots }, (_, i) => ({
      ...fac(ok(createArrival(s0, () => 0.3))).dogs[0]!,
      id: `p${i}`,
      name: `Pal${i}`,
      size: "small" as const,
      temper: "gentle" as const,
      checkedIn: true,
      place: { kind: "room" as const, room: room.room.uid },
    }));
    const b: Booking = {
      uid: "b1",
      name: "Biscuit",
      breed: 1,
      size: "small",
      temper: "gentle",
      day: 3,
      min: 9 * 60,
      boarding: false,
      source: { kind: "campaign", run: "c1", name: "Local flyers" },
    };
    const s = ok(createArrival(withFac(s0, { ...fac(s0), dogs: full }), () => 0.3, false, b));
    load(s);
    const { unmount } = render(<Desk />);
    const before = now().coins;
    expect(screen.getByText(/booked · Local flyers/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Another day for Biscuit" }));
    expect(now().coins).toBe(before);
    expect(fac(now()).bookings).toEqual([
      expect.objectContaining({ name: "Biscuit", day: 4, again: true }),
    ]);
    unmount();
  });
});

it("the old Finances screen no longer has its own marketing tab (one place for marketing)", async () => {
  const { FinancesSheet } = await import("./FinancesSheet");
  localStorage.clear();
  tycoonStore._reset(null);
  load(newTycoon(Date.now()));
  function F() {
    const { state, act } = useTycoon();
    return state ? <FinancesSheet open state={state} act={act} onClose={() => {}} /> : null;
  }
  const { unmount } = render(<F />);
  expect(screen.queryByRole("tab", { name: "Marketing" })).toBeNull();
  unmount();
});
