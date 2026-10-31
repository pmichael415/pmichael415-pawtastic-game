import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { SaveConflictError, syncOnce, type Link, type SyncDeps, type SyncStatus } from "./cloud";
import { newGame, type GameState } from "./engine";

/** In-memory model of public.save_player_progress (conditional on revision; 0 = first insert). */
function fakeServer() {
  let row: { data: GameState; revision: number } | null = null;
  return {
    get row() { return row; },
    async upload(s: GameState, expected: number) {
      if (expected === 0) { if (row) throw new SaveConflictError(); row = { data: s, revision: 1 }; return 1; }
      if (!row || row.revision !== expected) throw new SaveConflictError();
      row = { data: s, revision: row.revision + 1 };
      return row.revision;
    },
  };
}
function device(server: ReturnType<typeof fakeServer>, local: GameState, link: Link | null) {
  const d = { local, link, status: { kind: "idle" } as SyncStatus };
  const deps: SyncDeps = { getLink: () => d.link, setLink: (l) => { d.link = l; }, readLocal: () => d.local, upload: (s, e) => server.upload(s, e), setStatus: (s) => { d.status = s; } };
  return { d, sync: () => syncOnce("u1", deps) };
}
const game = (coins: number) => ({ ...newGame(0, "d"), coins });

describe("multi-device cloud sync", () => {
  it("a stale device pauses with a conflict instead of overwriting newer cloud progress", async () => {
    const server = fakeServer();
    const a = device(server, game(100), { userId: "u1", revision: 0 });
    expect((await a.sync()).kind).toBe("ok");
    const b = device(server, game(100), { userId: "u1", revision: 1 }); // B linked by choosing cloud rev 1
    b.d.local = game(900);
    expect((await b.sync()).kind).toBe("ok"); // B is newer → rev 2
    a.d.local = game(150);
    expect((await a.sync()).kind).toBe("conflict"); // A still thinks rev 1
    expect(server.row!.data.coins).toBe(900);
    expect(a.d.link!.revision).toBe(1);
  });

  it("concurrent first saves: exactly one wins, the other gets a conflict", async () => {
    const server = fakeServer();
    const a = device(server, game(1), { userId: "u1", revision: 0 });
    const b = device(server, game(2), { userId: "u1", revision: 0 });
    const results = await Promise.all([a.sync(), b.sync()]);
    expect(results.map((r) => r.kind).sort()).toEqual(["conflict", "ok"]);
    expect([1, 2]).toContain(server.row!.data.coins);
  });

  it("unchanged progress is not re-uploaded, so idle devices don't cause false conflicts", async () => {
    const server = fakeServer();
    const a = device(server, game(10), { userId: "u1", revision: 0 });
    await a.sync();
    expect((await a.sync()).kind).toBe("idle");
    a.d.local = { ...a.d.local, lastSeen: 999 };
    expect((await a.sync()).kind).toBe("idle");
    expect(server.row!.revision).toBe(1);
  });

  it("upload errors surface as an error status, not success", async () => {
    const deps: SyncDeps = { getLink: () => ({ userId: "u1", revision: 3 }), setLink: () => {}, readLocal: () => game(5), upload: async () => { throw new Error("Cloud save failed — we'll retry"); }, setStatus: () => {} };
    expect(await syncOnce("u1", deps)).toEqual({ kind: "error", message: "Cloud save failed — we'll retry" });
  });

  it("an unlinked or other-account device never uploads", async () => {
    const upload = vi.fn();
    const deps: SyncDeps = { getLink: () => ({ userId: "someone-else", revision: 1 }), setLink: () => {}, readLocal: () => game(5), upload, setStatus: () => {} };
    expect((await syncOnce("u1", deps)).kind).toBe("idle");
    expect(upload).not.toHaveBeenCalled();
  });
});
