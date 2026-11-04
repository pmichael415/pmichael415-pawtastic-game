// Pickup with a complaint (service design, "Complaints"): the bill as it stands, what went wrong, and the player's
// choices — finish the service while the owner waits, a game-coin refund, or explain (no credit for next time). One checkout.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { refundFor } from "@/tycoon/assess";
import { pickupView, remedy } from "@/tycoon/pickup";
import { checkout } from "@/tycoon/run";
import { fac } from "@/tycoon/state";
import { visitOf } from "@/tycoon/visit";
import type { ActOpts, ActResult } from "@/tycoon/store";
import type { ComplaintKind, RemedyKind, TResult, TycoonState } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;

export function PickupSheet({ state, dogId, exitBath, act, onClose }: { state: TycoonState; dogId: string; exitBath: boolean; act: Act; onClose: () => void }) {
  const [said, setSaid] = useState<string[]>([]);
  const [paid, setPaid] = useState(false);
  const paying = useRef(false);
  const last = useRef<{ dog: NonNullable<ReturnType<typeof fac>["dogs"][number]>; view: ReturnType<typeof pickupView> } | null>(null);
  const f = fac(state);
  const live = f.dogs.find((d) => d.id === dogId);
  // once paid, the sheet shows its last view for a moment (the pup has gone home) so a second tap can't fall through
  if (live) last.current = { dog: live, view: pickupView(state, dogId, exitBath) };
  // collected while the sheet was open (the owner gave up, the bath finished, closing time): close it
  const gone = !live && !paid;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (!last.current || gone) return null;
  const dog = last.current.dog;
  const v = visitOf(f, dog);
  const { assessment: a, options } = last.current.view;
  const daycare = a.lines.find((l) => l.key === "daycare")?.amount ?? 0;
  const label = (kind: ComplaintKind, r: RemedyKind) =>
    r === "finish"
      ? kind === "attention" ? "Quick playtime now" : kind === "dirty" ? "Mop now" : dog.bathing ? "Ask them to wait for the bath" : "Finish the bath now (they'll wait)"
      : r === "refund" ? `Refund ${refundFor(kind, v.paid, daycare)} game coins`
      : "Explain and apologise";
  const answer = (kind: ComplaintKind, r: RemedyKind) => {
    const res = act((s) => remedy(s, dogId, kind, r), { quiet: true });
    if (res.ok && res.msg) setSaid((x) => [...x, res.msg!]);
  };
  const pay = () => {
    if (paying.current) return; // one checkout, however many taps
    paying.current = true;
    const r = act((s) => checkout(s, dogId, exitBath));
    if (r.ok) {
      setPaid(true);
      setTimeout(onClose, 700);
    } else paying.current = false;
  };
  const total = a.total;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-2xl" aria-label={`Pickup — ${dog.name}`}>
        <SheetHeader>
          <SheetTitle>Pickup — {dog.name}</SheetTitle>
          <SheetDescription>{v.owner} is here. Booked {v.requests.join(" + ")}{v.prepaid.length ? ` (${v.prepaid.join(", ")} prepaid)` : ""}.</SheetDescription>
        </SheetHeader>
        <div className="mt-3 space-y-2">
          {a.complaints.map((c) => (
            <div key={c.kind} className={`rounded-xl border p-3 ${c.resolved ? "border-border bg-muted/40" : "border-destructive/40 bg-destructive/5"}`}>
              <p className="text-sm font-semibold text-secondary">{c.text}</p>
              {c.remedy ? (
                <p className="mt-1 text-xs text-muted-foreground">{c.remedy === "finish" && !c.resolved ? "Being finished — they're waiting." : c.resolved ? `Answered (${c.remedy}).` : `Answered (${c.remedy}) — but they're not satisfied.`}</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(options[c.kind] ?? []).map((r) => (
                    <Button key={r} variant={r === "explain" ? "ghost" : "outline"} className="h-11 justify-start" onClick={() => answer(c.kind, r)}>
                      {label(c.kind, r)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {said.map((t, i) => (
            <p key={i} className="rounded-xl bg-sky px-3 py-2 text-sm text-secondary">{t}</p>
          ))}
        </div>
        <Receipt lines={a.lines} total={total} />
        <Button className="mt-3 h-12 w-full font-display" disabled={!!v.finishing || paid} onClick={pay}>
          {paid ? "Paid — goodbye!" : v.finishing ? "Waiting for the bath…" : total > 0 ? `Charge ${total} & say goodbye` : total === 0 ? "No charge — say goodbye" : `Refund ${-total} & say goodbye`}
        </Button>
        {v.finishing && <p className="mt-2 text-center text-xs text-muted-foreground">{dog.name} goes home with {v.owner} as soon as the bath is done.</p>}
      </SheetContent>
    </Sheet>
  );
}

export function Receipt({ lines, total }: { lines: { label: string; amount: number }[]; total: number }) {
  return (
    <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-card px-3 text-sm">
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-2 py-1.5">
          <dt className={l.amount ? "text-secondary" : "text-muted-foreground"}>{l.label}</dt>
          <dd className="tabular-nums text-secondary">{l.amount ? (l.amount > 0 ? `+${l.amount}` : l.amount) : "—"}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-2 py-1.5 font-bold">
        <dt className="text-secondary">Total</dt>
        <dd className="tabular-nums text-secondary">{total}</dd>
      </div>
    </dl>
  );
}
