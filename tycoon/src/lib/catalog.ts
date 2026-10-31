// Single source of truth for paid cosmetic products. Server code validates
// webhook amounts/currency against this — never against client input.
export type PaidProduct = {
  id: "blue-ribbon-style" | "deluxe-daycare-decor";
  name: string;
  priceCents: number;
  currency: "usd";
  blurb: string;
  items: string[];
};

export const PAID_PRODUCTS: PaidProduct[] = [
  {
    id: "blue-ribbon-style",
    name: "Blue Ribbon Style Pack",
    priceCents: 299,
    currency: "usd",
    blurb: "Show-ring bandanas, ribbon collars and a sparkle trail for Recess Rush.",
    items: ["Blue Ribbon Collar", "Navy Star Bandana", "Sparkle Trail"],
  },
  {
    id: "deluxe-daycare-decor",
    name: "Deluxe Daycare Decor",
    priceCents: 699,
    currency: "usd",
    blurb: "Cosmetic-only theme: cloud beds, paw-print rugs and a lighthouse play fort.",
    items: ["Cloud Beds", "Paw-Print Rug", "Lighthouse Play Fort", "Bubble Machine"],
  },
];

export const formatPrice = (p: PaidProduct) => `$${(p.priceCents / 100).toFixed(2)}`;

