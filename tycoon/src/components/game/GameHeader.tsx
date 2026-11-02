import type { ReactNode } from "react";
import { SoundToggle } from "./SoundToggle";
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
import { ShareButton } from "./ShareSheet";
import { openTeamPicker } from "./TeamPicker";
import { useSession } from "@/lib/auth";
import { overall, useLinks, useStatuses } from "@/game/cloud";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { NotifySettings } from "./NotifySettings";
import { EmailUpdates } from "./EmailUpdates";
import { Slider } from "@/components/ui/slider";
import { setSettings, useSettings, type ViewMode } from "@/lib/settings";

/** Account + cloud-save state in plain words, shown in every game's header. */
export function SaveStatus() {
  const { user, ready } = useSession();
  const links = useLinks();
  const kind = overall(useStatuses());
  const row = (icon: ReactNode, text: string, cls = "") => (
    <span className={`inline-flex items-center gap-1 ${cls}`}>{icon} {text}</span>
  );
  if (!ready) return row(<Loader2 className="h-3 w-3 animate-spin" />, "Checking account…");
  if (!user) return row(<CloudOff className="h-3 w-3" />, "Guest · not backed up");
  if (!links || links.userId !== user.id) return row(<Loader2 className="h-3 w-3 animate-spin" />, "Signed in · loading your saves");
  if (kind === "conflict") return row(<TriangleAlert className="h-3 w-3" />, "Choose which progress to keep", "text-destructive");
  if (kind === "error") return row(<TriangleAlert className="h-3 w-3" />, "Cloud save error — retrying", "text-destructive");
  if (kind === "syncing") return row(<Loader2 className="h-3 w-3 animate-spin" />, "Saving…");
  return row(<Cloud className="h-3 w-3" />, "Signed in · cloud saves on");
}

export function GameHeader({
  title,
  subtitle,
  children,
  back = true,
  sound = false,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  back?: boolean;
  /** A game with sound (the new Daycare, Recess Rush): a mute button, and the Sound effects and Music switches. */
  sound?: boolean;
}) {
  return (
    <header className="flex items-center gap-2">
      {back && (
        <Link
          to="/"
          aria-label="Back to PAWtastic Games home"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-secondary"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
      )}
      <Logo className="h-10 w-auto" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-bold leading-tight text-secondary">
          {title}
        </h1>
        <p className="truncate text-[11px] font-medium text-muted-foreground">
          {subtitle ? `${subtitle} · ` : ""}
          <SaveStatus />
        </p>
      </div>
      {children}
      {sound && <SoundToggle />}
      <ShareButton />
      <SettingsSheet sound={sound} />
    </header>
  );
}

type SwitchKey = "invertLook" | "sound" | "music" | "reducedMotion" | "lowPower" | "analytics";
/** The on/off settings. Sound and Music appear in games that have sound (the new Daycare and Recess Rush). */
export function settingsSwitches(sound: boolean): [SwitchKey, string][] {
  return [
    ["invertLook", "Invert up/down look"],
    ...(sound ? ([["sound", "Sound effects"], ["music", "Music"]] as [SwitchKey, string][]) : []),
    ["reducedMotion", "Reduce motion (less bobbing & shaking)"],
    ["lowPower", "Battery saver graphics"],
    ["analytics", "Share anonymous gameplay stats (no name, email or location)"],
  ];
}

export function SettingsSheet({ sound = false }: { sound?: boolean } = {}) {
  const s = useSettings();
  const { user } = useSession();
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-secondary"
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
            <legend className="text-sm font-bold">Daycare camera</legend>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {views.map((x) => (
                <button
                  key={x.v}
                  type="button"
                  onClick={() => setSettings({ view: x.v })}
                  aria-pressed={s.view === x.v}
                  className={`min-h-11 rounded-xl px-2 text-sm font-bold ${s.view === x.v ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-bold">
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
          {settingsSwitches(sound).map(([k, label]) => (
            <label
              key={k}
              className="flex min-h-11 items-center justify-between gap-3 text-sm font-bold"
            >
              {label}
              <Switch checked={s[k]} onCheckedChange={(v) => setSettings({ [k]: v })} />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Battery saver and reduced motion apply the next time the 3D view opens.
          </p>
          <NotifySettings />
          {user && <EmailUpdates />}
          <button
            type="button"
            onClick={openTeamPicker}
            className="grid min-h-11 w-full place-items-center rounded-xl bg-muted text-sm font-bold"
          >
            Your team: pick or switch (once a week)
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/help"
              className="grid min-h-11 place-items-center rounded-xl bg-muted text-sm font-bold"
            >
              How to play
            </Link>
            <Link
              to="/account"
              className="grid min-h-11 place-items-center rounded-xl bg-muted text-sm font-bold"
            >
              Account & saves
            </Link>
          </div>
          <Link to="/privacy" className="block text-center text-xs font-bold text-muted-foreground underline">
            Privacy
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
