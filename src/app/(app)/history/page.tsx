import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { EntryLog } from "@/components/entry-log";
import { PageHeader } from "@/components/page-header";
import { StillLoading } from "@/components/still-loading";
import { Card, cx, EmptyState, Skeleton } from "@/components/ui";
import { WaitingChangesNote } from "@/components/waiting-note";
import { requireUserId } from "@/lib/auth";
import { getActivityTypes, getMonthCounts, getMonthLog, searchEntries, type DayCount } from "@/lib/data";
import {
  addMonths,
  firstDayOfWeek,
  formatMonthYear,
  formatShort,
  isISOMonth,
  monthGrid,
  monthOf,
  weekdayLabels,
} from "@/lib/dates";
import { getRequestPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <>
      <PageHeader title="History" />
      <div className="mx-auto max-w-xl px-4 pt-4">
        <Suspense fallback={<HistorySkeleton />}>
          <History searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function History({ searchParams }: { searchParams: PageProps<"/history">["searchParams"] }) {
  const userId = await requireUserId();
  const [params, { today, locale }] = await Promise.all([searchParams, getRequestPrefs()]);
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const month = isISOMonth(params.m) ? params.m : monthOf(today);

  const activities = await getActivityTypes(userId);
  const activityById = new Map(activities.map((a) => [a.id, a]));

  if (query) {
    const results = await searchEntries(userId, query);
    return (
      <>
        <SearchBox query={query} />
        <WaitingChangesNote className="mt-4" />
        <p className="mt-4 mb-3 px-1 text-[15px] text-ink-2">
          {results.length === 0
            ? "No matches."
            : `${results.length === 100 ? "100+" : results.length} ${results.length === 1 ? "match" : "matches"} for “${query}”`}
        </p>
        {results.length > 0 && (
          <EntryLog
            entries={results}
            activityById={activityById}
            today={today}
            locale={locale}
            showHorse
            highlight={query}
          />
        )}
      </>
    );
  }

  const [counts, log] = await Promise.all([getMonthCounts(userId, month), getMonthLog(userId, month, today)]);
  const sessions = counts.reduce((n, d) => n + d.done, 0);
  const daysWorked = counts.filter((d) => d.done > 0).length;

  return (
    <>
      <SearchBox query="" />
      <WaitingChangesNote className="mt-4" />
      <Card className="mt-4 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Link
            href={`/history?m=${addMonths(month, -1)}`}
            aria-label="Previous month"
            className="grid size-10 place-items-center rounded-full text-ink-2 active:bg-surface-2"
          >
            <ChevronLeft className="size-6" />
          </Link>
          <div className="text-center">
            <h2 className="font-serif text-xl font-semibold">{formatMonthYear(month, locale)}</h2>
            <p className="text-xs text-ink-3 tabular-nums">
              {sessions} {sessions === 1 ? "session" : "sessions"} done · {daysWorked}{" "}
              {daysWorked === 1 ? "day" : "days"}
            </p>
          </div>
          <Link
            href={`/history?m=${addMonths(month, 1)}`}
            aria-label="Next month"
            className="grid size-10 place-items-center rounded-full text-ink-2 active:bg-surface-2"
          >
            <ChevronRight className="size-6" />
          </Link>
        </div>
        <MonthCalendar month={month} counts={counts} today={today} locale={locale} />
      </Card>

      <div className="mt-8">
        {log.length > 0 ? (
          <EntryLog entries={log} activityById={activityById} today={today} locale={locale} showHorse />
        ) : (
          <EmptyState title="Nothing logged this month">
            Days you plan and check off on the Today screen show up here.
          </EmptyState>
        )}
      </div>
    </>
  );
}

function SearchBox({ query }: { query: string }) {
  return (
    <Form action="/history" role="search" className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
      <input
        name="q"
        type="search"
        defaultValue={query}
        placeholder="Search notes, horses, work…"
        enterKeyHint="search"
        autoComplete="off"
        className="w-full rounded-xl bg-surface py-2.5 pr-12 pl-11 text-ink shadow-card ring-1 ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-brand/50 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <Link
          href="/history"
          aria-label="Clear search"
          className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-3"
        >
          <X className="size-5" />
        </Link>
      )}
    </Form>
  );
}

function MonthCalendar({
  month,
  counts,
  today,
  locale,
}: {
  month: string;
  counts: DayCount[];
  today: string;
  locale: string;
}) {
  const weekStart = firstDayOfWeek(locale);
  const byDate = new Map(counts.map((c) => [c.date, c]));
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-3">
        {weekdayLabels(locale, weekStart).map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {monthGrid(month, weekStart)
          .flat()
          .map((d, i) => {
            if (!d) return <span key={`blank-${i}`} />;
            const c = byDate.get(d);
            const isToday = d === today;
            return (
              <Link
                key={d}
                href={isToday ? "/" : `/?d=${d}`}
                aria-label={`${formatShort(d, locale)}${c ? `: ${c.done} of ${c.total} done` : ""}`}
                className="flex flex-col items-center gap-1 rounded-xl py-1.5 active:bg-surface-2"
              >
                <span
                  className={cx(
                    "grid size-8 place-items-center rounded-full text-[15px] tabular-nums",
                    isToday && "bg-brand font-semibold text-brand-ink",
                    !isToday && c && c.done > 0 && "font-semibold text-ink",
                    !isToday && (!c || c.done === 0) && "text-ink-2",
                    d > today && !isToday && "text-ink-3",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <Dots count={c} />
              </Link>
            );
          })}
      </div>
    </div>
  );
}

/** Up to five dots per day: filled for done, hollow for still to do. */
function Dots({ count }: { count?: DayCount }) {
  if (!count || count.total === 0) return <span className="h-1.5" />;
  const shown = Math.min(count.total, 5);
  const done = Math.min(count.done, shown);
  return (
    <span className="flex h-1.5 gap-0.5" aria-hidden>
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className={cx("size-1.5 rounded-full", i < done ? "bg-done" : "bg-transparent ring-1 ring-ink-3/60 ring-inset")}
        />
      ))}
    </span>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-11" />
      <Skeleton className="h-80 rounded-2xl" />
      <StillLoading />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
