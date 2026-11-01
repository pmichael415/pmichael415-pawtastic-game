import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const enablePush = vi.fn();
vi.mock("@/lib/notify/client", async (orig) => ({ ...(await orig<typeof import("@/lib/notify/client")>()), enablePush: () => enablePush() }));

import { NotifyCard } from "./NotifyCard";
import { closeNotifyCard, goodMoment, PROMPT_KEY } from "@/lib/notify/prompt";

type Ev = { name: string; props: Record<string, unknown> };
const events = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []);
const QUESTION = "Want a heads-up when the new weekly challenge and prizes are out?";

describe("the 'Notify me' card", () => {
  beforeEach(() => {
    localStorage.clear();
    enablePush.mockReset();
    act(() => closeNotifyCard());
  });

  it("stays hidden until a good moment, then asks with the agreed words", () => {
    render(<NotifyCard />);
    expect(screen.queryByText(QUESTION)).toBeNull();
    act(() => goodMoment("supported"));
    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.getByText("At most 2 a week.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notify me" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No thanks" })).toBeTruthy();
    expect(events().some((e) => e.name === "notify_prompt")).toBe(true);
  });

  it("'No thanks' hides it, remembers the answer and records it", () => {
    render(<NotifyCard />);
    act(() => goodMoment("supported"));
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(JSON.parse(localStorage.getItem(PROMPT_KEY)!).declines).toBe(1);
    expect(events().some((e) => e.name === "notify_optin" && e.props["result"] === "dismissed")).toBe(true);
    act(() => goodMoment("supported"));
    expect(screen.queryByText(QUESTION)).toBeNull(); // not again right away
  });

  it("'Notify me' turns notifications on and the card doesn't come back", async () => {
    enablePush.mockResolvedValue("on");
    render(<NotifyCard />);
    act(() => goodMoment("supported"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Notify me" })));
    expect(enablePush).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(JSON.parse(localStorage.getItem(PROMPT_KEY)!).accepted).toBe(true);
    act(() => goodMoment("supported"));
    expect(screen.queryByText(QUESTION)).toBeNull();
  });

  it("on an iPhone that hasn't installed the game, it explains Add to Home Screen instead", () => {
    render(<NotifyCard />);
    act(() => goodMoment("needs_install"));
    expect(screen.getByText(/tap Share, then Add to Home Screen/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Notify me" })).toBeNull();
  });

  it("shows nothing where notifications can't work or were blocked", () => {
    render(<NotifyCard />);
    act(() => goodMoment("unsupported"));
    act(() => goodMoment("blocked"));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });
  it("inside Instagram or Facebook on an iPhone, it says to open Safari first", () => {
    const real = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0", configurable: true });
    try {
      render(<NotifyCard />);
      act(() => goodMoment("needs_install"));
      expect(screen.getByText(/open this page in Safari/)).toBeTruthy();
    } finally {
      Object.defineProperty(navigator, "userAgent", { value: real, configurable: true });
    }
  });
});
