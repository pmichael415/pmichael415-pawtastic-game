// Today's Daycare: the Blue Ribbon pieces, worn or bought from inside the game.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth", () => ({ useSession: () => ({ user: { id: "u1" }, ready: true, session: null }) }));
const createCheckout = vi.fn(async (_a: unknown) => ({ ok: true, url: "https://checkout.stripe.com/x" }));
vi.mock("@/lib/payments/payments.functions", () => ({
  createCheckout: (a: unknown) => createCheckout(a),
  getPaymentsStatus: async () => ({ ready: true, reason: null }),
}));
import { PupStyleSheet } from "./PupStyleSheet";

const off = { "ribbon-collar": false, "navy-star-bandana": false, "sparkle-trail": false };

describe("Pup style", () => {
  it("lists the three Blue Ribbon pieces", () => {
    render(<PupStyleSheet open onClose={() => {}} owned={false} on={off} onToggle={() => {}} />);
    for (const n of ["Blue Ribbon Collar", "Navy Star Bandana", "Sparkle Trail (Recess Rush)"]) expect(screen.getByText(n)).toBeTruthy();
  });
  it("when owned, each piece can be put on and taken off", () => {
    const onToggle = vi.fn();
    render(<PupStyleSheet open onClose={() => {}} owned on={{ ...off, "navy-star-bandana": true }} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Take off Navy Star Bandana" }));
    expect(onToggle).toHaveBeenCalledWith("navy-star-bandana", false);
    fireEvent.click(screen.getByRole("button", { name: "Put on Blue Ribbon Collar" }));
    expect(onToggle).toHaveBeenCalledWith("ribbon-collar", true);
  });
  it("when not owned, Buy opens the buy sheet and returns to today's Daycare", async () => {
    render(<PupStyleSheet open onClose={() => {}} owned={false} on={off} onToggle={() => {}} go={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy the Blue Ribbon Style Pack, $2.99" }));
    fireEvent.click(await screen.findByRole("button", { name: "Buy $2.99" }));
    await vi.waitFor(() => expect(createCheckout).toHaveBeenCalledWith({ data: { productId: "blue-ribbon-style", returnTo: "/daycare", attempt: expect.any(String) } }));
  });
});
