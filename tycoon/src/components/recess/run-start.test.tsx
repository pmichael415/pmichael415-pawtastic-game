// Recess Rush's start screen: power-ups to switch on for this run, "Get more", and the runner looks.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RunStart } from "./RunStart";

const base = {
  counts: { shield: 2, life: 0 },
  use: { shield: false, life: false },
  onUse: () => {},
  onBuy: () => {},
  looks: { owned: false, "rainbow-trail": false, "rocket-cape": false },
  onEquip: () => {},
};

describe("before a run", () => {
  it("shows how many power-ups are left; one with none left can't be switched on", () => {
    render(<RunStart {...base} />);
    expect(screen.getByText("Shield Start · 2 left")).toBeTruthy();
    expect(screen.getByText("Extra Life · 0 left")).toBeTruthy();
    expect((screen.getByRole("switch", { name: "Use a Shield Start this run" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("switch", { name: "Use an Extra Life this run" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("switching one on, and Get more", () => {
    const onUse = vi.fn();
    const onBuy = vi.fn();
    render(<RunStart {...base} onUse={onUse} onBuy={onBuy} />);
    fireEvent.click(screen.getByRole("switch", { name: "Use a Shield Start this run" }));
    expect(onUse).toHaveBeenCalledWith("shield", true);
    fireEvent.click(screen.getByRole("button", { name: "Get more power-ups" }));
    expect(onBuy).toHaveBeenCalledWith("power-pack");
  });
  it("runner looks: Buy when not owned, Equip when owned", () => {
    const onBuy = vi.fn();
    const onEquip = vi.fn();
    const { rerender } = render(<RunStart {...base} onBuy={onBuy} onEquip={onEquip} />);
    fireEvent.click(screen.getByRole("button", { name: "Runner Looks Pack, $1.99" }));
    expect(onBuy).toHaveBeenCalledWith("runner-looks");
    rerender(<RunStart {...base} onBuy={onBuy} onEquip={onEquip} looks={{ owned: true, "rainbow-trail": true, "rocket-cape": false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Unequip Rainbow Trail" }));
    expect(onEquip).toHaveBeenCalledWith("rainbow-trail", false);
    fireEvent.click(screen.getByRole("button", { name: "Equip Rocket Cape" }));
    expect(onEquip).toHaveBeenCalledWith("rocket-cape", true);
  });
  it("every control is at least 44px tall", () => {
    render(<RunStart {...base} />);
    for (const el of [...screen.getAllByRole("button"), ...screen.getAllByRole("switch")]) expect(el.className).toMatch(/min-h-11|h-11/);
  });
});
