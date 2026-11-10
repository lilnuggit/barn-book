"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { HorseLite } from "@/lib/data";

/**
 * What's open on each day's screen: the expanded card, the add sheet, and
 * what's picked and typed in it. Kept outside the screen because a day's
 * screen can be swapped for another copy of itself (the copy kept on the phone
 * while there's no signal, replaced by the live list when it returns), and
 * the new one must carry on where the rider was, not close what she had open.
 */
export type DayOpen = {
  expandedId: string | null;
  sheetOpen: boolean;
  horseIds: string[];
  activityIds: string[];
  note: string;
  /** Horses added in the sheet itself. */
  created: HorseLite[];
  /** The entry whose note she's typing in (the keyboard is up). */
  typingIn: string | null;
};

const NOTHING_OPEN: DayOpen = {
  expandedId: null,
  sheetOpen: false,
  horseIds: [],
  activityIds: [],
  note: "",
  created: [],
  typingIn: null,
};
const byDay = new Map<string, DayOpen>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDayOpen(date: string): [DayOpen, (change: (now: DayOpen) => Partial<DayOpen>) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => byDay.get(date) ?? NOTHING_OPEN,
    () => NOTHING_OPEN,
  );
  const update = useCallback(
    (change: (now: DayOpen) => Partial<DayOpen>) => {
      const now = byDay.get(date) ?? NOTHING_OPEN;
      byDay.set(date, { ...now, ...change(now) });
      for (const listener of listeners) listener();
    },
    [date],
  );
  return [open, update];
}
