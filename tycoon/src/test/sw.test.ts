// @vitest-environment node
// The background script (public/sw.js), run in a stand-in service-worker environment.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CODE = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://play.example.com";

type Client = { url: string; frameType: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn>; order: string[] };
function client(url: string, frameType: "top-level" | "nested", navigateFails = false): Client {
  const order: string[] = [];
  const c: Client = {
    url,
    frameType,
    order,
    focus: vi.fn(async () => (order.push("focus"), c)),
    navigate: vi.fn(async () => {
      order.push("navigate");
      if (navigateFails) throw new Error("not controlled");
      return c;
    }),
  };
  return c;
}

function worker(clients: Client[]) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const openWindow = vi.fn(async () => null);
  const showNotification = vi.fn(async () => {});
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    skipWaiting: () => {},
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: { matchAll: async () => clients, openWindow, claim: async () => {} },
  };
  new Function("self", CODE)(self);
  const fire = async (type: string, event: Record<string, unknown>) => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[type]!({ ...event, waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const tap = (url: unknown) => fire("notificationclick", { notification: { close: () => {}, data: { url } } });
  return { fire, tap, openWindow, showNotification };
}

describe("tapping a notification", () => {
  it("brings the hub's own tab forward first, then opens the page there (never the Graduation Day frame)", async () => {
    const frame = client(`${ORIGIN}/graduation/index.html`, "nested");
    const tab = client(`${ORIGIN}/graduation`, "top-level");
    const w = worker([frame, tab]);
    await w.tap("/recess?utm_source=notification&utm_medium=push&utm_campaign=m1");
    expect(frame.navigate).not.toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/recess?utm_source=notification&utm_medium=push&utm_campaign=m1`);
    expect(tab.order).toEqual(["focus", "navigate"]);
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it("opens a new window if the open tab can't be navigated", async () => {
    const tab = client(`${ORIGIN}/`, "top-level", true);
    const w = worker([tab]);
    await w.tap("/recess");
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/recess`);
  });
  it("opens a new window when the hub isn't open", async () => {
    const w = worker([]);
    await w.tap("/");
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
  it("never leaves the hub's own site", async () => {
    for (const bad of ["/\\evil.com", "//evil.com", "https://evil.com/x", "/\t/evil.com", 42]) {
      const w = worker([]);
      await w.tap(bad);
      const opened = (w.openWindow.mock.calls[0] as unknown[])[0] as string;
      expect(new URL(opened).origin, String(bad)).toBe(ORIGIN);
    }
  });
});

describe("receiving a notification", () => {
  it("shows the message", async () => {
    const w = worker([]);
    await w.fire("push", { data: { json: () => ({ title: "New week!", body: "Prizes are up.", url: "/", tag: "m1" }) } });
    expect(w.showNotification).toHaveBeenCalledWith("New week!", expect.objectContaining({ body: "Prizes are up.", tag: "m1", data: { url: "/" } }));
  });
  it("still shows something if the message can't be read (iPhones require it)", async () => {
    const w = worker([]);
    await w.fire("push", { data: { json: () => { throw new Error("bad"); } } });
    expect(w.showNotification).toHaveBeenCalledWith("PAWtastic Games", expect.objectContaining({ body: "Something new is waiting in the games." }));
  });
});
