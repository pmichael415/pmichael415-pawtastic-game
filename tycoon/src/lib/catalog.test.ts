// The catalog is the only source of prices and contents: checkout, the webhook and the in-game buy sheets read it.
import { describe, expect, it } from "vitest";
import { PAID_PRODUCTS, PRODUCT_IDS, delivers, entitles, productById } from "./catalog";

const PRICES: Record<string, number> = {
  "coins-2500": 99,
  "coins-8000": 299,
  "coins-20000": 599,
  "coins-50000": 1299,
  "coins-150000": 2999,
  "shield-starts-5": 99,
  "extra-lives-5": 99,
  "power-pack": 299,
  "runner-looks": 199,
  "blue-ribbon-style": 299,
  "deluxe-daycare-decor": 699,
};

describe("the hub catalog", () => {
  it("has exactly the phase 1 products, at the owner's prices", () => {
    expect([...PRODUCT_IDS].sort()).toEqual(Object.keys(PRICES).sort());
    for (const [id, cents] of Object.entries(PRICES)) {
      expect(productById(id)?.priceCents).toBe(cents);
      expect(productById(id)?.currency).toBe("usd");
    }
  });
  it("says what each consumable gives", () => {
    expect(productById("coins-2500")?.contents).toEqual({ coins: 2500 });
    expect(productById("coins-8000")?.contents).toEqual({ coins: 8000 });
    expect(productById("coins-20000")?.contents).toEqual({ coins: 20000 });
    expect(productById("coins-50000")?.contents).toEqual({ coins: 50000 });
    expect(productById("coins-150000")?.contents).toEqual({ coins: 150000 });
    expect(productById("shield-starts-5")?.contents).toEqual({ shieldStarts: 5 });
    expect(productById("extra-lives-5")?.contents).toEqual({ extraLives: 5 });
    expect(productById("power-pack")?.contents).toEqual({ shieldStarts: 10, extraLives: 10 });
  });
  it("returns each buyer to the game it belongs to", () => {
    for (const id of ["coins-2500", "coins-8000", "coins-20000", "coins-50000", "coins-150000", "deluxe-daycare-decor"])
      expect(productById(id)).toMatchObject({ game: "daycare-next", returnPath: "/daycare-next" });
    for (const id of ["shield-starts-5", "extra-lives-5", "power-pack", "runner-looks"])
      expect(productById(id)).toMatchObject({ game: "recess", returnPath: "/recess" });
    expect(productById("blue-ribbon-style")).toMatchObject({ game: "daycare", returnPath: "/daycare" });
  });
  it("looks are entitlements without contents; consumables are deliveries with contents", () => {
    for (const p of PAID_PRODUCTS) {
      if (p.kind === "looks") {
        expect(p.contents).toBeUndefined();
        expect(entitles(p) && !delivers(p)).toBe(true);
      } else {
        expect(p.kind).toBe("consumable");
        expect(p.contents && Object.values(p.contents).every((n) => Number.isInteger(n) && n > 0)).toBe(true);
        expect(delivers(p) && !entitles(p)).toBe(true);
      }
    }
    expect(["blue-ribbon-style", "deluxe-daycare-decor", "runner-looks"].map((id) => productById(id)?.kind)).toEqual(["looks", "looks", "looks"]);
  });
  it("knows nothing it doesn't sell", () => {
    expect(productById("free-stuff")).toBeUndefined();
    expect(productById("__proto__")).toBeUndefined();
  });
});
