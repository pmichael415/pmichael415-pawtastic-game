// The one buy sheet every game uses (spec: "Buying inside a game"). Shows what the item gives, its price and that
// it is real money; signed-out players sign in first; Stripe Checkout opens in this tab and returns to `returnTo`.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { formatPrice, type PaidProduct, type ReturnPath } from "@/lib/catalog";
import { createCheckout, getPaymentsStatus } from "@/lib/payments/payments.functions";

export const REAL_MONEY = "Real money — charged by Stripe to your card.";
export const PAUSED = "Purchases are paused right now — nothing can be charged.";

export function BuySheet({
  product,
  returnTo,
  open,
  onClose,
  go = (url: string) => window.location.assign(url),
}: {
  product: PaidProduct;
  returnTo: ReturnPath;
  open: boolean;
  onClose: () => void;
  go?: (url: string) => void;
}) {
  const { user } = useSession();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    getPaymentsStatus()
      .then((s) => live && setReady(!!s.ready))
      .catch(() => live && setReady(false));
    return () => {
      live = false;
    };
  }, [open]);

  const buy = async () => {
    setBusy(true);
    track("checkout_start", { product: product.id });
    try {
      const r = await createCheckout({ data: { productId: product.id, returnTo } });
      if (r.ok) go(r.url);
      else {
        track("client_error", { where: `${returnTo} checkout`, message: r.error.replace(/^Checkout could not be started — /, "") });
        toast.error(r.error, { duration: 15000 });
      }
    } catch {
      toast.error("Checkout could not be started — try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>{product.blurb}</SheetDescription>
        </SheetHeader>
        <ul className="mt-2 flex flex-wrap gap-1">
          {product.items.map((i) => (
            <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-secondary">
              {i}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-display text-2xl font-bold text-secondary">{formatPrice(product)}</p>
        <p className="text-xs font-medium text-muted-foreground">{REAL_MONEY}</p>
        <div className="mt-3">
          {!user ? (
            <Button asChild className="min-h-11 w-full" size="lg">
              <Link to="/account">Sign in to buy</Link>
            </Button>
          ) : ready === false ? (
            <p className="rounded-xl bg-muted p-3 text-center text-sm font-semibold text-secondary">{PAUSED}</p>
          ) : (
            <Button className="min-h-11 w-full" size="lg" disabled={busy || ready === null} onClick={buy}>
              {`Buy ${formatPrice(product)}`}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
