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
const place = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Place ${name} in first free spot` }));
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("list view", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
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

  it("locked items say when they unlock", () => {
    const { unmount } = render(<Harness />);
    tab("furniture");
    expect(screen.getAllByText("Unlocks at level 5").length).toBeGreaterThan(0);
    tab("land");
    expect(screen.getAllByText("Unlocks at level 3")).toHaveLength(2);
    unmount();
  });
});
