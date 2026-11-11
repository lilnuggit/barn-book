"use client";

import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { AppointmentLite } from "@/lib/appointments";

/*
 * The visit sheet of each screen (keys "day:<date>", "visits", "horse:<id>"),
 * kept outside the screen like day-open-state: a screen drawn from the copy
 * kept on the phone is replaced by the live one when it arrives, and the new
 * one carries on with the sheet open and what's typed in it. A new screen for
 * a key with no other screen on show starts with the sheet closed.
 */

export type SheetState = {
  open: boolean;
  /** The visit being changed, as it was shown when the sheet opened (null: a new visit). */
  editing: AppointmentLite | null;
  id: string;
  typeId: string | null;
  horseIds: string[];
  date: string | null;
  /** "HH:MM", or null. */
  time: string | null;
  note: string;
  done: boolean;
  /** She picked Booked or Done herself: changing the day doesn't change it (only a future day does). */
  doneTouched: boolean;
  /** "6 weeks after the last visit", shown while the day is still the one suggested. */
  hint: { text: string; date: string } | null;
  /** The note has the keyboard. */
  typing: boolean;
  /** What the sheet started with, to tell whether anything has changed. */
  initial: string;
  /** Which opening this is (each open, or "Book the next one", gets a new one). */
  session: number;
};

export type Prefill = {
  typeId?: string;
  horseIds?: string[];
  date?: string;
  time?: string | null;
  hint?: SheetState["hint"];
};

const CLOSED: SheetState = {
  open: false,
  editing: null,
  id: "",
  typeId: null,
  horseIds: [],
  date: null,
  time: null,
  note: "",
  done: false,
  doneTouched: false,
  hint: null,
  typing: false,
  initial: "",
  session: 0,
};

let sessions = 0;

const sheets = new Map<string, SheetState>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(key: string, next: SheetState) {
  sheets.set(key, next);
  for (const listener of listeners) listener();
}

function snapshot(s: Pick<SheetState, "typeId" | "horseIds" | "date" | "time" | "note" | "done">): string {
  return JSON.stringify({
    typeId: s.typeId,
    horseIds: [...s.horseIds].sort(),
    date: s.date,
    time: s.time,
    note: s.note.trim(),
    done: s.done,
  });
}

/**
 * Done as it will be saved. A future day hides Status and saves the visit as
 * booked; one already checked off and dated ahead (another time zone, another
 * phone) stays done unless she moved it or chose Booked.
 */
export function savedDone(s: SheetState, today: string): boolean {
  if (s.date !== null && s.date <= today) return s.done;
  return s.editing !== null && s.date === s.editing.date && s.editing.done && s.done;
}

/** What would be saved differs from what the sheet started with: closing asks first. */
export function sheetDirty(s: SheetState, today: string): boolean {
  return s.open && snapshot({ ...s, done: savedDone(s, today) }) !== s.initial;
}

/** Screens of each key on show (mounted, not hidden). */
const onShow = new Map<string, number>();

/** Called by a screen before anything reads its sheet (see useDayScreen for the rules). */
export function useAppointmentScreen(key: string) {
  useState(() => {
    // Nothing subscribed to this key can be on show, so no one to tell.
    if (typeof window !== "undefined" && !onShow.get(key)) sheets.delete(key);
    return null;
  });
  useLayoutEffect(() => {
    onShow.set(key, (onShow.get(key) ?? 0) + 1);
    return () => {
      const left = (onShow.get(key) ?? 1) - 1;
      if (left > 0) onShow.set(key, left);
      else onShow.delete(key);
    };
  }, [key]);
}

export function useAppointmentSheet(
  key: string,
): [SheetState, (change: (now: SheetState) => Partial<SheetState>) => void] {
  const state = useSyncExternalStore(
    subscribe,
    () => sheets.get(key) ?? CLOSED,
    () => CLOSED,
  );
  const update = useCallback(
    (change: (now: SheetState) => Partial<SheetState>) => {
      const now = sheets.get(key) ?? CLOSED;
      const patch = change(now);
      const keys = Object.keys(patch) as (keyof SheetState)[];
      if (keys.every((k) => Object.is(patch[k], now[k]))) return;
      set(key, { ...now, ...patch });
    },
    [key],
  );
  return [state, update];
}

/** A new visit, with what's known already picked (a type and horses from Due, a day from "Book the next one"). */
export function openNewAppointment(key: string, prefill: Prefill = {}) {
  const fields = {
    typeId: prefill.typeId ?? null,
    horseIds: prefill.horseIds ?? [],
    date: prefill.date ?? null,
    time: prefill.time ?? null,
    note: "",
    done: false,
  };
  set(key, {
    ...CLOSED,
    ...fields,
    open: true,
    id: crypto.randomUUID(),
    hint: prefill.hint ?? null,
    initial: snapshot(fields),
    session: ++sessions,
  });
}

/** Changes a visit, starting from it as shown. */
export function openAppointment(key: string, a: AppointmentLite) {
  const fields = {
    typeId: a.typeId,
    horseIds: a.horses.map((h) => h.id),
    date: a.date,
    time: a.time,
    note: a.note,
    done: a.done,
  };
  set(key, {
    ...CLOSED,
    ...fields,
    open: true,
    editing: a,
    id: a.id,
    doneTouched: true,
    initial: snapshot(fields),
    session: ++sessions,
  });
}

export function closeAppointmentSheet(key: string) {
  const now = sheets.get(key);
  if (now?.open) set(key, { ...now, open: false, typing: false });
}

/** The opening on show (see `session`), or null when the sheet is closed. */
export function openAppointmentSession(key: string): number | null {
  const now = sheets.get(key);
  return now?.open ? now.session : null;
}

/** Closes that opening of the sheet if it's still the one on show and closing it loses nothing (one left open overnight). */
export function closeAppointmentSheetIfClean(key: string, session: number, today: string) {
  const now = sheets.get(key);
  if (now?.open && now.session === session && !sheetDirty(now, today)) closeAppointmentSheet(key);
}
