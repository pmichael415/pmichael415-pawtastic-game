// Recess Rush's start screen (spec: "Buying inside a game"): the power-ups to switch on for this run, "Get more",
// and the runner looks with Equip or Buy. Power-ups are used when the run starts (startRun), one of each at most.
import { formatPrice, productById } from "@/lib/catalog";

type PowerKey = "shield" | "life";
type LookId = "rainbow-trail" | "rocket-cape";
export type RunStartBuy = "power-pack" | "shield-starts-5" | "extra-lives-5" | "runner-looks";

const POWER: { key: PowerKey; name: string; does: string; label: string }[] = [
  { key: "shield", name: "Shield Start", does: "Start this run with a shield on.", label: "Use a Shield Start this run" },
  { key: "life", name: "Extra Life", does: "Start this run with 4 lives instead of 3.", label: "Use an Extra Life this run" },
];
const LOOKS: { id: LookId; name: string }[] = [
  { id: "rainbow-trail", name: "Rainbow Trail" },
  { id: "rocket-cape", name: "Rocket Cape" },
];

export function RunStart({
  counts,
  use,
  onUse,
  onBuy,
  looks,
  onEquip,
}: {
  counts: { shield: number; life: number };
  use: { shield: boolean; life: boolean };
  onUse: (k: PowerKey, on: boolean) => void;
  onBuy: (id: RunStartBuy) => void;
  looks: { owned: boolean } & Record<LookId, boolean>;
  onEquip: (id: LookId, on: boolean) => void;
}) {
  const pack = productById("runner-looks")!;
  return (
    <div className="mt-3 space-y-3 text-left">
      <section aria-label="Power-ups" className="rounded-2xl border border-border bg-card p-3">
        <h3 className="font-display text-base font-bold text-secondary">Power-ups</h3>
        <ul className="mt-1 space-y-1">
          {POWER.map((p) => {
            const left = counts[p.key];
            const on = use[p.key] && left > 0;
            return (
              <li key={p.key} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-secondary">{`${p.name} · ${left} left`}</p>
                  <p className="text-xs text-muted-foreground">{p.does}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={p.label}
                  disabled={left <= 0}
                  onClick={() => onUse(p.key, !on)}
                  className={`min-h-11 min-w-16 shrink-0 rounded-xl border px-3 text-sm font-bold disabled:opacity-40 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-secondary"}`}
                >
                  {on ? "On" : "Off"}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => onBuy("power-pack")}
          aria-label="Get more power-ups"
          className="mt-2 min-h-11 w-full rounded-xl border border-primary text-sm font-bold text-primary"
        >
          Get more
        </button>
      </section>
      <section aria-label="Runner looks" className="rounded-2xl border border-border bg-card p-3">
        <h3 className="font-display text-base font-bold text-secondary">Runner looks</h3>
        {looks.owned ? (
          <ul className="mt-1 space-y-1">
            {LOOKS.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm font-semibold text-secondary">{l.name}</span>
                <button
                  type="button"
                  onClick={() => onEquip(l.id, !looks[l.id])}
                  aria-label={`${looks[l.id] ? "Unequip" : "Equip"} ${l.name}`}
                  className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-sm font-bold text-secondary"
                >
                  {looks[l.id] ? "Unequip" : "Equip"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => onBuy("runner-looks")}
            aria-label={`${pack.name}, ${formatPrice(pack)}`}
            className="mt-1 min-h-11 w-full rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground"
          >
            {`Rainbow Trail + Rocket Cape · ${formatPrice(pack)}`}
          </button>
        )}
      </section>
    </div>
  );
}
