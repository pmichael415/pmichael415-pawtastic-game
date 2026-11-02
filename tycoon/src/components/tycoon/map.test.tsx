// When 3D can't load (Stage A, spec §3.4): a lightweight 2D map of the daycare, and a plain explanation.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TycoonMap } from "./TycoonMap";
import { FallbackNotice } from "./FallbackNotice";
import { fac, newTycoon } from "@/tycoon/state";
import { startTour } from "@/tycoon/tour";

const s = startTour(newTycoon(0), "quick", 0);
const f = fac(s);

describe("the 2D map", () => {
  it("shows each room with its name and how full it is, and each pup with its status", () => {
    render(<TycoonMap state={s} selected={null} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Playroom · Small & Gentle, 0 of 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lobby, 1 of 4 waiting" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calm-Down Room" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Biscuit, waiting to check in" })).toBeTruthy();
  });
  it("tapping a pup or a room picks it, like the 3D view", () => {
    const onPick = vi.fn();
    render(<TycoonMap state={s} selected={null} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Biscuit, waiting to check in" }));
    expect(onPick).toHaveBeenLastCalledWith({ kind: "dog", id: f.dogs[0]!.id });
    fireEvent.click(screen.getByRole("button", { name: "Calm-Down Room" }));
    expect(onPick).toHaveBeenLastCalledWith({ kind: "room", uid: f.rooms.find((r) => r.type === "calm")!.uid });
  });
  it("draws short room names and counts that fit inside each room", () => {
    render(<TycoonMap state={s} selected={null} onPick={() => {}} />);
    expect(screen.getByText("Lobby")).toBeTruthy();
    expect(screen.getByText("1/4")).toBeTruthy();
    expect(screen.getByText("Calm")).toBeTruthy();
    expect(screen.getByText("0/3")).toBeTruthy();
    const name = screen.getByText("Small & Gentle");
    const room = f.rooms.find((r) => r.type === "playroom")!;
    const len = Number(name.getAttribute("textLength") ?? 0);
    expect(len === 0 || len <= room.w - 0.2).toBe(true);
    expect(screen.queryByText(/of 4 waiting/)).toBeNull(); // the long form stays in the button's name
  });
  it("frames the daycare itself (rooms, things, paths) so it fills the map on a phone", () => {
    render(<TycoonMap state={s} selected={null} onPick={() => {}} />);
    const [x, y, w, h] = screen.getByRole("group", { name: "Your daycare from above" }).getAttribute("viewBox")!.split(" ").map(Number) as [number, number, number, number];
    for (const r of f.rooms) {
      expect(r.c).toBeGreaterThanOrEqual(x);
      expect(r.r).toBeGreaterThanOrEqual(y);
      expect(r.c + r.w).toBeLessThanOrEqual(x + w);
      expect(r.r + r.d).toBeLessThanOrEqual(y + h);
    }
    expect(w).toBeLessThan(16); // tighter than the 16-square starter lot
  });
  it("a lot with no rooms yet frames the land the player owns", () => {
    render(<TycoonMap state={newTycoon(0)} selected={null} onPick={() => {}} />);
    // the starter lot is columns 10–26 and rows 16–28; half a square of margin, kept inside the 36 × 28 grid
    expect(screen.getByRole("group", { name: "Your daycare from above" }).getAttribute("viewBox")).toBe("9.5 15.5 17 12.5");
  });
  it("shows an owner waiting for pickup, and a pup in the bath", () => {
    const d0 = f.dogs[0]!;
    const st = { ...s, facilities: { f1: { ...f, dogs: [{ ...d0, visit: { ...d0.visit!, owner: "Taylor", ownerHere: 900 } }, { ...d0, id: "z", name: "Suds", bathing: 20, visit: { ...d0.visit!, ownerHere: null } }] } } };
    render(<TycoonMap state={st} selected={null} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Biscuit, Taylor is here for pickup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suds, in the bath" })).toBeTruthy();
  });
  it("marks the selected pup", () => {
    render(<TycoonMap state={s} selected={f.dogs[0]!.id} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Biscuit, waiting to check in" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("explaining the fallback", () => {
  it("without WebGL: says why, that progress is the same, and offers to try 3D again", () => {
    const onRetry = vi.fn();
    render(<FallbackNotice reason="no-webgl" onRetry={onRetry} />);
    expect(screen.getByText(/3D isn't available in this browser/)).toBeTruthy();
    expect(screen.getByText(/progress is the same/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try 3D again" }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("the list view chosen in Settings is described as a choice", () => {
    render(<FallbackNotice reason="list" onRetry={() => {}} />);
    expect(screen.getByText(/You chose the list view/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show the 3D view" })).toBeTruthy();
  });
});
