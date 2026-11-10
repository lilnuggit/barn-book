"use client";

import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Copy, Loader2, Plus } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { EntryStatus } from "@/db/schema";
import type { SyncResult } from "@/lib/action-result";
import type { ActivityLite, CopySuggestion, DayEntry, HorseLite } from "@/lib/data";
import { addDays, daysBetween, formatLong, formatShort, isISODate, phoneToday, relativeDayName } from "@/lib/dates";
import {
  forgetConfirmedBefore,
  ignoreClick,
  isPageChangePending,
  notePageChange,
  refreshWhenPossible,
  run,
  useNoSignal,
  useOverlayWrites,
  usePendingWrites,
  useSyncStuck,
  type OutboxItem,
} from "@/lib/sync";
import { HorseshoeMark } from "../icons";
import { headerButtonClass } from "../page-header";
import { toast } from "../toast";
import { cx } from "../ui";
import { addedLines, applyActivityChanges, applyDayChanges, saveDayCopy } from "@/lib/day-copy";
import { busyEditing } from "@/lib/editing";
import { AddSheet } from "./add-sheet";
import { sheetDraftEmpty, useDayScreen, useDayUi } from "./day-open-state";
import { orderForToday, useCardMoves } from "./day-order";
import { EntryCard } from "./entry-card";

type Props = {
  date: string;
  today: string;
  /** The page was opened for a particular day (?d=), not just "today". */
  pinned: boolean;
  /** Drawn from the copy kept on the phone (no signal), saved at this time. */
  savedAt?: number;
  /** When the list was loaded from the server (for a copy: the last load it was saved from). */
  loadedAt?: number;
  locale: string;
  entries: DayEntry[];
  horses: HorseLite[];
  activities: ActivityLite[];
  suggestions: CopySuggestion[];
};

/**
 * Entries with changes stuck on the phone: no signal, or they can't get
 * through (the server didn't answer, sign-in isn't ready). Changes go strictly
 * in order, so while the first is stuck, everything behind it is waiting too.
 */
function waitingEntryIds(pending: OutboxItem[], stuck: boolean): Set<string> {
  const ids = new Set<string>();
  if (!stuck) return ids;
  for (const item of pending) {
    const lines = addedLines(item);
    if (lines) {
      for (const e of lines) ids.add(e.id);
    } else if (item.name !== "copyDay" && typeof item.args[0] === "string") {
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
  return useSyncExternalStore(subscribeToClock, () => phoneToday(), () => serverToday);
}

const NO_SIGNAL_DAYS = "No signal — other days load once you’re back online";

/** "at 8:00 AM", or "on Sun, Nov 8 at 8:00 AM" when it wasn't today. */
function whenLoaded(at: number, locale: string) {
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(at);
  if (phoneToday(new Date(at)) === phoneToday()) return `at ${time}`;
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(at);
  return `on ${day} at ${time}`;
}

/**
 * When a horse is finished, for its place at the bottom of the list: now
 * (after every horse finished before it, whatever the clocks say), or, when it
 * only changes between done and skipped, when it was first finished.
 */
function finishTime(entry: DayEntry, status: EntryStatus, entries: DayEntry[]): number | null {
  if (status === "planned") return null;
  if (entry.status !== "planned" && entry.completedAt != null) return entry.completedAt;
  return Math.max(Date.now(), ...entries.map((e) => (e.completedAt ?? 0) + 1));
}

function report(result: SyncResult) {
  if (!result.ok && result.reason === "invalid") toast(result.error);
}

export function DayView({
  date,
  today,
  pinned,
  savedAt,
  loadedAt,
  locale,
  entries: serverEntries,
  horses,
  activities,
  suggestions,
}: Props) {
  // Open card and add sheet: shared by every copy of this day's screen (see
  // day-open-state). First, so a new screen for the day starts afresh before
  // anything reads them.
  useDayScreen(date);
  const [{ expandedId, sheetOpen, typingIn, held }, updateOpen] = useDayUi(date);
  const router = useRouter();
  const pending = usePendingWrites();
  const overlay = useOverlayWrites();
  const offline = useNoSignal();
  const stuck = useSyncStuck();
  // Labels ("Today", "Yesterday") follow the phone's date. If the day has
  // moved on since this page loaded, get the new day's list once there's signal.
  const now = usePhoneToday(today);
  const behind = now > today;
  // The phone's date when this screen was put on show. A list on show as
  // today when the phone's day moves on (the app left open overnight) is a
  // stale "today", even after a save brings the server's new date; a day she
  // opens later is just that day.
  const [dayWhenShown, setDayWhenShown] = useState(today);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the phone's clock, read each time the screen shows
    setDayWhenShown(phoneToday());
  }, []);
  // Today's list ("/", loaded as the server's today) is stale once the
  // phone's day has moved past it, however it came back on screen.
  const staleToday = (date === dayWhenShown && now > dayWhenShown) || (!pinned && date === today && now > today);
  // What was open when she came back to the app (unlocked the phone, switched
  // back to it): the add sheet, and the note box that had the keyboard.
  const sheetOpenNow = useRef(sheetOpen);
  useLayoutEffect(() => {
    sheetOpenNow.current = sheetOpen;
  });
  const leftOpen = useRef<{ at: number; sheet: boolean; note: Element | null } | null>(null);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement;
      const note = el instanceof HTMLTextAreaElement && el.dataset.noteFor ? el : null;
      leftOpen.current = { at: Date.now(), sheet: sheetOpenNow.current, note };
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  // Waiting for her to finish (sheet open, typing) before loading the new day.
  const [heldForEditing, setHeldForEditing] = useState(false);
  useEffect(() => {
    if ((!behind && !staleToday) || savedAt !== undefined) return;
    function moveOn() {
      const left = leftOpen.current;
      if (staleToday && left && Date.now() - left.at < 5000) {
        // Just back on the phone, the next morning: what was left open on
        // this list last night mustn't hold today's back (or catch the first
        // taps of the day): an add sheet with nothing in it closes, and a note
        // box lets go of the keyboard (its text was saved when she left, and
        // letting go saves it again). Once, and only what was open then: not
        // what she opens now.
        leftOpen.current = null;
        if (left.sheet) updateOpen((ui) => (ui.sheetOpen && sheetDraftEmpty(date) ? { sheetOpen: false } : {}));
        if (left.note && document.activeElement === left.note && left.note instanceof HTMLElement) left.note.blur();
      }
      // Not while she's in the middle of something: a new day's list would
      // replace this one, open sheet and all.
      const busy = busyEditing();
      setHeldForEditing(busy);
      if (busy) return false;
      if (staleToday && pinned) {
        // Opened as /?d=<that day>: reloading it would show the same day. Go to
        // today's list instead, once there's signal to load it (and unless the
        // rider has already set off somewhere else).
        if (offline || isPageChangePending()) return false;
        notePageChange("/");
        router.replace("/");
      } else {
        refreshWhenPossible();
      }
      return true;
    }
    const timer = setInterval(() => {
      if (moveOn()) clearInterval(timer);
    }, 2000);
    const first = setTimeout(() => {
      if (moveOn()) clearInterval(timer);
    }, 0);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [behind, staleToday, pinned, offline, router, savedAt, date, updateOpen]);
  // Changes show instantly: each one is stored on the phone the moment it's
  // made, and the screen is drawn from the server's data plus those changes.
  // (Deliberately no transition per save: a pending one would hold up every
  // navigation, so with no signal the tabs and day arrows would stop working.)
  const entries = useMemo(() => applyDayChanges(serverEntries, overlay, date), [serverEntries, overlay, date]);
  // Fresh page data includes everything the server confirmed before it arrived
  // (not the copy kept on the phone, which may be older).
  useEffect(() => {
    if (savedAt === undefined) forgetConfirmedBefore(Date.now());
  }, [serverEntries, savedAt]);
  // Keep what she sees of this day (with her changes), to draw it from with no
  // signal later. Horses added on the phone go along, for the add sheet.
  const waitingHorses = useMemo(
    () => overlay.filter((i) => i.name === "createHorse").map((i) => i.meta as HorseLite),
    [overlay],
  );
  useEffect(() => {
    if (savedAt !== undefined) return;
    const known = [...horses, ...waitingHorses.filter((h) => h && !horses.some((x) => x.id === h.id))];
    saveDayCopy({ date, today, locale, entries, horses: known, activities, suggestions, loadedAt });
  }, [savedAt, date, today, locale, entries, horses, waitingHorses, activities, suggestions, loadedAt]);
  function setExpandedId(next: string | null | ((id: string | null) => string | null)) {
    updateOpen((now) => {
      const id = typeof next === "function" ? next(now.expandedId) : next;
      // Closing the card of a horse just checked off (or opening another)
      // lets it go down with the others that are finished.
      return { expandedId: id, held: now.held === id ? now.held : null };
    });
  }
  function setSheetOpen(open: boolean) {
    updateOpen(() => ({ sheetOpen: open }));
  }

  // Work types as renamed or archived on the phone, before the server has it.
  const shownActivities = useMemo(() => applyActivityChanges(activities, overlay), [activities, overlay]);
  const activityById = useMemo(() => new Map(shownActivities.map((a) => [a.id, a])), [shownActivities]);
  const waiting = useMemo(() => waitingEntryIds(pending, offline || stuck), [pending, offline, stuck]);
  const notesSyncing = useMemo(
    () => new Set(pending.filter((i) => i.name === "saveEntryNote").map((i) => i.args[0] as string)),
    [pending],
  );
  // A "Repeat list" queued by an older version of the app, without its lines,
  // that hasn't shown up yet: show that, and don't offer to add horses by
  // hand meanwhile (that would add them twice).
  const copying = overlay.some((i) => i.name === "copyDay" && i.args[1] === date && !addedLines(i));
  const done = entries.filter((e) => e.status === "done").length;
  // Still to do first; done and skipped at the bottom, the latest last.
  const shown = useMemo(() => orderForToday(entries, held), [entries, held]);
  const [listRef, beforeMove] = useCardMoves();

  function save(result: Promise<SyncResult>): Promise<SyncResult> {
    void result.then(report);
    return result;
  }

  function setStatus(entry: DayEntry, status: EntryStatus) {
    // A check-off keeps the card she tapped under her finger; unchecking lets it go back up.
    beforeMove(status === "planned" ? null : entry.id);
    save(run("setEntryStatus", [entry.id, status, finishTime(entry, status, entries)], { key: `status:${entry.id}` }));
    // Open the card after a check-off so the note box is right there. A horse
    // just finished (it was still to do) stays in its place while its card is
    // open, and goes down once it's closed or the next one is checked. One
    // only switching between done and skipped is already in its place below.
    const hold = entry.status === "planned" || held === entry.id ? entry.id : null;
    if (status === "done") updateOpen(() => ({ expandedId: entry.id, held: hold }));
    else if (status === "skipped" && hold) updateOpen((now) => (now.expandedId === entry.id ? { held: hold } : {}));
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

  /** Repeats a past day's list here. Its lines show at once, like lines added by hand. */
  function repeat(s: CopySuggestion): Promise<SyncResult> {
    const lines = (s.lines ?? []).map((line) => ({ ...line, id: crypto.randomUUID() }));
    // A suggestion kept by an older version of the app, without its lines.
    if (lines.length === 0) return save(run("copyDay", [s.date, date], { key: `copy:${date}` }));
    const added: DayEntry[] = lines.map((l) => ({
      id: l.id,
      date,
      horseId: l.horseId,
      horseName: l.horseName,
      horseColor: l.horseColor,
      status: "planned",
      activityIds: l.activityIds,
      note: "",
    }));
    const sent = lines.map(({ id, horseId, activityIds }) => ({ id, horseId, activityIds }));
    return save(run("copyDay", [s.date, date, sent], { key: `copy:${date}`, meta: { entries: added } }));
  }

  return (
    <>
      <DayHeader
        date={date}
        today={today}
        now={now}
        locale={locale}
        done={done}
        total={entries.length}
        offline={offline}
        newDay={staleToday && savedAt === undefined}
        heldForEditing={heldForEditing}
      />

      <div className="mx-auto max-w-xl px-4 pt-4 pb-20">
        {savedAt !== undefined && (
          <p role="status" className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-[14px] text-ink-2">
            {offline ? "No signal" : "Still loading"} — this is the list as last loaded{" "}
            {whenLoaded(loadedAt ?? savedAt, locale)}, with your changes since. They’re kept and will sync.
          </p>
        )}
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
            onRepeat={repeat}
          />
        ) : (
          <ul ref={listRef} className="space-y-3">
            {shown.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                activities={shownActivities}
                activityById={activityById}
                expanded={expandedId === entry.id}
                onToggleExpanded={() => {
                  // Opening a card keeps it under her finger; closing one lets a horse just finished go down.
                  beforeMove(expandedId === entry.id ? null : entry.id);
                  setExpandedId((id) => (id === entry.id ? null : entry.id));
                }}
                waiting={waiting.has(entry.id)}
                noteSyncing={notesSyncing.has(entry.id)}
                typing={typingIn === entry.id}
                onTyping={(typing) =>
                  updateOpen((now) => ({ typingIn: typing ? entry.id : now.typingIn === entry.id ? null : now.typingIn }))
                }
                onStatus={(status) => setStatus(entry, status)}
                onNote={(note) => save(run("saveEntryNote", [entry.id, note], { key: `note:${entry.id}` }))}
                onActivities={(activityIds) =>
                  save(run("setEntryActivities", [entry.id, activityIds], { key: `activities:${entry.id}` }))
                }
                onRemove={() => {
                  beforeMove();
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
        draftKey={date}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Add to ${relativeDayName(date, now, locale) === "Today" ? "today" : formatShort(date, locale)}`}
        horses={horses}
        activities={shownActivities}
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
  today,
  now,
  locale,
  done,
  total,
  offline,
  newDay,
  heldForEditing,
}: {
  date: string;
  /** The server's today, when the page loaded. */
  today: string;
  /** The phone's today: labels follow it. */
  now: string;
  locale: string;
  done: number;
  total: number;
  offline: boolean;
  /** This is the list the page loaded as today, and the phone has moved on to the next day. */
  newDay: boolean;
  /** Today's list waits until she has finished what she has open. */
  heldForEditing: boolean;
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
  // "/" is whatever day the server thinks it is, so link there only when the
  // phone agrees; otherwise name the day (the page can be a day behind, or the
  // server can still have the phone's old time zone).
  const href = (d: string) => (d === now && d === today ? "/" : `/?d=${d}`);
  const round = "relative grid size-10 place-items-center rounded-full bg-header-fill active:opacity-70";
  // Another day needs the server: with no signal, Next would hold the tap
  // and open that day suddenly once the signal is back (in the middle of
  // whatever she's doing by then). Say so instead.
  function stayOffline(e: MouseEvent<HTMLAnchorElement>) {
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
            {offline
              ? "Today’s list will load once you’re back online."
              : heldForEditing
                ? "Today’s list will load once you’ve finished here."
                : "Loading today’s list…"}
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
  onRepeat,
}: {
  date: string;
  today: string;
  locale: string;
  hasHorses: boolean;
  suggestions: CopySuggestion[];
  onStart: () => void;
  onRepeat: (s: CopySuggestion) => Promise<SyncResult>;
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

  function copyFrom(s: CopySuggestion) {
    if (isPending) return;
    setPendingDate(s.date);
    void onRepeat(s).then(() => setPendingDate(null));
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
              onClick={() => copyFrom(s)}
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
