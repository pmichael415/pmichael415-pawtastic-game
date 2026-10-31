import { beforeEach, describe, expect, it } from "vitest";
import {
  captureReferral,
  inviteLink,
  isRefCode,
  myReferralCode,
  recommendLink,
  referredBy,
} from "./referral";
import { LOCATIONS } from "./locations";

describe("referral codes and links", () => {
  beforeEach(() => localStorage.clear());

  it("each device gets one random, stable, unguessable code", () => {
    const a = myReferralCode();
    expect(isRefCode(a)).toBe(true);
    expect(myReferralCode()).toBe(a);
    localStorage.clear();
    expect(myReferralCode()).not.toBe(a);
    expect(isRefCode("ABC")).toBe(false);
    expect(isRefCode("ABCD1234")).toBe(false); // 1 is excluded (looks like I)
    expect(isRefCode("<script>")).toBe(false);
  });

  it("captures the first valid referral only, never your own code", () => {
    const mine = myReferralCode();
    expect(captureReferral(`?ref=${mine}`)).toBeNull();
    expect(referredBy()).toBeNull();
    expect(captureReferral("?ref=bad!")).toBeNull();
    expect(captureReferral("?ref=ABCDEFGH")).toBe("ABCDEFGH");
    expect(captureReferral("?ref=ZZZZZZZZ")).toBeNull(); // first touch wins
    expect(referredBy()).toBe("ABCDEFGH");
  });

  it("invite links carry the code and campaign tags", () => {
    const u = new URL(inviteLink("https://games.example.com", "ABCDEFGH", "daycare"));
    expect(u.origin + u.pathname).toBe("https://games.example.com/");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      ref: "ABCDEFGH",
      utm_source: "referral",
      utm_medium: "share",
      utm_campaign: "pawtastic_games",
      utm_content: "daycare",
    });
  });

  it("recommend links open the real evaluation form for the chosen location, tagged for attribution", () => {
    const ht = new URL(recommendLink(LOCATIONS[0]!, "ABCDEFGH"));
    expect(ht.origin + ht.pathname).toBe("https://pawtasticacademy.com/booking-page-ht");
    expect(Object.fromEntries(ht.searchParams)).toMatchObject({
      utm_source: "pawtastic_games_referral",
      utm_medium: "friend_share",
      utm_campaign: "free_evaluation",
      utm_content: "hawthorne",
      utm_term: "ABCDEFGH",
    });
    const hd = new URL(recommendLink(LOCATIONS[1]!, "ABCDEFGH"));
    expect(hd.origin + hd.pathname).toBe("https://pawtasticacademy.com/booking-page");
  });
});
