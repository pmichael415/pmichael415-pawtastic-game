// Ad attribution with the hub's own events (no ad trackers or pixels). Each visit's utm_* tags are cleaned to short
// plain words; the first tagged visit on a device is kept as its "first touch" so later sessions and booking,
// app and directions clicks can be counted per campaign. Clicks stay clicks: nothing here records a booking.
export type Campaign = { source: string | null; medium: string | null; campaign: string | null; content: string | null };

export const FIRST_TOUCH_KEY = "pawtastic-first-touch";

export function cleanTag(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase().replace(/\s+/g, "-");
  return /^[a-z0-9._-]{1,60}$/.test(t) ? t : null;
}

export function readCampaign(search: string): Campaign | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  const c: Campaign = {
    source: cleanTag(q.get("utm_source")),
    medium: cleanTag(q.get("utm_medium")),
    campaign: cleanTag(q.get("utm_campaign")),
    content: cleanTag(q.get("utm_content")),
  };
  return c.source || c.medium || c.campaign || c.content ? c : null;
}

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function firstTouch(): Campaign | null {
  try {
    const raw = store()?.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Record<keyof Campaign, unknown>>;
    const c: Campaign = {
      source: cleanTag(v.source as string),
      medium: cleanTag(v.medium as string),
      campaign: cleanTag(v.campaign as string),
      content: cleanTag(v.content as string),
    };
    return c.source || c.medium || c.campaign || c.content ? c : null;
  } catch {
    return null;
  }
}

/** Reads this visit's tags; saves them as the device's first touch if it has none yet. Returns this visit's tags. */
export function captureFirstTouch(search: string): Campaign | null {
  const c = readCampaign(search);
  if (c && !firstTouch()) {
    try {
      store()?.setItem(FIRST_TOUCH_KEY, JSON.stringify(c));
    } catch {
      /* storage blocked */
    }
  }
  return c;
}

export function attributionProps(): { ft_source?: string; ft_campaign?: string } {
  const f = firstTouch();
  return { ...(f?.source ? { ft_source: f.source } : {}), ...(f?.campaign ? { ft_campaign: f.campaign } : {}) };
}
