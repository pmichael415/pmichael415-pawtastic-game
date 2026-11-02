// The hub Shop tab's product list: everything the games sell, grouped by game (spec: "The hub Shop tab lists
// everything, grouped by game"). Buying opens the shared buy sheet; the route passes owned looks and extras.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PAID_PRODUCTS, formatPrice, type GameId, type PaidProduct } from "@/lib/catalog";

export const SHOP_SUBTITLE = "Coins, power-ups and looks";

export const SHOP_GROUPS: { game: GameId; title: string; blurb: string }[] = [
  { game: "daycare-next", title: "New Daycare", blurb: "Coins go straight into your daycare." },
  { game: "recess", title: "Recess Rush", blurb: "Power-ups are used one per run; looks are yours to keep." },
  { game: "daycare", title: "Today's Daycare", blurb: "Looks for your pups." },
];

export function ShopProducts({
  owned,
  onBuy,
  extra,
}: {
  owned: ReadonlySet<string> | null;
  onBuy: (p: PaidProduct) => void;
  extra?: (p: PaidProduct) => ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">
        Real money, charged by Stripe. Coins and power-ups go into the game; looks stay on your account. Every room,
        upgrade and location is still free to earn by playing.
      </p>
      {SHOP_GROUPS.map((g) => (
        <section key={g.game} aria-label={g.title}>
          <h3 className="font-display text-base font-bold text-secondary">{g.title}</h3>
          <p className="text-xs text-muted-foreground">{g.blurb}</p>
          <div className="mt-2 grid gap-3">
            {PAID_PRODUCTS.filter((p) => p.game === g.game).map((p) => {
              const mine = p.kind === "looks" && !!owned?.has(p.id);
              return (
                <article key={p.id} className="rounded-2xl border border-primary/40 bg-card p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-display text-lg font-bold text-secondary">{p.name}</h4>
                    <span className="rounded-full bg-secondary px-3 py-1 font-display font-bold text-secondary-foreground">{formatPrice(p)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {p.items.map((i) => (
                      <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-secondary">
                        {i}
                      </li>
                    ))}
                  </ul>
                  {extra?.(p)}
                  {mine ? (
                    <p className="mt-2 text-center text-sm font-bold text-success">✓ Owned on your account (server-verified)</p>
                  ) : (
                    <Button className="mt-3 min-h-11 w-full" size="lg" onClick={() => onBuy(p)}>
                      {`Buy ${formatPrice(p)}`}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
