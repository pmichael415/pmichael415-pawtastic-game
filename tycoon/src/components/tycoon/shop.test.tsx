// The new Daycare's in-game shop (phase 1: coins, plus the Deluxe Decor looks).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth", () => ({ useSession: () => ({ user: { id: "u1" }, ready: true, session: null }) }));
vi.mock("@/lib/payments/payments.functions", () => ({
  createCheckout: vi.fn(),
  getPaymentsStatus: async () => ({ ready: true, reason: null }),
  listEntitlements: async () => [],
  reserveDeliveries: async () => [],
  ackDeliveries: async () => ({ acked: 0 }),
}));

import { DaycareShop } from "./DaycareShop";
import { RunHud } from "./RunHud";
import { CatalogSheet } from "./CatalogSheet";
import { applyDeliveries, coinRefusalAction, tycoonStore } from "@/tycoon/store";
import { fac, newTycoon } from "@/tycoon/state";
import { guidedBuild } from "@/tycoon/testkit";

beforeEach(() => localStorage.clear());
afterEach(() => tycoonStore._reset(null));

describe("the Daycare Shop", () => {
  it("lists the five coin packs at the owner's prices", () => {
    render(<DaycareShop open onClose={() => {}} owned={new Set()} />);
    const coins = screen.getByRole("region", { name: "Coins" });
    const packs: [string, string][] = [
      ["2,500 Coins", "$0.99"],
      ["8,000 Coins", "$2.99"],
      ["20,000 Coins", "$5.99"],
      ["50,000 Coins", "$12.99"],
      ["Mega Vault (150,000 Coins)", "$29.99"],
    ];
    for (const [name, price] of packs) {
      const row = within(coins).getByText(name).closest("li")!;
      expect(within(row).getByText(price)).toBeTruthy();
    }
  });
  it("picking a pack opens its buy sheet", async () => {
    render(<DaycareShop open onClose={() => {}} owned={new Set()} />);
    fireEvent.click(screen.getByRole("button", { name: "8,000 Coins, $2.99" }));
    expect(await screen.findByRole("button", { name: "Buy $2.99" })).toBeTruthy();
    expect(screen.getByText("Real money — charged by Stripe to your card.")).toBeTruthy();
  });
  it("Deluxe Daycare Decor shows as owned once bought", () => {
    render(<DaycareShop open onClose={() => {}} owned={new Set(["deluxe-daycare-decor"])} />);
    const looks = screen.getByRole("region", { name: "Items & themes" });
    expect(within(looks).getByText("Owned")).toBeTruthy();
  });
});

describe("getting to the shop from play", () => {
  it("the status bar has a Shop button and a Get coins button", () => {
    const onShop = vi.fn();
    render(<RunHud state={newTycoon(0)} act={() => ({ ok: false, error: "x" })} paused={false} setPaused={() => {}} onShop={onShop} />);
    fireEvent.click(screen.getByRole("button", { name: "Daycare Shop" }));
    fireEvent.click(screen.getByRole("button", { name: "Get coins" }));
    expect(onShop).toHaveBeenCalledTimes(2);
    for (const b of [screen.getByRole("button", { name: "Daycare Shop" }), screen.getByRole("button", { name: "Get coins" })]) expect(b.className).toMatch(/min-h-11|h-11/);
  });
  it("a refusal for coins offers Get coins; other refusals don't", () => {
    const open = vi.fn();
    const a = coinRefusalAction("Need 120 more coins.", open);
    expect(a?.action.label).toBe("Get coins");
    a!.action.onClick();
    expect(open).toHaveBeenCalled();
    expect(coinRefusalAction("Paused until your coins are back above zero.", open)?.action.label).toBe("Get coins");
    expect(coinRefusalAction("The lobby is full — move waiting pups to a playroom or bed first.", open)).toBeUndefined();
    expect(coinRefusalAction("Need 120 more coins.", null)).toBeUndefined();
  });
  it("with a buy handler, a locked Deluxe Decor item in the build catalog opens its buy sheet in place", () => {
    const onBuyPack = vi.fn();
    render(<CatalogSheet open tab="furniture" level={5} coins={3000} owned={new Set()} onPick={() => {}} onClose={() => {}} onBuyPack={onBuyPack} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Get the Deluxe Daycare Decor pack/ })[0]!);
    expect(onBuyPack).toHaveBeenCalled();
  });
});

describe("bought coins in a running game", () => {
  it("arrive in the counter and are not daycare income", () => {
    const s = guidedBuild(newTycoon(Date.now()));
    tycoonStore._reset(s);
    const before = fac(s).ledger.at(-1);
    const r = applyDeliveries([{ id: "00000000-0000-4000-8000-00000000000a", contents: { coins: 8000 }, reverses: null }]);
    expect(r.ok).toBe(true);
    const now = tycoonStore.getState()!;
    expect(now.coins).toBe(s.coins + 8000);
    expect(fac(now).ledger.at(-1)).toEqual(before);
  });
});
