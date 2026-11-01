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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.navigate(target).then((w) => (w || c).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
