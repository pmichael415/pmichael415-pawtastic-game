import { describe, expect, it } from "vitest";
import { pushSupport } from "./client";

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
