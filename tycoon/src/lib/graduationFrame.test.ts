import { describe, expect, it } from "vitest";
import { graduationFrame } from "./graduationFrame";

const BASE = "/";
const GAME = "/graduation/index.html";

describe("Graduation Day frame address", () => {
  it("is the plain game normally, and leaves the hub address alone", () => {
    expect(graduationFrame(BASE, "", "")).toEqual({
      src: GAME,
      hubSearch: "",
      hubHash: "",
      moved: false,
    });
    expect(graduationFrame(BASE, "?ref=abc", "#top")).toEqual({
      src: GAME,
      hubSearch: "?ref=abc",
      hubHash: "#top",
      moved: false,
    });
    expect(graduationFrame("/play/", "", "").src).toBe("/play/graduation/index.html");
  });
  it("hands Stripe's return to the game and takes it off the hub address", () => {
    expect(
      graduationFrame(BASE, "?checkout=success&session_id=cs_live_a1B2c3&ref=abc", ""),
    ).toEqual({
      src: `${GAME}?checkout=success&session_id=cs_live_a1B2c3`,
      hubSearch: "?ref=abc",
      hubHash: "",
      moved: true,
    });
    expect(graduationFrame(BASE, "?checkout=cancel", "").src).toBe(`${GAME}?checkout=cancel`);
  });
  it("hands the email sign-in link's session to the game", () => {
    const hash =
      "#access_token=eyJ.a-b_c&expires_at=1&refresh_token=r1&token_type=bearer&type=magiclink";
    expect(graduationFrame(BASE, "", hash)).toEqual({
      src: `${GAME}${hash}`,
      hubSearch: "",
      hubHash: "",
      moved: true,
    });
  });
  it("passes nothing it doesn't recognise", () => {
    expect(graduationFrame(BASE, "?checkout=evil", "").src).toBe(GAME);
    expect(graduationFrame(BASE, "?checkout=success&session_id=cs_live_<script>", "").src).toBe(
      `${GAME}?checkout=success`,
    );
    expect(graduationFrame(BASE, "?checkout=success&session_id=" + "a".repeat(300), "").src).toBe(
      `${GAME}?checkout=success`,
    );
    expect(graduationFrame(BASE, "", "#refresh_token=x").src).toBe(GAME);
    expect(graduationFrame(BASE, "", '#access_token="><img>').src).toBe(GAME);
  });
});
