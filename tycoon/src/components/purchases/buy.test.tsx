// The shared in-game buy sheet and what happens when Stripe sends the buyer back to the game.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: Object.assign((m: string) => void toasts.push(m), {
    success: (m: string) => void toasts.push(m),
    error: (m: string) => void toasts.push(m),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
let user: { id: string } | null = { id: "u1" };
vi.mock("@/lib/auth", () => ({ useSession: () => ({ user, ready: true, session: null }) }));
const createCheckout = vi.fn();
const getPaymentsStatus = vi.fn();
const listEntitlements = vi.fn(async (): Promise<{ product_id: string; granted_at: string }[]> => []);
vi.mock("@/lib/payments/payments.functions", () => ({
  createCheckout: (a: unknown) => createCheckout(a),
  getPaymentsStatus: () => getPaymentsStatus(),
  listEntitlements: () => listEntitlements(),
}));

import { BuySheet } from "./BuySheet";
import { addedMessage, useCheckoutReturn } from "./useCheckoutReturn";
import { productById } from "@/lib/catalog";
import { EntitlementsProvider, useEntitlementsMaybe } from "@/lib/entitlements";

beforeEach(() => {
  toasts.length = 0;
  user = { id: "u1" };
  getPaymentsStatus.mockResolvedValue({ ready: true, reason: null });
  createCheckout.mockResolvedValue({
    ok: true,
    url: "https://checkout.stripe.com/c/pay/cs_live_x",
  });
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.clearAllMocks());

describe("the buy sheet", () => {
  it("shows what you get, the price and that it's real money", async () => {
    render(
      <BuySheet product={productById("power-pack")!} returnTo="/recess" open onClose={() => {}} />,
    );
    expect(screen.getByText("Power Pack")).toBeTruthy();
    expect(screen.getByText("10 Shield Starts")).toBeTruthy();
    expect(screen.getByText("Real money — charged by Stripe to your card.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Buy $2.99" })).toBeTruthy();
  });
  it("buying starts Stripe checkout and returns to the game page it came from", async () => {
    const go = vi.fn();
    render(
      <BuySheet
        product={productById("coins-8000")!}
        returnTo="/daycare-next"
        open
        onClose={() => {}}
        go={go}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Buy $2.99" }));
    await waitFor(() =>
      expect(go).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_live_x"),
    );
    expect(createCheckout).toHaveBeenCalledWith({
      data: { productId: "coins-8000", returnTo: "/daycare-next", attempt: expect.any(String) },
    });
  });
  it("a refused checkout says why and goes nowhere", async () => {
    const go = vi.fn();
    createCheckout.mockResolvedValue({
      ok: false,
      error: "You already own this pack — use Restore purchases.",
    });
    render(
      <BuySheet
        product={productById("runner-looks")!}
        returnTo="/recess"
        open
        onClose={() => {}}
        go={go}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Buy $1.99" }));
    await waitFor(() =>
      expect(toasts).toContain("You already own this pack — use Restore purchases."),
    );
    expect(go).not.toHaveBeenCalled();
  });
  it("a guest is asked to sign in first", async () => {
    user = null;
    render(
      <BuySheet
        product={productById("coins-2500")!}
        returnTo="/daycare-next"
        open
        onClose={() => {}}
      />,
    );
    expect((await screen.findByRole("link", { name: "Sign in to buy" })).getAttribute("href")).toBe(
      "/account",
    );
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
  });
  it("while payments are paused, nothing can be bought", async () => {
    getPaymentsStatus.mockResolvedValue({
      ready: false,
      reason: "Only live-mode keys are accepted",
    });
    render(
      <BuySheet
        product={productById("coins-2500")!}
        returnTo="/daycare-next"
        open
        onClose={() => {}}
      />,
    );
    expect(
      await screen.findByText("Purchases are paused right now — nothing can be charged."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
  });
  it("all buttons are at least 44px tall", async () => {
    render(
      <BuySheet
        product={productById("coins-2500")!}
        returnTo="/daycare-next"
        open
        onClose={() => {}}
      />,
    );
    for (const b of await screen.findAllByRole("button"))
      if (b.textContent?.startsWith("Buy")) expect(b.className).toMatch(/min-h-11|h-11/);
  });
});

describe("coming back from Stripe", () => {
  it("names what arrived", () => {
    expect(addedMessage([{ id: "a", contents: { coins: 8000 }, sign: 1 }])).toBe(
      "+8,000 coins added",
    );
    expect(
      addedMessage([{ id: "a", contents: { shieldStarts: 10, extraLives: 10 }, sign: 1 }]),
    ).toBe("+10 Shield Starts and +10 Extra Lives added");
    expect(addedMessage([{ id: "a", contents: { shieldStarts: 5 }, sign: 1 }])).toBe(
      "+5 Shield Starts added",
    );
  });
  it("after paying, keeps checking until the purchase arrives, then says what was added", async () => {
    window.history.replaceState(null, "", "/daycare-next?checkout=returned&item=coins-8000&x=1");
    let calls = 0;
    const collect = vi.fn(async () =>
      ++calls < 3
        ? { added: [], pending: false }
        : { added: [{ id: "d", contents: { coins: 8000 }, sign: 1 as const }], pending: false },
    );
    renderHook(() =>
      useCheckoutReturn("daycare-next", { collect, refresh: async () => null, delayMs: 0 }),
    );
    await waitFor(() => expect(toasts).toContain("+8,000 coins added"));
    expect(collect).toHaveBeenCalledTimes(3);
    expect(window.location.search).toBe("?x=1");
  });
  it("if it hasn't arrived after the last check, says it's on its way", async () => {
    window.history.replaceState(null, "", "/recess?checkout=returned&item=power-pack");
    const collect = vi.fn(async () => ({ added: [], pending: false }));
    renderHook(() =>
      useCheckoutReturn("recess", { collect, refresh: async () => null, delayMs: 0, tries: 3 }),
    );
    await waitFor(() => expect(toasts).toContain("Payment received — your purchase is on its way"));
    expect(collect).toHaveBeenCalledTimes(3);
  });
  it("looks are confirmed by the account's purchases, not by a delivery", async () => {
    window.history.replaceState(null, "", "/recess?checkout=returned&item=runner-looks");
    const collect = vi.fn(async () => ({ added: [], pending: false }));
    let n = 0;
    const refresh = vi.fn(async () => (++n < 2 ? new Set<string>() : new Set(["runner-looks"])));
    renderHook(() => useCheckoutReturn("recess", { collect, refresh, delayMs: 0 }));
    await waitFor(() => expect(toasts).toContain("Runner Looks Pack unlocked"));
  });
  it("a look confirmed after the return also updates the page, so it shows Equip instead of Buy", async () => {
    window.history.replaceState(null, "", "/recess?checkout=returned&item=runner-looks");
    listEntitlements.mockReset();
    listEntitlements.mockResolvedValueOnce([]); // when the page opens, Stripe hasn't confirmed yet
    listEntitlements.mockResolvedValue([{ product_id: "runner-looks", granted_at: "2026-11-02T17:00:00Z" }]);
    const collect = vi.fn(async () => ({ added: [], pending: false }));
    let n = 0;
    const refresh = vi.fn(async () => (++n < 2 ? new Set<string>() : new Set(["runner-looks"])));
    const { result } = renderHook(
      () => {
        useCheckoutReturn("recess", { collect, refresh, delayMs: 0 });
        return useEntitlementsMaybe();
      },
      { wrapper: ({ children }) => <EntitlementsProvider>{children}</EntitlementsProvider> },
    );
    await waitFor(() => expect(toasts).toContain("Runner Looks Pack unlocked"));
    await waitFor(() => expect(result.current?.owned.has("runner-looks")).toBe(true));
  });
  it("keeps checking when the page is re-mounted right after the return (seen in the browser), and reports once", async () => {
    window.history.replaceState(null, "", "/daycare-next?checkout=returned&item=coins-8000");
    let calls = 0;
    const collect = vi.fn(async () =>
      ++calls < 3
        ? { added: [], pending: false }
        : { added: [{ id: "d", contents: { coins: 8000 }, sign: 1 as const }], pending: false },
    );
    const use = () => useCheckoutReturn("daycare-next", { collect, refresh: async () => null, delayMs: 5 });
    const first = renderHook(use);
    first.unmount(); // the game re-mounts while its first check is still out
    renderHook(use);
    await waitFor(() => expect(toasts).toContain("+8,000 coins added"));
    await new Promise((r) => setTimeout(r, 50));
    expect(toasts.filter((t) => t === "+8,000 coins added")).toHaveLength(1);
    expect(toasts).not.toContain("Payment received — your purchase is on its way");
  });
  it("after backing out, says nothing was charged and checks nothing", async () => {
    window.history.replaceState(null, "", "/daycare-next?checkout=cancelled");
    const collect = vi.fn();
    await act(async () => {
      renderHook(() =>
        useCheckoutReturn("daycare-next", { collect, refresh: async () => null, delayMs: 0 }),
      );
    });
    expect(toasts).toContain("Checkout cancelled — nothing was charged.");
    expect(collect).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});

describe("each buy is its own checkout", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it("a retry in the same sheet sends the same attempt id; opening the sheet again sends a new one", async () => {
    createCheckout.mockResolvedValue({ ok: false, error: "Checkout could not be started — try again" });
    const product = productById("coins-8000")!;
    const { unmount } = render(<BuySheet product={product} returnTo="/daycare-next" open onClose={() => {}} go={() => {}} />);
    const buy = await screen.findByRole("button", { name: "Buy $2.99" });
    await waitFor(() => expect((buy as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(buy);
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((buy as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(buy);
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(2));
    const first = createCheckout.mock.calls[0]![0].data.attempt;
    expect(first).toMatch(UUID);
    expect(createCheckout.mock.calls[1]![0].data.attempt).toBe(first);
    unmount();
    render(<BuySheet product={product} returnTo="/daycare-next" open onClose={() => {}} go={() => {}} />);
    const again = await screen.findByRole("button", { name: "Buy $2.99" });
    await waitFor(() => expect((again as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(again);
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(3));
    expect(createCheckout.mock.calls[2]![0].data.attempt).toMatch(UUID);
    expect(createCheckout.mock.calls[2]![0].data.attempt).not.toBe(first);
  });
});
