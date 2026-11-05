// The Marketing screen (customer-growth requirement §2, §3, §5), from the main daycare: Customers (each family's
// status and story, free outreach, who makes calls), Campaigns (cost, who, days, estimate, readiness) and Results
// (what each campaign and outreach brought, credited once; contribution after cost; overhead apart; unmet demand).
// Game coins only — no discounts, prizes, credit or real messages.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CAMPAIGNS } from "@/tycoon/catalog";
import {
  FREE_CALLS_PER_DAY,
  STAFF_CALLS,
  contact,
  familyStatus,
  familyStory,
  fmtHM,
  freeCallsLeft,
  outreachLog,
  outreachOffers,
  setOutreachStaff,
  type FamilyStatus,
} from "@/tycoon/customers";
import {
  campaignCard,
  customerSummary,
  runResult,
  runningRun,
  startCampaign,
  walkInBaseline,
} from "@/tycoon/marketing";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import { ownerFor } from "@/tycoon/visit";
import type { CampaignRun, Facility, TRegular, TResult, TycoonState } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const TABS = ["Customers", "Campaigns", "Results"] as const;
export type MarketingTab = (typeof TABS)[number];
const n = (x: number) => x.toLocaleString("en-US");
const signed = (x: number) => (x > 0 ? `+${n(x)}` : x < 0 ? `−${n(-x)}` : "0");
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const STATUS: Record<FamilyStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-sky-100 text-sky-900" },
  returning: { label: "Returning", cls: "bg-emerald-100 text-emerald-900" },
  regular: { label: "Regular", cls: "bg-primary/15 text-secondary" },
  inactive: { label: "Inactive", cls: "bg-muted text-muted-foreground" },
};

export function MarketingSheet({
  open,
  state,
  act,
  onClose,
  initialTab = "Customers",
}: {
  open: boolean;
  state: TycoonState;
  act: Act;
  onClose: () => void;
  initialTab?: MarketingTab;
}) {
  const [tab, setTab] = useState<MarketingTab>(initialTab);
  const f = fac(state);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Marketing</SheetTitle>
          <SheetDescription>
            Bring families in, earn their trust, bring them back. Game coins only — no discounts,
            prizes or real messages.
          </SheetDescription>
        </SheetHeader>
        <div
          role="tablist"
          aria-label="Marketing"
          className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {TABS.map((t) => (
            <Button
              key={t}
              role="tab"
              aria-selected={tab === t}
              size="sm"
              variant={tab === t ? "default" : "outline"}
              className="h-11 shrink-0"
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab} className="mt-2">
          {tab === "Customers" && <CustomersTab f={f} act={act} />}
          {tab === "Campaigns" && <CampaignsTab state={state} act={act} />}
          {tab === "Results" && <ResultsTab f={f} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Customers ----------

const ORDER: Record<string, number> = { followup: 0, invite: 1, thank: 2, suggest: 3 };
function CustomersTab({ f, act }: { f: Facility; act: Act }) {
  const [all, setAll] = useState(false);
  const sum = customerSummary(f);
  const left = freeCallsLeft(f);
  const hired = f.staff.filter((x) => !x.founder);
  const staffDay = outreachLog(f).staff;
  const caller = hired.find((x) => x.id === f.outreachBy);
  const rows = f.guestBook
    .map((g) => ({
      g,
      status: familyStatus(f, g),
      offers: outreachOffers(f, g),
      booking: (f.bookings ?? []).find((b) => b.name === g.name && b.breed === g.breed) ?? null,
    }))
    .sort(
      (a, b) =>
        (a.offers.length && !a.booking ? ORDER[a.offers[0]!.kind]! : 9) -
          (b.offers.length && !b.booking ? ORDER[b.offers[0]!.kind]! : 9) ||
        b.g.lastDay - a.g.lastDay,
    );
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap gap-1.5 text-xs font-semibold" aria-label="Families by status">
        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900">{sum.status.new} new</span>
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-900">
          {sum.status.returning} returning
        </span>
        <span className="rounded-full bg-primary/15 px-2 py-1 text-secondary">
          {plural(sum.status.regular, "regular")}
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
          {sum.status.inactive} inactive
        </span>
      </p>
      <div className="rounded-xl border border-border bg-background p-2 text-sm">
        <p className="font-semibold text-secondary">
          {left === 1 ? "1 free call left today" : `${left} free calls left today`}{" "}
          <span className="font-normal text-muted-foreground">
            ({FREE_CALLS_PER_DAY} each active day · one contact per family every few days)
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A call is free. The family decides once; a yes is a booking for a coming active day —
          never coins.
        </p>
        {hired.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-secondary">Calls in the midday break</p>
            <div
              role="group"
              aria-label="Who makes outreach calls"
              className="mt-1 flex flex-wrap gap-1.5"
            >
              <button
                type="button"
                aria-pressed={!caller}
                onClick={() => act((s) => setOutreachStaff(s, null))}
                className={`min-h-11 rounded-xl border px-3 text-xs font-semibold ${!caller ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-secondary"}`}
              >
                Only you
              </button>
              {hired.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={caller?.id === st.id}
                  onClick={() => act((s) => setOutreachStaff(s, st.id))}
                  className={`min-h-11 rounded-xl border px-3 text-xs font-semibold ${caller?.id === st.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-secondary"}`}
                >
                  {st.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {caller
                ? staffDay?.day === f.day
                  ? `${caller.name} called ${plural(staffDay.calls, "family", "families")} today — ${staffDay.booked} booked.`
                  : `${caller.name} calls up to ${STAFF_CALLS} families in each midday break — follow-ups first. Your free calls stay yours.`
                : `A team member can take up to ${STAFF_CALLS} calls a day for you.`}
            </p>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No families yet — serve your first family and they'll appear here.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Families">
          {shown.map(({ g, status, offers, booking }) => (
            <FamilyRow
              key={`${g.name}|${g.breed}`}
              f={f}
              g={g}
              status={status}
              offers={booking ? [] : offers}
              booking={booking}
              act={act}
              canCall={left > 0}
            />
          ))}
        </ul>
      )}
      {rows.length > 12 && !all && (
        <Button variant="outline" className="h-11 w-full" onClick={() => setAll(true)}>
          Show all {rows.length} families
        </Button>
      )}
    </div>
  );
}

const callLabel = (kind: string, label: string, owner: string) =>
  kind === "thank"
    ? `Say thank you to ${owner}`
    : kind === "invite"
      ? `Invite ${owner} back`
      : kind === "followup"
        ? `Follow up with ${owner}`
        : `${label} to ${owner}`;

function FamilyRow({
  f,
  g,
  status,
  offers,
  booking,
  act,
  canCall,
}: {
  f: Facility;
  g: TRegular;
  status: FamilyStatus;
  offers: ReturnType<typeof outreachOffers>;
  booking: { day: number; min: number } | null;
  act: Act;
  canCall: boolean;
}) {
  const owner = ownerFor(g);
  const st = STATUS[status];
  return (
    <li aria-label={`${g.name}'s family`} className="rounded-xl border border-border bg-card p-2">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-secondary">🐕 {g.name}</span>
        <span className="text-xs text-muted-foreground">
          {owner}'s family · {plural(g.visits, "visit")}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>
          {st.label}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-secondary">{familyStory(f, g)}</p>
      {booking && (
        <p className="mt-0.5 text-xs font-semibold text-primary">
          📅 Booked for day {booking.day} at {fmtHM(booking.min)}
        </p>
      )}
      {offers.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {offers.map((o) => (
            <div key={o.kind} className="flex items-center gap-2">
              <Button
                size="sm"
                variant={o.kind === "followup" ? "default" : "outline"}
                className="h-11 shrink-0"
                disabled={!canCall}
                aria-label={callLabel(o.kind, o.label, owner)}
                onClick={() =>
                  act((s) => contact(s, g, o.kind), {
                    event: { name: "tycoon_marketing", props: { outreach: o.kind } },
                  })
                }
              >
                {o.label}
              </Button>
              <span className="text-xs text-muted-foreground">{o.why}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

// ---------- Campaigns ----------

function CampaignsTab({ state, act }: { state: TycoonState; act: Act }) {
  const f = fac(state);
  const run = runningRun(f);
  const legacy = !run && f.campaign && f.day < f.campaign.untilDay ? f.campaign : null;
  return (
    <div className="space-y-3">
      {run && (
        <p
          role="status"
          className="rounded-xl bg-primary/10 p-2 text-sm font-semibold text-secondary"
        >
          {run.name} is running — day {f.day - run.startDay + 1} of {run.untilDay - run.startDay} ·{" "}
          {plural(run.responses, "response")} so far ({run.booked} booked). It ends after day{" "}
          {run.untilDay - 1}.
        </p>
      )}
      {legacy && (
        <p
          role="status"
          className="rounded-xl bg-primary/10 p-2 text-sm font-semibold text-secondary"
        >
          A campaign from an earlier version runs until day {legacy.untilDay}.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        One campaign at a time. Each buys a defined activity for game coins up front; responses come
        in as bookings over its active days — never guaranteed. Natural drop-offs carry on either
        way.
      </p>
      {CAMPAIGNS.map((c) => {
        const card = campaignCard(state, c.id);
        const blocked = !!card.locked || !card.ready || !!run || !!legacy || state.coins < c.price;
        return (
          <article
            key={c.id}
            aria-label={c.name}
            className={`rounded-xl border p-3 ${card.running ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold text-secondary">{c.name}</h3>
              <span className="ml-auto text-sm font-bold tabular-nums text-secondary">
                {n(c.price)} coins
              </span>
            </div>
            <p className="text-sm text-secondary">{c.who}</p>
            <p className="text-xs text-muted-foreground">
              {c.activity} · {card.days}
            </p>
            <p className="mt-1 text-sm font-semibold text-secondary">{card.estimate}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {card.checks.map((k) => (
                <li
                  key={k.label}
                  className={k.ok ? "text-secondary" : "font-semibold text-destructive"}
                >
                  {k.ok ? "✓" : "✗"} {k.label}: {k.text}
                </li>
              ))}
            </ul>
            {card.note && <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>}
            {card.warn && (
              <p className="mt-1 rounded-lg bg-amber-100 p-1.5 text-xs font-semibold text-amber-900">
                ⚠️ {card.warn}
              </p>
            )}
            {card.locked ? (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">{card.locked}</p>
            ) : (
              <>
                {!card.ready && card.why && (
                  <p className="mt-1 text-xs font-semibold text-destructive">{card.why}</p>
                )}
                {card.ready && state.coins < c.price && !run && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    You need {n(c.price - Math.max(0, state.coins))} more coins.
                  </p>
                )}
                <Button
                  className="mt-2 h-11 w-full"
                  disabled={blocked}
                  onClick={() =>
                    act((s) => startCampaign(s, c.id), {
                      event: { name: "tycoon_marketing", props: { campaign: c.id } },
                    })
                  }
                >
                  Launch {c.name} · {n(c.price)} coins
                </Button>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ---------- Results ----------

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 text-sm ${strong ? "font-bold" : ""}`}>
      <span className="text-secondary">{label}</span>
      <span className="tabular-nums text-secondary">{value}</span>
    </div>
  );
}

function RunCard({ f, run }: { f: Facility; run: CampaignRun }) {
  const r = runResult(f, run);
  const declined = Object.values(run.declined).reduce((a, k) => a + k, 0);
  return (
    <article
      aria-label={`${run.name} results`}
      className="rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-secondary">{run.name}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {r.ended
            ? `days ${run.startDay}–${run.untilDay - 1} · ended`
            : `running · ${plural(r.daysLeft, "active day")} left`}
        </span>
      </div>
      <div className="mt-1 space-y-0.5">
        <Row label="Coins spent" value={n(run.cost)} />
        <Row label="Families reached" value={n(run.reached)} />
        <Row
          label="Responses"
          value={`${run.responses} (${run.booked} booked, ${declined} declined)`}
        />
        <Row label="Arrivals" value={n(run.arrivals)} />
        <Row label="Completed paid visits" value={n(run.visits)} />
        <Row label="Attributed service revenue" value={n(run.revenue)} />
        <Row label="Direct service costs" value={n(run.costs)} />
        <Row label="Contribution after campaign cost" value={signed(r.contribution)} strong />
      </div>
      {declined > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Declined (unmet demand):{" "}
          {Object.entries(run.declined)
            .map(([k, v]) => `${k} ×${v}`)
            .join(", ")}
          .
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Overhead on those days — wages {n(r.overhead.wages)}, upkeep {n(r.overhead.upkeep)} — is
        paid for every family, so it's shown apart, not charged to the campaign.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
    </article>
  );
}

function ResultsTab({ f }: { f: Facility }) {
  const runs = [...(f.campaignRuns ?? [])].reverse();
  const o = outreachLog(f).stats;
  const base = walkInBaseline(f);
  const sum = customerSummary(f);
  const hurt = f.guestBook.filter((g) => g.issue && !g.issue.followedUp).length;
  const space = sum.reasons.filter((r) => /full/.test(r.reason)).reduce((a, r) => a + r.n, 0);
  const missingKind = sum.reasons
    .filter((r) => /^no .* playroom$/.test(r.reason))
    .reduce((a, r) => a + r.n, 0);
  return (
    <div className="space-y-3">
      {runs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No campaigns yet. Launch one from Campaigns — its results build up here, day by day.
        </p>
      )}
      {runs.map((r) => (
        <RunCard key={r.uid} f={f} run={r} />
      ))}
      <article
        aria-label="Outreach results"
        className="rounded-xl border border-border bg-card p-3"
      >
        <h3 className="font-semibold text-secondary">Outreach (free)</h3>
        <p className="text-sm text-secondary">
          {plural(o.calls, "call")} · {o.booked} booked · {plural(o.arrivals, "arrival")} ·{" "}
          {plural(o.visits, "completed paid visit")}
        </p>
        <p className="text-sm text-secondary">
          Attributed service revenue {n(o.revenue)} − direct costs {n(o.costs)} ={" "}
          <span className="font-bold">{signed(o.revenue - o.costs)}</span> (no coins spent)
        </p>
      </article>
      <section
        aria-label="With and without a campaign"
        className="rounded-xl border border-border bg-background p-3"
      >
        <h3 className="font-semibold text-secondary">First-time walk-ins a day</h3>
        <p className="text-sm text-secondary">
          With a campaign running:{" "}
          {base.with.days
            ? `${base.with.perDay} (over ${plural(base.with.days, "day")}, plus ${base.with.bookedPerDay} booked)`
            : "no days yet"}{" "}
          · without:{" "}
          {base.without.days
            ? `${base.without.perDay} (over ${plural(base.without.days, "day")})`
            : "no days yet"}
          .
        </p>
        <p className="text-xs text-muted-foreground">
          A comparison, not proof — reputation, rooms and reviews change too.
        </p>
      </section>
      <section aria-label="Customers" className="rounded-xl border border-border bg-background p-3">
        <h3 className="font-semibold text-secondary">
          Customers · last {plural(sum.days, "active day")}
        </h3>
        <p className="text-sm text-secondary">
          {plural(sum.came.newWalkIns, "first-time walk-in")} · {sum.came.returning} came back on
          their own · {sum.came.booked} booked
        </p>
        <p className="text-sm text-secondary">
          {plural(sum.status.regular, "regular")} · {sum.status.inactive} inactive ·{" "}
          {sum.status.new + sum.status.returning + sum.status.regular + sum.status.inactive}{" "}
          families in your guest book
        </p>
      </section>
      <section
        aria-label="Unmet demand"
        className="rounded-xl border border-border bg-background p-3"
      >
        <h3 className="font-semibold text-secondary">Families who couldn't come</h3>
        {sum.total === 0 ? (
          <p className="text-sm text-muted-foreground">None turned away lately.</p>
        ) : (
          <>
            <p className="text-sm text-secondary">
              By service: Daycare {sum.unmet.daycare} · Boarding {sum.unmet.boarding} · Bath{" "}
              {sum.unmet.bath}
              {Object.keys(sum.kinds).length
                ? ` · by kind: ${Object.entries(sum.kinds)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(", ")}`
                : ""}
            </p>
            <ul className="mt-1 text-sm">
              {sum.reasons.map((r) => (
                <li key={r.reason} className="flex justify-between">
                  <span className="text-secondary">{r.reason}</span>
                  <span className="tabular-nums text-secondary">{r.n}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section
        aria-label="What next"
        className="rounded-xl border border-primary/40 bg-primary/5 p-3"
      >
        <h3 className="font-semibold text-secondary">What next?</h3>
        <ul className="mt-1 space-y-1 text-sm text-secondary">
          <li>
            <span className="font-semibold">More customers:</span>{" "}
            {space + missingKind === 0
              ? "you had room for everyone who came — a campaign could fill it."
              : "families already come — make room for them first."}
          </li>
          <li>
            <span className="font-semibold">More capacity:</span>{" "}
            {space
              ? `${plural(space, "family", "families")} turned away for lack of space.`
              : "no one turned away for space."}{" "}
            {missingKind
              ? `${plural(missingKind, "family", "families")} had no playroom for their kind of pup.`
              : ""}
          </li>
          <li>
            <span className="font-semibold">Better service:</span>{" "}
            {hurt
              ? `${plural(hurt, "family", "families")} left with a problem nobody followed up — care and follow-ups keep families; marketing can't make up for it.`
              : "no unresolved problems — happy families come back on their own."}
          </li>
        </ul>
      </section>
    </div>
  );
}
