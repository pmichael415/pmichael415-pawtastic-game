// Every button in the new game is at least 44px tall (Tailwind h-11), like the rest of the hub.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname);
describe("tap targets", () => {
  it("no button in the new Daycare UI is shorter than 44px", () => {
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))) {
      readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
        if (/<(Button|button)\b/.test(line) || /className=.*\bh-(9|10)\b/.test(line)) if (/\bh-(8|9|10)\b/.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
