import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
// The 3D stage, stubbed: it shows the ghost it was given and lets the test tap squares, edges, rooms and things.
let emit: (p: TPick | null) => void = () => {};
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { ghost: unknown; pickMode: string; overlay: boolean; onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage", "data-ghost": JSON.stringify(props.ghost), "data-pick": props.pickMode, "data-overlay": String(props.overlay) });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { START_COINS } from "@/tycoon/catalog";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

const tap = (p: TPick) => act(() => emit(p));
const now = () => tycoonStore.getState()!;
const ghost = () => JSON.parse(screen.getByTestId("stage").getAttribute("data-ghost") ?? "null");
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tool = (name: string) => fireEvent.click(within(screen.getByRole("toolbar", { name: "Build tools" })).getByRole("button", { name }));

/** A player building freely: picked "Build from scratch", then skipped the guide (a brand-new save shows only the start card). */
const FREE_BUILD = { mode: "scratch", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function start(s: TycoonState = newTycoon(Date.now())) {
  localStorage.setItem(KEY, JSON.stringify({ ...s, tour: s.tour ?? FREE_BUILD }));
  const r = render(<TycoonPlay />);
  fireEvent.click(button("Build"));
  return r;
}
/** Draws a 4 × 3 room at (10,16) with the Rooms tool. */
function drawLobby() {
  tool("Rooms");
  tap({ kind: "tile", c: 10, r: 16 });
  tap({ kind: "tile", c: 13, r: 18 });
  fireEvent.click(button(/^Build room/));
  fireEvent.click(button("Lobby"));
}

describe("build mode", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });

  it("draws a 4 × 3 room with two taps, shows its size and price, builds it and sets its type", () => {
    const { unmount } = start();
    expect(screen.getByTestId("stage").getAttribute("data-overlay")).toBe("true");
    tool("Rooms");
    expect(screen.getByTestId("stage").getAttribute("data-pick")).toBe("tiles");
    tap({ kind: "tile", c: 10, r: 16 });
    tap({ kind: "tile", c: 13, r: 18 });
    expect(ghost()).toMatchObject({ kind: "room", c: 10, r: 16, w: 4, d: 3, ok: true });
    // The full cost: walls and floor, a door, and the path squares to the entrance (Stage A) — and that's what's
    // charged: the room is built with its door and path (empire milestone §2), not the walls alone.
    const line = screen.getAllByText(/^4 × 3 · Room 400 \+ door 30 \+ path \d+ × 10 = \d+$/)[0]!.textContent!;
    const total = Number(line.split("= ")[1]);
    expect(ghost().door).toBeTruthy();
    fireEvent.click(button(/^Build room/));
    expect(fac(now()).rooms).toHaveLength(1);
    expect(now().coins).toBe(START_COINS - total);
    expect(fac(now()).rooms[0]!.doors).toHaveLength(1);
    fireEvent.click(button("Lobby"));
    expect(fac(now()).rooms[0]!.type).toBe("lobby");
    expect(screen.getByText("Furnishing: Lobby")).toBeTruthy(); // furnishing it is next
    unmount();
  });

  it("a room on land you don't own is red with the reason", () => {
    const { unmount } = start();
    tool("Rooms");
    tap({ kind: "tile", c: 2, r: 20 });
    tap({ kind: "tile", c: 4, r: 22 });
    expect(ghost()).toMatchObject({ ok: false });
    expect(screen.getByText("Buy this land first.")).toBeTruthy();
    expect(button(/^Build room/)).toHaveProperty("disabled", true);
    unmount();
  });

  it("playrooms ask for a group", () => {
    const { unmount } = start();
    tool("Rooms");
    tap({ kind: "tile", c: 10, r: 16 });
    tap({ kind: "tile", c: 12, r: 18 });
    fireEvent.click(button(/^Build room/));
    fireEvent.click(button("Playroom"));
    fireEvent.click(button("Large & Active"));
    expect(fac(now()).rooms[0]).toMatchObject({ type: "playroom", group: "large-active" });
    unmount();
  });

  it("an edge tap shows a door ghost, and Add door adds it", () => {
    const { unmount } = start();
    drawLobby();
    tool("Doors");
    expect(screen.getByTestId("stage").getAttribute("data-pick")).toBe("edges");
    tap({ kind: "edge", c: 11, r: 18, side: "S" });
    expect(ghost()).toMatchObject({ kind: "door", door: { side: "S", i: 1 }, ok: true });
    fireEvent.click(button(/^Add door/));
    expect(fac(now()).rooms[0]!.doors).toContainEqual({ side: "S", i: 1 });
    expect(fac(now()).rooms[0]!.doors).toHaveLength(2); // the way in it was built with, and this one
    tap({ kind: "edge", c: 10, r: 18, side: "S" });
    expect(screen.getByText("Doors can't go on corners.")).toBeTruthy();
    unmount();
  });

  it("furnishing the lobby: a bath tub can't be chosen there and says where it goes", () => {
    const { unmount } = start({ ...newTycoon(Date.now()), xp: 100 });
    drawLobby();
    fireEvent.click(button("Choose furniture for the Lobby")); // building it led straight into furnishing it
    const sheet = within(screen.getByRole("dialog", { name: "Furniture for the Lobby" }));
    expect(sheet.queryByRole("button", { name: "Bath Tub" })).toBeNull();
    expect(sheet.getAllByText("Goes in a Bath Room").length).toBeGreaterThan(0); // bath tubs (and the deluxe tub)
    expect(sheet.getByRole("button", { name: "Front Desk Counter" })).toBeTruthy();
    unmount();
  });

  it("an item tapped outside the room being furnished is red with the reason", () => {
    const { unmount } = start();
    drawLobby();
    fireEvent.click(button("Choose furniture for the Lobby")); // building it led straight into furnishing it
    fireEvent.click(button("Waiting Bench"));
    tap({ kind: "tile", c: 15, r: 16 });
    expect(ghost()).toMatchObject({ kind: "thing", thing: "bench", ok: false });
    expect(screen.getByText(/outside the Lobby/)).toBeTruthy();
    expect(button(/^Put it in Lobby/)).toHaveProperty("disabled", true);
    unmount();
  });

  it("places, rotates and keeps the item ready for another", () => {
    const { unmount } = start();
    drawLobby();
    fireEvent.click(button("Choose furniture for the Lobby")); // building it led straight into furnishing it
    fireEvent.click(button("Front Desk Counter"));
    expect(ghost()).toMatchObject({ kind: "thing", ok: true }); // waiting at the room's first free spot
    tap({ kind: "tile", c: 10, r: 16 });
    fireEvent.click(button("Rotate"));
    expect(ghost()).toMatchObject({ rot: 1 });
    fireEvent.click(button("Rotate"));
    fireEvent.click(button("Rotate"));
    fireEvent.click(button("Rotate"));
    fireEvent.click(button(/^Put it in Lobby here/));
    expect(fac(now()).items.find((i) => i.kind === "front_counter")).toMatchObject({ c: 10, r: 16, rot: 0 });
    unmount();
  });

  it("locked items say when they unlock", () => {
    const { unmount } = start();
    drawLobby();
    fireEvent.click(button("Choose furniture for the Lobby")); // building it led straight into furnishing it
    expect(screen.getAllByText("Unlocks at level 3").length).toBeGreaterThan(0);
    unmount();
  });

  it("paths: tap squares, then Done paves them", () => {
    const { unmount } = start();
    tool("Paths");
    tap({ kind: "tile", c: 18, r: 26 });
    tap({ kind: "tile", c: 18, r: 25 });
    tap({ kind: "tile", c: 18, r: 24 });
    tap({ kind: "tile", c: 18, r: 24 }); // tapping again removes it
    expect(ghost()).toMatchObject({ kind: "paths", tiles: [{ c: 18, r: 26 }, { c: 18, r: 25 }] });
    fireEvent.click(button(/^Done · 2 squares/));
    expect(fac(now()).items.filter((i) => i.kind === "path")).toHaveLength(3);
    unmount();
  });

  it("before the daycare first opens, selling gives everything back — and says so", () => {
    const { unmount } = start();
    drawLobby();
    fireEvent.click(button("Done building"));
    tap({ kind: "room", uid: fac(now()).rooms[0]!.uid });
    fireEvent.click(button("Sell"));
    // all of what the room cost: its walls and floor (400) and its door (30); its path stays
    expect(screen.getByText("Sell the Lobby and everything in it for 430 coins?")).toBeTruthy();
    expect(screen.getByText(/Everything back until you first open — after that, selling gives back 75%/)).toBeTruthy();
    const coins = now().coins;
    fireEvent.click(button("Yes, sell"));
    expect(now().coins).toBe(coins + 430);
    unmount();
  });

  it("selling a room asks first and shows the refund (a daycare that has opened)", () => {
    const s = newTycoon(Date.now());
    const { unmount } = start(withFac(s, { ...fac(s), introDay: 0 }));
    drawLobby();
    fireEvent.click(button("Done building"));
    tap({ kind: "room", uid: fac(now()).rooms[0]!.uid });
    fireEvent.click(button("Sell"));
    // 75% back of what the room cost: its walls and floor (400) and its door (30); its path stays
    expect(screen.getByText("Sell the Lobby and everything in it for 322 coins?")).toBeTruthy();
    expect(screen.queryByText(/Everything back until you first open/)).toBeNull();
    expect(fac(now()).rooms).toHaveLength(1);
    const coins = now().coins;
    fireEvent.click(button("Yes, sell"));
    expect(fac(now()).rooms).toHaveLength(0);
    expect(now().coins).toBe(coins + 322);
    unmount();
  });

  it("paint: tap a room, pick a floor and colour", () => {
    const { unmount } = start();
    drawLobby();
    tool("Paint");
    tap({ kind: "room", uid: fac(now()).rooms[0]!.uid });
    fireEvent.click(button("Tile"));
    fireEvent.click(button("Wall colour 3"));
    fireEvent.click(button("Apply paint"));
    expect(fac(now()).rooms[0]).toMatchObject({ floor: "tile", wall: "#DCEBFA" });
    expect(now().guide.painted).toBe(true);
    unmount();
  });

  it("land: the sheet lists each parcel's state", () => {
    const { unmount } = start({ ...newTycoon(Date.now()), xp: 300 });
    tool("Land");
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getAllByText(/Unlocks at level/).length).toBe(3);
    fireEvent.click(within(sheet).getAllByRole("button", { name: /^Buy .* lot for 1,500/ })[0]!);
    expect(fac(now()).land).toContain("west");
    unmount();
  });

  it("upgrading an outdoor item from its edit panel", () => {
    const { unmount } = start();
    tool("Outdoor");
    fireEvent.click(button("Play Yard"));
    tap({ kind: "tile", c: 12, r: 22 });
    fireEvent.click(button("Place"));
    fireEvent.click(button("Done building"));
    const yard = fac(now()).items.find((i) => i.kind === "play_yard")!;
    tap({ kind: "thing", uid: yard.uid });
    expect(screen.getByText(/Fun 4/)).toBeTruthy();
    fireEvent.click(button(/^Upgrade · 360/));
    expect(fac(now()).items.find((i) => i.uid === yard.uid)!.level).toBe(2);
    unmount();
  });
});
