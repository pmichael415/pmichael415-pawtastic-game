// Browser side of phone notifications: can this browser show them, and turning them on or off.
import { device, track } from "@/lib/analytics";
import { fromB64url } from "./webpush";

export type PushSupport = "supported" | "needs_install" | "unsupported" | "blocked";

/** Instagram, Facebook and similar apps open links in their own browser, where Add to Home Screen isn't possible. */
export function inAppBrowser(ua: string): boolean {
  return /\b(Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|Twitter|TikTok|BytedanceWebview|Snapchat|Pinterest)\b/i.test(ua);
}

export function pushSupport(env?: { navigator: Navigator; window: Window }): PushSupport {
  const e = env ?? (typeof window === "undefined" ? null : { navigator, window });
  if (!e) return "unsupported";
  const nav = e.navigator as Navigator & { standalone?: boolean };
  const win = e.window as Window & { Notification?: { permission: NotificationPermission } };
  const ua = nav.userAgent ?? "";
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  const standalone = !!win.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
  if (iOS && !standalone) return "needs_install"; // iPhones only allow notifications from the Home Screen icon
  if (!("serviceWorker" in nav) || !("PushManager" in win) || !win.Notification) return "unsupported";
  if (win.Notification.permission === "denied") return "blocked";
  return "supported";
}

async function accessToken(): Promise<string | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function postSubscription(sub: PushSubscription): Promise<boolean> {
  const j = sub.toJSON();
  const token = await accessToken();
  const r = await fetch("/api/public/notifications/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, deviceId: device().id }),
  });
  return r.ok;
}

/** On app start (and sign-in): re-send this browser's current subscription so a changed endpoint, a disabled row or a
 *  lost account link is repaired. Does nothing unless the player turned notifications on here. */
export async function resyncPush(): Promise<void> {
  try {
    if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await postSubscription(sub);
  } catch {
    /* try again next time the app opens */
  }
}

/** Call straight from the tap: Safari only shows the permission prompt for a direct user action. */
export async function enablePush(): Promise<"on" | "denied" | "error"> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      track("notify_optin", { result: "denied" });
      return "denied";
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { publicKey } = (await (await fetch("/api/public/notifications/key")).json()) as { publicKey: string };
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(publicKey) as unknown as BufferSource });
    if (!(await postSubscription(sub))) throw new Error("subscribe failed");
    track("notify_optin", { result: "granted" });
    return "on";
  } catch {
    track("notify_optin", { result: "error" });
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/public/notifications/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}

export async function pushIsOn(): Promise<boolean> {
  try {
    if (pushSupport() !== "supported" || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}
