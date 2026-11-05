import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
import { WeeklyCard } from "./WeeklyCard";
import { KEY, tycoonStore, useTycoon } from "@/tycoon/store";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { weekKey } from "@/game/engine";
import { START_COINS } from "@/tycoon/catalog";

type Ev = { name: string; props: Record<string, unknown> };
const events = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []);
function Harness() {
  const { state, act } = useTycoon();
  return state ? <WeeklyCard state={state} act={act} /> : null;
}
const save = (checkouts: number) => {
  const s = newTycoon(Date.now());
  const w = { ...s, trophies: ["first_dog", "dogs_10"], weekly: { week: weekKey(), goal: "serve", base: { checkouts: 0, plays: 0, admitted: 0, baths: 0, boarders: 0 }, baseDay: 1, claimed: false } };
  localStorage.setItem(KEY, JSON.stringify(withFac(w, { ...fac(w), stats: { ...fac(w).stats, checkouts } })));
};

describe("weekly card", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("shows the goal and progress, with no claim until it's done", () => {
    save(12);
    const { unmount } = render(<Harness />);
    expect(screen.getByText("Send 25 pups home happy")).toBeTruthy();
    expect(screen.getByText("12/25")).toBeTruthy();
    expect(screen.getByText("+300 coins")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    unmount();
  });
  it("claims once and records it", () => {
    save(25);
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Claim +300 coins" }));
    expect(tycoonStore.getState()!.coins).toBe(START_COINS + 300);
    expect(screen.getByText("Claimed — a new challenge starts Monday.")).toBeTruthy();
    expect(events().some((e) => e.name === "tycoon_weekly" && e.props["goal"] === "serve")).toBe(true);
    unmount();
  });
});
