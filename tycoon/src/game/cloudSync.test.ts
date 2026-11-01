import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { SaveConflictError, chooseDevice, reconcile, syncSlot, chooseCloud, type CloudRows, type Links, type SyncDeps, type SyncStatus } from "./cloud";
import { daycareOf, recessOf, type GameId, type SlotData } from "./cloudSlots";
import { newGame, type GameState } from "./engine";

/** In-memory model of public.save_game_progress: one row per game, conditional on revision (0 = first save). */
function fakeServer() {
  const rows: Partial<Record<GameId, { data: unknown; revision: number }>> = {};
  let down = false;
  return {
    rows,
    goDown() { down = true; },
    async upload(game: GameId, data: unknown, expected: number) {
      if (down) throw new Error("Cloud save failed — we'll retry");
      const row = rows[game];
      if (expected === 0) { if (row) throw new SaveConflictError(); rows[game] = { data: structuredClone(data), revision: 1 }; return 1; }
      if (!row || row.revision !== expected) throw new SaveConflictError();
      rows[game] = { data: structuredClone(data), revision: row.revision + 1 };
      return row.revision + 1;
    },
    async fetchAll(): Promise<CloudRows> {
      if (down) throw new Error("Couldn't reach your cloud saves");
      const out: CloudRows = {};
      for (const [g, r] of Object.entries(rows)) out[g as GameId] = { data: structuredClone(r!.data), revision: r!.revision, updated_at: "now" };
      return out;
    },
  };
}
type Local = { [G in GameId]?: SlotData[G] };
function phone(server: ReturnType<typeof fakeServer>, local: Local = {}, opts: { canWrite?: (g: GameId) => boolean } = {}) {
  const p = { local, links: null as Links | null, status: {} as Partial<Record<GameId, SyncStatus>> };
  const deps: SyncDeps = {
    getLinks: () => p.links,
    setLinks: (l) => { p.links = l; },
    read: <G extends GameId>(g: G) => (p.local[g] ?? null) as SlotData[G] | null,
    write: <G extends GameId>(g: G, d: SlotData[G]) => { (p.local as Record<string, unknown>)[g] = d; },
    upload: (g, d, e) => server.upload(g, d, e),
    fetchAll: () => server.fetchAll(),
    setStatus: (g, s) => { p.status[g] = s; },
    ...(opts.canWrite ? { canWrite: opts.canWrite } : {}),
  };
  return { p, deps, settle: () => reconcile("u1", deps), sync: (g: GameId) => syncSlot("u1", g, deps) };
}
const day = (coins: number, admitted = 5): GameState => daycareOf({ ...newGame(0, "2026-11-01"), coins, stats: { ...newGame(0, "2026-11-01").stats, admitted } });
const run = (best: number) => recessOf({ ...newGame(0, "2026-11-01"), recessBest: best, recessDay: "2026-11-01" });
const grad = (n: number) => ({ version: 1 as const, dog: { name: "Biscuit" }, progress: { levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 2, score: 100 }])) } });

describe("signing in", () => {
  it("a phone with progress and an empty account saves each game that has real progress", async () => {
    const server = fakeServer();
    const a = phone(server, { daycare: day(900), recess: run(420), graduation: grad(0) });
    expect(await a.settle()).toEqual({ daycare: "saved", recess: "saved", graduation: "linked" });
    expect(server.rows.daycare!.revision).toBe(1);
    expect(server.rows.recess!.revision).toBe(1);
    expect(server.rows.graduation).toBeUndefined(); // an enrolled pup with no levels isn't uploaded
  });

  it("a new phone loads every game that has cloud progress, each into its own place", async () => {
    const server = fakeServer();
    await phone(server, { daycare: day(900), recess: run(420), graduation: grad(8) }).settle();
    const b = phone(server, { daycare: day(500, 0) }); // fresh tutorial daycare only
    expect(await b.settle()).toEqual({ daycare: "loaded", recess: "loaded", graduation: "loaded" });
    expect((b.p.local.daycare as GameState).coins).toBe(900);
    expect((b.p.local.recess as SlotData["recess"]).best).toBe(420);
    expect(Object.keys((b.p.local.graduation as ReturnType<typeof grad>).progress.levels)).toHaveLength(8);
  });

  it("progress in both places: only that game asks; the others load or save by themselves", async () => {
    const server = fakeServer();
    await phone(server, { daycare: day(900), recess: run(420) }).settle();
    const b = phone(server, { daycare: day(300, 12), graduation: grad(3) });
    expect(await b.settle()).toEqual({ daycare: "ask", recess: "loaded", graduation: "saved" });
    expect(b.p.status.daycare).toEqual({ kind: "conflict" });
    expect((b.p.local.daycare as GameState).coins).toBe(300); // nothing overwritten while asking
    expect(server.rows.daycare!.data).toMatchObject({ coins: 900 });
  });

  it("the player's choice settles one game: keep this phone, or use the cloud", async () => {
    const server = fakeServer();
    await phone(server, { daycare: day(900), recess: run(420) }).settle();
    const b = phone(server, { daycare: day(300, 12), recess: run(50) });
    await b.settle();
    await chooseDevice("u1", "daycare", b.deps);
    expect(server.rows.daycare).toMatchObject({ revision: 2, data: { coins: 300 } });
    await chooseCloud("u1", "recess", b.deps);
    expect((b.p.local.recess as SlotData["recess"]).best).toBe(420);
    expect(b.p.status).toMatchObject({ daycare: { kind: "ok" }, recess: { kind: "ok" } });
  });

  it("can't reach the server: every game shows an error and nothing is uploaded or overwritten", async () => {
    const server = fakeServer();
    server.goDown();
    const a = phone(server, { daycare: day(900) });
    expect(await a.settle()).toEqual({ daycare: "error", recess: "error", graduation: "error" });
    expect(a.p.links).toBeNull();
    expect((a.p.local.daycare as GameState).coins).toBe(900);
  });

  it("Graduation Day isn't swapped while it's open on screen; it loads once the player leaves", async () => {
    const server = fakeServer();
    await phone(server, { graduation: grad(8) }).settle();
    let onGraduationScreen = true;
    const b = phone(server, {}, { canWrite: (g) => g !== "graduation" || !onGraduationScreen });
    expect((await b.settle()).graduation).toBeUndefined();
    expect(b.p.local.graduation).toBeUndefined();
    onGraduationScreen = false;
    expect((await b.settle()).graduation).toBe("loaded");
  });
});

describe("saving automatically, game by game", () => {
  it("a stale phone pauses only the game that changed elsewhere", async () => {
    const server = fakeServer();
    const a = phone(server, { daycare: day(100), recess: run(10) });
    await a.settle();
    const b = phone(server, {});
    await b.settle(); // loads both
    b.p.local.daycare = day(900);
    expect((await b.sync("daycare")).kind).toBe("ok");
    a.p.local.daycare = day(150);
    a.p.local.recess = run(20);
    expect((await a.sync("daycare")).kind).toBe("conflict");
    expect((await a.sync("recess")).kind).toBe("ok");
    expect(server.rows.daycare!.data).toMatchObject({ coins: 900 });
    expect(server.rows.recess!.data).toMatchObject({ best: 20 });
  });

  it("after a conflict, a phone with nothing real there loads the newer save by itself", async () => {
    const server = fakeServer();
    const a = phone(server, { recess: run(10) });
    await a.settle();
    server.rows.recess = { data: run(800), revision: 5 }; // played on another phone
    a.p.local.recess = run(0); // this phone was reset
    a.p.links!.slots.recess = { revision: 1 };
    expect((await a.settle()).recess).toBeUndefined(); // still linked: nothing to settle
    a.p.local.recess = run(30);
    expect((await a.sync("recess")).kind).toBe("conflict"); // unlinks recess
    a.p.local.recess = run(0);
    expect((await a.settle()).recess).toBe("loaded");
    expect((a.p.local.recess as SlotData["recess"]).best).toBe(800);
  });

  it("unchanged or empty progress isn't uploaded, so idle phones never cause conflicts", async () => {
    const server = fakeServer();
    const a = phone(server, { daycare: day(10) });
    await a.settle();
    expect((await a.sync("daycare")).kind).toBe("idle");
    a.p.local.daycare = { ...(a.p.local.daycare as GameState), lastSeen: 999 };
    expect((await a.sync("daycare")).kind).toBe("idle");
    expect((await a.sync("graduation")).kind).toBe("idle");
    expect(server.rows.daycare!.revision).toBe(1);
  });

  it("another account's links are never used to upload", async () => {
    const server = fakeServer();
    const a = phone(server, { daycare: day(10) });
    a.p.links = { userId: "someone-else", slots: { daycare: { revision: 1 } } };
    expect((await a.sync("daycare")).kind).toBe("idle");
    expect(server.rows.daycare).toBeUndefined();
  });
});
