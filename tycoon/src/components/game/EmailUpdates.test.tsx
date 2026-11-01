import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const getEmailOptIn = vi.fn();
const setEmailOptIn = vi.fn();
vi.mock("@/lib/notify/email.functions", () => ({ getEmailOptIn: () => getEmailOptIn(), setEmailOptIn: (a: unknown) => setEmailOptIn(a) }));
import { EmailUpdates } from "./EmailUpdates";

const LABEL = "Email me the weekly challenge and prizes (at most 2 a week)";

describe("email updates checkbox", () => {
  beforeEach(() => {
    getEmailOptIn.mockReset();
    setEmailOptIn.mockReset();
  });
  it("is hidden while email updates aren't available", async () => {
    getEmailOptIn.mockResolvedValue({ available: false, on: false, email: "a@b.co" });
    await act(async () => render(<EmailUpdates />));
    expect(screen.queryByText(LABEL)).toBeNull();
  });
  it("turning on needs the 18+ tick, then saves with the player's choice", async () => {
    getEmailOptIn.mockResolvedValue({ available: true, on: false, email: "a@b.co" });
    setEmailOptIn.mockResolvedValue({ ok: true });
    await act(async () => render(<EmailUpdates />));
    fireEvent.click(screen.getByRole("checkbox", { name: LABEL }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "I'm 18 or older" }));
    expect(save.hasAttribute("disabled")).toBe(false);
    await act(async () => fireEvent.click(save));
    expect(setEmailOptIn).toHaveBeenCalledWith({ data: { on: true, adult: true } });
  });
  it("turning off doesn't ask for the 18+ tick", async () => {
    getEmailOptIn.mockResolvedValue({ available: true, on: true, email: "a@b.co" });
    setEmailOptIn.mockResolvedValue({ ok: true });
    await act(async () => render(<EmailUpdates />));
    fireEvent.click(screen.getByRole("checkbox", { name: LABEL }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(setEmailOptIn).toHaveBeenCalledWith({ data: { on: false, adult: false } });
  });
});
