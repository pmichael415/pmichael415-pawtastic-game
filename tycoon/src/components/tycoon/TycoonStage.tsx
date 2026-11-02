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
  /** 3D can't run here, and why — with details for diagnosis (nothing personal). */
  onUnavailable?: (reason: Unavailable, details: Diagnostics) => void;
  children?: React.ReactNode;
};

export type Unavailable = "no-webgl" | "load-failed" | "renderer-error" | "context-lost";
export type Diagnostics = { reason: Unavailable; message: string; browser: string; renderer: string | null };

/** The graphics renderer's name, if the browser shares it (for "Copy details"). */
function rendererName(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
}

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
    const canvas = canvasRef.current;
    const fail = (reason: Unavailable, err?: unknown) => {
      if (cancelled) return;
      world?.dispose();
      world = null;
      worldRef.current = null;
      setStatus("unavailable");
      const details: Diagnostics = {
        reason,
        message: err instanceof Error ? err.message.slice(0, 200) : err ? String(err).slice(0, 200) : "",
        browser: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : "",
        renderer: reason === "no-webgl" ? null : rendererName(),
      };
      track("client_error", { where: "tycoon-3d", reason });
      latest.current.onUnavailable?.(reason, details);
    };
    const lost = (e: Event) => {
      e.preventDefault();
      fail("context-lost", "The graphics context was lost");
    };
    canvas?.addEventListener("webglcontextlost", lost);
    import("@/tycoon/render/world")
      .then((m) => {
        if (cancelled || !canvasRef.current) return;
        if (!m.webglAvailable()) return fail("no-webgl");
        try {
          world = new m.TycoonWorld(canvasRef.current, {
            onPick: (p) => latest.current.onPick(p),
            reducedMotion: settings.reducedMotion,
            lowPower: settings.lowPower,
          });
          const s = latest.current;
          world.setSnapshot({ state: s.state, selected: s.selected, ghost: s.ghost, overlay: s.overlay, looks: s.looks ?? {}, pickMode: s.pickMode });
          world.resetCamera();
        } catch (e) {
          return fail("renderer-error", e);
        }
        worldRef.current = world;
        if (import.meta.env.DEV) (window as unknown as { __tycoonWorld?: TycoonWorld }).__tycoonWorld = world;
        setStatus("ready");
      })
      .catch((e) => fail("load-failed", e));
    return () => {
      cancelled = true;
      canvas?.removeEventListener("webglcontextlost", lost);
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
        style={{ height: "clamp(320px, 62svh, 620px)" }}
      />
      {status === "loading" && <div className="absolute inset-0 grid place-items-center bg-sky font-display text-lg font-bold text-secondary">Building your daycare…</div>}
      <div className="absolute bottom-2 right-2 flex flex-col gap-2">
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
