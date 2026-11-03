// Private test tools (phone readiness plan, task 6) — only in the dev server and the private review build, never in
// the public hub. Diagnostics on/off and separate test saves; the player's own daycare is never touched.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { diagAvailable, reset, summary, type DiagSummary } from "@/tycoon/diag";
import { setSettings, useSettings } from "@/lib/settings";
import { SCENARIOS } from "@/tycoon/scenarios";
import { switchSave, testScenario } from "@/tycoon/store";
import { fac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

type Debug = { dogs: unknown[]; people?: unknown[]; calls: number; triangles: number; pixelRatio?: number; canvas?: { w: number; h: number }; gpu?: string } | null;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** A banner while a test save is open: what it is, and the way back. */
export function TestBanner({ state }: { state: TycoonState }) {
  const id = testScenario();
  if (!id) return null;
  return (
    <section aria-label="Test save" className="flex items-center gap-2 rounded-2xl border border-accent bg-accent/30 p-2 text-xs text-secondary">
      <p className="min-w-0 flex-1"><b>{fac(state).name}</b> — a separate test save. Your own daycare isn't changed.</p>
      <Button variant="outline" className="h-11 shrink-0" onClick={() => switchSave(null)}>Back to my daycare</Button>
    </section>
  );
}

export function diagReport(s: DiagSummary, d: Debug, extra: Record<string, string | number>) {
  return {
    measured: "in this browser, on this device",
    ...extra,
    seconds: r1(s.seconds),
    fps: r1(s.fps),
    frameMs: { p50: r1(s.frameP50), p95: r1(s.frameP95), p99: r1(s.frameP99), longest: r1(s.longestFrame) },
    slowFrames: { over50ms: s.slow50, over100ms: s.slow100, of: s.frames },
    view3dMs: { avg: r1(s.renderAvg), p95: r1(s.renderP95), note: "main-thread update + draw calls; GPU time isn't measurable in browsers" },
    simulationMs: { avg: r1(s.tickAvg), p95: r1(s.tickP95), ticks: s.ticks },
    screenMs: { avg: r1(s.uiAvg), p95: r1(s.uiP95), renders: s.uiRenders },
    pups: d?.dogs.length ?? "3D off",
    staff: d?.people?.length ?? "3D off",
    drawCalls: d?.calls ?? "3D off",
    triangles: d?.triangles ?? "3D off",
    canvas: d?.canvas ? `${d.canvas.w}×${d.canvas.h} @${d.pixelRatio}x` : "3D off",
    gpu: d?.gpu ?? "unavailable",
  };
}

/** The overlay: live numbers, refreshed twice a second, with Copy so a phone tester can paste them back. */
export function DiagOverlay({ debug, quality }: { debug: () => Debug; quality: string }) {
  const [, setN] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const s = summary();
  const d = debug();
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const report = diagReport(s, d, { quality, browser: nav?.userAgent ?? "unknown", screen: typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x` : "unknown", build: String(import.meta.env["VITE_REVIEW_BUILD"] ? "private review build" : "dev server"), scenario: testScenario() ?? "player save" });
  if (typeof window !== "undefined") (window as unknown as { __tycoonDiagReport?: unknown }).__tycoonDiagReport = report; // for the measuring script
  return (
    <aside aria-label="Diagnostics" className="pointer-events-auto fixed right-2 top-2 z-50 w-56 rounded-xl bg-black/80 p-2 font-mono text-[10px] leading-tight text-white shadow-pop">
      <p className="font-bold">Diagnostics (private)</p>
      <p>{r1(s.fps)} fps · p95 {r1(s.frameP95)} ms · worst {r1(s.longestFrame)} ms</p>
      <p>slow frames: {s.slow50} &gt;50ms · {s.slow100} &gt;100ms / {s.frames}</p>
      <p>3D update+draw {r1(s.renderAvg)} ms (p95 {r1(s.renderP95)})</p>
      <p>simulation {r1(s.tickAvg)} ms/tick (p95 {r1(s.tickP95)})</p>
      <p>screen render {r1(s.uiAvg)} ms (p95 {r1(s.uiP95)})</p>
      <p>pups {String(report.pups)} · staff {String(report.staff)} · calls {String(report.drawCalls)}</p>
      <p>{String(report.canvas)} · {quality}</p>
      <p className="truncate">GPU: {String(report.gpu)}</p>
      <p className="text-white/70">GPU time: unavailable in browsers</p>
      <div className="mt-1 flex gap-1">
        <button type="button" className="min-h-11 rounded bg-white/20 px-3" onClick={() => reset()}>Reset</button>
        <button
          type="button"
          className="min-h-11 rounded bg-white/20 px-3"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify(report, null, 1)).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </aside>
  );
}

/** The private tools section at the bottom of the play screen (review build and dev only). */
export function TestTools({ diag, onDiag }: { diag: boolean; onDiag: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  if (!diagAvailable()) return null;
  const current = testScenario();
  return (
    <section aria-label="Test tools" className="rounded-2xl border border-dashed border-border bg-card p-3 text-xs text-secondary">
      <button type="button" className="min-h-11 w-full text-left font-bold" aria-expanded={open} onClick={() => setOpen(!open)}>
        Test tools (private preview) {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant={diag ? "default" : "outline"} className="h-11" aria-pressed={diag} onClick={() => onDiag(!diag)}>
              Diagnostics {diag ? "on" : "off"}
            </Button>
            <Button variant={settings.lowPower ? "default" : "outline"} className="h-11" aria-pressed={settings.lowPower} onClick={() => setSettings({ lowPower: !settings.lowPower })}>
              Battery saver graphics {settings.lowPower ? "on" : "off"}
            </Button>
          </div>
          <p>Test saves are separate: starting one never changes your own daycare.</p>
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map((x) => (
              <Button key={x.id} variant="outline" className="h-11" title={x.detail} onClick={() => switchSave(x.id)}>
                Start test: {x.name}
              </Button>
            ))}
            {current && <Button className="h-11" onClick={() => switchSave(null)}>Back to my daycare</Button>}
          </div>
        </div>
      )}
    </section>
  );
}

/** How the 3D view is set to draw (the existing "Battery saver graphics" setting). */
export const qualityLabel = (lowPower: boolean) => (lowPower ? "battery saver graphics (1x)" : "standard graphics (up to 1.5x)");
