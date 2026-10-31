import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, RefreshCw, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth";
import { createCheckout, getPaymentsStatus } from "@/lib/payments/payments.functions";
import { useEntitlements } from "@/lib/entitlements";
import { NAVY_STAR, PAID_ITEMS, type PaidItemId } from "@/lib/paidVisuals";
import { Button } from "@/components/ui/button";
import { FREE_COSMETICS, type GameState } from "@/game/engine";
import { updateSave } from "@/game/store";
import { DogSprite, Logo } from "@/game/sprites";
import { PAID_PRODUCTS, formatPrice } from "@/lib/catalog";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Style Shop & Inventory | PAWtastic Tycoon" },
      { name: "description", content: "Equip free bandanas earned in Recess Rush and preview optional cosmetic packs for PAWtastic Tycoon." },
      { property: "og:title", content: "Style Shop & Inventory | PAWtastic Tycoon" },
      { property: "og:description", content: "Free earned cosmetics plus optional cosmetic packs (coming soon)." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const [s, setS] = useState<GameState | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => setS(updateSave((x) => x)), []);
  const { user } = useSession();
  const [pay, setPay] = useState<{ ready: boolean; reason: string | null }>({ ready: false, reason: "Checking…" });
  const ent = useEntitlements();
  const owned = ent.status === "ready" ? [...ent.owned] : null;
  const [busy, setBusy] = useState(false);
  const [paidPreview, setPaidPreview] = useState<PaidItemId | null>(null);
  useEffect(() => { getPaymentsStatus().then(setPay).catch(() => setPay({ ready: false, reason: "Unavailable" })); }, []);
  const restore = async () => {
    setBusy(true);
    try {
      const n = await ent.refresh();
      if (n === null) toast.error("Couldn't check purchases — try again");
      else toast.success(n ? `Restored ${n} pack(s)` : "No purchases found on this account");
    } finally { setBusy(false); }
  };
  const buy = async (productId: "blue-ribbon-style" | "deluxe-daycare-decor") => {
    setBusy(true);
    try {
      const r = await createCheckout({ data: { productId } });
      if (r.ok) window.location.href = r.url;
      else toast.error(r.error);
    } catch { toast.error("Checkout unavailable"); } finally { setBusy(false); }
  };
  if (!s) return null;
  const equip = (id: string | null) => setS(updateSave((x) => ({ ...x, equipped: id && x.cosmetics.includes(id) ? id : null })));
  const v = ent.visuals;
  const showStar = paidPreview === "navy-star-bandana" || (!preview && !paidPreview && v["navy-star-bandana"]);
  const showCollar = paidPreview === "ribbon-collar" || (!paidPreview && v["ribbon-collar"]);
  const color = showStar ? NAVY_STAR : FREE_COSMETICS.find((c) => c.id === (preview ?? s.equipped))?.color;

  return (
    <main className="space-y-4 px-3 pt-3">
      <header className="flex items-center gap-2">
        <Logo className="h-10 w-auto" />
        <h1 className="font-display text-2xl font-bold text-secondary">Style Shop</h1>
      </header>

      <section className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
        <div className="grid h-24 w-24 place-items-center rounded-2xl bg-sky"><DogSprite breed={0} size={80} bandana={color} star={showStar} collar={showCollar} /></div>
        <div>
          <h2 className="font-display text-lg font-bold text-secondary">Preview</h2>
          <p className="text-sm font-bold text-muted-foreground">{paidPreview ? (paidPreview === "sparkle-trail" ? "Sparkle Trail: ✨✨✨ follows your runner in Recess Rush." : paidPreview === "deluxe-decor" ? "Deluxe decor: ☁️ cloud beds, 🐾 paw-print rug, 🗼 lighthouse fort, 🫧 bubbles in your rooms." : "Previewing a pack item.") : preview ? "Previewing — tap Equip to wear it." : s.equipped ? "Currently equipped on all pups." : "No bandana equipped."}</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-secondary">Inventory · free, earned in Recess Rush</h2>
        <div className="mt-2 grid gap-2">
          {FREE_COSMETICS.map((c) => {
            const owned = s.cosmetics.includes(c.id);
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                <span className="h-8 w-8 rounded-full border-2 border-secondary" style={{ background: c.color }} />
                <div className="flex-1">
                  <div className="font-display font-bold text-secondary">{c.name}</div>
                  <div className="text-xs font-bold text-muted-foreground">{owned ? "Owned" : `Score ${c.unlockScore} in Recess Rush`}</div>
                </div>
                <Button variant="outline" size="sm" onPointerEnter={() => setPreview(c.id)} onClick={() => setPreview(c.id)}>Preview</Button>
                <Button size="sm" disabled={!owned} onClick={() => { equip(s.equipped === c.id ? null : c.id); setPreview(null); }}>
                  {!owned ? <Lock /> : s.equipped === c.id ? "Unequip" : "Equip"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-secondary">Optional cosmetic packs</h2>
        <p className="text-xs font-bold text-muted-foreground">Proposed launch prices. Cosmetic only — every room, upgrade and location is free to earn in-game.</p>
        <div className="mt-2 grid gap-3">
          {PAID_PRODUCTS.map((p) => (
            <article key={p.id} className="rounded-3xl border-2 border-primary bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-secondary">{p.name}</h3>
                <span className="rounded-full bg-secondary px-3 py-1 font-display font-bold text-secondary-foreground">{formatPrice(p)}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-muted-foreground">{p.blurb}</p>
              <ul className="mt-2 flex flex-wrap gap-1">{p.items.map((i) => <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-secondary">{i}</li>)}</ul>
              <div className="mt-2 grid gap-1.5">
                {PAID_ITEMS.filter((it) => it.pack === p.id).map((it) => {
                  const mine = ent.status === "ready" && ent.owned.has(p.id);
                  const on = v[it.id];
                  return (
                    <div key={it.id} className="flex items-center gap-2 rounded-xl bg-muted px-2 py-1.5">
                      <span className="flex-1 text-xs font-bold text-secondary">{it.name}</span>
                      <Button size="sm" variant="ghost" onPointerEnter={() => setPaidPreview(it.id)} onPointerLeave={() => setPaidPreview(null)} onClick={() => setPaidPreview(paidPreview === it.id ? null : it.id)}>Preview</Button>
                      {mine ? (
                        <Button size="sm" variant={on ? "secondary" : "default"} onClick={() => ent.toggle(it.id, !on)}>{on ? "Unequip" : "Equip"}</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled aria-label={`${it.name} locked`}><Lock className="h-3 w-3" /></Button>
                      )}
                    </div>
                  );
                })}
              </div>
              {ent.status === "ready" && ent.owned.has(p.id) ? (
                <p className="mt-2 text-center text-sm font-bold text-success">✓ Owned on your account (server-verified)</p>
              ) : ent.status === "loading" && user ? (
                <Button className="mt-3 w-full" size="lg" disabled>Checking purchases…</Button>
              ) : ent.status === "error" ? (
                <Button className="mt-3 w-full" size="lg" variant="outline" disabled={busy} onClick={restore}>Couldn't verify purchases — retry</Button>
              ) : pay.ready && user ? (
                <Button className="mt-3 w-full" size="lg" disabled={busy} onClick={() => buy(p.id)}>Buy (test mode) {formatPrice(p)}</Button>
              ) : (
                <Button className="mt-3 w-full" size="lg" disabled><Lock /> {pay.ready ? "Sign in to buy" : "Purchases coming soon"}</Button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-card p-4 shadow-soft">
        <h2 className="font-display text-lg font-bold text-secondary">Account & purchases</h2>
        <p className="mt-1 text-sm font-bold text-muted-foreground">Paid packs are tied to your verified account and confirmed by our server, so they follow you across devices. {user ? "" : "You're playing as a guest."}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {user ? <Button variant="secondary" asChild><Link to="/account"><UserRound /> Account</Link></Button> : <Button variant="secondary" asChild><Link to="/account"><UserRound /> Sign in</Link></Button>}
          <Button variant="outline" disabled={!user || busy} onClick={restore}><RefreshCw /> Restore purchases</Button>
        </div>
        <p className="mt-2 text-[11px] font-bold text-muted-foreground">Owned packs: {owned === null ? (!user ? "sign in to see" : ent.status === "error" ? "couldn't verify" : "checking…") : owned.length ? owned.map((id) => PAID_PRODUCTS.find((x) => x.id === id)?.name).join(", ") : "none"}. Game coins have no cash value and can't buy packs.</p>
      </section>
    </main>
  );
}
