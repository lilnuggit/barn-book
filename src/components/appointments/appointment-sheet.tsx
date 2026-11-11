"use client";

import { CalendarDays, Clock, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  afterVisit,
  dayPhrase,
  everyAfterLabel,
  formatTime,
  sortHorses,
  spokenHorseList,
  visitName,
  type AppointmentLite,
  type AppointmentTypeLite,
} from "@/lib/appointments";
import type { HorseLite } from "@/lib/data";
import { addDays, dayHeading, isISODate } from "@/lib/dates";
import { colorClass } from "@/lib/palette";
import { Sheet } from "../sheet";
import { ToggleChip } from "../toggle-chip";
import { cx } from "../ui";
import { addAppointment, knownHorses, removeAppointment, saveAppointment, type SaveContext } from "./save";
import { closeAppointmentSheet, openNewAppointment, savedDone, sheetDirty, useAppointmentSheet } from "./sheet-state";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LABEL = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase";
const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium ring-1 transition-colors";

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Adds a visit, or changes one. One sheet per screen (`sheetKey`); its state lives in sheet-state. */
export function AppointmentSheet({
  sheetKey,
  today,
  locale,
  types,
  horses,
  extraHorses = [],
  around,
  covered,
  offline,
}: {
  sheetKey: string;
  /** The phone's today. */
  today: string;
  locale: string;
  /** As shown (changes on the phone applied), archived ones included. */
  types: AppointmentTypeLite[];
  /** Horses in work, as shown, A–Z. */
  horses: HorseLite[];
  /** Horses not in work that can still be on a visit (an archived horse's own page). */
  extraHorses?: HorseLite[];
  /**
   * The visits known around (as shown), to tell whether the next one is booked
   * already; missing when the screen doesn't have them (then it's offered anyway).
   */
  around?: readonly AppointmentLite[];
  /** "type|horse" pairs whose visits are all in `around` (Today); missing: all of them. */
  covered?: ReadonlySet<string>;
  offline: boolean;
}) {
  const [s, update] = useAppointmentSheet(sheetKey);
  const inWork = new Set(horses.map((h) => h.id));
  const ctx: SaveContext = { types, today, locale, offline, around, inWork, covered };
  const editing = s.editing;
  const dirty = sheetDirty(s, today);
  const done = savedDone(s, today);
  const tomorrow = addDays(today, 1);

  const noteRef = useRef<HTMLTextAreaElement>(null);
  // Unique per sheet: two copies of a screen can be mounted at once (one hidden).
  const noteId = useId();
  const titleId = useId();
  // The sheet became another visit while open ("Book the next one"): the button
  // she tapped is gone, so move to the title, which says what the sheet is now.
  const shownId = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = shownId.current;
    shownId.current = s.open ? s.id : null;
    if (s.open && was !== null && was !== s.id) document.getElementById(titleId)?.focus();
  }, [s.open, s.id, titleId]);
  // The note grows with what's typed (measured once the sheet is open).
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el || !s.open) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [s.note, s.open]);
  // This screen took over from another copy of itself while she was typing
  // the note: put the keyboard back there, with the cursor at the end.
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!s.open || !s.typing || !el || document.activeElement === el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // Only when it first appears (the sheet re-opens in its own layout effect, which runs first).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Types: the active ones, plus an archived one the visit has (or had when the sheet opened).
  const typeChoices = types.filter((t) => !t.archived || t.id === s.typeId || t.id === editing?.typeId);
  const type = types.find((t) => t.id === s.typeId);
  // Horses: those in work, then any others on the visit (archived), muted.
  const extras: HorseLite[] = [];
  for (const h of [...extraHorses, ...(editing?.horses ?? [])]) {
    if (!inWork.has(h.id) && !extras.some((x) => x.id === h.id)) extras.push(h);
  }
  const known = new Map([...extras, ...horses].map((h) => [h.id, h]));
  const picked = s.horseIds.map((id) => known.get(id)).filter((h) => h !== undefined);
  const allPicked = horses.length > 0 && horses.every((h) => s.horseIds.includes(h.id));
  const showStatus = s.date !== null && s.date <= today;
  const customDay = s.date !== null && s.date !== today && s.date !== tomorrow;

  const missing = !type ? "Pick a type" : picked.length === 0 ? "Pick a horse" : !s.date ? "Pick a day" : null;
  const label = missing ?? (editing ? "Save changes" : done ? "Add visit" : "Book visit");
  const canSave = missing === null && (!editing || dirty);

  function pickDay(date: string | null) {
    update((now) => {
      // A past day means she's logging what happened. A future day hides Status
      // (it's saved as booked) but keeps her choice, for if she comes back.
      if (date === null || date > today) return { date };
      return { date, done: now.doneTouched ? now.done : date < today };
    });
  }

  function toggleHorse(id: string) {
    update((now) => ({
      horseIds: now.horseIds.includes(id) ? now.horseIds.filter((x) => x !== id) : [...now.horseIds, id],
    }));
  }

  function submit() {
    if (!canSave || !type || !s.date) return;
    const a: AppointmentLite = {
      id: s.id,
      typeId: type.id,
      date: s.date,
      time: s.time,
      horses: sortHorses(picked, locale),
      note: s.note.trim(),
      done,
    };
    if (editing) saveAppointment(editing, a, ctx);
    else addAppointment(a, ctx);
    closeAppointmentSheet(sheetKey);
  }

  // After a visit that's checked off: the next one, on the day it's due, for
  // the horses it's the last visit for and that have nothing booked since.
  const editingType = editing ? types.find((t) => t.id === editing.typeId) : undefined;
  const after =
    editing?.done && !dirty && editingType
      ? afterVisit(editing, editingType, around ?? [editing], inWork, today, knownHorses(editing, covered))
      : null;
  const every = editingType?.every;
  const next = after?.due && after.due >= today ? after.due : null;
  const bookFor = next ? (after?.bookFor ?? []) : [];
  const allOnVisit = editing ? editing.horses.filter((h) => inWork.has(h.id)).length : 0;

  return (
    <Sheet
      open={s.open}
      onClose={() => closeAppointmentSheet(sheetKey)}
      title={editing ? visitName(type?.name ?? "Visit") : "New visit"}
      titleId={titleId}
      closeLabel="Cancel"
      dirty={dirty}
      footer={
        <button
          type="button"
          disabled={!canSave}
          onClick={submit}
          className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-brand-ink active:opacity-80 disabled:opacity-40"
        >
          {label}
        </button>
      }
    >
      <Field label="Type">
        {typeChoices.length === 0 ? (
          <p className="text-[15px] text-ink-2">
            No types of visit yet.{" "}
            <Link
              href="/settings"
              onClick={() => closeAppointmentSheet(sheetKey)}
              className="font-semibold text-brand underline"
            >
              Add them in Settings
            </Link>
          </p>
        ) : (
          <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
            {typeChoices.map((t) => (
              <ToggleChip
                key={t.id}
                role="radio"
                selected={s.typeId === t.id}
                color={t.color}
                muted={t.archived}
                onClick={() => update(() => ({ typeId: t.id }))}
              >
                {t.name}
              </ToggleChip>
            ))}
          </div>
        )}
      </Field>

      <Field
        label="Horses"
        action={
          horses.length > 1 && (
            <button
              type="button"
              onClick={() =>
                update((now) => ({
                  horseIds: allPicked
                    ? now.horseIds.filter((id) => !inWork.has(id))
                    : [...now.horseIds, ...horses.map((h) => h.id).filter((id) => !now.horseIds.includes(id))],
                }))
              }
              className="-my-2 -mr-2 min-h-11 min-w-11 rounded-full px-3 text-[15px] font-semibold text-brand active:opacity-70"
            >
              {allPicked ? "None" : "All"}
            </button>
          )
        }
      >
        {horses.length === 0 && extras.length === 0 ? (
          <p className="text-[15px] text-ink-2">No horses in work yet. Add them on the Horses tab.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...horses, ...extras].map((h) => (
              <ToggleChip
                key={h.id}
                selected={s.horseIds.includes(h.id)}
                color={h.color}
                muted={!inWork.has(h.id)}
                onClick={() => toggleHorse(h.id)}
              >
                {h.name}
              </ToggleChip>
            ))}
          </div>
        )}
      </Field>

      <Field label="Day">
        <div role="radiogroup" aria-label="Day" className="flex flex-wrap gap-2">
          <ToggleChip role="radio" selected={s.date === today} color="slate" onClick={() => pickDay(today)}>
            Today
          </ToggleChip>
          <ToggleChip role="radio" selected={s.date === tomorrow} color="slate" onClick={() => pickDay(tomorrow)}>
            Tomorrow
          </ToggleChip>
          <span className="relative inline-flex">
            <span
              aria-hidden
              className={cx(
                colorClass("slate"),
                CHIP,
                customDay ? "bg-tone-bg text-tone-fg ring-tone-solid" : "bg-surface text-ink-2 ring-line",
              )}
            >
              <CalendarDays className="size-4" />
              {customDay && s.date ? dayHeading(s.date, today, locale) : "Pick a date"}
            </span>
            <input
              type="date"
              aria-label="Choose a day"
              value={s.date ?? ""}
              onClick={(e) => e.currentTarget.showPicker?.()}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "") pickDay(null); // Reset on iOS
                else if (isISODate(value)) pickDay(value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </div>
        {s.hint && s.date === s.hint.date && <p className="mt-2 text-[13px] text-ink-3">{s.hint.text}</p>}
      </Field>

      <Field label="Time" optional>
        <div className="flex items-center gap-1">
          <span className="relative inline-flex">
            <span
              aria-hidden
              className={cx(
                colorClass("slate"),
                CHIP,
                s.time ? "bg-tone-bg text-tone-fg ring-tone-solid" : "bg-surface text-ink-2 ring-line",
              )}
            >
              <Clock className="size-4" />
              {s.time ? formatTime(s.time, locale) : "Add a time"}
            </span>
            <input
              type="time"
              aria-label="Time"
              value={s.time ?? ""}
              onClick={(e) => e.currentTarget.showPicker?.()}
              onChange={(e) => {
                const value = e.target.value.slice(0, 5);
                if (value === "") update(() => ({ time: null }));
                else if (TIME.test(value)) update(() => ({ time: value }));
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
          {s.time && (
            <button
              type="button"
              aria-label="Remove the time"
              onClick={() => update(() => ({ time: null }))}
              className="grid size-11 place-items-center rounded-full text-ink-3 active:bg-surface-2"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      </Field>

      <Field label="Note" optional htmlFor={noteId}>
        <textarea
          id={noteId}
          ref={noteRef}
          rows={2}
          value={s.note}
          maxLength={4000}
          onChange={(e) => update(() => ({ note: e.target.value }))}
          onFocus={() => update(() => ({ typing: true }))}
          onBlur={() => update(() => ({ typing: false }))}
          placeholder="e.g. fronts only, needs sedating"
          className="w-full resize-none rounded-xl bg-surface-2 px-3.5 py-2.5 text-[16px] text-ink placeholder:text-ink-3 focus:ring-2 focus:ring-brand/50 focus:outline-none"
        />
      </Field>

      {showStatus && (
        <Field label="Status">
          <div role="radiogroup" aria-label="Status" className="flex w-fit rounded-full bg-surface-2 p-1">
            {(
              [
                ["Booked", false],
                ["Done", true],
              ] as const
            ).map(([text, value]) => (
              <button
                key={text}
                type="button"
                role="radio"
                aria-checked={s.done === value}
                onClick={() => update(() => ({ done: value, doneTouched: true }))}
                className={cx(
                  "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors",
                  s.done === value ? "bg-surface text-ink shadow-sm" : "text-ink-3",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          {s.done && picked.length >= 2 && (
            <p className="mt-2 text-[13px] text-ink-3">Counts as done for every horse picked.</p>
          )}
        </Field>
      )}

      {editing && (
        <div className="mt-6 space-y-3">
          {next && every && bookFor.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() =>
                  openNewAppointment(sheetKey, {
                    typeId: editing.typeId,
                    horseIds: bookFor.map((h) => h.id),
                    date: next,
                    time: editing.time,
                    hint: { text: `${capitalized(everyAfterLabel(every))} after the last visit`, date: next },
                  })
                }
                className="w-full rounded-2xl py-3 text-[16px] font-semibold text-brand ring-1 ring-line active:bg-surface-2"
              >
                Book the next one
              </button>
              <p className="mt-1.5 text-center text-[13px] text-ink-3">
                {dayHeading(next, today, locale)} · {everyAfterLabel(every)} after this visit
                {bookFor.length < allOnVisit && ` · for ${spokenHorseList(bookFor, locale)}`}
              </p>
            </div>
          ) : (
            // Only when every horse on it is known to have its next one (else Due has the ones that don't).
            after?.booked &&
            after.bookFor.length === 0 &&
            after.unknown.length === 0 && (
              <p className="text-center text-[14px] text-ink-2">{bookedLine(after.booked, today, locale)}</p>
            )
          )}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Delete this visit? This can’t be undone.")) return;
              removeAppointment(editing, ctx);
              closeAppointmentSheet(sheetKey);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[16px] font-semibold text-danger ring-1 ring-line active:bg-danger-soft"
          >
            <Trash2 className="size-4" /> Delete visit
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** "Next one booked for tomorrow · 9:30 AM", "Next one was yesterday — not checked off yet". */
function bookedLine(next: AppointmentLite, today: string, locale: string): string {
  const day = dayPhrase(next.date, today, locale);
  if (next.date >= today) return `Next one booked for ${day}${next.time ? ` · ${formatTime(next.time, locale)}` : ""}`;
  return `Next one was ${day === "yesterday" ? day : `on ${day}`} — not checked off yet`;
}

function Field({
  label,
  optional = false,
  htmlFor,
  action,
  children,
}: {
  label: string;
  optional?: boolean;
  htmlFor?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const text = (
    <>
      {label} {optional && <span className="font-normal normal-case">(optional)</span>}
    </>
  );
  return (
    <section className="mt-5 first:mt-0">
      <div className="flex items-center justify-between">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={LABEL}>
            {text}
          </label>
        ) : (
          <h3 className={LABEL}>{text}</h3>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}
