// The "Notify me" card: appears only after a good moment in a game (see src/lib/notify/prompt.ts).
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { enablePush, inAppBrowser } from "@/lib/notify/client";
import { closeNotifyCard, loadPrompt, recordAccept, recordDecline, savePrompt, useNotifyCard } from "@/lib/notify/prompt";

export function NotifyCard() {
  const card = useNotifyCard();
  if (!card.open) return null;
  const decline = () => {
    savePrompt(recordDecline(loadPrompt(), Date.now()));
    track("notify_optin", { result: card.support === "needs_install" ? "needs_install" : "dismissed" });
    closeNotifyCard();
  };
  const accept = async () => {
    const r = await enablePush();
    if (r === "on") {
      savePrompt(recordAccept(loadPrompt()));
      toast.success("Notifications are on. You can turn them off in Settings.");
    } else if (r === "error") toast.error("Couldn't turn on notifications. Try again from Settings.");
    closeNotifyCard();
  };
  return (
    <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-pop">
      <button type="button" aria-label="Close" onClick={decline} className="absolute top-2 right-2 grid size-9 place-items-center rounded-full text-muted-foreground">
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Bell className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-display font-bold text-secondary">Want a heads-up when the new weekly challenge and prizes are out?</p>
          <p className="text-sm text-muted-foreground">At most 2 a week.</p>
          {card.support === "needs_install" && (
            <p className="text-sm text-muted-foreground">
              {inAppBrowser(typeof navigator === "undefined" ? "" : navigator.userAgent)
                ? "On iPhone: first open this page in Safari (tap the ••• or share button, then Open in Safari). Then tap Share, then Add to Home Screen. Open PAWtastic Games from your home screen, then tap Notify me."
                : "On iPhone: tap Share, then Add to Home Screen. Open PAWtastic Games from your home screen, then tap Notify me."}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {card.support === "needs_install" ? (
          <Button className="col-span-2 h-11" variant="secondary" onClick={decline}>
            Got it
          </Button>
        ) : (
          <>
            <Button className="h-11" variant="secondary" onClick={decline}>
              No thanks
            </Button>
            <Button className="h-11" onClick={accept}>
              Notify me
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
