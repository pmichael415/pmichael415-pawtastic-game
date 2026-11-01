// One-time trophies with small coin rewards. They reward playing, never spending.
import { TROPHIES } from "@/tycoon/trophies";
import type { TycoonState } from "@/tycoon/types";

export function TrophyShelf({ state }: { state: TycoonState }) {
  const won = TROPHIES.filter((t) => state.trophies.includes(t.id)).length;
  return (
    <section aria-label="Trophy shelf" className="mt-4">
      <h3 className="font-semibold text-secondary">
        Trophy shelf · {won}/{TROPHIES.length}
      </h3>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {TROPHIES.map((t) => {
          const has = state.trophies.includes(t.id);
          return (
            <li key={t.id} className={`rounded-xl border p-2 text-sm ${has ? "border-accent bg-accent/30" : "border-border opacity-60"}`}>
              <p className="font-semibold text-secondary">
                <span aria-hidden>{has ? "🏆 " : "🔒 "}</span>
                <span>{t.name}</span>
                <span className="sr-only">{has ? " (won)" : " (not yet)"}</span>
              </p>
              <p className="text-xs text-muted-foreground">+{t.reward} coins</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
