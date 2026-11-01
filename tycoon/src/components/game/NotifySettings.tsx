// Settings row: phone notifications on/off, with a plain explanation when they can't work here.
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, pushIsOn, pushSupport, type PushSupport } from "@/lib/notify/client";
import { loadPrompt, recordAccept, savePrompt } from "@/lib/notify/prompt";

const NOTE: Partial<Record<PushSupport, string>> = {
  blocked: "Notifications are blocked in this browser's settings.",
  needs_install: "On iPhone, add PAWtastic Games to your Home Screen first.",
  unsupported: "This browser can't show notifications.",
};

export function NotifySettings() {
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSupport(pushSupport());
    void pushIsOn().then(setOn);
  }, []);
  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      if (v) {
        const r = await enablePush();
        if (r === "on") savePrompt(recordAccept(loadPrompt()));
        setSupport(pushSupport());
        setOn(r === "on");
      } else {
        await disablePush();
        setOn(false);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-bold">
        Phone notifications (weekly challenge and prizes, at most 2 a week)
        <Switch checked={on} disabled={busy || support !== "supported"} onCheckedChange={(v) => void toggle(v)} />
      </label>
      {NOTE[support] && <p className="text-xs text-muted-foreground">{NOTE[support]}</p>}
    </div>
  );
}
