import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
import { CatalogSheet } from "./CatalogSheet";
import { moveThing, placeThing, sellThing } from "@/tycoon/build";
import { caps } from "@/tycoon/connect";
import { funAppeal } from "@/tycoon/effects";
import { ownedPaid, setOwnedPaid } from "@/tycoon/paid";
import { fac, newTycoon, parseTycoon } from "@/tycoon/state";
import { guidedBuild, ok } from "@/tycoon/testkit";
import type { PaidItemId } from "@/lib/paidVisuals";

const DELUXE: ReadonlySet<PaidItemId> = new Set(["deluxe-decor"]);
const NONE: ReadonlySet<PaidItemId> = new Set();
const play = (s = guidedBuild(newTycoon(0))) => ({ s, room: fac(s).rooms.find((r) => r.type === "playroom")! });

describe("paid packs in the new game", () => {
  afterEach(() => setOwnedPaid(NONE));

  it("nothing is owned until the server says so", () => {
    expect(ownedPaid().size).toBe(0);
  });
  it("without the entitlement a cloud bed can't be placed", () => {
    const { s } = play();
    expect(placeThing(s, "cloud_bed", 22, 22, 0, NONE)).toEqual({ ok: false, error: "Part of the Deluxe Daycare Decor pack." });
    expect(placeThing(s, "cloud_bed", 22, 22, 0)).toEqual({ ok: false, error: "Part of the Deluxe Daycare Decor pack." }); // default: fail closed
  });
  it("with it, they place like their free twins: Cloud Bed = Dog Bed, Lighthouse Fort = Mini Hurdles", () => {
    const { s, room } = play({ ...guidedBuild(newTycoon(0)), xp: 50 * 4 * 3 });
    const t = ok(placeThing(s, "cloud_bed", 22, 22, 0, DELUXE));
    expect(t.coins).toBe(s.coins - 60);
    expect(fac(t).items.at(-1)).toMatchObject({ kind: "cloud_bed", room: room.uid, spent: 60 });
    expect(caps(fac(t), DELUXE).playrooms[0]!.spots).toBe(3);
    expect(funAppeal(fac(t), DELUXE).fun).toBe(funAppeal(fac(s), DELUXE).fun);
    const fort = ok(placeThing(t, "lighthouse_fort", 20, 22, 0, DELUXE));
    expect(fort.coins).toBe(t.coins - 180);
    expect(funAppeal(fac(fort), DELUXE).fun).toBe(funAppeal(fac(s), DELUXE).fun + 4);
  });
  it("after the entitlement goes, placed pack items count nothing and can't move, but still sell", () => {
    const { s } = play();
    const t = ok(placeThing(s, "cloud_bed", 22, 22, 0, DELUXE));
    const bed = fac(t).items.at(-1)!;
    expect(funAppeal(fac(t), NONE)).toEqual(funAppeal(fac(s), NONE));
    expect(caps(fac(t), NONE).playrooms[0]!.spots).toBe(2);
    expect(moveThing(t, bed.uid, 20, 23, 0, NONE)).toEqual({ ok: false, error: "Pack no longer active." });
    const sold = ok(sellThing(t, bed.uid));
    expect(sold.coins).toBe(t.coins + 45);
  });
  it("saves never record ownership", () => {
    const { s } = play();
    const t = ok(placeThing(s, "cloud_bed", 22, 22, 0, DELUXE));
    const json = JSON.stringify(t);
    expect(json).not.toMatch(/deluxe-decor|entitle|owned/i);
    expect(fac(parseTycoon(JSON.parse(json))!).items.some((i) => i.kind === "cloud_bed")).toBe(true);
  });
  it("the catalog shows pack items locked unless owned", () => {
    const { rerender } = render(<CatalogSheet open tab="furniture" level={1} coins={3000} owned={NONE} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText("Part of the Deluxe Daycare Decor pack")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Cloud Bed" })).toBeNull();
    rerender(<CatalogSheet open tab="furniture" level={5} coins={3000} owned={DELUXE} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Cloud Bed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lighthouse Fort" })).toBeTruthy();
    expect(screen.queryByText("Part of the Deluxe Daycare Decor pack")).toBeNull();
  });
});
