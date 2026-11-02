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
  // The same look as Graduation Day's emails and the games: logo tile, gold rule, DM Sans, brand blue and gold.
  const font = "font-family:'DM Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:24px 0;background:#FAF8F5;${font};color:#312721">
<div style="max-width:560px;margin:0 auto;padding:0 12px">
<div style="background:#FFFFFF;border:1px solid #DAE0E7;border-radius:20px;padding:28px 28px 24px">
<img src="${esc(`${origin}/brand/pawtastic-logo.png`)}" width="72" height="72" alt="PAWtastic Academy" style="display:block;margin:0 auto;border-radius:16px">
<div style="height:4px;width:56px;background:#F6A823;border-radius:4px;margin:18px auto 22px"></div>
<p style="${font};font-size:16px;line-height:1.55;color:#312721;white-space:pre-line;margin:0 0 18px">${esc(m.email_body)}</p>
<p style="text-align:center;margin:0 0 6px"><a href="${esc(link)}" style="${font};display:inline-block;background:#0068D6;color:#FFFFFF;font-size:16px;font-weight:bold;padding:14px 24px;border-radius:12px;text-decoration:none">Play now</a></p>
</div>
<p style="${font};font-size:12px;line-height:1.5;color:#70645C;text-align:center;margin:18px 12px 0">${esc(WHY)}<br><a href="${esc(unsubscribeUrl)}" style="color:#70645C">Unsubscribe</a><br>${esc(footer)}</p>
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
