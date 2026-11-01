// Rules every notification follows (the database enforces the same limits).
export const MESSAGE_LIMITS = { title: 50, body: 140 } as const;
const PATH_RE = /^\/[a-z0-9/_-]{0,60}$/;

export function validateMessage(m: { title: string; body: string; path: string }): string[] {
  const bad: string[] = [];
  if (m.title.length < 1 || m.title.length > MESSAGE_LIMITS.title) bad.push("title");
  if (m.body.length < 1 || m.body.length > MESSAGE_LIMITS.body) bad.push("body");
  if (!PATH_RE.test(m.path) || m.path.includes("//")) bad.push("path");
  return bad;
}

const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

/** Only real browser push services: the server never posts to any other address. */
export function isAllowedPushEndpoint(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port !== "" || u.username !== "" || u.password !== "") return false;
  const host = u.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

/** The hub link a notification or email opens, tagged with its channel and message id. */
export function campaignUrl(path: string, messageId: string, channel: "push" | "email"): string {
  const tags = channel === "push" ? "utm_source=notification&utm_medium=push" : "utm_source=email&utm_medium=email";
  return `${path}?${tags}&utm_campaign=${encodeURIComponent(messageId)}`;
}
