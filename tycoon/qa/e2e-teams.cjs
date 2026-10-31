// End-to-end QA: customers pick Team Hawthorne or Team Hillsdale (iPhone 13 profile, touch).
const { chromium, devices } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:5173";
const KEY = "pawtastic-tycoon-save-v1";
let pass = 0,
  fail = 0;
const out = [];
const check = (n, ok, d = "") => {
  ok ? pass++ : fail++;
  out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
};

(async () => {
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const save = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), KEY);
  const vh = page.viewportSize().height;
  async function fresh(path, setup = {}) {
    await page.goto(BASE + "/help");
    await page.evaluate((s) => {
      localStorage.clear();
      sessionStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      localStorage.setItem(
        "pawtastic-settings-v1",
        JSON.stringify({ view: "overhead", seenWalkHelp: true }),
      );
    }, setup);
    await page.waitForTimeout(300);
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
  }
  const dialog = () => page.getByRole("dialog", { name: "Pick your team!" });

  // 1) New player: the picker opens by itself
  await fresh("/");
  check("a new player is asked to pick a team", await dialog().isVisible());
  const joinHb = await page.getByRole("button", { name: "Join Team Hawthorne" }).boundingBox();
  check(
    "team buttons are big enough to tap",
    joinHb && joinHb.height >= 44,
    JSON.stringify(joinHb),
  );
  await page.getByRole("button", { name: "Not sure yet" }).tap();
  await page.waitForTimeout(300);
  check('"Not sure yet" closes it', !(await dialog().isVisible()));
  await page.getByRole("link", { name: "Recess Rush" }).first().tap();
  await page.waitForTimeout(600);
  await page.getByRole("link", { name: "Home" }).tap();
  await page.waitForTimeout(800);
  check("…and it doesn't nag again this visit", !(await dialog().isVisible()));
  check(
    "the home page offers both teams",
    await page.getByRole("button", { name: "Team Hillsdale", exact: true }).isVisible(),
  );

  // 2) Join Team Hillsdale from the home page → daycare opens in Hillsdale
  await page.getByRole("button", { name: "Team Hillsdale", exact: true }).tap();
  await page.waitForTimeout(500);
  let s = await save();
  check(
    "joining saves the team and makes Hillsdale home for a new daycare",
    s.team === "hillsdale" && s.home === "hillsdale",
    JSON.stringify({ team: s.team, home: s.home }),
  );
  check(
    "the home page shows Team Hillsdale",
    await page
      .getByRole("heading", { name: /Team Hillsdale/ })
      .first()
      .isVisible(),
  );
  check(
    "team totals degrade gracefully without the server",
    await page
      .getByTestId("team-standings")
      .innerText()
      .then((t) => /aren't available|pts/.test(t)),
  );
  const ev = await page.evaluate(() =>
    (window.__pawtasticEvents || []).filter((e) => e.name === "team_pick"),
  );
  check("the pick is measured", ev.length === 1 && ev[0].props.team === "hillsdale");
  await page.getByRole("link", { name: /Open your daycare/ }).tap();
  await page.waitForURL(/daycare/);
  await page.waitForTimeout(2000);
  s = await save();
  check(
    "the first customer arrives at the Hillsdale daycare",
    s.dogs.length >= 1 && s.dogs.every((d) => d.site === "hillsdale") && s.site === "hillsdale",
  );
  check(
    "the daycare header says Hillsdale",
    await page
      .locator("header")
      .getByText(/Hillsdale/)
      .first()
      .isVisible(),
  );
  check(
    "the team adventure is shown",
    (await page
      .getByText(/The Great Ball Hunt/)
      .first()
      .isVisible()) &&
      (await page
        .getByText(/chapter 1\/6: Ball count/)
        .first()
        .isVisible()),
  );

  // 3) Care earns team points and adventure progress
  await page.locator('[data-testid^="quick-checkin-"]').first().tap();
  await page.waitForTimeout(400);
  const pts = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pawtastic-team-points") || "{}"),
  );
  check("checking a pup in earns a team point", pts.total === 1, JSON.stringify(pts));
  check("…and moves the adventure forward (1/3)", await page.getByText("1/3").first().isVisible());
  // finish chapter 1 quickly via the save, then claim in the UI
  await page.goto(BASE + "/help", { waitUntil: "domcontentloaded" }); // leave the daycare so its autosave stops
  await page.waitForTimeout(500);
  s = await save();
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k, JSON.stringify(v)),
    [KEY, { ...s, stats: { ...s.stats, admitted: s.stats.admitted + 2 } }],
  );
  await page.goto(BASE + "/daycare", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const coins = (await save()).coins;
  await page.getByTestId("claim-chapter").tap();
  await page.waitForTimeout(400);
  s = await save();
  check(
    "claiming a finished chapter pays its reward and opens the next",
    s.coins - coins === 60 && s.adventure.chapter === 1,
    `coins ${coins}→${s.coins}, chapter ${s.adventure.chapter}`,
  );
  check(
    "the next chapter is Fetch fever",
    await page
      .getByText(/chapter 2\/6: Fetch fever/)
      .first()
      .isVisible(),
  );

  // 4) Switching is limited to once a week
  await page.getByRole("button", { name: "Settings" }).tap();
  await page.getByRole("button", { name: /Your team: pick or switch/ }).tap();
  await page.waitForTimeout(300);
  check(
    "the picker marks your current team",
    await page.getByRole("button", { name: "Your team ✓" }).isVisible(),
  );
  await page.getByRole("button", { name: "Join Team Hawthorne" }).tap();
  await page.waitForTimeout(400);
  check(
    "switching again within a week is refused, with the reason",
    (await save()).team === "hillsdale" &&
      (await page
        .getByText(/once a week/)
        .first()
        .isVisible()),
  );

  // 5) Second location is the other town
  await page.keyboard.press("Escape"); // closes the team picker…
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape"); // …then the Settings sheet it was opened from
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: "upgrades" }).tap();
  check(
    "a Hillsdale daycare expands to Hawthorne",
    await page.getByText("Second Location: Hawthorne").isVisible(),
  );

  // 6) An existing Hawthorne player who joins Team Hillsdale keeps their daycare
  const nyDay = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const st = {
    admitted: 12,
    baths: 3,
    plays: 9,
    earned: 900,
    checkouts: 8,
    cleans: 1,
    boarders: 0,
    shares: 0,
    runs: 0,
    scuffles: 0,
  };
  await fresh("/", {
    [KEY]: JSON.stringify({
      v: 4,
      coins: 800,
      dogs: [],
      staff: [{ id: "s0", name: "Phil", energy: 100 }],
      tutorial: -1,
      stats: st,
      missionBase: st,
      missionDay: nyDay(),
    }),
  });
  await page.getByRole("button", { name: "Join Team Hillsdale" }).tap();
  await page.waitForTimeout(400);
  s = await save();
  check(
    "an existing Hawthorne daycare stays put when joining Team Hillsdale",
    s.team === "hillsdale" && s.home === "hawthorne" && s.coins === 800,
  );
  check(
    "…and is told how to open Hillsdale",
    await page
      .getByText(/Open Hillsdale as your second location/)
      .first()
      .isVisible(),
  );

  // 7) Visit + recommend put your team's location first
  await page.goto(BASE + "/visit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const firstCard = await page.locator("main article h2").first().innerText();
  check(
    "Visit shows your team's PAWtastic first",
    /Hillsdale · your team/.test(firstCard),
    firstCard,
  );
  await page.getByRole("button", { name: "Share and invite friends" }).tap();
  await page.waitForTimeout(500);
  check(
    '"Recommend PAWtastic" highlights your team',
    await page.getByRole("button", { name: "Hillsdale (your team)" }).isVisible(),
  );
  await page.keyboard.press("Escape");

  // 8) Weekly standings (server response simulated)
  await page.route("**/api/public/team-standings", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thisWeek: {
          hawthorne: { points: 340, players: 9 },
          hillsdale: { points: 410, players: 11 },
        },
        lastWeek: {
          hawthorne: { points: 500, players: 12 },
          hillsdale: { points: 480, players: 10 },
        },
      }),
    }),
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const standings = await page.getByTestId("team-standings").innerText();
  check(
    "this week's team totals show both teams",
    /Team Hawthorne[\s\S]*340 pts · 9 players/.test(standings) &&
      /Team Hillsdale \(you\)[\s\S]*410 pts · 11 players/.test(standings),
    standings.replace(/\n/g, " | "),
  );
  check("last week's winner is announced", /Last week: Team Hawthorne won/.test(standings));
  await page.screenshot({ path: "qa/out/team-card.png", fullPage: true });

  const layout = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("no sideways overflow", layout <= 0);
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(out.join("\n"));
  console.error(e);
  process.exit(2);
});
