"use client";

import type { ActivityLite, CopySuggestion, DayEntry, HorseLite } from "./data";
import { currentUser } from "./sync";

/*
 * The last list the server sent for each day, kept on the phone. With no
 * signal, a day the router no longer has (Next drops its copies after every
 * save) is drawn from here instead of a blank skeleton, with the changes still
 * waiting on the phone layered on top as usual.
 */

export type DayCopy = {
  date: string;
  today: string;
  locale: string;
  entries: DayEntry[];
  horses: HorseLite[];
  activities: ActivityLite[];
  suggestions: CopySuggestion[];
  savedAt: number;
  /** The account it belongs to (null without Clerk). */
  userId: string | null;
};

const KEY = "barnbook:days:v1";
const KEEP = 7;

function load(): DayCopy[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as DayCopy[]) : [];
  } catch {
    return [];
  }
}

export function saveDayCopy(copy: Omit<DayCopy, "savedAt" | "userId">) {
  const userId = currentUser();
  if (userId === undefined) return; // sign-in still loading: don't know whose it is
  const others = load().filter((d) => !(d.date === copy.date && d.userId === userId));
  const next = [{ ...copy, savedAt: Date.now(), userId }, ...others].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // full or private mode: just don't keep a copy
  }
}

export function readDayCopy(date: string): DayCopy | null {
  const userId = currentUser();
  if (userId === undefined) return null;
  return load().find((d) => d.date === date && d.userId === userId) ?? null;
}

/** After signing out: nothing of this account stays on the phone. */
export function clearDayCopies() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
