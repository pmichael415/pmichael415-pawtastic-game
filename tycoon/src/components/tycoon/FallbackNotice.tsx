// Why the 3D view isn't showing, in one line (Stage A, spec §3.4). Progress is the same save in every view.
import { Box } from "lucide-react";

export type FallbackReason = "no-webgl" | "failed" | "list";

const SAY: Record<FallbackReason, string> = {
  "no-webgl": "3D isn't available in this browser (WebGL is turned off or not supported), so you're on the map view — your progress is the same.",
  failed: "3D couldn't start on this device, so you're on the map view — your progress is the same.",
  list: "You chose the list view in Settings — your progress is the same in every view.",
};

export function FallbackNotice({ reason, onRetry }: { reason: FallbackReason; onRetry: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-secondary">
      <Box className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{SAY[reason]}</p>
      <button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-xl border border-primary px-3 text-xs font-bold text-primary">
        {reason === "list" ? "Show the 3D view" : "Try 3D again"}
      </button>
    </div>
  );
}
