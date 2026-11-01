import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacyContent } from "@/routes/privacy";

describe("privacy page content", () => {
  it("says what is recorded, what isn't done, and how to opt out or ask for deletion", () => {
    render(<PrivacyContent />);
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What we record" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What we don't do" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your choices" })).toBeTruthy();
    expect(screen.getByText(/no ad trackers or pixels/i)).toBeTruthy();
    expect(screen.getByText(/phone-notification subscriptions/i)).toBeTruthy();
    const mail = screen.getByRole("link", { name: "info@pawtasticacademy.com" });
    expect(mail.getAttribute("href")).toBe("mailto:info@pawtasticacademy.com");
  });
});
