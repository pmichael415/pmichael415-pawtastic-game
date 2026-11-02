// The Shop page says what it sells (review finding): coins, power-ups and looks for real money — not "cosmetics
// only" or "coming soon".
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/payments/payments.functions", () => ({ createCheckout: vi.fn(), getPaymentsStatus: vi.fn(), listEntitlements: vi.fn() }));
import { Route } from "@/routes/shop";
import { SHOP_SUBTITLE } from "@/components/shop/ShopProducts";

describe("the Shop page's words", () => {
  it("its title and description name coins, power-ups and looks, and never say cosmetics only or coming soon", () => {
    const meta = (Route.options.head as () => { meta: Record<string, string>[] })().meta;
    const text = meta.map((m) => m["title"] ?? m["content"] ?? "").join(" | ") + " | " + SHOP_SUBTITLE;
    expect(text).not.toMatch(/coming soon|cosmetics only/i);
    expect(text).toMatch(/coins/i);
    expect(text).toMatch(/power-ups/i);
    expect(text).toMatch(/looks/i);
  });
});
