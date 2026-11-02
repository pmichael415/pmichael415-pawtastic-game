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
