"use client";

import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Copy, Loader2, Plus } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { EntryStatus } from "@/db/schema";
import type { SyncResult } from "@/lib/action-result";
import type { ActivityLite, CopySuggestion, DayEntry, HorseLite } from "@/lib/data";
import {
  addDays,
  daysBetween,
  formatLong,
  formatShort,
  isISODate,
  relativeDayName,
  todayInTimeZone,
} from "@/lib/dates";
import {
  forgetConfirmedBefore,
  ignoreClick,
  notePageChange,
  refreshWhenPossible,
  run,
  useOverlayWrites,
  usePendingWrites,
  useSyncStuck,
  type OutboxItem,
} from "@/lib/sync";
import { HorseshoeMark } from "../icons";
import { headerButtonClass } from "../page-header";
import { toast } from "../toast";
import { cx } from "../ui";
import { AddSheet } from "./add-sheet";
import { EntryCard } from "./entry-card";

type Props = {
  date: string;
  today: string;
  /** The page was opened for a particular day (?d=), not just "today". */
  pinned: boolean;
  locale: string;
  entries: DayEntry[];
  horses: HorseLite[];
  activities: ActivityLite[];
  suggestions: CopySuggestion[];
};

/** Layers changes still waiting on the phone over what the server sent. */
function applyPending(entries: DayEntry[], pending: OutboxItem[], date: string): DayEntry[] {
  let out = entries;
  for (const item of pending) {
    const [first, second] = item.args as [unknown, unknown];
    switch (item.name) {
      case "addEntries": {
        const added = ((item.meta as { entries?: DayEntry[] } | undefined)?.entries ?? []).filter(
          (e) => e.date === date && !out.some((o) => o.id === e.id),
        );
        if (added.length) out = [...out, ...added];
        break;
      }
      case "setEntryStatus":
        out = out.map((e) => (e.id === first ? { ...e, status: second as EntryStatus } : e));
        break;
      case "saveEntryNote":
        out = out.map((e) => (e.id === first ? { ...e, note: second as string } : e));
        break;
      case "setEntryActivities":
        out = out.map((e) => (e.id === first ? { ...e, activityIds: second as string[] } : e));
        break;
      case "deleteEntry":
        out = out.filter((e) => e.id !== first);
        break;
    }
  }
  return out;
}

/**
 * Entries with changes stuck on the phone: no signal, or they can't get
 * through (the server didn't answer, sign-in isn't ready). Changes go strictly
 * in order, so while the first is stuck, everything behind it is waiting too.
 */
function waitingEntryIds(pending: OutboxItem[], stuck: boolean): Set<string> {
  const ids = new Set<string>();
  if (!stuck) return ids;
  for (const item of pending) {
    if (item.name === "addEntries") {
      for (const e of (item.meta as { entries?: DayEntry[] } | undefined)?.entries ?? []) ids.add(e.id);
    } else if (typeof item.args[0] === "string") {
      ids.add(item.args[0]);
    }
  }
  return ids;
}

function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * The phone's own date. The server's "today" is from when the page loaded; an
 * app left open overnight would otherwise call yesterday "Today" until it can
 * reach the server again.
 */
function usePhoneToday(serverToday: string) {
  return useSyncExternalStore(
    subscribeToClock,
    () => todayInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => serverToday,
  );
}

const NO_SIGNAL_DAYS = "No signal — other days load once you’re back online";

function report(result: SyncResult) {
  if (!result.ok && result.reason === "invalid") toast(result.error);
}

export function DayView({ date, today, pinned, locale, entries: serverEntries, horses, activities, suggestions }: Props) {
  const router = useRouter();
  const pending = usePendingWrites();
  const overlay = useOverlayWrites();
  const offline = useOffline();
  const stuck = useSyncStuck();
  // Labels ("Today", "Yesterday") follow the phone's date. If the day has
  // moved on since this page loaded, get the new day's list once there's signal.
  const now = usePhoneToday(today);
  const newDay = now > today;
  // This list was "today" when it loaded and the phone is now on the next day.
  const staleToday = newDay && date === today;
  useEffect(() => {
    if (!newDay) return;
    if (staleToday && pinned) {
      // Opened as /?d=<that day>: reloading it would show the same day. Go to
      // today's list instead, once there's signal to load it.
      if (offline) return;
      notePageChange("/");
      router.replace("/");
    } else {
      refreshWhenPossible();
    }
  }, [newDay, staleToday, pinned, offline, router]);
  // Changes show instantly: each one is stored on the phone the moment it's
  // made, and the screen is drawn from the server's data plus those changes.
  // (Deliberately no transition per save: a pending one would hold up every
  // navigation, so with no signal the tabs and day arrows would stop working.)
  const entries = useMemo(() => applyPending(serverEntries, overlay, date), [serverEntries, overlay, date]);
  // Fresh page data includes everything the server confirmed before it arrived.
  useEffect(() => forgetConfirmedBefore(Date.now()), [serverEntries]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const waiting = useMemo(() => waitingEntryIds(pending, offline || stuck), [pending, offline, stuck]);
  const notesSyncing = useMemo(
    () => new Set(pending.filter((i) => i.name === "saveEntryNote").map((i) => i.args[0] as string)),
    [pending],
  );
  // A "Repeat list" that hasn't shown up yet (still waiting, or confirmed but
  // the new list not loaded): show that, and don't offer to add horses by hand
  // meanwhile (that would add them twice).
  const copying = overlay.some((i) => i.name === "copyDay" && i.args[1] === date);
  const done = entries.filter((e) => e.status === "done").length;

  function save(result: Promise<SyncResult>): Promise<SyncResult> {
    void result.then(report);
    return result;
  }

  function setStatus(entry: DayEntry, status: EntryStatus) {
    save(run("setEntryStatus", [entry.id, status], { key: `status:${entry.id}` }));
    // Open the card after a check-off so the note box is right there.
    if (status === "done") setExpandedId(entry.id);
  }

  function addToDay(horseIds: string[], activityIds: string[], note: string, knownHorses: HorseLite[]) {
    const items = horseIds.map((horseId) => ({ id: crypto.randomUUID(), horseId }));
    const added: DayEntry[] = items.flatMap(({ id, horseId }) => {
      const horse = knownHorses.find((h) => h.id === horseId);
      if (!horse) return [];
      return [{ id, date, horseId, horseName: horse.name, horseColor: horse.color, status: "planned", activityIds, note }];
    });
    save(run("addEntries", [{ date, items, activityIds, note }], { meta: { entries: added } }));
  }

  return (
    <>
      <DayHeader
        date={date}
        now={now}
        locale={locale}
        done={done}
        total={entries.length}
        offline={offline}
        newDay={staleToday}
      />

      <div className="mx-auto max-w-xl px-4 pt-4 pb-20">
        {entries.length === 0 && copying ? (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <Loader2 className="size-8 animate-spin text-brand" aria-hidden />
            <h2 className="mt-4 font-serif text-[22px] font-semibold">Copying the list…</h2>
            <p className="mt-1 text-[15px] text-ink-2">
              {offline
                ? "It’s saved on this phone and will appear when you’re back online."
                : stuck
                  ? "It’s saved on this phone and will appear once it syncs."
                  : "Just a moment."}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyDay
            date={date}
            today={now}
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
                waiting={waiting.has(entry.id)}
                noteSyncing={notesSyncing.has(entry.id)}
                onStatus={(status) => setStatus(entry, status)}
                onNote={(note) => save(run("saveEntryNote", [entry.id, note], { key: `note:${entry.id}` }))}
                onActivities={(activityIds) =>
                  save(run("setEntryActivities", [entry.id, activityIds], { key: `activities:${entry.id}` }))
                }
                onRemove={() => {
                  save(run("deleteEntry", [entry.id], { key: `delete:${entry.id}` }));
                  toast(`Removed ${entry.horseName}`);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {(entries.length > 0 || horses.length > 0) && !copying && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Add horses to this day"
          className="fixed z-20 grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg shadow-black/20 active:scale-95"
          style={{
            // Clear of the tab bar, including its no-signal strip.
            bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)",
            right: "max(1rem, calc((100vw - 36rem) / 2 + 1rem))",
          }}
        >
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      <AddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Add to ${relativeDayName(date, now, locale) === "Today" ? "today" : formatShort(date, locale)}`}
        horses={horses}
        activities={activities}
        horseIdsOnDay={new Set(entries.map((e) => e.horseId))}
        onAdd={addToDay}
      />
    </>
  );
}

/** Shows that a tap on a day arrow registered while the next day is still loading. */
function LoadingHint() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="absolute inset-0 animate-[fade-in_0.2s_ease-out_0.3s_backwards] rounded-full ring-2 ring-header-ink/70"
    />
  );
}

function DayHeader({
  date,
  now,
  locale,
  done,
  total,
  offline,
  newDay,
}: {
  date: string;
  /** The phone's today: labels and links follow it. */
  now: string;
  locale: string;
  done: number;
  total: number;
  offline: boolean;
  /** This is the list the page loaded as today, and the phone has moved on to the next day. */
  newDay: boolean;
}) {
  const router = useRouter();
  const offset = daysBetween(now, date);
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
  // "/" is whatever day it is when the server answers, so only the phone's
  // today may link there (the page's own idea of today can be a day behind).
  const href = (d: string) => (d === now ? "/" : `/?d=${d}`);
  const round = "relative grid size-10 place-items-center rounded-full bg-header-fill active:opacity-70";
  // Another day needs the server; with no signal the tap would only take
  // effect (suddenly) once the signal is back. Say so instead.
  function stayOffline(e: MouseEvent) {
    if (!offline) return;
    e.preventDefault(); // Next's Link then doesn't navigate…
    ignoreClick(e.nativeEvent); // …and the save queue doesn't wait for a page change
    toast(NO_SIGNAL_DAYS);
  }

  return (
    <header className="bg-header pt-safe text-header-ink">
      <div className="mx-auto max-w-xl px-4 pt-2 pb-5">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <Link href={href(addDays(date, -1))} onClick={stayOffline} aria-label="Previous day" className={round}>
            <ChevronLeft className="size-6" />
            <LoadingHint />
          </Link>
          {offset !== 0 && (
            <Link href={href(now)} onClick={stayOffline} className={headerButtonClass}>
              Back to today
            </Link>
          )}
          <Link href={href(addDays(date, 1))} onClick={stayOffline} aria-label="Next day" className={round}>
            <ChevronRight className="size-6" />
            <LoadingHint />
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
              if (!isISODate(e.target.value)) return;
              if (offline) {
                toast(NO_SIGNAL_DAYS);
                return;
              }
              notePageChange(href(e.target.value));
              router.push(href(e.target.value));
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
        {newDay && (
          <p role="status" className="mt-2 rounded-xl bg-header-fill px-3 py-2 text-[14px] text-header-ink">
            It’s a new day.{" "}
            {offline ? "Today’s list will load once you’re back online." : "Loading today’s list…"}
          </p>
        )}

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
  // Only until the copy is queued: from then on DayView shows "Copying the list…".
  const isPending = pendingDate !== null;

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
    if (isPending) return;
    setPendingDate(from);
    void run("copyDay", [from, date], { key: `copy:${date}` }).then((result) => {
      setPendingDate(null);
      report(result);
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
