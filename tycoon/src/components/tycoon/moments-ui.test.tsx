// Personal moments on screen (combined-loop plan, task 2): the pup's panel shows who it is and what it's asking you
// for; one tap answers it; a short note says when a pup asks, with a way to go to it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

const toasts: { msg: string; opts?: { action?: { label: string; onClick: () => void } } | undefined }[] = [];
vi.mock("sonner", () => {
  const rec = (msg: string, opts?: never) => void toasts.push({ msg, opts });
  return { toast: Object.assign(rec, { success: rec, error: rec, warning: rec, info: rec }) };
});
let emit: (p: TPick | null) => void = () => {};
const fxs: string[] = [];
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: (k: string) => fxs.push(k), resetCamera: () => {}, debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { personalityOf, FAVORITE_LABEL } from "@/game/engine";
import { MOMENT_ASK, openMoments } from "@/tycoon/moments";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import { defaultVisit } from "@/tycoon/visit";
import type { TDog, TycoonState } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function midday(): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  const room = f.rooms.find((r) => r.type === "playroom")!.uid;
  const d: TDog = { id: "b1", name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 60, clean: 70, boarding: false, played: 1, bathed: false };
  const dog = { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 8 * 60, checkedInAt: 8 * 60, pickup: 17 * 60 } };
  return { ...withFac(s, { ...f, open: true, clockMin: 12 * 60, introDay: 0, dogs: [dog], stats: { ...f.stats, checkouts: 1 } }), coins: 3000, tour: SKIPPED };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const panel = () => within(screen.getByTestId("panel-sheet")).getByRole("article", { name: "Biscuit" });

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
  toasts.length = 0;
  fxs.length = 0;
});

describe("a pup's panel shows who it is", () => {
  it("its favourite game and its trait, so the pup feels like itself", () => {
    open(midday());
    act(() => emit({ kind: "dog", id: "b1" }));
    const p = personalityOf({ name: "Biscuit", breed: 1 });
    // (the panel is compact since the legacy comparison: the pup's details are one tap away)
    fireEvent.click(within(panel()).getByRole("button", { name: /^More about Biscuit/ }));
    expect(within(panel()).getByText(new RegExp(`Loves ${FAVORITE_LABEL[p.favorite]}`))).toBeTruthy();
    expect(within(panel()).getByText(new RegExp(p.trait))).toBeTruthy();
  });
});

describe("when a pup asks for you", () => {
  it("a note says so, with a button that goes straight to the pup", () => {
    open(midday());
    act(() => tycoonStore.set(openMoments));
    const ask = MOMENT_ASK[personalityOf({ name: "Biscuit", breed: 1 }).favorite];
    const note = toasts.find((t) => t.msg.includes(`Biscuit ${ask}`));
    expect(note?.opts?.action?.label).toBe("Go to Biscuit");
    act(() => note!.opts!.action!.onClick());
    expect(within(panel()).getByText(new RegExp(`Biscuit ${ask}`))).toBeTruthy();
  });
  it("the panel's card answers it in one tap: a happier pup, hearts, and the card says the family will hear about it", () => {
    open(openMoments(midday()));
    act(() => emit({ kind: "dog", id: "b1" }));
    const card = within(panel()).getByRole("region", { name: /asking for you/ });
    fireEvent.click(within(card).getByRole("button"));
    const d = fac(now()).dogs[0]!;
    expect(d.visit?.moment?.state).toBe("done");
    expect(d.happiness).toBeGreaterThanOrEqual(74);
    expect(fxs).toContain("hearts");
    expect(within(panel()).queryByRole("region", { name: /asking for you/ })).toBeNull();
    expect(within(panel()).getByText(/family will hear about it/)).toBeTruthy();
  });
  it("while a pup is asking, a chip over the daycare stays until it's answered — notes vanish on a phone, the chip doesn't", () => {
    open(openMoments(midday()));
    fireEvent.click(screen.getByRole("button", { name: /Biscuit is asking for you/ }));
    expect(within(panel()).getByRole("region", { name: /asking for you/ })).toBeTruthy();
    fireEvent.click(within(within(panel()).getByRole("region", { name: /asking for you/ })).getByRole("button"));
    expect(screen.queryByRole("button", { name: /is asking for you/ })).toBeNull();
  });
  it("a family kept waiting comes first: the chip shows them before a pup's moment (a moment can wait; they can't)", () => {
    let s = openMoments(midday());
    const f = fac(s);
    s = withFac(s, { ...f, dogs: f.dogs.map((d) => ({ ...d, visit: { ...d.visit!, owner: "Lee", ownerHere: f.clockMin - 32 } })) });
    open(s);
    const chip = screen.getByRole("button", { name: /Lee is waiting to pick up Biscuit/ });
    fireEvent.click(chip);
    expect(within(panel()).getByText(/Lee is here for pickup/)).toBeTruthy();
  });
  it("the same moment isn't announced twice, and moments already open when you come back aren't repeated", () => {
    open(openMoments(midday()));
    act(() => tycoonStore.set((s) => ({ ...s })));
    expect(toasts.filter((t) => /Biscuit/.test(t.msg) && /with you|from you/.test(t.msg))).toHaveLength(0);
  });
});
