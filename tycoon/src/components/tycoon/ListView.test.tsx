import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
import { ListView } from "./ListView";
import { RunHud } from "./RunHud";
import { tycoonStore, useTycoon } from "@/tycoon/store";
import { createArrival } from "@/tycoon/run";
import { connectedRooms } from "@/tycoon/connect";
import { fac } from "@/tycoon/state";
import { firstFreeRoomPlan, sellThing } from "@/tycoon/build";
import { groupName, groupOf } from "@/game/engine";

function Harness() {
  const { state, act: run, paused, setPaused } = useTycoon();
  if (!state) return null;
  return (
    <>
      <RunHud state={state} act={run} paused={paused} setPaused={setPaused} />
      <ListView state={state} act={run} />
    </>
  );
}
/** Place, then confirm: Build at the quoted price (rooms) or Put it in the suggested room (furniture). */
const place = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: `Place ${name} in first free spot` }));
  const confirm = screen.queryAllByRole("button", { name: new RegExp(`^(Build|Put) ${name.replace(/[()]/g, "\\$&")} (for|in) `) })[0];
  if (confirm) fireEvent.click(confirm);
};
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("list view", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });

  it("a room's listing is its exact price, and Place asks before charging; Cancel costs nothing", () => {
    const { unmount } = render(<Harness />);
    const q = firstFreeRoomPlan(fac(tycoonStore.getState()!), "lobby");
    if (!q.ok) throw new Error("no spot");
    expect(screen.getByText(new RegExp(`^Room ${q.cost.room} \\+ door 30 \\+ path ${q.paths.length} × 10 = ${q.cost.total} · 4 × 3`))).toBeTruthy();
    const coins = tycoonStore.getState()!.coins;
    fireEvent.click(screen.getByRole("button", { name: "Place Lobby in first free spot" }));
    expect(tycoonStore.getState()!.coins).toBe(coins); // nothing yet
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tycoonStore.getState()!.coins).toBe(coins);
    fireEvent.click(screen.getByRole("button", { name: "Place Lobby in first free spot" }));
    fireEvent.click(screen.getByRole("button", { name: `Build Lobby for ${q.cost.total}` }));
    expect(coins - tycoonStore.getState()!.coins).toBe(q.cost.total);
    unmount();
  });

  it("the quote on screen follows the daycare: one that changed behind you shows its new price, and Build charges exactly that; a double tap builds once (audit finding 3)", () => {
    // (a plan that changed after it was shown and still reaches the rules is refused with nothing charged:
    // confirm-quote.test.ts. On screen the row re-renders with the new quote, so the stale one can't be tapped.)
    const { unmount } = render(<Harness />);
    place("Lobby");
    fireEvent.click(screen.getByRole("button", { name: "Place Playroom — Small & Gentle in first free spot" }));
    const shown = () => Number(screen.getByRole("button", { name: /^Build Playroom — Small & Gentle for \d+$/ }).getAttribute("aria-label")!.match(/for (\d+)$/)![1]);
    const price = shown();
    // meanwhile the daycare changes behind the open quote: a path square near the entrance goes
    act(() => {
      tycoonStore.dispatch((t) => sellThing(t, fac(t).items.find((i) => i.kind === "path" && i.uid !== "entrance")!.uid));
    });
    const coins = tycoonStore.getState()!.coins;
    const rooms = fac(tycoonStore.getState()!).rooms.length;
    const fresh = shown();
    expect(fresh).not.toBe(price); // the row really shows a different, current price
    // two quick taps on the button showing it: one room, charged the price on screen, once (the row closes after the
    // first tap, so the second lands on nothing — the row's own guard is a second line of defence)
    const btn = screen.getByRole("button", { name: `Build Playroom — Small & Gentle for ${fresh}` });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(coins - tycoonStore.getState()!.coins).toBe(fresh);
    expect(fac(tycoonStore.getState()!).rooms).toHaveLength(rooms + 1);
    // and a deliberate second purchase still works
    place("Playroom — Large & Active");
    expect(fac(tycoonStore.getState()!).rooms).toHaveLength(rooms + 2);
    unmount();
  });

  it("furniture asks which room, suggesting where it does its job", () => {
    const { unmount } = render(<Harness />);
    place("Lobby");
    place("Playroom — Small & Gentle");
    tab("furniture");
    place("Front Desk Counter");
    place("Dog Bed");
    fireEvent.click(screen.getByRole("button", { name: "Place Water Bowl in first free spot" }));
    const first = screen.getAllByRole("button", { name: /^Put Water Bowl in / })[0]!;
    expect(first.getAttribute("aria-label")).toBe("Put Water Bowl in Playroom");
    expect(first.textContent).toMatch(/suggested/);
    fireEvent.click(screen.getByRole("button", { name: "Put Water Bowl in Lobby" }));
    const f = fac(tycoonStore.getState()!);
    expect(f.items.at(-1)).toMatchObject({ kind: "water_bowl", room: f.rooms.find((r) => r.type === "lobby")!.uid }); // your choice wins
    unmount();
  });

  it("runs the whole guided start without the 3D view", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("switch", { name: "Open for business" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/To open you need/)).toBeTruthy();

    place("Lobby");
    tab("furniture");
    place("Front Desk Counter");
    place("Waiting Bench");
    tab("rooms");
    place("Playroom — Small & Gentle");
    place("Playroom — Small & Active");
    place("Playroom — Large & Gentle");
    place("Playroom — Large & Active");
    tab("furniture");
    for (let i = 0; i < 4; i++) place("Dog Bed");
    place("Water Bowl");
    tab("rooms");
    place("Calm-Down Room");

    const s = tycoonStore.getState()!;
    const f = fac(s);
    expect(f.rooms.map((r) => r.type)).toEqual(["lobby", "playroom", "playroom", "playroom", "playroom", "calm"]);
    expect(connectedRooms(f).size).toBe(6);
    expect(screen.queryByText("Not connected")).toBeNull();

    const sw = screen.getByRole("switch", { name: "Open for business" });
    expect(sw).toHaveProperty("disabled", false);
    fireEvent.click(sw);
    expect(fac(tycoonStore.getState()!).open).toBe(true);

    act(() => {
      tycoonStore.dispatch((t) => createArrival({ ...t, facilities: { ...t.facilities, f1: { ...fac(t), clockMin: 480 } } }, () => 0.1));
    });
    const pup = fac(tycoonStore.getState()!).dogs[0]!;
    const lobby = screen.getByRole("region", { name: "Front desk" });
    fireEvent.click(within(lobby).getByRole("button", { name: `Check in ${pup.name}` }));
    const card = () => screen.getByRole("article", { name: pup.name });
    const coinsBefore = tycoonStore.getState()!.coins;
    // every group has a playroom, so the pup's own group is offered
    fireEvent.click(within(card()).getByRole("button", { name: new RegExp(`^To ${groupName(groupOf(pup))} \\(0/1\\)$`) }));
    expect(fac(tycoonStore.getState()!).dogs[0]!.place.kind).toBe("room");
    fireEvent.click(within(card()).getByRole("button", { name: "Playtime" }));
    expect(fac(tycoonStore.getState()!).dogs[0]!.played).toBe(1);
    fireEvent.click(within(card()).getByRole("button", { name: "Check out" }));
    const end = tycoonStore.getState()!;
    expect(fac(end).dogs).toHaveLength(0);
    expect(fac(end).stats.checkouts).toBe(1);
    expect(end.coins).toBeGreaterThan(coinsBefore);
    expect(end.trophies).toContain("first_dog");
    unmount();
  });

  it("built things can be upgraded, closed and sold from the list view", () => {
    const { unmount } = render(<Harness />);
    tab("outdoor");
    place("Play Yard");
    const items = screen.getByRole("region", { name: "Outdoor items" });
    fireEvent.click(within(items).getByRole("button", { name: "Upgrade Play Yard · 360" }));
    expect(fac(tycoonStore.getState()!).items.find((i) => i.kind === "play_yard")!.level).toBe(2);
    fireEvent.click(within(items).getByRole("button", { name: "Close Play Yard" }));
    expect(fac(tycoonStore.getState()!).items.find((i) => i.kind === "play_yard")!.closed).toBe(true);
    fireEvent.click(within(items).getByRole("button", { name: "Sell Play Yard" }));
    fireEvent.click(within(items).getByRole("button", { name: /^Tap again to sell Play Yard/ }));
    expect(fac(tycoonStore.getState()!).items.some((i) => i.kind === "play_yard")).toBe(false);
    unmount();
  });

  it("furniture inside a room can be sold from its room card", () => {
    const { unmount } = render(<Harness />);
    place("Lobby");
    tab("furniture");
    place("Waiting Bench");
    const lobby = screen.getByRole("region", { name: "Lobby" });
    fireEvent.click(within(lobby).getByRole("button", { name: "Sell Waiting Bench" }));
    fireEvent.click(within(lobby).getByRole("button", { name: /^Tap again to sell Waiting Bench/ }));
    expect(fac(tycoonStore.getState()!).items.some((i) => i.kind === "bench")).toBe(false);
    unmount();
  });

  it("locked items say when they unlock", () => {
    const { unmount } = render(<Harness />);
    tab("furniture");
    expect(screen.getAllByText("Unlocks at level 5").length).toBeGreaterThan(0);
    tab("land");
    expect(screen.getAllByText("Unlocks at level 3")).toHaveLength(2);
    unmount();
  });
});
