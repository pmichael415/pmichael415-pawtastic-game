// Email updates checkbox for signed-in players (hidden until email updates are available).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { getEmailOptIn, setEmailOptIn } from "@/lib/notify/email.functions";

export function EmailUpdates() {
  const [info, setInfo] = useState<{ available: boolean; on: boolean; email: string | null } | null>(null);
  const [want, setWant] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getEmailOptIn()
      .then((i) => {
        setInfo(i);
        setWant(i.on);
      })
      .catch(() => setInfo(null));
  }, []);
  if (!info?.available) return null;
  const changed = want !== info.on;
  const save = async () => {
    setBusy(true);
    try {
      const r = await setEmailOptIn({ data: { on: want, adult: want ? adult : false } });
      if (r.ok) {
        setInfo({ ...info, on: want });
        track("email_optin", { on: want });
        toast.success(want ? "Email updates are on." : "Email updates are off.");
      } else toast.error(r.error);
    } catch {
      toast.error("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <label className="flex items-start gap-2 text-sm font-bold">
        <input type="checkbox" className="mt-1 size-4" checked={want} onChange={(e) => setWant(e.target.checked)} />
        Email me the weekly challenge and prizes (at most 2 a week)
      </label>
      {want && !info.on && (
        <label className="flex items-start gap-2 pl-6 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          I'm 18 or older
        </label>
      )}
      {info.email && <p className="pl-6 text-xs text-muted-foreground">Sent to {info.email}. Every email has an unsubscribe link.</p>}
      <Button size="sm" className="ml-6" disabled={!changed || busy || (want && !info.on && !adult)} onClick={save}>
        Save
      </Button>
    </div>
  );
}
