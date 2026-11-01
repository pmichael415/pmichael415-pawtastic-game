import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { Route as Root } from "@/routes/__root";
import { PUBLIC_ORIGIN } from "@/lib/site";

const pub = path.resolve(__dirname, "../../public");

describe("installable hub (needed for iPhone notifications)", () => {
  const m = JSON.parse(readFileSync(path.join(pub, "manifest.webmanifest"), "utf8"));
  it("opens as a standalone app from the home screen, tagged so installs can be counted", () => {
    expect(m).toMatchObject({ name: "PAWtastic Games", start_url: "/?utm_source=homescreen", display: "standalone", background_color: "#FAF8F5" });
  });
  it("has 192 and 512 px icons plus a maskable one, and every icon file exists", () => {
    const icons = m.icons as { src: string; sizes: string; purpose?: string }[];
    expect(icons.some((i) => i.sizes === "192x192" && (i.purpose ?? "any") === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && (i.purpose ?? "any") === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const i of icons) expect(existsSync(path.join(pub, i.src))).toBe(true);
  });
});

describe("link previews and home-screen tags", () => {
  const head = (Root.options.head as unknown as () => { meta: Record<string, string>[]; links: Record<string, string>[] })();
  const meta = (key: string) => head.meta.find((x) => x["property"] === key || x["name"] === key)?.["content"];
  it("shares with a title, description, absolute image and address", () => {
    expect(meta("og:title")).toBe("PAWtastic Games");
    expect(meta("og:description")).toMatch(/Daycare Tycoon, Recess Rush and Graduation Day/);
    expect(meta("og:image")).toBe(`${PUBLIC_ORIGIN}/brand/og-image.png`);
    expect(meta("twitter:image")).toBe(`${PUBLIC_ORIGIN}/brand/og-image.png`);
    expect(meta("og:url")).toBe(PUBLIC_ORIGIN);
    expect(existsSync(path.join(pub, "brand/og-image.png"))).toBe(true);
  });
  it("links the manifest and sets the iPhone home-screen tags", () => {
    expect(head.links.some((l) => l["rel"] === "manifest" && l["href"] === "/manifest.webmanifest")).toBe(true);
    expect(head.links.some((l) => l["rel"] === "apple-touch-icon" && l["href"] === "/icons/icon-192.png")).toBe(true);
    expect(meta("apple-mobile-web-app-capable")).toBe("yes");
    expect(meta("apple-mobile-web-app-title")).toBe("PAWtastic");
  });
});

describe("privacy page", () => {
  it("/privacy has its own page", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/privacy").at(-1)?.routeId).toBe("/privacy");
  });
});
