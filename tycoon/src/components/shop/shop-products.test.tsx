// The hub Shop tab: everything the games sell, grouped by game, at the catalog's prices, bought with real money.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ShopProducts } from "./ShopProducts";

const groups: [string, [string, string][]][] = [
  ["New Daycare", [["2,500 Coins", "$0.99"], ["8,000 Coins", "$2.99"], ["20,000 Coins", "$5.99"], ["50,000 Coins", "$12.99"], ["Mega Vault (150,000 Coins)", "$29.99"], ["Deluxe Daycare Decor", "$6.99"]]],
  ["Recess Rush", [["5 Shield Starts", "$0.99"], ["5 Extra Lives", "$0.99"], ["Power Pack", "$2.99"], ["Runner Looks Pack", "$1.99"]]],
  ["Today's Daycare", [["Blue Ribbon Style Pack", "$2.99"]]],
];

describe("the Shop tab", () => {
  it("groups every product by its game, at its price", () => {
    render(<ShopProducts owned={new Set()} onBuy={() => {}} />);
    for (const [title, items] of groups) {
      const section = screen.getByRole("region", { name: title });
      for (const [name, price] of items) {
        const card = within(section).getByRole("heading", { name }).closest("article")!;
        expect(within(card).getByRole("button", { name: `Buy ${price}` })).toBeTruthy();
      }
    }
  });
  it("is real money, never 'test mode' or 'proposed' prices", () => {
    const { container } = render(<ShopProducts owned={new Set()} onBuy={() => {}} />);
    expect(container.textContent).not.toMatch(/test mode|Proposed launch prices/i);
    expect(screen.getByText(/Real money, charged by Stripe/)).toBeTruthy();
  });
  it("Buy hands the product to the buy sheet", () => {
    const onBuy = vi.fn();
    render(<ShopProducts owned={new Set()} onBuy={onBuy} />);
    const card = screen.getByRole("heading", { name: "Power Pack" }).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Buy $2.99" }));
    expect(onBuy.mock.calls[0]![0].id).toBe("power-pack");
  });
  it("owned looks show as owned instead of a Buy button", () => {
    render(<ShopProducts owned={new Set(["runner-looks"])} onBuy={() => {}} />);
    const card = screen.getByRole("heading", { name: "Runner Looks Pack" }).closest("article")!;
    expect(within(card).getByText("✓ Owned on your account (server-verified)")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /^Buy/ })).toBeNull();
  });
});
