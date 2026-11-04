// Building a room you can use (empire milestone §2): Select room → see footprint and entrance → tap to place → see the
// route and total cost → confirm (charged once) → furnish it, choosing the room first. Cancelling costs nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
let emit: (p: TPick | null) => void = () => {};
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { ghost: unknown; onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, focus: () => {}, debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage", "data-ghost": JSON.stringify(props.ghost) });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { planRoom, removeDoor } from "@/tycoon/build";
import { connectedRooms } from "@/tycoon/connect";
import { xpForLevel } from "@/tycoon/progress";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import type { TycoonState } from "@/tycoon/types";

const tap = (p: TPick) => act(() => emit(p));
const now = () => tycoonStore.getState()!;
const ghost = () => JSON.parse(screen.getByTestId("stage").getAttribute("data-ghost") ?? "null");
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tool = (name: string) => fireEvent.click(within(screen.getByRole("toolbar", { name: "Build tools" })).getByRole("button", { name }));
const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
const spent = (s: TycoonState) => fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;
function start(edit: (s: TycoonState) => TycoonState = (s) => s) {
  const s = edit({ ...ok(quickStart(newTycoon(Date.now()))), coins: 5000, xp: xpForLevel(4), pendingLevel: null, tour: SKIPPED });
  localStorage.setItem(KEY, JSON.stringify(s));
  render(<TycoonPlay />);
  fireEvent.click(button("Build"));
}

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
});

describe("placing a room", () => {
  it("choose Bath, tap a spot: the outline shows its door and route and the itemised price; Build here builds it connected for exactly that, then asks what to furnish it with", () => {
    start();
    tool("Rooms");
    fireEvent.click(button("Bath Room"));
    tap({ kind: "tile", c: 12, r: 18 });
    const g = ghost();
    expect(g).toMatchObject({ kind: "room", ok: true });
    expect(g.door).toBeTruthy();
    // the price is read from what's on screen — the itemised line and the button — not recomputed (audit finding 7)
    const line = screen.getAllByText(/^Bath Room 3 × 2 · Room \d+ \+ door 30( \+ path \d+ × 10)? = \d+$/)[0]!.textContent!;
    const shownTotal = Number(line.split("= ")[1]);
    const go = button(/^Build here · /);
    expect(Number(go.textContent!.replace(/[^\d]/g, ""))).toBe(shownTotal);
    const before = now();
    fireEvent.click(go);
    const room = fac(now()).rooms.at(-1)!;
    expect(room).toMatchObject({ type: "bath", c: g.c, r: g.r });
    expect(connectedRooms(fac(now())).has(room.uid)).toBe(true);
    expect(spent(now()) - spent(before)).toBe(shownTotal);
    expect(before.coins - now().coins).toBe(shownTotal);
    // furnishing that room is next
    expect(screen.getByText(/Furnishing: Bath Room/)).toBeTruthy();
  });
  it("Cancel costs nothing; a quick double tap on Build here builds one room", () => {
    start();
    tool("Rooms");
    fireEvent.click(button("Bath Room"));
    tap({ kind: "tile", c: 12, r: 18 });
    const coins = now().coins;
    fireEvent.click(button("Cancel"));
    expect(now().coins).toBe(coins);
    expect(ghost()).toBeNull();
    tap({ kind: "tile", c: 12, r: 18 });
    const rooms = fac(now()).rooms.length;
    const go = button(/^Build here/);
    fireEvent.click(go);
    fireEvent.click(go);
    expect(fac(now()).rooms.length).toBe(rooms + 1);
  });
  it("a spot with no way in is red and says why; nothing is charged", () => {
    start();
    tool("Rooms");
    fireEvent.click(button("Bath Room"));
    tap({ kind: "tile", c: 18, r: 23 }); // on top of the lobby
    expect(ghost()).toMatchObject({ ok: false });
    expect(screen.getByText(/overlap/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Build here/ })).toBeNull();
  });
});

describe("furnishing: choose the room first", () => {
  it("the catalog offers only what fits that room, and Put it in places it inside that room (never the lobby)", () => {
    start();
    tool("Furniture");
    const pick = within(screen.getByRole("region", { name: "Choose a room to furnish" }));
    fireEvent.click(pick.getByRole("button", { name: /^Playroom/ }));
    expect(screen.getByText(/Furnishing: Playroom/)).toBeTruthy();
    const play = fac(now()).rooms.find((r) => r.type === "playroom")!;
    fireEvent.click(screen.getByRole("button", { name: /Water Bowl/ }));
    const items = fac(now()).items.length;
    fireEvent.click(button(/^Put it in Playroom/));
    const placed = fac(now()).items.at(-1)!;
    expect(fac(now()).items.length).toBe(items + 1);
    expect(placed).toMatchObject({ kind: "water_bowl", room: play.uid });
  });
});

describe("inspecting a room's connection", () => {
  it("a room shows its way in; one with no door says so, and Connect it fixes it for the price shown", () => {
    start((s) => {
      const play = fac(s).rooms.find((r) => r.type === "playroom")!;
      return ok(removeDoor(s, play.uid, play.doors[0]!));
    });
    fireEvent.click(button("Done building"));
    const play = fac(now()).rooms.find((r) => r.type === "playroom")!;
    tap({ kind: "room", uid: play.uid });
    const panel = within(screen.getByRole("region", { name: /^Edit Playroom/ }));
    expect(panel.getByText(/No door yet/)).toBeTruthy();
    const before = now();
    const connect = panel.getByRole("button", { name: /^Connect it · \d+$/ });
    const shown = Number(connect.textContent!.replace(/[^\d]/g, ""));
    expect(shown).toBe(30); // a doorway into the lobby, no path squares
    fireEvent.click(connect);
    expect(connectedRooms(fac(now())).has(play.uid)).toBe(true);
    expect(spent(now()) - spent(before)).toBe(shown);
    expect(within(screen.getByRole("region", { name: /^Edit Playroom/ })).getByText(/Way in: a door into the Lobby/)).toBeTruthy();
  });
});

describe("review fixes", () => {
  it("a quick double tap on Put it in places one item, charged once", () => {
    start();
    tool("Furniture");
    fireEvent.click(within(screen.getByRole("region", { name: "Choose a room to furnish" })).getByRole("button", { name: /^Playroom/ }));
    fireEvent.click(screen.getByRole("button", { name: /Water Bowl/ }));
    const items = fac(now()).items.length;
    const coins = now().coins;
    const put = button(/^Put it in Playroom/);
    fireEvent.click(put);
    fireEvent.click(put);
    expect(fac(now()).items.length).toBe(items + 1);
    expect(coins - now().coins).toBe(20);
  });
  it("choosing Playroom can be backed out of, to pick another type", () => {
    start();
    tool("Rooms");
    fireEvent.click(button("Playroom"));
    expect(screen.getByText("Which pups will play there?")).toBeTruthy();
    fireEvent.click(button("Back"));
    expect(button("Bath Room")).toBeTruthy();
  });
});

describe("reloading mid-build (audit finding 1)", () => {
  it("an unconfirmed room leaves nothing behind and charges nothing; the game comes back paused", () => {
    start();
    tool("Rooms");
    fireEvent.click(button("Bath Room"));
    tap({ kind: "tile", c: 12, r: 18 }); // the outline and price are showing, nothing confirmed
    const before = now();
    const rooms = fac(before).rooms.length;
    cleanup(); // the page goes away (reload, or the phone discards the tab)
    tycoonStore._reset(null);
    render(<TycoonPlay />);
    expect(fac(now()).rooms).toHaveLength(rooms);
    expect(now().coins).toBe(before.coins);
    expect(tycoonStore.getSnapshot().paused).toBe(true);
    expect(screen.getByRole("region", { name: "Paused" })).toBeTruthy();
  });
});

describe("Connect it charges the plan it shows, once (audit finding 3)", () => {
  it("a double tap connects once, for the price on the button", () => {
    start((s) => {
      const play = fac(s).rooms.find((r) => r.type === "playroom")!;
      return ok(removeDoor(s, play.uid, play.doors[0]!));
    });
    fireEvent.click(button("Done building"));
    const play = fac(now()).rooms.find((r) => r.type === "playroom")!;
    tap({ kind: "room", uid: play.uid });
    const panel = within(screen.getByRole("region", { name: /^Edit Playroom/ }));
    const connect = panel.getByRole("button", { name: /^Connect it · \d+$/ });
    const price = Number(connect.textContent!.replace(/[^\d]/g, ""));
    const before = now();
    fireEvent.click(connect);
    fireEvent.click(connect);
    expect(before.coins - now().coins).toBe(price);
    expect(connectedRooms(fac(now())).has(play.uid)).toBe(true);
  });
});
