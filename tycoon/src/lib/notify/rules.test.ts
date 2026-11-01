import { describe, expect, it } from "vitest";
import { campaignUrl, isAllowedPushEndpoint, validateMessage } from "./rules";

describe("only real browser push services are accepted", () => {
  it("accepts Chrome/Android, Firefox, Apple and Windows push endpoints", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/QW",
      "https://api.push.apple.com/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ])
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
  });
  it("refuses anything that could make the server call elsewhere", () => {
    for (const bad of [
      "http://fcm.googleapis.com/x",
      "https://evil.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.com/x",
      "https://user@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://localhost/x",
      "https://notify.windows.com.evil.com/x",
      "https://push.apple.com.evil.com/x",
      "not a url",
    ])
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
  });
});

describe("message rules", () => {
  it("accepts a normal weekly message", () => {
    expect(validateMessage({ title: "New week, new prizes!", body: "Team Hawthorne vs Team Hillsdale starts now.", path: "/" })).toEqual([]);
  });
  it("names each broken rule", () => {
    expect(validateMessage({ title: "x".repeat(51), body: "ok", path: "/" })).toEqual(["title"]);
    expect(validateMessage({ title: "ok", body: "x".repeat(141), path: "/" })).toEqual(["body"]);
    expect(validateMessage({ title: "", body: "ok", path: "/" })).toEqual(["title"]);
    for (const p of ["//evil.com", "https://evil.com", "/Recess", "recess", "/a b"]) expect(validateMessage({ title: "ok", body: "ok", path: p })).toEqual(["path"]);
  });
});

describe("links in messages are tagged so opens can be counted", () => {
  it("push and email links carry their channel and the message id", () => {
    expect(campaignUrl("/recess", "1b2c", "push")).toBe("/recess?utm_source=notification&utm_medium=push&utm_campaign=1b2c");
    expect(campaignUrl("/", "1b2c", "email")).toBe("/?utm_source=email&utm_medium=email&utm_campaign=1b2c");
  });
});
