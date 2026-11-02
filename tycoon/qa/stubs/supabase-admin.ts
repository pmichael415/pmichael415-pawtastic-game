// DEVELOPMENT-ONLY stand-in for @/integrations/supabase/client.server (see qa/stubs/db.ts). Covers the calls the
// hub's server code makes: rpc(), and from(table).select/insert/update/eq/is/in/order/limit/maybeSingle/single.
// A client made for a user (makeClient(uid)) only sees that user's rows, like the real row-level security.
import { stubDb } from "./db";

type Result = { data: unknown; error: { message: string; code?: string } | null };
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`stub: bad identifier ${s}`);
  return s;
};
const val = (v: unknown) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" = "select";
  private cols = "*";
  private rows: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};
  private where: [string, string, unknown][] = [];
  private orderBy = "";
  private max = 0;
  private one: "" | "maybe" | "single" = "";
  constructor(private table: string, private uid: string | null) {}
  select(cols = "*") {
    if (this.op === "select") this.cols = cols.split(",").map((c) => ident(c.trim())).join(", ");
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  eq(c: string, v: unknown) { this.where.push([ident(c), "=", v]); return this; }
  is(c: string, v: unknown) { this.where.push([ident(c), "is", v]); return this; }
  in(c: string, v: unknown[]) { this.where.push([ident(c), "in", v]); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.orderBy = ` ORDER BY ${ident(c)} ${o.ascending === false ? "DESC" : "ASC"}`; return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }

  private async run(): Promise<Result> {
    const db = await stubDb();
    const params: unknown[] = [];
    const p = (v: unknown) => (params.push(val(v)), `$${params.length}`);
    const where = [...this.where, ...(this.uid ? ([["user_id", "=", this.uid]] as [string, string, unknown][]) : [])];
    const clause = where.length
      ? " WHERE " + where.map(([c, op, v]) => (op === "is" ? `${c} IS ${v === null ? "NULL" : "NOT NULL"}` : op === "in" ? `${c} = ANY(${p(v)})` : `${c} = ${p(v)}`)).join(" AND ")
      : "";
    const t = `public.${ident(this.table)}`;
    try {
      if (this.op === "insert") {
        const cols = Object.keys(this.rows[0] ?? {}).map(ident);
        const values = this.rows.map((r) => `(${cols.map((c) => p(r[c])).join(", ")})`).join(", ");
        const r = await db.query(`INSERT INTO ${t} (${cols.join(", ")}) VALUES ${values} RETURNING *`, params);
        return { data: r.rows, error: null };
      }
      if (this.op === "update") {
        const set = Object.entries(this.patch).map(([c, v]) => `${ident(c)} = ${p(v)}`).join(", ");
        const r = await db.query(`UPDATE ${t} SET ${set}${clause} RETURNING *`, params);
        return { data: r.rows, error: null };
      }
      const r = await db.query(`SELECT ${this.cols} FROM ${t}${clause}${this.orderBy}${this.max ? ` LIMIT ${this.max}` : ""}`, params);
      if (this.one) {
        if (r.rows.length > 1 || (this.one === "single" && !r.rows.length)) return { data: null, error: { message: "not exactly one row" } };
        return { data: r.rows[0] ?? null, error: null };
      }
      return { data: r.rows, error: null };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? String(e), ...(err.code ? { code: err.code } : {}) } };
    }
  }
  then<A, B>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }
}

export function makeClient(uid: string | null) {
  return {
    from: (table: string) => new Query(table, uid),
    async rpc(name: string, args: Record<string, unknown> = {}): Promise<Result> {
      const db = await stubDb();
      const keys = Object.keys(args).map(ident);
      try {
        const r = await db.query<{ r: unknown }>(`SELECT public.${ident(name)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) AS r`, keys.map((k) => val(args[k])));
        return { data: r.rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}

export const supabaseAdmin = makeClient(null);
