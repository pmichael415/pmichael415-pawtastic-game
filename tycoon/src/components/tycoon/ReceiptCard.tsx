// The receipt after a pickup (any kind: at the desk, an owner who gave up waiting, closing time, a finished bath):
// what the family said, what they paid and the reputation change, with the itemized bill a tap away. Dismisses itself.
import { X } from "lucide-react";
import { outcomeLine } from "@/tycoon/run";
import type { Outcome } from "@/tycoon/types";
import { Receipt } from "./PickupSheet";

export function ReceiptCard({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  return (
    // Taps pass through the card (only its close button takes them), so it never blocks the daycare underneath.
    <section aria-label="Receipt" className="pointer-events-none fixed inset-x-0 z-50 mx-auto max-w-md px-3" style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
      <div className="rounded-2xl border border-border bg-card/95 p-3 shadow-pop">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-secondary">{outcomeLine(outcome)}</p>
          <button type="button" aria-label="Close receipt" onClick={onClose} className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs font-semibold text-secondary">
          {outcome.total > 0 ? `Paid ${outcome.total}` : outcome.total < 0 ? `Refunded ${-outcome.total}` : "No charge"} · {outcome.repDelta ? `Reputation ${outcome.repDelta > 0 ? "+" : ""}${outcome.repDelta}` : "Reputation unchanged"}
          {outcome.review ? ` · New ${outcome.review.stars}★ review` : ""}
        </p>
        {/* compact on a phone: the itemized bill opens on tap (it used to cover the buttons underneath) */}
        <details className="pointer-events-auto mt-1">
          <summary className="min-h-8 cursor-pointer text-xs font-semibold text-primary">See the bill</summary>
          <Receipt lines={outcome.lines} total={outcome.total} />
          {outcome.review && <p className="mt-2 text-xs text-muted-foreground">“{outcome.review.text}”</p>}
        </details>
      </div>
    </section>
  );
}
