// Single source of truth for everything the hub sells. Server code validates checkout and webhook amounts,
// currency and contents against this, never against client input. Spec: docs/superpowers/specs/
// 2026-11-02-in-game-purchases-design.md. Phase 1 products; phases 2 and 3 add the Daycare Shop and the VIP Pass.
export type ProductId =
  | "coins-2500"
  | "coins-8000"
  | "coins-20000"
  | "coins-50000"
  | "coins-150000"
  | "shield-starts-5"
  | "extra-lives-5"
  | "power-pack"
  | "runner-looks"
  | "blue-ribbon-style"
  | "deluxe-daycare-decor";
export type GameId = "daycare-next" | "recess" | "daycare";
/** consumable: delivered once to one installation; looks: an entitlement on the account (restores everywhere). */
export type ProductKind = "consumable" | "looks";
export type Contents = { coins?: number; shieldStarts?: number; extraLives?: number };
export type ReturnPath = "/daycare-next" | "/recess" | "/daycare" | "/shop";

export type PaidProduct = {
  id: ProductId;
  game: GameId;
  kind: ProductKind;
  name: string;
  priceCents: number;
  currency: "usd";
  blurb: string;
  items: string[];
  contents?: Contents;
  returnPath: ReturnPath;
};

const coins = (
  id: ProductId,
  n: number,
  cents: number,
  name = `${n.toLocaleString("en-US")} Coins`,
): PaidProduct => ({
  id,
  game: "daycare-next",
  kind: "consumable",
  name,
  priceCents: cents,
  currency: "usd",
  blurb: `${n.toLocaleString("en-US")} coins for your daycare, added right away.`,
  items: [`${n.toLocaleString("en-US")} coins`],
  contents: { coins: n },
  returnPath: "/daycare-next",
});

export const PAID_PRODUCTS: PaidProduct[] = [
  coins("coins-2500", 2500, 99),
  coins("coins-8000", 8000, 299),
  coins("coins-20000", 20000, 599),
  coins("coins-50000", 50000, 1299),
  coins("coins-150000", 150000, 2999, "Mega Vault (150,000 Coins)"),
  {
    id: "shield-starts-5",
    game: "recess",
    kind: "consumable",
    name: "5 Shield Starts",
    priceCents: 99,
    currency: "usd",
    blurb: "Start a run with a shield already on.",
    items: ["5 Shield Starts"],
    contents: { shieldStarts: 5 },
    returnPath: "/recess",
  },
  {
    id: "extra-lives-5",
    game: "recess",
    kind: "consumable",
    name: "5 Extra Lives",
    priceCents: 99,
    currency: "usd",
    blurb: "Start a run with 4 lives instead of 3.",
    items: ["5 Extra Lives"],
    contents: { extraLives: 5 },
    returnPath: "/recess",
  },
  {
    id: "power-pack",
    game: "recess",
    kind: "consumable",
    name: "Power Pack",
    priceCents: 299,
    currency: "usd",
    blurb: "10 Shield Starts and 10 Extra Lives.",
    items: ["10 Shield Starts", "10 Extra Lives"],
    contents: { shieldStarts: 10, extraLives: 10 },
    returnPath: "/recess",
  },
  {
    id: "runner-looks",
    game: "recess",
    kind: "looks",
    name: "Runner Looks Pack",
    priceCents: 199,
    currency: "usd",
    blurb: "Looks only: a rainbow trail and a rocket cape for your runner pup.",
    items: ["Rainbow Trail", "Rocket Cape"],
    returnPath: "/recess",
  },
  {
    id: "blue-ribbon-style",
    game: "daycare",
    kind: "looks",
    name: "Blue Ribbon Style Pack",
    priceCents: 299,
    currency: "usd",
    blurb: "Show-ring bandanas, ribbon collars and a sparkle trail for Recess Rush.",
    items: ["Blue Ribbon Collar", "Navy Star Bandana", "Sparkle Trail"],
    returnPath: "/daycare",
  },
  {
    id: "deluxe-daycare-decor",
    game: "daycare-next",
    kind: "looks",
    name: "Deluxe Daycare Decor",
    priceCents: 699,
    currency: "usd",
    blurb: "Cosmetic-only theme: cloud beds, paw-print rugs and a lighthouse play fort.",
    items: ["Cloud Beds", "Paw-Print Rug", "Lighthouse Play Fort", "Bubble Machine"],
    returnPath: "/daycare-next",
  },
];

export const PRODUCT_IDS = PAID_PRODUCTS.map((p) => p.id) as [ProductId, ...ProductId[]];
export const productById = (id: string): PaidProduct | undefined =>
  PAID_PRODUCTS.find((p) => p.id === id);
/** Permanent purchases live in `entitlements`; consumables become `deliveries`. */
export const entitles = (p: PaidProduct) => p.kind === "looks";
export const delivers = (p: PaidProduct) => p.kind === "consumable";

export const formatPrice = (p: { priceCents: number }) => `$${(p.priceCents / 100).toFixed(2)}`;
