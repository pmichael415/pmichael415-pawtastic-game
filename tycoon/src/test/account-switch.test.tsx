import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

// Controllable session + server entitlement lookups (one pending promise per call).
let currentUser: { id: string } | null = null;
const listeners = new Set<() => void>();
vi.mock("@/lib/auth", async () => {
  const React = await import("react");
  return {
    useSession: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const f = () => force((n) => n + 1);
        listeners.add(f);
        return () => {
          listeners.delete(f);
        };
      }, []);
      return { user: currentUser, session: null, ready: true };
    },
  };
});
const pending: {
  uid: string | null;
  resolve: (rows: { product_id: string }[]) => void;
  reject: (e: Error) => void;
}[] = [];
vi.mock("@/lib/payments/payments.functions", () => ({
  listEntitlements: () =>
    new Promise((resolve, reject) =>
      pending.push({ uid: currentUser?.id ?? null, resolve, reject }),
    ),
}));
import { EntitlementsProvider, useEntitlements } from "@/lib/entitlements";
import { PREFS_KEY } from "@/lib/paidVisuals";

function Probe() {
  const e = useEntitlements();
  return (
    <div data-testid="probe">
      {JSON.stringify({
        status: e.status,
        owned: [...e.owned],
        collar: e.visuals["ribbon-collar"],
        deluxe: e.visuals["deluxe-decor"],
      })}
    </div>
  );
}
const read = () => JSON.parse(screen.getByTestId("probe").textContent!);
const signIn = (id: string | null) =>
  act(() => {
    currentUser = id ? { id } : null;
    listeners.forEach((l) => l());
  });

describe("account switching and paid cosmetics", () => {
  beforeEach(() => {
    pending.length = 0;
    localStorage.clear();
    currentUser = null;
  });

  it("never shows one account's packs for another, even while the new list is loading", async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ "ribbon-collar": true, "deluxe-decor": true }),
    ); // device prefs only
    render(
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>,
    );
    expect(read()).toMatchObject({ status: "guest", collar: false, deluxe: false });
    signIn("user-a");
    await act(async () => {
      pending.at(-1)!.resolve([{ product_id: "blue-ribbon-style" }]);
    });
    expect(read()).toMatchObject({
      status: "ready",
      owned: ["blue-ribbon-style"],
      collar: true,
      deluxe: false,
    });
    signIn("user-b");
    expect(read()).toMatchObject({ status: "loading", owned: [], collar: false }); // cleared immediately
    await act(async () => {
      pending.at(-1)!.resolve([]);
    });
    expect(read()).toMatchObject({ status: "ready", owned: [], collar: false, deluxe: false });
  });

  it("a slow response for the previous account is ignored", async () => {
    render(
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>,
    );
    signIn("user-a");
    const slowA = pending.at(-1)!;
    signIn("user-b");
    const fastB = pending.at(-1)!;
    await act(async () => {
      fastB.resolve([]);
    });
    await act(async () => {
      slowA.resolve([{ product_id: "deluxe-daycare-decor" }]);
    });
    expect(read()).toMatchObject({ status: "ready", owned: [] });
  });

  it("fails closed when ownership can't be verified, and on sign-out", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ "deluxe-decor": true }));
    render(
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>,
    );
    signIn("user-a");
    await act(async () => {
      pending.at(-1)!.reject(new Error("network"));
    });
    expect(read()).toMatchObject({ status: "error", deluxe: false });
    signIn(null);
    expect(read()).toMatchObject({ status: "guest", owned: [], deluxe: false });
  });
});
