"use client";

import { CalendarClock, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { applyAppointmentChanges, applyAppointmentTypeChanges, waitingAppointmentIds } from "@/lib/appointment-changes";
import {
  dueLabel,
  everyLabel,
  monthDay,
  shortHorseList,
  spokenHorseList,
  visitName,
  visitsBoard,
  type AppointmentLite,
  type AppointmentTypeLite,
} from "@/lib/appointments";
import { saveAppointmentsCopy } from "@/lib/appointments-copy";
import type { HorseLite } from "@/lib/data";
import { addDays } from "@/lib/dates";
import { horsesWithChanges } from "@/lib/day-copy";
import { colorClass } from "@/lib/palette";
import { usePhoneToday, whenLoaded } from "@/lib/phone-today";
import {
  forgetConfirmedBefore,
  notePageChange,
  useNoSignal,
  useOverlayWrites,
  usePendingWrites,
  useSyncStuck,
} from "@/lib/sync";
import { headerButtonClass, PageHeader } from "../page-header";
import { toast } from "../toast";
import { ActivityChip, Card, cx, EmptyState, SectionTitle } from "../ui";
import { AppointmentRow } from "./appointment-row";
import { AppointmentSheet } from "./appointment-sheet";
import { checkOffAppointment, type SaveContext } from "./save";
import { openAppointment, openNewAppointment, useAppointmentScreen } from "./sheet-state";

const KEY = "visits";
const DONE_PAGE = 10;
const MORE = 30;

/**
 * The Visits tab: what to check off, who's due, what's booked, what's done.
 * Everything is worked out on the phone from the visits as shown (server data
 * with the changes still on the phone layered on), so a change shows at once,
 * with or without signal.
 */
export function AppointmentsScreen({
  today,
  locale,
  loadedAt,
  savedAt,
  appointments,
  types,
  horses,
  doneSince,
  nextSince = null,
  extended = false,
}: {
  today: string;
  locale: string;
  /** When the data was loaded from the server (for a copy: the last load it was saved from). */
  loadedAt: number;
  /** Drawn from the copy kept on the phone, saved at this time. */
  savedAt?: number;
  appointments: AppointmentLite[];
  types: AppointmentTypeLite[];
  /** Horses in work. */
  horses: HorseLite[];
  /** Done lists every visit checked off since this day (a year back, or further once she asks for older ones). */
  doneSince?: string;
  /** Where "Show older visits" goes back to (the next older ones), or null when there are none. */
  nextSince?: string | null;
  /** She asked for older visits (?since=): show the whole list at once. */
  extended?: boolean;
}) {
  useAppointmentScreen(KEY);
  const now = usePhoneToday(today);
  const overlay = useOverlayWrites();
  const pending = usePendingWrites();
  const offline = useNoSignal();
  const stuck = useSyncStuck();
  const [doneShown, setDoneShown] = useState(DONE_PAGE);
  const toCheckId = useId();
  const router = useRouter();
  const [loadingOlder, startLoadingOlder] = useTransition();
  const since = doneSince ?? addDays(today, -365);

  const shownTypes = useMemo(() => applyAppointmentTypeChanges(types, overlay), [types, overlay]);
  const shownHorses = useMemo(() => horsesWithChanges(horses, overlay), [horses, overlay]);
  const shown = useMemo(() => applyAppointmentChanges(appointments, overlay), [appointments, overlay]);
  const waiting = useMemo(() => waitingAppointmentIds(pending, offline || stuck), [pending, offline, stuck]);
  const typeById = useMemo(() => new Map(shownTypes.map((t) => [t.id, t])), [shownTypes]);
  const board = useMemo(
    () => visitsBoard({ appointments: shown, types: shownTypes, horses: shownHorses }, now),
    [shown, shownTypes, shownHorses, now],
  );
  const inWork = useMemo(() => new Set(shownHorses.map((h) => h.id)), [shownHorses]);
  const ctx: SaveContext = { types: shownTypes, today: now, locale, offline, around: shown, inWork };
  // Done: everything checked off since `since` (older ones are in the book only for the due rules).
  const doneList = useMemo(() => board.done.filter((a) => a.date >= since), [board.done, since]);
  // Older ones exist (on the server, or logged on the phone from before `since`).
  const olderToShow = nextSince !== null || doneList.length < board.done.length;
  const visibleDone = extended ? doneList : doneList.slice(0, doneShown);
  const moreHere = visibleDone.length < doneList.length;

  // A visit checked off under "Did these happen?" moves to Done, and the circle she
  // tapped goes with it: carry on from the next one (or the next section).
  const toCheckList = useRef<HTMLUListElement>(null);
  const refocusAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = refocusAt.current;
    if (at === null) return;
    refocusAt.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const circles = toCheckList.current?.querySelectorAll<HTMLElement>("button[aria-pressed]");
    const target = circles?.length
      ? circles[Math.min(at, circles.length - 1)]
      : document.querySelector<HTMLElement>('[data-visits-section="due"] h2');
    if (!target) return;
    if (target.tagName !== "BUTTON") target.tabIndex = -1;
    target.focus();
  });

  // "Show older visits": the rest of the year's list first, then older ones from the
  // server. One button throughout, so it keeps the focus; when it goes (all shown),
  // the focus moves to the first of the rows it brought.
  const doneListRef = useRef<HTMLUListElement>(null);
  const focusRowAt = useRef<number | null>(null);
  function showOlder() {
    if (loadingOlder) return;
    focusRowAt.current = visibleDone.length;
    if (moreHere) {
      setDoneShown((n) => n + MORE);
      return;
    }
    if (offline) {
      focusRowAt.current = null;
      toast("No signal — older visits load once you’re back online");
      return;
    }
    // Back to a day, not a number of visits: the list mustn't shift when one is added or checked off.
    const url = `/visits?since=${nextSince ?? "2000-01-01"}`;
    notePageChange(url);
    startLoadingOlder(() => router.replace(url, { scroll: false }));
  }
  useLayoutEffect(() => {
    const at = focusRowAt.current;
    if (at === null || loadingOlder) return;
    focusRowAt.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) return; // still on the button
    doneListRef.current?.querySelectorAll<HTMLElement>(":scope > li > button")[at]?.focus();
  });

  // Fresh data from the server includes everything it confirmed before it arrived (not the copy, which may be older).
  useEffect(() => {
    if (savedAt === undefined) forgetConfirmedBefore(Date.now());
  }, [appointments, types, horses, savedAt]);
  // Keep what she sees, to draw the tab from with no signal later.
  useEffect(() => {
    if (savedAt !== undefined) return;
    saveAppointmentsCopy({
      locale,
      appointments: shown,
      types: shownTypes,
      horses: shownHorses,
      loadedAt,
      doneSince: since,
      nextSince,
      extended,
    });
  }, [savedAt, locale, shown, shownTypes, shownHorses, loadedAt, since, nextSince, extended]);

  const row = (a: AppointmentLite, tick: "live" | "static" | "none", toCheckAt?: number) => (
    <AppointmentRow
      key={a.id}
      appointment={a}
      type={typeById.get(a.typeId)}
      today={now}
      locale={locale}
      withDay
      tick={tick}
      waiting={waiting.has(a.id)}
      onCheck={(done) => {
        if (toCheckAt !== undefined) refocusAt.current = toCheckAt;
        checkOffAppointment(a, done, ctx);
      }}
      onOpen={() => openAppointment(KEY, a)}
    />
  );
  // A checked-off visit dated ahead (another time zone, another phone) shows it's done; it can't be ticked here.
  const ahead = (a: AppointmentLite) => (a.date <= now ? "live" : a.done ? "static" : "none");
  const list = "divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line";
  const notCountedTotal = board.notCounted.reduce((n, g) => n + g.horses.length, 0);

  return (
    <>
      <PageHeader
        title="Visits"
        action={
          <button type="button" onClick={() => openNewAppointment(KEY)} className={headerButtonClass}>
            <Plus className="size-5" /> Add visit
          </button>
        }
      />
      <div className="mx-auto max-w-xl px-4 pt-4">
        {savedAt !== undefined && (
          <p role="status" className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-[14px] text-ink-2">
            {offline ? "No signal" : "Still loading"} — this is as last loaded {whenLoaded(loadedAt, locale)}, with your
            changes since. They’re kept and will sync.
          </p>
        )}

        {shown.length === 0 ? (
          <EmptyState icon={<CalendarClock className="size-14 text-brand" />} title="No visits yet">
            <p>
              Keep the farrier, vet, dentist and the rest in one place. Add when each last came, and Barn Book will
              show who’s due next.
            </p>
            <button
              type="button"
              onClick={() => openNewAppointment(KEY)}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[16px] font-semibold text-brand-ink active:opacity-80"
            >
              <Plus className="size-5" /> Add a visit
            </button>
          </EmptyState>
        ) : (
          <div className="space-y-8">
            {board.toCheck.length > 0 && (
              <section aria-labelledby={toCheckId}>
                <h2 id={toCheckId} className="px-1 font-serif text-[20px] font-semibold">
                  {board.toCheck.length === 1 ? "Did this happen?" : "Did these happen?"}
                </h2>
                <p className="mt-0.5 mb-3 px-1 text-[15px] text-ink-2">
                  {board.toCheck.length === 1
                    ? "Check it off if it did, or tap it to change the day or delete it."
                    : "Check off the ones that did, or tap one to change its day or delete it."}
                </p>
                <ul ref={toCheckList} className={list}>
                  {board.toCheck.map((a, i) => row(a, "live", i))}
                </ul>
              </section>
            )}

            <section data-visits-section="due">
              <SectionTitle>{board.dueCount > 0 ? `Due · ${board.dueCount}` : "Due"}</SectionTitle>
              {!board.remindersSet ? (
                <Card className="p-4 text-[15px] text-ink-2">
                  <p>
                    Set how often each type comes round, like the farrier every 6 weeks, and horses that need booking
                    will show here.
                  </p>
                  <Link
                    href="/settings"
                    className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand active:opacity-70"
                  >
                    Set reminders in Settings
                  </Link>
                </Card>
              ) : !board.anyTracked ? (
                <Card className="p-4 text-[15px] text-ink-2">
                  <p>Due dates count from each horse’s last visit. Add the last one and Barn Book will work out the next.</p>
                  <button
                    type="button"
                    onClick={() => openNewAppointment(KEY)}
                    className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand active:opacity-70"
                  >
                    Add a past visit
                  </button>
                </Card>
              ) : board.dueCount === 0 ? (
                <Card className="p-4 text-[15px] text-ink-2">No horses due right now.</Card>
              ) : (
                <div className="space-y-4">
                  {board.due.map(({ type, rows }) => {
                    const all = rows.map((r) => r.horse);
                    const footer =
                      all.length === 1
                        ? `Book a visit for ${all[0]!.name}`
                        : all.length === 2
                          ? "Book a visit for both"
                          : `Book a visit for all ${all.length}`;
                    return (
                      <Card key={type.id} className="overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                          <ActivityChip name={type.name} color={type.color} size="md" />
                          <span className="text-[14px] text-ink-3">{everyLabel(type.every)}</span>
                        </div>
                        <ul className="divide-y divide-line">
                          {rows.map((r) => {
                            const due = dueLabel(r.due, now, locale);
                            return (
                              <li key={r.horse.id}>
                                <button
                                  type="button"
                                  onClick={() => openNewAppointment(KEY, { typeId: type.id, horseIds: [r.horse.id] })}
                                  aria-label={`${r.horse.name}, ${due.text}: book ${visitName(type.name)}`}
                                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2"
                                >
                                  <span
                                    className={cx(colorClass(r.horse.color), "size-2 shrink-0 rounded-full bg-tone-solid")}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[17px] font-semibold">{r.horse.name}</span>
                                    <span
                                      className={cx(
                                        "block text-[14px]",
                                        due.tone === "danger"
                                          ? "font-medium text-danger"
                                          : due.tone === "strong"
                                            ? "font-medium text-ink"
                                            : "text-ink-3",
                                      )}
                                    >
                                      {due.text}
                                    </span>
                                  </span>
                                  <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <button
                          type="button"
                          onClick={() => openNewAppointment(KEY, { typeId: type.id, horseIds: all.map((h) => h.id) })}
                          aria-label={`${footer}: ${visitName(type.name)}, ${spokenHorseList(all, locale)}`}
                          className="min-h-12 w-full border-t border-line text-[16px] font-semibold text-brand active:bg-surface-2"
                        >
                          {footer}
                        </button>
                      </Card>
                    );
                  })}
                </div>
              )}
              {board.anyTracked && notCountedTotal > 0 && (
                <details className="group mt-4">
                  <summary className="mb-2 flex min-h-11 cursor-pointer list-none items-center gap-1 px-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                    Not counted yet · {notCountedTotal}
                  </summary>
                  <ul className={list}>
                    {board.notCounted.map(({ type, horses: never }) => (
                      <li key={type.id} className="flex items-center gap-3 px-4 py-2.5">
                        <ActivityChip name={type.name} color={type.color} />
                        <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{shortHorseList(never)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            openNewAppointment(KEY, { typeId: type.id, horseIds: never.map((h) => h.id) })
                          }
                          className="min-h-11 shrink-0 rounded-full px-2 text-[15px] font-semibold text-brand active:opacity-70"
                        >
                          Add last visit
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 px-1 text-sm text-ink-3">
                    Due dates count from the last visit checked off. Add it and they’ll show here when due.
                  </p>
                </details>
              )}
            </section>

            <section>
              <SectionTitle>Coming up</SectionTitle>
              {board.comingUp.length === 0 ? (
                <Card className="p-4 text-[15px] text-ink-2">Nothing booked.</Card>
              ) : (
                <ul className={list}>{board.comingUp.map((a) => row(a, ahead(a)))}</ul>
              )}
            </section>

            {(doneList.length > 0 || olderToShow) && (
              <section>
                <SectionTitle>Done</SectionTitle>
                {visibleDone.length > 0 && (
                  <ul ref={doneListRef} className={list}>
                    {visibleDone.map((a) => row(a, "static"))}
                  </ul>
                )}
                <p role="status" className="mt-2 px-1 text-center text-sm text-ink-3">
                  {!moreHere && olderToShow ? `Showing visits since ${monthDay(since, now, locale)}.` : ""}
                </p>
                {(moreHere || olderToShow) && (
                  <button
                    type="button"
                    onClick={showOlder}
                    aria-disabled={loadingOlder || undefined}
                    className={cx(
                      "min-h-11 w-full rounded-full text-[15px] font-semibold text-brand active:opacity-70",
                      loadingOlder && "opacity-60",
                    )}
                  >
                    {loadingOlder ? "Loading older visits…" : "Show older visits"}
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <AppointmentSheet
        sheetKey={KEY}
        today={now}
        locale={locale}
        types={shownTypes}
        horses={shownHorses}
        around={shown}
        offline={offline}
      />
    </>
  );
}
