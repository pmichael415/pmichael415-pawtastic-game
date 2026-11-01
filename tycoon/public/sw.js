// PAWtastic Games background script: shows notifications and opens their link. It does not cache pages
// (no fetch handler), so it can never serve an old version of the game.
const FALLBACK = { title: "PAWtastic Games", body: "Something new is waiting in the games.", url: "/", tag: "pawtastic" };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = FALLBACK;
  try {
    const d = event.data ? event.data.json() : null;
    if (d && typeof d.title === "string" && typeof d.body === "string") msg = { ...FALLBACK, ...d };
  } catch (e) {
    msg = FALLBACK; // iPhones require a notification for every push
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, { body: msg.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: msg.tag, data: { url: msg.url } }),
  );
});

// Opening a notification: only ever a page on the hub's own site. Bring the hub's own tab forward first (never the
// Graduation Day frame inside it), then open the page there; if that tab can't be used, open a new window.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  let target = self.location.origin + "/";
  try {
    if (typeof raw === "string") {
      const u = new URL(raw, self.location.origin);
      if (u.origin === self.location.origin) target = u.href;
    }
  } catch (e) {
    target = self.location.origin + "/";
  }
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = list.find((c) => c.frameType === "top-level" && new URL(c.url).origin === self.location.origin);
      if (tab) {
        try {
          await tab.focus();
          await tab.navigate(target);
          return;
        } catch (e) {
          /* not ours to steer: open a fresh window instead */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
