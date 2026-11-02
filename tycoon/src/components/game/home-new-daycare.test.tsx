// The home page points players at the new buildable Daycare (Stage A, spec §3.7) while today's Daycare stays.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({ options: opts }),
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
vi.mock("@/lib/auth", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/components/game/TeamCard", () => ({ TeamCard: () => null }));
vi.mock("@/components/game/TeamPicker", () => ({ maybeAskForTeam: () => {}, openTeamPicker: () => {} }));
vi.mock("@/components/game/GraduationWeeklyCard", () => ({ GraduationWeeklyCard: () => null }));

import { Route } from "@/routes/index";

function Home() {
  const C = (Route as unknown as { options: { component: () => ReactNode } }).options.component;
  return <C />;
}

describe("the home page's new Daycare card", () => {
  beforeEach(() => localStorage.clear());
  it("has its own heading and a 44 px link to the new Daycare", async () => {
    render(<Home />);
    const card = await screen.findByRole("region", { name: "New: build your own PAWtastic daycare" });
    expect(within(card).getByRole("heading", { name: "New: build your own PAWtastic daycare" })).toBeTruthy();
    const link = within(card).getByRole("link", { name: /Play the new Daycare/ });
    expect(link.getAttribute("href")).toBe("/daycare-next");
    expect(link.className).toMatch(/min-h-11|h-11|h-12/);
  });
  it("today's Daycare keeps its own card and link", async () => {
    render(<Home />);
    await screen.findByRole("region", { name: "New: build your own PAWtastic daycare" });
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/daycare");
  });
});
