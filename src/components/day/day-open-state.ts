"use client";

import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { HorseLite } from "@/lib/data";

/*
 * What's open on each day's screen, kept outside the screen. A day's screen
 * can be swapped for another copy of itself (the copy kept on the phone while
 * there's no signal, replaced by the live list when it returns), and the new
 * one must carry on where the rider was, not close what she had open.
 *
 * Otherwise it behaves as if it were the screen's own: a new screen for a day
 * that isn't on show anywhere starts afresh. So a sheet left open on a list
 * that was replaced (the day moving on under it) doesn't pop up by itself the
 * next time she goes to that day.
 */

/** The open card and the add sheet: what the list itself depends on. */
export type DayUi = {
  expandedId: string | null;
  sheetOpen: boolean;
  /** The entry whose note she's typing in (the keyboard is up). */
  typingIn: string | null;
  /** A horse just checked off whose card is still open: it stays in its place until the card closes. */
  held: string | null;
};

/** What's picked and typed in the day's add sheet. Kept apart, so typing there doesn't redraw the list. */
export type SheetDraft = {
  horseIds: string[];
  activityIds: string[];
  note: string;
  /** Horses added in the sheet itself. */
  created: HorseLite[];
  /** The new horse's name being typed, and whether that field is out. */
  newName: string;
  showNewHorse: boolean;
  /** The sheet's field that has the keyboard. */
  typingIn: "note" | "name" | null;
};

const NO_UI: DayUi = { expandedId: null, sheetOpen: false, typingIn: null, held: null };
const NO_DRAFT: SheetDraft = {
  horseIds: [],
  activityIds: [],
  note: "",
  created: [],
  newName: "",
  showNewHorse: false,
  typingIn: null,
};

type Store<T> = { byDay: Map<string, T>; listeners: Set<() => void>; empty: T };

function store<T>(empty: T): Store<T> {
  return { byDay: new Map(), listeners: new Set(), empty };
}

const uiStore = store(NO_UI);
const draftStore = store(NO_DRAFT);

function useDayStore<T>(s: Store<T>, date: string): [T, (change: (now: T) => Partial<T>) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      s.listeners.add(listener);
      return () => {
        s.listeners.delete(listener);
      };
    },
    [s],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => s.byDay.get(date) ?? s.empty,
    () => s.empty,
  );
  const update = useCallback(
    (change: (now: T) => Partial<T>) => {
      const now = s.byDay.get(date) ?? s.empty;
      const patch = change(now);
      const keys = Object.keys(patch) as (keyof T)[];
      if (keys.every((k) => Object.is(patch[k], now[k]))) return; // nothing changes
      s.byDay.set(date, { ...now, ...patch });
      for (const listener of s.listeners) listener();
    },
    [s, date],
  );
  return [value, update];
}

/** The day's open card, add sheet, and the note being typed in. */
export function useDayUi(date: string) {
  return useDayStore(uiStore, date);
}

/** The day's add sheet: picks, note, a new horse's name. */
export function useSheetDraft(date: string) {
  return useDayStore(draftStore, date);
}

/** Nothing is picked or typed in the day's add sheet: closing it loses nothing. */
export function sheetDraftEmpty(date: string): boolean {
  const d = draftStore.byDay.get(date);
  return !d || (d.horseIds.length === 0 && !d.note.trim() && !d.newName.trim());
}

/** Screens of each day on show (mounted, not hidden). */
const onShow = new Map<string, number>();

/**
 * Called by a day's screen before it reads anything above. A new screen for
 * a day with no other screen on show starts afresh; one taking over from
 * another copy of the day's screen (both are there until the swap is done)
 * carries on. A screen that was only hidden (another tab) is the same screen
 * when it shows again, so it carries on too.
 */
export function useDayScreen(date: string) {
  useState(() => {
    if (typeof window !== "undefined" && !onShow.get(date)) {
      // Nothing subscribed to this day can be on show, so no one to tell.
      uiStore.byDay.delete(date);
      draftStore.byDay.delete(date);
    }
    return null;
  });
  useLayoutEffect(() => {
    onShow.set(date, (onShow.get(date) ?? 0) + 1);
    return () => {
      const left = (onShow.get(date) ?? 1) - 1;
      if (left > 0) onShow.set(date, left);
      else onShow.delete(date);
    };
  }, [date]);
}
