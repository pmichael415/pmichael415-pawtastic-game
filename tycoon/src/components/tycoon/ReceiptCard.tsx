// The receipt after a pickup (any kind: at the desk, an owner who gave up waiting, closing time, a finished bath):
// what the family said, the itemized bill, and the reputation change. Dismisses itself.
import { X } from "lucide-react";
import { outcomeLine } from "@/tycoon/run";
import type { Outcome } from "@/tycoon/types";
import { Receipt } from "./PickupSheet";

export function ReceiptCard({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  return (
    <section aria-label="Receipt" className="fixed inset-x-0 z-50 mx-auto max-w-md px-3" style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
      <div className="rounded-2xl border border-border bg-card p-3 shadow-pop">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-secondary">{outcomeLine(outcome)}</p>
          <button type="button" aria-label="Close receipt" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Receipt lines={outcome.lines} total={outcome.total} />
        <p className="mt-2 text-xs text-muted-foreground">
          {outcome.repDelta ? `Reputation ${outcome.repDelta > 0 ? "+" : ""}${outcome.repDelta}` : "Reputation unchanged"}
          {outcome.review ? ` · New ${outcome.review.stars}★ review: “${outcome.review.text}”` : ""}
        </p>
      </div>
    </section>
  );
}
