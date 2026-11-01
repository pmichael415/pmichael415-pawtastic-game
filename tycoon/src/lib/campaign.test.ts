import { beforeEach, describe, expect, it } from "vitest";
import { attributionProps, captureFirstTouch, cleanTag, firstTouch, readCampaign } from "./campaign";
import { startSession, track } from "./analytics";

type Ev = { name: string; props: Record<string, unknown> };
const events = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []);
const last = (name: string) => [...events()].reverse().find((e) => e.name === name);

describe("campaign tags (ad attribution)", () => {
  beforeEach(() => localStorage.clear());

  it("keeps only short, plain tags", () => {
    expect(cleanTag("Facebook")).toBe("facebook");
    expect(cleanTag("  fall promo ")).toBe("fall-promo");
    expect(cleanTag("<script>")).toBeNull();
    expect(cleanTag("a".repeat(61))).toBeNull();
    expect(cleanTag("")).toBeNull();
    expect(cleanTag(null)).toBeNull();
  });

  it("reads utm tags from a visit's address", () => {
    expect(readCampaign("?utm_source=facebook&utm_medium=paid&utm_campaign=hawthorne-fall&utm_content=video1")).toEqual({
      source: "facebook",
      medium: "paid",
      campaign: "hawthorne-fall",
      content: "video1",
    });
    expect(readCampaign("?ref=ABCDEFGH")).toBeNull();
    expect(readCampaign("?utm_source=%3Cscript%3E")).toBeNull();
  });

  it("remembers the first campaign that brought this device, never overwriting it", () => {
    expect(captureFirstTouch("?utm_source=facebook&utm_campaign=a")?.source).toBe("facebook");
    expect(captureFirstTouch("?utm_source=google&utm_campaign=b")?.source).toBe("google");
    expect(firstTouch()?.source).toBe("facebook");
    expect(attributionProps()).toEqual({ ft_source: "facebook", ft_campaign: "a" });
  });

  it("an untagged first visit doesn't block a later tagged one from becoming first touch", () => {
    expect(captureFirstTouch("")).toBeNull();
    expect(attributionProps()).toEqual({});
    captureFirstTouch("?utm_source=nextdoor");
    expect(attributionProps()).toEqual({ ft_source: "nextdoor" });
  });
});

describe("analytics carries campaign tags", () => {
  beforeEach(() => localStorage.clear());

  it("session_start records this visit's tags and the first touch; booking clicks carry the first touch", () => {
    window.history.replaceState({}, "", "/?utm_source=facebook&utm_campaign=a");
    startSession("home");
    const s = last("session_start");
    expect(s?.props).toMatchObject({ utm_source: "facebook", utm_campaign: "a", ft_source: "facebook", ft_campaign: "a" });
    expect(s?.props).not.toHaveProperty("utm_medium");

    track("booking_click", { location: "hillsdale" });
    expect(last("booking_click")?.props).toMatchObject({ location: "hillsdale", ft_source: "facebook", ft_campaign: "a" });
    track("recess_run", { score: 1 });
    expect(last("recess_run")?.props).not.toHaveProperty("ft_source");
    window.history.replaceState({}, "", "/");
  });
});
