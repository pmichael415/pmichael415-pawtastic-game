import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { GRADUATION_SITE, GraduationWeeklyCard } from "./GraduationWeeklyCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

type Ev = { name: string; props: Record<string, unknown> };
const events = () => (window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? [];

describe("Graduation Day's Weekly Challenge card", () => {
  it("sends players to Graduation Day in the hub, where the Weekly Challenge counts", () => {
    render(<GraduationWeeklyCard from="home" />);
    expect(screen.getByRole("heading", { name: "This week's Weekly Challenge" })).toBeTruthy();
    expect(screen.getByText(/Play it right here in Graduation Day/)).toBeTruthy();
    expect(screen.queryByText(/free play/i)).toBeNull();
    const link = screen.getByRole("link", { name: /Play the Weekly Challenge/ });
    expect(link.getAttribute("href")).toBe("/graduation");
    expect(link.getAttribute("target")).toBeNull();
    expect(link.className).toMatch(/min-h-11/);
    fireEvent.click(link);
    expect(
      events().some((e) => e.name === "graduation_weekly_open" && e.props["from"] === "home"),
    ).toBe(true);
  });
  it("the slim link (shown only while the hub copy can't reach the server) still opens Graduation Day's site", () => {
    render(<GraduationWeeklyCard from="graduation" slim />);
    const link = screen.getByRole("link", { name: /Graduation Day's own site/ });
    expect(link.getAttribute("href")).toBe(GRADUATION_SITE);
    expect(link.getAttribute("target")).toBe("_blank");
  });
  it("copies no prize details into the hub", () => {
    render(<GraduationWeeklyCard from="home" />);
    expect(screen.queryByText(/free (daycare|bath)/i)).toBeNull();
  });
});
