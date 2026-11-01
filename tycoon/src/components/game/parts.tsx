// Small presentational pieces shared by the daycare screens. Defined at module level (never inside a
// render function) so React keeps the same DOM nodes across clock ticks — taps, focus and drags survive.
import { memo, type ReactNode } from "react";
import type { Dog } from "@/game/engine";
import { traitLabel } from "@/game/engine";
import { DogSprite } from "@/game/sprites";

export function Meter({
  label,
  value,
  tone = "bg-primary",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-[11px] font-bold text-secondary">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div
        className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={`h-full rounded-full transition-all ${value < 35 ? "bg-destructive" : tone}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function Row({
  title,
  sub,
  children,
}: {
  title: ReactNode;
  sub: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold text-secondary">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      {children}
    </div>
  );
}

/** Why something can't be done right now — always shown next to the disabled control. */
export function Reason({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warn" | "danger";
}) {
  if (!children) return null;
  const cls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-secondary"
        : "text-muted-foreground";
  return (
    <p className={`mt-1 text-[11px] font-bold leading-snug ${cls}`} role="note">
      {children}
    </p>
  );
}

export type Looks = { bandana?: string | undefined; star: boolean; collar: boolean };

type ChipProps = {
  dog: Dog;
  selected: boolean;
  passive?: boolean;
  looks: Looks;
  moving: boolean;
  onSelect: (id: string) => void;
  onMouseDrag?: (id: string, x: number, y: number) => void;
};

/** A tappable pup in the list view. Mouse users can also drag it onto a room. */
export const DogChip = memo(function DogChip({
  dog: d,
  selected,
  passive,
  looks,
  moving,
  onSelect,
  onMouseDrag,
}: ChipProps) {
  return (
    <button
      type="button"
      data-dog={d.id}
      aria-label={`${d.name}, ${traitLabel(d)}, happiness ${Math.round(d.happiness)}%${d.checkedIn ? "" : ", waiting for check-in"}`}
      aria-pressed={selected}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && onMouseDrag) onMouseDrag(d.id, e.clientX, e.clientY);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(d.id);
      }}
      className={`flex min-h-[44px] min-w-[44px] flex-col items-center rounded-xl p-0.5 ${passive ? "pointer-events-none opacity-70" : ""} ${selected ? "bg-primary/15 ring-2 ring-primary" : ""}`}
    >
      <DogSprite
        breed={d.breed}
        size={d.size === "small" ? 40 : 54}
        bandana={looks.bandana}
        star={looks.star}
        collar={looks.collar}
        moving={moving}
      />
      <span className="whitespace-nowrap rounded-full bg-card px-1.5 text-[10px] font-bold text-secondary">
        {d.boarding && "🌙"}
        {d.name}
        {d.happiness < 35 ? " 😢" : d.clean < 35 ? " 🟤" : ""}
      </span>
      <span className="text-[9px] font-bold text-muted-foreground">
        {d.size === "small" ? "S" : "L"} · {d.temper === "gentle" ? "🧸 gentle" : "⚡ active"}
      </span>
    </button>
  );
});
