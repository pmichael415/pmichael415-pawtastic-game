// Weekly email updates (opt-in, 18+, owner-approved text). Off until the owner's gates are done: the switch, the
// mailing address for the footer (required by US email law) and an email service set up for the hub.
import { campaignUrl } from "./rules";

export type EmailTransport = (m: {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
  idempotencyKey: string;
}) => Promise<"sent" | "suppressed">;

export function emailUpdatesEnabled(
  env: { NOTIFY_EMAIL_ENABLED?: string | undefined; NOTIFY_MAILING_ADDRESS?: string | undefined },
  transport: EmailTransport | null,
): boolean {
  return env.NOTIFY_EMAIL_ENABLED === "true" && !!env.NOTIFY_MAILING_ADDRESS?.trim() && transport !== null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const WHY = "You're getting this because you asked for weekly challenge emails in PAWtastic Games.";

export function emailContent(
  m: { id: string; email_subject: string; email_body: string; path: string },
  token: string,
  mailingAddress: string,
  origin: string,
): { subject: string; text: string; html: string; unsubscribeUrl: string } {
  const link = `${origin}${campaignUrl(m.path, m.id, "email")}`;
  const unsubscribeUrl = `${origin}/unsubscribe?t=${encodeURIComponent(token)}`;
  const footer = `PAWtastic Academy · ${mailingAddress}`;
  const text = [m.email_body, "", `Play now: ${link}`, "", "—", WHY, `Unsubscribe: ${unsubscribeUrl}`, footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#FAF8F5;font-family:Arial,sans-serif;color:#312721">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:16px;line-height:1.5;white-space:pre-line">${esc(m.email_body)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0068D6;color:#ffffff;font-weight:bold;padding:12px 20px;border-radius:12px;text-decoration:none">Play now</a></p>
<hr style="border:none;border-top:1px solid #DAE0E7;margin:24px 0">
<p style="font-size:12px;color:#6b5f57">${esc(WHY)}<br><a href="${esc(unsubscribeUrl)}" style="color:#6b5f57">Unsubscribe</a><br>${esc(footer)}</p>
</div></body></html>`;
  return { subject: m.email_subject, text, html, unsubscribeUrl };
}

/** Decides an email opt-in change. The address always comes from the signed-in account, never from what was typed. */
export function emailOptInDecision(
  input: { on: boolean; adult: boolean },
  claims: { email?: unknown },
  available: boolean,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email : null;
  if (input.on && !available) return { ok: false, error: "Email updates aren't available yet." };
  if (input.on && !input.adult) return { ok: false, error: "Please confirm you're 18 or older." };
  if (!email) return { ok: false, error: "Your account has no email address." };
  return { ok: true, email };
}
