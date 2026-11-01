import { afterEach, describe, expect, it, vi } from "vitest";
import { inAppBrowser, pushSupport, resyncPush } from "./client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
function env(o: { ua: string; standalone?: boolean; sw?: boolean; push?: boolean; permission?: NotificationPermission; touch?: number }) {
  const navigator: Record<string, unknown> = { userAgent: o.ua, maxTouchPoints: o.touch ?? 0 };
  if (o.sw ?? true) navigator["serviceWorker"] = {};
  const window: Record<string, unknown> = { matchMedia: () => ({ matches: !!o.standalone }) };
  if (o.push ?? true) window["PushManager"] = function PushManager() {};
  window["Notification"] = { permission: o.permission ?? "default" };
  return { navigator: navigator as unknown as Navigator, window: window as unknown as Window };
}

describe("can this browser show notifications?", () => {
  it("iPhone Safari needs the game on the Home Screen first", () => {
    expect(pushSupport(env({ ua: IPHONE, push: false }))).toBe("needs_install");
  });
  it("iPhone from the Home Screen icon can", () => {
    expect(pushSupport(env({ ua: IPHONE, standalone: true }))).toBe("supported");
  });
  it("Android Chrome can", () => {
    expect(pushSupport(env({ ua: ANDROID }))).toBe("supported");
  });
  it("a browser where the player blocked notifications says so", () => {
    expect(pushSupport(env({ ua: ANDROID, permission: "denied" }))).toBe("blocked");
  });
  it("a browser without background scripts can't", () => {
    expect(pushSupport(env({ ua: ANDROID, sw: false }))).toBe("unsupported");
  });
  it("an iPad that reports itself as a Mac still needs the Home Screen", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    expect(pushSupport(env({ ua: mac, touch: 5, push: false }))).toBe("needs_install");
    expect(pushSupport(env({ ua: mac, touch: 0 }))).toBe("supported");
  });
});

describe("keeping a player's notifications working", () => {
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/keep-1", toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/keep-1", keys: { p256dh: "P", auth: "A" } }) };
  function stubBrowser(o: { permission: NotificationPermission; subscription: unknown }) {
    Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
    Object.defineProperty(window, "Notification", { value: { permission: o.permission }, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => o.subscription } }) },
      configurable: true,
    });
  }
  afterEach(() => vi.restoreAllMocks());

  it("on app start, re-sends the browser's current subscription (new endpoint, re-enabled, linked to the account)", async () => {
    stubBrowser({ permission: "granted", subscription: sub });
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    await resyncPush();
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/public/notifications/subscribe");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ endpoint: "https://fcm.googleapis.com/fcm/send/keep-1", keys: { p256dh: "P", auth: "A" } });
    expect(typeof body.deviceId).toBe("string");
  });
  it("does nothing for players who never turned notifications on", async () => {
    stubBrowser({ permission: "default", subscription: null });
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await resyncPush();
    stubBrowser({ permission: "granted", subscription: null });
    await resyncPush();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("ad visitors inside Instagram or Facebook", () => {
  it("are recognised (they must open Safari before they can add the game to the Home Screen)", () => {
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]")).toBe(true);
    expect(inAppBrowser(IPHONE)).toBe(false);
    expect(inAppBrowser(ANDROID)).toBe(false);
  });
});
