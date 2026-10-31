import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  Cloud,
  CloudOff,
  Loader2,
  Settings as Gear,
  TriangleAlert,
} from "lucide-react";
import { Logo } from "@/game/sprites";
import { useSession } from "@/lib/auth";
import { useLink, useSyncStatus } from "@/game/cloud";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { setSettings, useSettings, type ViewMode } from "@/lib/settings";

/** Account + cloud-save state in plain words, shown in every game's header. */
export function SaveStatus() {
  const { user, ready } = useSession();
  const link = useLink();
  const st = useSyncStatus();
  if (!ready)
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking account…
      </span>
    );
  if (!user)
    return (
      <span className="inline-flex items-center gap-1">
        <CloudOff className="h-3 w-3" /> Guest · saved on this device
      </span>
    );
  if (!link || link.userId !== user.id)
    return (
      <Link to="/account" className="inline-flex min-h-6 items-center gap-1 underline">
        <Cloud className="h-3 w-3" /> Signed in · choose a save to sync
      </Link>
    );
  if (st.kind === "syncing")
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
      </span>
    );
  if (st.kind === "error")
    return (
      <Link to="/account" className="inline-flex items-center gap-1 text-destructive underline">
        <TriangleAlert className="h-3 w-3" /> Cloud save error — retrying
      </Link>
    );
  if (st.kind === "conflict")
    return (
      <Link to="/account" className="inline-flex items-center gap-1 text-destructive underline">
        <TriangleAlert className="h-3 w-3" /> Newer save on another device — choose
      </Link>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Cloud className="h-3 w-3" /> Signed in · cloud save on
    </span>
  );
}

export function GameHeader({
  title,
  subtitle,
  children,
  back = true,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  back?: boolean;
}) {
  return (
    <header className="flex items-center gap-2">
      {back && (
        <Link
          to="/"
          aria-label="Back to PAWtastic Games home"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-secondary shadow-soft"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
      )}
      <Logo className="h-10 w-auto" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-bold leading-tight text-secondary">
          {title}
        </h1>
        <p className="truncate text-[11px] font-bold text-muted-foreground">
          {subtitle ? `${subtitle} · ` : ""}
          <SaveStatus />
        </p>
      </div>
      {children}
      <SettingsSheet />
    </header>
  );
}

export function SettingsSheet() {
  const s = useSettings();
  const views: { v: ViewMode; label: string }[] = [
    { v: "overhead", label: "Overhead" },
    { v: "walk", label: "Walk (first person)" },
    { v: "list", label: "List only" },
  ];
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-secondary shadow-soft"
        >
          <Gear className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="font-display text-secondary">Settings</SheetTitle>
          <SheetDescription>
            Saved on this device and shared by every PAWtastic game.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-secondary">
          <fieldset>
            <legend className="text-sm font-extrabold">Daycare camera</legend>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {views.map((x) => (
                <button
                  key={x.v}
                  type="button"
                  onClick={() => setSettings({ view: x.v })}
                  aria-pressed={s.view === x.v}
                  className={`min-h-11 rounded-xl px-2 text-sm font-extrabold ${s.view === x.v ? "bg-secondary text-secondary-foreground" : "bg-muted"}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-extrabold">
            Look sensitivity ({s.lookSpeed.toFixed(1)}×)
            <Slider
              className="mt-3"
              min={0.5}
              max={2}
              step={0.1}
              value={[s.lookSpeed]}
              onValueChange={(v) => setSettings({ lookSpeed: v[0] ?? 1 })}
              aria-label="Look sensitivity"
            />
          </label>
          {(
            [
              ["invertLook", "Invert up/down look"],
              ["reducedMotion", "Reduce motion (less bobbing & shaking)"],
              ["lowPower", "Battery saver graphics"],
              ["analytics", "Share anonymous gameplay stats (no name, email or location)"],
            ] as const
          ).map(([k, label]) => (
            <label
              key={k}
              className="flex min-h-11 items-center justify-between gap-3 text-sm font-extrabold"
            >
              {label}
              <Switch checked={s[k]} onCheckedChange={(v) => setSettings({ [k]: v })} />
            </label>
          ))}
          <p className="text-xs font-bold text-muted-foreground">
            Battery saver and reduced motion apply the next time the 3D view opens.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/help"
              className="grid min-h-11 place-items-center rounded-xl bg-muted text-sm font-extrabold"
            >
              How to play
            </Link>
            <Link
              to="/account"
              className="grid min-h-11 place-items-center rounded-xl bg-muted text-sm font-extrabold"
            >
              Account & saves
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
