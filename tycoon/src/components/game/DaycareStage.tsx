// The 3D daycare viewport with overhead + first-person cameras. three.js is loaded lazily on the client so
// the page (and the accessible list view) works instantly and on devices without WebGL.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Crosshair, Eye, List, Map as MapIcon, Minus, Plus, RotateCcw } from "lucide-react";
import type { GameState, SiteId } from "@/game/engine";
import type {
  CameraMode,
  DaycareWorld,
  FocusTarget,
  RoomHint,
  WorldLooks,
  WorldPick,
} from "@/world/renderer";
import type { GroupId } from "@/game/engine";
import { setSettings, useSettings, type ViewMode } from "@/lib/settings";
import { LOGO_URL } from "@/game/sprites";
import { track } from "@/lib/analytics";

export type StageHandle = {
  effect: (
    kind: "checkin" | "play" | "bath" | "checkout" | "separate" | "assign",
    dogId: string,
  ) => void;
  jumpTo: (key: string) => void;
  debug: () => unknown;
  project: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean } | null;
};

export type FocusPrompt = {
  title: string;
  sub?: string;
  label: string;
  disabled?: boolean;
  reason?: string;
  run: () => void;
  more?: () => void;
} | null;

type Props = {
  state: GameState;
  site: SiteId;
  selected: string | null;
  looks: WorldLooks;
  roomHints: Partial<Record<GroupId, RoomHint>>;
  suiteHints: (RoomHint | null)[];
  onPick: (p: WorldPick | null) => void;
  onFocus: (t: FocusTarget) => void;
  prompt: FocusPrompt;
  onUnavailable?: () => void;
};

const JUMPS = [
  { key: "lobby", label: "🛎️ Lobby" },
  { key: "playrooms", label: "🎾 Playrooms" },
  { key: "suite:1", label: "🌙 Suites" },
  { key: "bath", label: "🛁 Bath" },
  { key: "recovery", label: "🫶 Recovery" },
];

export const DaycareStage = forwardRef<StageHandle, Props>(function DaycareStage(props, ref) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<DaycareWorld | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const latest = useRef(props);
  latest.current = props;
  const mode: CameraMode = settings.view === "walk" ? "walk" : "overhead";

  useImperativeHandle(
    ref,
    () => ({
      effect: (k, id) => worldRef.current?.effect(k, id),
      jumpTo: (k) => worldRef.current?.jumpTo(k),
      debug: () => worldRef.current?.debugInfo(),
      project: (x, y, z) => worldRef.current?.project(x, y, z) ?? null,
    }),
    [],
  );

  // Create the world once.
  useEffect(() => {
    let cancelled = false;
    let world: DaycareWorld | null = null;
    import("@/world/renderer")
      .then((m) => {
        if (cancelled || !canvasRef.current) return;
        if (!m.webglAvailable()) {
          setStatus("unavailable");
          latest.current.onUnavailable?.();
          return;
        }
        const s = latest.current;
        world = new m.DaycareWorld(canvasRef.current, {
          onPick: (p) => latest.current.onPick(p),
          onFocus: (t) => latest.current.onFocus(t),
          reducedMotion: settings.reducedMotion,
          lowPower: settings.lowPower,
          logoUrl: LOGO_URL,
        });
        world.setMode(mode);
        world.setSnapshot({
          state: s.state,
          site: s.site,
          selected: s.selected,
          looks: s.looks,
          roomHints: s.roomHints,
          suiteHints: s.suiteHints,
        });
        world.resetCamera();
        worldRef.current = world;
        (window as unknown as { __daycareWorld?: DaycareWorld }).__daycareWorld = world;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("unavailable");
          latest.current.onUnavailable?.();
        }
      });
    return () => {
      cancelled = true;
      world?.dispose();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push every state change into the world (same GameState the list view renders).
  useEffect(() => {
    worldRef.current?.setSnapshot({
      state: props.state,
      site: props.site,
      selected: props.selected,
      looks: props.looks,
      roomHints: props.roomHints,
      suiteHints: props.suiteHints,
    });
  }, [props.state, props.site, props.selected, props.looks, props.roomHints, props.suiteHints]);

  useEffect(() => {
    worldRef.current?.setMode(mode);
  }, [mode, status]);
  useEffect(() => {
    worldRef.current?.setLookPrefs(settings.lookSpeed, settings.invertLook);
  }, [settings.lookSpeed, settings.invertLook, status]);

  const setView = (v: ViewMode) => {
    setSettings({ view: v });
    track("camera_mode", { mode: v });
  };

  // ---------- first-person joystick ----------
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickId = useRef<number | null>(null);
  const moveStick = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el || stickId.current !== e.pointerId) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    worldRef.current?.setMove(dx, -dy);
  };
  const endStick = () => {
    stickId.current = null;
    if (knobRef.current) knobRef.current.style.transform = "translate(0,0)";
    worldRef.current?.setMove(0, 0);
  };

  const p = props.prompt;
  const walk = mode === "walk";
  return (
    <section
      aria-label="3D daycare view"
      className="relative overflow-hidden rounded-3xl border-4 border-secondary bg-sky shadow-pop"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-walk-keys="1"
        aria-label={
          walk
            ? "First-person daycare view. Use the on-screen stick or W A S D keys to walk, drag to look around."
            : "Overhead daycare view. Drag to pan, pinch or use the zoom buttons, tap a pup or room."
        }
        className="block w-full touch-none outline-none focus-visible:ring-4 focus-visible:ring-accent"
        style={{ height: "clamp(300px, 52svh, 540px)" }}
      />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-sky font-display text-lg font-bold text-secondary">
          Building your daycare…
        </div>
      )}
      {status === "unavailable" && (
        <div className="absolute inset-0 grid place-items-center bg-sky p-6 text-center font-bold text-secondary">
          3D isn't available on this device. Everything still works in the list below.
        </div>
      )}

      {/* top-left: camera mode */}
      <div
        className="absolute left-2 top-2 flex gap-1 rounded-full bg-card/95 p-1 shadow-soft"
        role="radiogroup"
        aria-label="Camera"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!walk}
          onClick={() => setView("overhead")}
          className={`flex h-11 items-center gap-1 rounded-full px-3 text-sm font-extrabold ${!walk ? "bg-secondary text-secondary-foreground" : "text-secondary"}`}
        >
          <MapIcon className="h-4 w-4" aria-hidden /> Overhead
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={walk}
          onClick={() => setView("walk")}
          className={`flex h-11 items-center gap-1 rounded-full px-3 text-sm font-extrabold ${walk ? "bg-secondary text-secondary-foreground" : "text-secondary"}`}
        >
          <Eye className="h-4 w-4" aria-hidden /> Walk
        </button>
      </div>
      {/* top-right: reset, zoom, list */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          aria-label="Reset camera"
          onClick={() => worldRef.current?.resetCamera()}
          className="grid h-11 w-11 place-items-center rounded-full bg-card/95 text-secondary shadow-soft"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        {!walk && (
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => worldRef.current?.zoom(0.8)}
            className="grid h-11 w-11 place-items-center rounded-full bg-card/95 text-secondary shadow-soft"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
        {!walk && (
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => worldRef.current?.zoom(1.25)}
            className="grid h-11 w-11 place-items-center rounded-full bg-card/95 text-secondary shadow-soft"
          >
            <Minus className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Hide 3D view (list only)"
          onClick={() => setView("list")}
          className="grid h-11 w-11 place-items-center rounded-full bg-card/95 text-secondary shadow-soft"
        >
          <List className="h-5 w-5" />
        </button>
      </div>

      {!walk && (
        <div
          className="absolute inset-x-2 bottom-2 flex gap-1 overflow-x-auto pb-0.5"
          aria-label="Jump to area"
        >
          {JUMPS.map((j) => (
            <button
              key={j.key}
              type="button"
              onClick={() => worldRef.current?.jumpTo(j.key)}
              className="h-11 shrink-0 rounded-full bg-card/95 px-3 text-sm font-extrabold text-secondary shadow-soft"
            >
              {j.label}
            </button>
          ))}
        </div>
      )}

      {walk && (
        <>
          <div
            ref={stickRef}
            role="application"
            aria-label="Movement stick: drag to walk"
            className="absolute bottom-3 left-3 grid h-32 w-32 touch-none place-items-center rounded-full border-4 border-card/80 bg-secondary/25 select-none"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              stickId.current = e.pointerId;
              moveStick(e);
            }}
            onPointerMove={moveStick}
            onPointerUp={endStick}
            onPointerCancel={endStick}
          >
            <div
              ref={knobRef}
              className="h-14 w-14 rounded-full bg-card shadow-soft transition-transform duration-75"
            />
          </div>
          <Crosshair
            className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-card drop-shadow"
            aria-hidden
          />
          {!settings.seenWalkHelp && (
            <button
              type="button"
              onClick={() => setSettings({ seenWalkHelp: true })}
              className="absolute inset-x-12 top-16 rounded-2xl bg-secondary/90 p-3 text-center text-sm font-bold text-secondary-foreground"
            >
              Stick: walk · Drag the view: look around · Face a pup and tap the big button. Desktop:
              W A S D + mouse drag. <span className="underline">Got it</span>
            </button>
          )}
          <div className="absolute bottom-3 left-[9.5rem] right-2 flex flex-col items-stretch gap-1">
            {p ? (
              <div className="rounded-2xl bg-card/95 p-1.5 shadow-soft">
                <div className="truncate px-1 text-[12px] font-extrabold text-secondary">
                  <span className="font-display text-sm">{p.title}</span>
                  {p.sub ? <span className="text-muted-foreground"> · {p.sub}</span> : null}
                </div>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    disabled={p.disabled}
                    onClick={p.run}
                    className="min-h-12 flex-1 rounded-xl bg-primary px-2 font-display text-sm font-bold leading-tight text-primary-foreground disabled:opacity-50"
                  >
                    {p.label}
                  </button>
                  {p.more && (
                    <button
                      type="button"
                      aria-label="More options"
                      onClick={p.more}
                      className="grid h-12 w-11 shrink-0 place-items-center rounded-xl bg-muted text-lg font-extrabold text-secondary"
                    >
                      ⋯
                    </button>
                  )}
                </div>
                {p.reason && (
                  <p className="mt-1 px-1 text-[11px] font-bold leading-snug text-destructive">
                    {p.reason}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-card/90 px-3 py-2 text-xs font-bold text-secondary shadow-soft">
                Walk up to a pup, a room sign or the front desk
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
});
