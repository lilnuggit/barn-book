"use client";

import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Copy, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  addEntries,
  copyDay,
  deleteEntry,
  saveEntryNote,
  setEntryActivities,
  setEntryStatus,
} from "@/app/actions";
import type { EntryStatus } from "@/db/schema";
import type { ActivityLite, CopySuggestion, DayEntry, HorseLite } from "@/lib/data";
import { addDays, daysBetween, formatLong, formatShort, isISODate, relativeDayName } from "@/lib/dates";
import { HorseshoeMark } from "../icons";
import { headerButtonClass } from "../page-header";
import { toast } from "../toast";
import { cx } from "../ui";
import { AddSheet } from "./add-sheet";
import { EntryCard } from "./entry-card";

type Props = {
  date: string;
  today: string;
  locale: string;
  entries: DayEntry[];
  horses: HorseLite[];
  activities: ActivityLite[];
  suggestions: CopySuggestion[];
};

type Patch = Partial<Pick<DayEntry, "status" | "note" | "activityIds">>;
type Action =
  | { type: "add"; entries: DayEntry[] }
  | { type: "update"; id: string; patch: Patch }
  | { type: "delete"; id: string };

function reducer(state: DayEntry[], action: Action): DayEntry[] {
  switch (action.type) {
    case "add":
      return [...state, ...action.entries.filter((e) => !state.some((s) => s.id === e.id))];
    case "update":
      return state.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e));
    case "delete":
      return state.filter((e) => e.id !== action.id);
  }
}

export function DayView({ date, today, locale, entries: serverEntries, horses, activities, suggestions }: Props) {
  // Changes show instantly; the server catches up (or retries when signal returns).
  const [entries, applyOptimistic] = useOptimistic(serverEntries, reducer);
  const [, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const done = entries.filter((e) => e.status === "done").length;

  function mutate(action: Action, call: () => Promise<unknown>) {
    startTransition(async () => {
      applyOptimistic(action);
      try {
        await call();
      } catch (error) {
        console.error(error);
        toast("Couldn’t save that — please try again");
      }
    });
  }

  function setStatus(entry: DayEntry, status: EntryStatus) {
    mutate({ type: "update", id: entry.id, patch: { status } }, () => setEntryStatus(entry.id, status));
    // Open the card after a check-off so the note box is right there.
    if (status === "done") setExpandedId(entry.id);
  }

  function addToDay(horseIds: string[], activityIds: string[], note: string, knownHorses: HorseLite[]) {
    const items = horseIds.map((horseId) => ({ id: crypto.randomUUID(), horseId }));
    const optimistic: DayEntry[] = items.flatMap(({ id, horseId }) => {
      const horse = knownHorses.find((h) => h.id === horseId);
      if (!horse) return [];
      return [{ id, date, horseId, horseName: horse.name, horseColor: horse.color, status: "planned", activityIds, note }];
    });
    mutate({ type: "add", entries: optimistic }, () => addEntries({ date, items, activityIds, note }));
  }

  return (
    <>
      <DayHeader date={date} today={today} locale={locale} done={done} total={entries.length} />

      <div className="mx-auto max-w-xl px-4 pt-4 pb-20">
        {entries.length === 0 ? (
          <EmptyDay
            date={date}
            today={today}
            locale={locale}
            hasHorses={horses.length > 0}
            suggestions={suggestions}
            onStart={() => setSheetOpen(true)}
          />
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                activities={activities}
                activityById={activityById}
                expanded={expandedId === entry.id}
                onToggleExpanded={() => setExpandedId((id) => (id === entry.id ? null : entry.id))}
                onStatus={(status) => setStatus(entry, status)}
                onNote={(note) =>
                  mutate({ type: "update", id: entry.id, patch: { note } }, () => saveEntryNote(entry.id, note))
                }
                onActivities={(activityIds) =>
                  mutate({ type: "update", id: entry.id, patch: { activityIds } }, () =>
                    setEntryActivities(entry.id, activityIds),
                  )
                }
                onRemove={() => {
                  mutate({ type: "delete", id: entry.id }, () => deleteEntry(entry.id));
                  toast(`Removed ${entry.horseName}`);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {(entries.length > 0 || horses.length > 0) && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Add horses to this day"
          className="fixed z-20 grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg shadow-black/20 active:scale-95"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
            right: "max(1rem, calc((100vw - 36rem) / 2 + 1rem))",
          }}
        >
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      <AddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Add to ${relativeDayName(date, today, locale) === "Today" ? "today" : formatShort(date, locale)}`}
        horses={horses}
        activities={activities}
        horseIdsOnDay={new Set(entries.map((e) => e.horseId))}
        onAdd={addToDay}
      />
    </>
  );
}

function DayHeader({
  date,
  today,
  locale,
  done,
  total,
}: {
  date: string;
  today: string;
  locale: string;
  done: number;
  total: number;
}) {
  const router = useRouter();
  const offset = daysBetween(today, date);
  const eyebrow =
    offset === 0
      ? "Today"
      : offset === -1
        ? "Yesterday"
        : offset === 1
          ? "Tomorrow"
          : offset < 0
            ? `${-offset} days ago`
            : `In ${offset} days`;
  const href = (d: string) => (d === today ? "/" : `/?d=${d}`);
  const round = "grid size-10 place-items-center rounded-full bg-header-fill active:opacity-70";

  return (
    <header className="bg-header pt-safe text-header-ink">
      <div className="mx-auto max-w-xl px-4 pt-2 pb-5">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <Link href={href(addDays(date, -1))} aria-label="Previous day" className={round}>
            <ChevronLeft className="size-6" />
          </Link>
          {offset !== 0 && (
            <Link href="/" className={headerButtonClass}>
              Back to today
            </Link>
          )}
          <Link href={href(addDays(date, 1))} aria-label="Next day" className={round}>
            <ChevronRight className="size-6" />
          </Link>
        </div>

        <p className="mt-1 text-[13px] font-semibold tracking-wider text-header-ink-2 uppercase">{eyebrow}</p>
        <div className="relative inline-flex max-w-full items-center gap-2">
          <h1 className="font-serif text-[30px] leading-tight font-semibold tracking-tight">
            {formatLong(date, locale)}
          </h1>
          <CalendarDays className="size-5 shrink-0 text-header-ink-2" aria-hidden />
          <input
            type="date"
            aria-label="Choose a day"
            value={date}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => {
              if (isISODate(e.target.value)) router.push(href(e.target.value));
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>

        {total > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-header-fill"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label="Horses done"
            >
              <div
                className="h-full rounded-full bg-header-ink transition-[width] duration-500 ease-out"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <span className="flex items-center gap-1 text-[14px] font-medium text-header-ink-2 tabular-nums">
              {done === total ? (
                <>
                  <CircleCheck className="size-4" /> All done
                </>
              ) : (
                `${done} of ${total} done`
              )}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

function EmptyDay({
  date,
  today,
  locale,
  hasHorses,
  suggestions,
  onStart,
}: {
  date: string;
  today: string;
  locale: string;
  hasHorses: boolean;
  suggestions: CopySuggestion[];
  onStart: () => void;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [isPending, startCopy] = useTransition();

  if (!hasHorses) {
    return (
      <div className="flex flex-col items-center px-4 pt-10 text-center">
        <HorseshoeMark className="size-16 text-brand" />
        <h2 className="mt-4 font-serif text-2xl font-semibold">Welcome to Barn Book</h2>
        <p className="mt-2 max-w-sm text-[15px] text-ink-2">
          Add your horses, then build each day’s list. Check them off as you go and jot a quick note — it all
          stays here, so you can look back anytime.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[16px] font-semibold text-brand-ink active:opacity-80"
        >
          <Plus className="size-5" /> Add your first horse
        </button>
      </div>
    );
  }

  function copyFrom(from: string) {
    setPendingDate(from);
    startCopy(async () => {
      try {
        await copyDay(from, date);
      } catch (error) {
        console.error(error);
        toast("Couldn’t copy that list — please try again");
      }
    });
  }

  const dayName = relativeDayName(date, today, locale);
  return (
    <div className="pt-6">
      <div className="text-center">
        <h2 className="font-serif text-[22px] font-semibold">
          Nothing planned {dayName === "Today" || dayName === "Tomorrow" ? dayName.toLowerCase() : `for ${dayName}`}
        </h2>
        <p className="mt-1 text-[15px] text-ink-2">Start a list, or repeat a recent one.</p>
      </div>

      <div className="mt-6 space-y-3">
        {suggestions.map((s) => {
          const rel = relativeDayName(s.date, today, locale);
          const label = ["Today", "Yesterday", "Tomorrow"].includes(rel)
            ? `Repeat ${rel.toLowerCase()}’s list`
            : daysBetween(s.date, date) === 7
              ? `Repeat last ${rel}’s list`
              : `Repeat the list from ${formatShort(s.date, locale)}`;
          const busy = isPending && pendingDate === s.date;
          return (
            <button
              key={s.date}
              type="button"
              disabled={isPending}
              onClick={() => copyFrom(s.date)}
              className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-card ring-1 ring-line active:bg-surface-2 disabled:opacity-60"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Copy className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold">{label}</span>
                <span className="block truncate text-sm text-ink-3">
                  {s.horseNames.slice(0, 4).join(", ")}
                  {s.horseNames.length > 4 && ` +${s.horseNames.length - 4}`} · {s.count}{" "}
                  {s.count === 1 ? "line" : "lines"}
                </span>
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onStart}
          className={cx(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[16px] font-semibold active:opacity-80",
            suggestions.length ? "text-brand ring-1 ring-line" : "bg-brand text-brand-ink",
          )}
        >
          <Plus className="size-5" /> Start a new list
        </button>
      </div>
    </div>
  );
}
