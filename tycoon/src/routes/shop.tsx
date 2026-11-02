import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, RefreshCw, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useEntitlements } from "@/lib/entitlements";
import { NAVY_STAR, PAID_ITEMS, type PaidItemId } from "@/lib/paidVisuals";
import { Button } from "@/components/ui/button";
import { FREE_COSMETICS, type GameState } from "@/game/engine";
import { updateSave } from "@/game/store";
import { DogSprite } from "@/game/sprites";
import { GameHeader } from "@/components/game/GameHeader";
import { productById, type PaidProduct } from "@/lib/catalog";
import { SHOP_SUBTITLE, ShopProducts } from "@/components/shop/ShopProducts";
import { BuySheet } from "@/components/purchases/BuySheet";
import { useCheckoutReturn } from "@/components/purchases/useCheckoutReturn";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop: coins, power-ups & looks | PAWtastic Games" },
      { name: "description", content: "Coins for the new Daycare, power-ups and looks for Recess Rush, and looks for your pups — real money, charged by Stripe. Bandanas you earned in Recess Rush are here too, free." },
      { property: "og:title", content: "Shop: coins, power-ups & looks | PAWtastic Games" },
      { property: "og:description", content: "Coins, power-ups and looks for the PAWtastic games, plus free bandanas earned by playing." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const [s, setS] = useState<GameState | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => setS(updateSave((x) => x)), []);
  const { user } = useSession();
  const [buying, setBuying] = useState<PaidProduct | null>(null);
  useCheckoutReturn("daycare"); // looks bought here confirm through the account; games collect their own on open
  const ent = useEntitlements();
  const owned = ent.status === "ready" ? [...ent.owned] : null;
  const [busy, setBusy] = useState(false);
  const [paidPreview, setPaidPreview] = useState<PaidItemId | null>(null);
  const restore = async () => {
    setBusy(true);
    try {
      const n = await ent.refresh();
      track("restore_result", { ok: n !== null, count: n ?? 0 });
      if (n === null) toast.error("Couldn't check purchases — try again");
      else toast.success(n ? `Restored ${n} pack(s)` : "No purchases found on this account");
    } finally { setBusy(false); }
  };
  if (!s) return null;
  const equip = (id: string | null) => setS(updateSave((x) => ({ ...x, equipped: id && x.cosmetics.includes(id) ? id : null })));
  const v = ent.visuals;
  const showStar = paidPreview === "navy-star-bandana" || (!preview && !paidPreview && v["navy-star-bandana"]);
  const showCollar = paidPreview === "ribbon-collar" || (!paidPreview && v["ribbon-collar"]);
  const color = showStar ? NAVY_STAR : FREE_COSMETICS.find((c) => c.id === (preview ?? s.equipped))?.color;

  return (
    <main className="space-y-4 px-3 pt-3">
      <GameHeader title="Shop" subtitle={SHOP_SUBTITLE} />

      <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="grid h-24 w-24 place-items-center rounded-2xl bg-sky"><DogSprite breed={0} size={80} bandana={color} star={showStar} collar={showCollar} /></div>
        <div>
          <h2 className="font-display text-lg font-bold text-secondary">Preview</h2>
          <p className="text-sm text-muted-foreground">{paidPreview ? (paidPreview === "sparkle-trail" ? "Sparkle Trail: ✨✨✨ follows your runner in Recess Rush." : paidPreview === "deluxe-decor" ? "Deluxe decor: ☁️ cloud beds, 🐾 paw-print rug, 🗼 lighthouse fort, 🫧 bubbles in your rooms." : "Previewing a pack item.") : preview ? "Previewing — tap Equip to wear it." : s.equipped ? "Currently equipped on all pups." : "No bandana equipped."}</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-secondary">Inventory · free, earned across PAWtastic Games</h2>
        <div className="mt-2 grid gap-2">
          {FREE_COSMETICS.map((c) => {
            const owned = s.cosmetics.includes(c.id);
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
                <span className="h-8 w-8 rounded-full border-2 border-secondary" style={{ background: c.color }} />
                <div className="flex-1">
                  <div className="font-display font-bold text-secondary">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{owned ? "Owned" : c.how}</div>
                </div>
                <Button variant="outline" size="sm" className="min-h-11" onPointerEnter={() => setPreview(c.id)} onClick={() => setPreview(c.id)}>Preview</Button>
                <Button size="sm" className="min-h-11" disabled={!owned} onClick={() => { equip(s.equipped === c.id ? null : c.id); setPreview(null); }}>
                  {!owned ? <Lock /> : s.equipped === c.id ? "Unequip" : "Equip"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="In-game purchases">
        <h2 className="font-display text-lg font-bold text-secondary">In-game purchases</h2>
        <ShopProducts
          owned={ent.status === "ready" ? ent.owned : null}
          onBuy={setBuying}
          extra={(p) =>
            p.kind === "looks" ? (
              <div className="mt-2 grid gap-1.5">
                {PAID_ITEMS.filter((it) => it.pack === p.id).map((it) => {
                  const mine = ent.status === "ready" && ent.owned.has(p.id);
                  const on = v[it.id];
                  return (
                    <div key={it.id} className="flex items-center gap-2 rounded-xl bg-muted px-2 py-1.5">
                      <span className="flex-1 text-xs font-bold text-secondary">{it.name}</span>
                      <Button size="sm" variant="ghost" className="min-h-11" onPointerEnter={() => setPaidPreview(it.id)} onPointerLeave={() => setPaidPreview(null)} onClick={() => { track("shop_preview", { item: it.id }); setPaidPreview(paidPreview === it.id ? null : it.id); }}>Preview</Button>
                      {mine ? (
                        <Button size="sm" className="min-h-11" variant={on ? "secondary" : "default"} onClick={() => ent.toggle(it.id, !on)}>{on ? "Unequip" : "Equip"}</Button>
                      ) : (
                        <Button size="sm" className="min-h-11" variant="outline" disabled aria-label={`${it.name} locked`}><Lock className="h-3 w-3" /></Button>
                      )}
                    </div>
                  );
                })}
                {(p.id === "deluxe-daycare-decor" || p.id === "blue-ribbon-style") && (
                  <Button asChild variant="secondary" className="min-h-11 w-full" onClick={() => track("shop_preview", { item: `${p.id}-3d` })}>
                    <Link to="/daycare" search={{ preview: p.id === "deluxe-daycare-decor" ? "deluxe" : "ribbon" }}>👀 Preview in my 3D daycare</Link>
                  </Button>
                )}
              </div>
            ) : null
          }
        />
      </section>
      {buying && <BuySheet product={buying} returnTo="/shop" open onClose={() => setBuying(null)} />}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <h2 className="font-display text-lg font-bold text-secondary">Account & purchases</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paid packs are tied to your verified account and confirmed by our server, so they follow you across devices. {user ? "" : "You're playing as a guest."}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {user ? <Button variant="secondary" asChild><Link to="/account"><UserRound /> Account</Link></Button> : <Button variant="secondary" asChild><Link to="/account"><UserRound /> Sign in</Link></Button>}
          <Button variant="outline" disabled={!user || busy} onClick={restore}><RefreshCw /> Restore purchases</Button>
        </div>
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">Owned packs: {owned === null ? (!user ? "sign in to see" : ent.status === "error" ? "couldn't verify" : "checking…") : owned.length ? owned.map((id) => productById(id)?.name ?? id).join(", ") : "none"}. Game coins have no cash value and can't buy packs.</p>
      </section>
    </main>
  );
}
