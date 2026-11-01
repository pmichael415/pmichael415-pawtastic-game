// The new Daycare Tycoon's 3D view. three.js loads lazily, so the page and the list view work instantly and on
// devices without WebGL (the route falls back to the list view).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { List, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSettings, useSettings } from "@/lib/settings";
import { track } from "@/lib/analytics";
import type { FxKind, Ghost, PickMode, TPick, TycoonWorld, WorldLooks } from "@/tycoon/render/world";
import type { TycoonState } from "@/tycoon/types";

export type TycoonStageHandle = {
  fx: (kind: FxKind, at: { c: number; r: number } | "hud") => void;
  resetCamera: () => void;
  debug: () => unknown;
};

type Props = {
  state: TycoonState;
  selected: string | null;
  ghost: Ghost | null;
  overlay: boolean;
  pickMode: PickMode;
  looks?: WorldLooks;
  onPick: (p: TPick | null) => void;
  onUnavailable?: () => void;
  children?: React.ReactNode;
};

export const TycoonStage = forwardRef<TycoonStageHandle, Props>(function TycoonStage(props, ref) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<TycoonWorld | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => ({
    fx: (k, at) => worldRef.current?.fx(k, at),
    resetCamera: () => worldRef.current?.resetCamera(),
    debug: () => worldRef.current?.debugInfo(),
  }), []);

  useEffect(() => {
    let cancelled = false;
    let world: TycoonWorld | null = null;
    import("@/tycoon/render/world")
      .then((m) => {
        if (cancelled || !canvasRef.current) return;
        if (!m.webglAvailable()) {
          setStatus("unavailable");
          latest.current.onUnavailable?.();
          return;
        }
        world = new m.TycoonWorld(canvasRef.current, {
          onPick: (p) => latest.current.onPick(p),
          reducedMotion: settings.reducedMotion,
          lowPower: settings.lowPower,
        });
        const s = latest.current;
        world.setSnapshot({ state: s.state, selected: s.selected, ghost: s.ghost, overlay: s.overlay, looks: s.looks ?? {}, pickMode: s.pickMode });
        world.resetCamera();
        worldRef.current = world;
        (window as unknown as { __tycoonWorld?: TycoonWorld }).__tycoonWorld = world;
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

  useEffect(() => {
    worldRef.current?.setSnapshot({ state: props.state, selected: props.selected, ghost: props.ghost, overlay: props.overlay, looks: props.looks ?? {}, pickMode: props.pickMode });
  }, [props.state, props.selected, props.ghost, props.overlay, props.looks, props.pickMode, status]);

  if (status === "unavailable") return null;
  return (
    <section aria-label="3D daycare view" className="relative overflow-hidden rounded-2xl border border-border bg-sky shadow-soft">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Overhead view of your daycare. Drag to pan, pinch or use the zoom buttons, tap a pup, room or square."
        className="block w-full touch-none outline-none focus-visible:ring-4 focus-visible:ring-accent"
        style={{ height: "clamp(300px, 52svh, 540px)" }}
      />
      {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-sky font-display text-lg font-bold text-secondary">Building your daycare…</div>}
      <div className="absolute right-2 top-2 flex flex-col gap-2">
        <Button size="icon" variant="secondary" className="h-11 w-11 shadow-soft" aria-label="Zoom in" onClick={() => worldRef.current?.zoom(0.8)}>
          <Plus className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="secondary" className="h-11 w-11 shadow-soft" aria-label="Zoom out" onClick={() => worldRef.current?.zoom(1.25)}>
          <Minus className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="secondary" className="h-11 w-11 shadow-soft" aria-label="Reset camera" onClick={() => worldRef.current?.resetCamera()}>
          <RotateCcw className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-11 w-11 shadow-soft"
          aria-label="Switch to list view"
          onClick={() => {
            setSettings({ view: "list" });
            track("camera_mode", { mode: "list" });
          }}
        >
          <List className="h-5 w-5" />
        </Button>
      </div>
      {props.children}
    </section>
  );
});
