import { describe, expect, it } from "vitest";
import { emailContent, emailOptInDecision, emailUpdatesEnabled } from "./email";

const msg = { id: "9f1c", email_subject: "New week, new prizes", email_body: "Team Hawthorne vs Team Hillsdale <script>x</script> starts now.", path: "/recess" };
const ORIGIN = "https://play.example.com";

describe("weekly email content", () => {
  const c = emailContent(msg, "tok-123", "123 Example St, Hawthorne, NJ", ORIGIN);
  it("uses the approved subject and links back to the hub, tagged as email", () => {
    expect(c.subject).toBe("New week, new prizes");
    expect(c.html).toContain(`href="${ORIGIN}/recess?utm_source=email&amp;utm_medium=email&amp;utm_campaign=9f1c"`);
    expect(c.text).toContain(`${ORIGIN}/recess?utm_source=email&utm_medium=email&utm_campaign=9f1c`);
  });
  it("never lets message text become HTML", () => {
    expect(c.html).not.toContain("<script>");
    expect(c.html).toContain("&lt;script&gt;");
  });
  it("carries the business address, why they get it, and a one-tap unsubscribe link", () => {
    expect(c.unsubscribeUrl).toBe(`${ORIGIN}/unsubscribe?t=tok-123`);
    for (const part of [c.html, c.text]) {
      expect(part).toContain("PAWtastic Academy · 123 Example St, Hawthorne, NJ");
      expect(part).toContain("You're getting this because you asked for weekly challenge emails in PAWtastic Games.");
    }
    expect(c.text).toContain(`Unsubscribe: ${ORIGIN}/unsubscribe?t=tok-123`);
    expect(c.html).toContain(`href="${ORIGIN}/unsubscribe?t=tok-123"`);
  });
  it("looks like the games and Graduation Day's emails: logo, DM Sans, brand colours, phone-sized", () => {
    expect(c.html).toContain(`src="${ORIGIN}/brand/pawtastic-logo.png"`);
    expect(c.html).toContain('alt="PAWtastic Academy"');
    expect(c.html).toContain("font-family:'DM Sans'");
    for (const colour of ["#FAF8F5", "#0068D6", "#F6A823", "#312721"]) expect(c.html).toContain(colour);
    expect(c.html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(c.html).not.toMatch(/groom|haircut/i);
  });
});

describe("email updates stay off until the owner's gates are done", () => {
  const transport = async () => "sent" as const;
  it("needs the switch, a mailing address and an email service", () => {
    expect(emailUpdatesEnabled({}, transport)).toBe(false);
    expect(emailUpdatesEnabled({ NOTIFY_EMAIL_ENABLED: "true" }, transport)).toBe(false);
    expect(emailUpdatesEnabled({ NOTIFY_EMAIL_ENABLED: "true", NOTIFY_MAILING_ADDRESS: "  " }, transport)).toBe(false);
    expect(emailUpdatesEnabled({ NOTIFY_EMAIL_ENABLED: "true", NOTIFY_MAILING_ADDRESS: "123 Example St" }, null)).toBe(false);
    expect(emailUpdatesEnabled({ NOTIFY_EMAIL_ENABLED: "yes", NOTIFY_MAILING_ADDRESS: "123 Example St" }, transport)).toBe(false);
    expect(emailUpdatesEnabled({ NOTIFY_EMAIL_ENABLED: "true", NOTIFY_MAILING_ADDRESS: "123 Example St" }, transport)).toBe(true);
  });
});

describe("turning email updates on or off", () => {
  it("needs email updates to be available", () => {
    expect(emailOptInDecision({ on: true, adult: true }, { email: "a@b.co" }, false)).toEqual({ ok: false, error: "Email updates aren't available yet." });
  });
  it("turning on needs the 18+ confirmation", () => {
    expect(emailOptInDecision({ on: true, adult: false }, { email: "a@b.co" }, true)).toEqual({ ok: false, error: "Please confirm you're 18 or older." });
  });
  it("uses the signed-in account's email, never anything typed", () => {
    expect(emailOptInDecision({ on: true, adult: true }, { email: "a@b.co" }, true)).toEqual({ ok: true, email: "a@b.co" });
    expect(emailOptInDecision({ on: true, adult: true }, {}, true)).toEqual({ ok: false, error: "Your account has no email address." });
  });
  it("turning off always works, even if updates were switched off since", () => {
    expect(emailOptInDecision({ on: false, adult: false }, { email: "a@b.co" }, false)).toEqual({ ok: true, email: "a@b.co" });
  });
});
