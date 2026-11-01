import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GRADUATION_SITE, GraduationWeeklyCard } from "./GraduationWeeklyCard";

type Ev = { name: string; props: Record<string, unknown> };
const events = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []);

describe("Graduation Day's Weekly Challenge card", () => {
  it("explains scores count on Graduation Day's own site and links there", () => {
    render(<GraduationWeeklyCard from="home" />);
    expect(screen.getByRole("heading", { name: "This week's Weekly Challenge" })).toBeTruthy();
    expect(screen.getByText(/Scores count on Graduation Day's own site/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Play the Weekly Challenge/ });
    expect(link.getAttribute("href")).toBe(GRADUATION_SITE);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.className).toMatch(/min-h-11/);
    fireEvent.click(link);
    expect(events().some((e) => e.name === "graduation_weekly_open" && e.props["from"] === "home")).toBe(true);
  });
  it("copies no prize details into the hub", () => {
    render(<GraduationWeeklyCard from="graduation" />);
    expect(screen.queryByText(/free (daycare|bath)/i)).toBeNull();
  });
});
