"use client";

import type { EntryStatus } from "@/db/schema";
import { currentUser } from "./account";
import type { ActivityLite, CopySuggestion, DayEntry, HorseLite } from "./data";
import type { OutboxItem } from "./sync";

/*
 * A copy of each recent day's list, kept on the phone. With no signal (or a
 * connection that hangs), a day the router no longer has is drawn from here
 * instead of a blank skeleton, with the changes still waiting on the phone
 * layered on top as usual.
 *
 * It's what the rider last saw of that day (server data plus her changes), and
 * every change the server confirms afterwards is applied to it too, wherever
 * she is at the time. So it's never behind what the server already has.
 */

export type DayCopy = {
  date: string;
  today: string;
  locale: string;
  entries: DayEntry[];
  horses: HorseLite[];
  activities: ActivityLite[];
  suggestions: CopySuggestion[];
  /** When this phone last had this list (shown, or brought up to date). */
  savedAt: number;
  /** The account it belongs to (null without Clerk). */
  userId: string | null;
};

const KEY = "barnbook:days:v1";
const KEEP = 14;

/** Layers changes (waiting on the phone, or just confirmed) over a day's entries. */
export function applyDayChanges(entries: DayEntry[], changes: OutboxItem[], date: string): DayEntry[] {
  let out = entries;
  for (const item of changes) {
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

function load(): DayCopy[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as DayCopy[]).filter((d) => d && typeof d.date === "string") : [];
  } catch {
    return [];
  }
}

function store(copies: DayCopy[]) {
  // The most recent days (by date), so looking back through old lists can't
  // push out today's.
  const kept = [...copies].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // full or private mode: just don't keep a copy
  }
}

const waitingForSignIn = new Map<string, Omit<DayCopy, "savedAt" | "userId">>();
let signInPoll: ReturnType<typeof setInterval> | undefined;

/** Keeps what the rider sees of a day. Waits for sign-in to load (the copy must be tagged with the account). */
export function saveDayCopy(copy: Omit<DayCopy, "savedAt" | "userId">) {
  const userId = currentUser();
  if (userId === undefined) {
    waitingForSignIn.set(copy.date, copy);
    if (!signInPoll) {
      let tries = 0;
      signInPoll = setInterval(() => {
        tries += 1;
        if (currentUser() === undefined && tries < 120) return;
        clearInterval(signInPoll);
        signInPoll = undefined;
        const waiting = [...waitingForSignIn.values()];
        waitingForSignIn.clear();
        if (currentUser() !== undefined) for (const c of waiting) saveDayCopy(c);
      }, 500);
    }
    return;
  }
  const others = load().filter((d) => !(d.date === copy.date && d.userId === userId));
  store([{ ...copy, savedAt: Date.now(), userId }, ...others]);
}

export function readDayCopy(date: string): DayCopy | null {
  const userId = currentUser();
  if (userId === undefined) return null;
  return load().find((d) => d.date === date && d.userId === userId) ?? null;
}

/** The server confirmed a change: apply it to the copies it touches. */
export function patchDayCopies(item: OutboxItem) {
  const copies = load();
  if (copies.length === 0) return;
  const owner = item.userId ?? null;
  const [first, second] = item.args as [unknown, unknown];
  let changed = false;
  const next: DayCopy[] = [];
  for (const copy of copies) {
    if (copy.userId !== owner) {
      next.push(copy);
      continue;
    }
    let c = copy;
    const entries = applyDayChanges(c.entries, [item], c.date);
    if (entries !== c.entries) c = { ...c, entries };
    switch (item.name) {
      case "createHorse": {
        const h = item.meta as HorseLite | undefined;
        if (h && !c.horses.some((x) => x.id === h.id)) c = { ...c, horses: [...c.horses, h] };
        break;
      }
      case "updateHorse": {
        const h = first as { id: string; name: string; color: string };
        const name = h.name.trim();
        c = {
          ...c,
          horses: c.horses.map((x) => (x.id === h.id ? { ...x, name: name || x.name, color: h.color } : x)),
          entries: c.entries.map((e) =>
            e.horseId === h.id ? { ...e, horseName: name || e.horseName, horseColor: h.color } : e,
          ),
        };
        break;
      }
      case "setHorseArchived":
        if (second === true) c = { ...c, horses: c.horses.filter((x) => x.id !== first) };
        break;
      case "deleteHorse":
        c = { ...c, horses: c.horses.filter((x) => x.id !== first), entries: c.entries.filter((e) => e.horseId !== first) };
        break;
      case "updateActivityType": {
        const a = first as { id: string; name: string; color: string };
        c = {
          ...c,
          activities: c.activities.map((x) => (x.id === a.id ? { ...x, name: a.name.trim() || x.name, color: a.color } : x)),
        };
        break;
      }
      case "setActivityArchived":
        c = { ...c, activities: c.activities.map((x) => (x.id === first ? { ...x, archived: second as boolean } : x)) };
        break;
      case "copyDay":
        // The copied lines get their ids on the server: this copy no longer shows the day.
        if (c.date === second) {
          changed = true;
          continue;
        }
        break;
    }
    if (c !== copy) {
      changed = true;
      c = { ...c, savedAt: Date.now() };
    }
    next.push(c);
  }
  if (changed) store(next);
}

/** After signing out: nothing of this account stays on the phone. */
export function clearDayCopies() {
  waitingForSignIn.clear();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
