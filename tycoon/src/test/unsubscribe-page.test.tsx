import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { UnsubscribeContent } from "@/routes/unsubscribe";

const TOKEN = "6f1d2c3b-0000-4000-8000-000000000009";
afterEach(() => vi.restoreAllMocks());

describe("email unsubscribe page", () => {
  it("opening the link does nothing by itself (email scanners open links)", () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    render(<UnsubscribeContent token={TOKEN} />);
    expect(screen.getByRole("heading", { name: "Unsubscribe from PAWtastic Games emails?" })).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
  it("pressing Unsubscribe sends one request and confirms", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<UnsubscribeContent token={TOKEN} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" })));
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/public/notifications/email-unsubscribe");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ token: TOKEN });
    expect(screen.getByText("You're unsubscribed. You won't get these emails again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unsubscribe" })).toBeNull();
  });
});
