// Why the 3D view isn't showing, in one line, with a way back (service design, "3D diagnostics"). Progress is the
// same save in every view. "Copy details" gives what's needed to diagnose a device (nothing personal).
import { useState } from "react";
import { Box } from "lucide-react";
import type { Diagnostics, Unavailable } from "./TycoonStage";

export type FallbackReason = Unavailable | "list";

const SAY: Record<FallbackReason, string> = {
  "no-webgl": "3D isn't available in this browser (WebGL is turned off or not supported), so you're on the map view — your progress is the same.",
  "load-failed": "The 3D view didn't finish loading (often a dropped connection), so you're on the map view — your progress is the same.",
  "renderer-error": "3D couldn't start on this device, so you're on the map view — your progress is the same.",
  "context-lost": "The 3D view stopped (the device needed its graphics memory back), so you're on the map view — your progress is the same.",
  list: "You chose the list view in Settings — your progress is the same in every view.",
};

export function FallbackNotice({ reason, onRetry, details }: { reason: FallbackReason; onRetry: () => void; details?: Diagnostics | null }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = JSON.stringify(details, null, 1);
    void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-secondary">
      <Box className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{SAY[reason]}</p>
      <button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-xl border border-primary px-3 text-xs font-bold text-primary">
        {reason === "list" ? "Show the 3D view" : "Try 3D again"}
      </button>
      {details && reason !== "list" && (
        <button type="button" onClick={copy} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline">
          {copied ? "Copied" : "Copy details"}
        </button>
      )}
    </div>
  );
}
