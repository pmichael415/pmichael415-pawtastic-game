import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
import { FinancesSheet } from "./FinancesSheet";
import { DayReport } from "./DayReport";
import { MoneyBanner } from "./MoneyBanner";
import { SignCard } from "./SignCard";
import { KEY, tycoonStore, useTycoon } from "@/tycoon/store";
import { START_COINS } from "@/tycoon/catalog";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { guidedBuild } from "@/tycoon/testkit";
import { CUSTOMER_APP_URL, LOCATIONS, bookingUrl, directionsUrl } from "@/lib/locations";
import type { TReport, TycoonState } from "@/tycoon/types";

type Ev = { name: string; props: Record<string, unknown> };
const events = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []);

function Harness({ show }: { show: "finances" | "report" | "banner" }) {
  const { state, act, set } = useTycoon();
  if (!state) return null;
  if (show === "finances") return <FinancesSheet open state={state} act={act} onClose={() => {}} />;
  if (show === "report") return <DayReport state={state} set={set} />;
  return <MoneyBanner state={state} />;
}
const load = (s: TycoonState) => localStorage.setItem(KEY, JSON.stringify(s));
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const now = () => tycoonStore.getState()!;

describe("finances", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });

  it("summary: today's money by category and a 14-day profit chart", () => {
    load(guidedBuild(newTycoon(Date.now())));
    const { unmount } = render(<Harness show="finances" />);
    const summary = screen.getByRole("tabpanel", { name: "Summary" });
    // profit is what running the daycare made; building is shown apart as what you invested
    expect(within(summary).getByText("Invested in building")).toBeTruthy();
    expect(within(summary).getByText("Operating costs")).toBeTruthy();
    expect(within(summary).getByText("Operating profit by closing")).toBeTruthy(); // (renamed for audit gap F: today's is a projection)
    expect(screen.getByRole("img", { name: /Profit for the last/ })).toBeTruthy();
    unmount();
  });

  it("prices: moving the daycare slider to 80 says fewer dogs will come", () => {
    load(newTycoon(Date.now()));
    const { unmount } = render(<Harness show="finances" />);
    tab("Prices");
    const slider = screen.getByRole("slider", { name: "Daycare day price" });
    fireEvent.change(slider, { target: { value: "80" } });
    expect(fac(now()).prices.daycare).toBe(80);
    const daycare = screen.getByRole("group", { name: "Daycare day" });
    expect(within(daycare).getByText("Above fair: fewer dogs will come")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "25" } });
    expect(within(daycare).getByText("Below fair: more dogs, less per dog")).toBeTruthy();
    fireEvent.mouseUp(slider);
    expect(events().some((e) => e.name === "tycoon_price" && e.props["service"] === "daycare" && e.props["price"] === 25)).toBe(true);
    unmount();
  });

  it("upkeep: closing an item lowers the daily total", () => {
    load(guidedBuild(newTycoon(Date.now())));
    const { unmount } = render(<Harness show="finances" />);
    tab("Upkeep");
    const total = () => Number(screen.getByTestId("upkeep-total").textContent);
    const before = total();
    fireEvent.click(screen.getByRole("switch", { name: "Front Desk Counter open" }));
    expect(total()).toBe(before - 6);
    expect(fac(now()).items.find((i) => i.kind === "front_counter")!.closed).toBe(true);
    unmount();
  });

  it("staff: wages and hiring", () => {
    load(newTycoon(Date.now()));
    const { unmount } = render(<Harness show="finances" />);
    tab("Staff");
    fireEvent.click(screen.getByRole("radio", { name: /Generous/ }));
    expect(fac(now()).wage).toBe("generous");
    fireEvent.click(screen.getByRole("button", { name: /^Hire/ }));
    expect(fac(now()).staff).toHaveLength(2);
    unmount();
  });

  it("the trophy shelf lists every trophy", () => {
    load({ ...newTycoon(Date.now()), trophies: ["first_dog"] });
    const { unmount } = render(<Harness show="finances" />);
    const shelf = screen.getByRole("region", { name: "Trophy shelf" });
    expect(within(shelf).getByText("First happy pup")).toBeTruthy();
    expect(within(shelf).getByText("Trophy shelf · 1/9")).toBeTruthy();
    expect(within(shelf).getByText("Fully booked")).toBeTruthy();
    unmount();
  });
});

describe("day report, money banner and sign", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  const report: TReport = { day: 3, income: 420, expenses: 300, profit: 120, running: 120, invested: 0, bonuses: 0, sales: 0, record: true, tip: "Your Fountain costs 16 a day and adds Appeal 6 — worth it while you have room for more dogs.", admitted: 9, checkouts: 8, avgHappy: 84 };

  it("the day report shows the profit, New record! and the money tip", () => {
    load(newTycoon(Date.now()));
    const { unmount } = render(<Harness show="report" />);
    act(() => tycoonStore.set((s) => withFac(s, { ...fac(s), day: 4, report }))); // reports aren't kept across reloads
    expect(screen.getByText("New record!")).toBeTruthy();
    expect(screen.getByText("+120")).toBeTruthy();
    expect(screen.getByText(report.tip)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start day 4" }));
    expect(fac(now()).report).toBeNull();
    unmount();
  });

  it("a day you built on: the running profit leads, and the building is shown as what you invested (play-session finding)", () => {
    const s = newTycoon(Date.now());
    const f = fac(s);
    const built: TReport = { day: 1, income: 756, expenses: 3045, profit: -2289, running: 636, invested: 2925, bonuses: 0, sales: 0, record: false, tip: "", admitted: 10, checkouts: 9, avgHappy: 100 };
    const ledger = [{ day: 1, income: { daycare: 700, boarding: 0, baths: 0, exitBaths: 0, tips: 56, bonus: 0 }, expenses: { wages: 40, upkeep: 60, supplies: 20, marketing: 0, building: 2925, refunds: 0 } }];
    load(withFac(s, { ...f, day: 2, ledger: ledger as never }));
    const { unmount } = render(<Harness show="report" />);
    act(() => tycoonStore.set((x) => withFac(x, { ...fac(x), report: built })));
    expect(screen.getByText("Running the daycare")).toBeTruthy();
    expect(screen.getByText("+636")).toBeTruthy();
    expect(screen.getByText(/You invested 2,925 in building/)).toBeTruthy();
    expect(screen.getByText(/after building −2,289/)).toBeTruthy();
    unmount();
  });

  it("the money banner shows below zero, with a saving idea", () => {
    load({ ...newTycoon(Date.now()), coins: -36 });
    const { unmount } = render(<Harness show="banner" />);
    expect(screen.getByText("Coins below zero: building is paused until income brings you back above zero")).toBeTruthy();
    unmount();
    tycoonStore._reset(null);
    load({ ...newTycoon(Date.now()), coins: 10 });
    const again = render(<Harness show="banner" />);
    expect(screen.queryByText(/Coins below zero/)).toBeNull();
    again.unmount();
  });

  it("the sign card links to booking, directions and the app, and counts clicks as clicks", () => {
    render(<SignCard open onClose={() => {}} />);
    for (const l of LOCATIONS) {
      expect(screen.getByRole("link", { name: `Book a free evaluation in ${l.name}` }).getAttribute("href")).toBe(bookingUrl(l));
      expect(screen.getByRole("link", { name: `Directions to PAWtastic ${l.name}` }).getAttribute("href")).toBe(directionsUrl(l));
    }
    expect(screen.getByRole("link", { name: "Open the PAWtastic app" }).getAttribute("href")).toBe(CUSTOMER_APP_URL);
    fireEvent.click(screen.getByRole("link", { name: "Book a free evaluation in Hawthorne" }));
    expect(events().some((e) => e.name === "booking_click" && e.props["from"] === "tycoon-sign" && e.props["location"] === "hawthorne")).toBe(true);
  });
});
