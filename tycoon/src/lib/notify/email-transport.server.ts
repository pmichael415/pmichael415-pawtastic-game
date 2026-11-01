// The hub's email service for weekly updates. None until the owner's email gates are done (Lovable email set up for
// the hub with the notify.pawtasticacademy.com sender, and confirmation that opt-in update emails are allowed).
import type { EmailTransport } from "./email";

export function getEmailTransport(): EmailTransport | null {
  return null;
}
