"use client";

import type { EntryStatus } from "@/db/schema";
import { currentUser } from "./account";
import type { AppointmentLite, AppointmentTypeLite } from "./appointments";
import { applyAppointmentChanges, applyAppointmentTypeChanges } from "./appointment-changes";
import type { ActivityLite, CopySuggestion, DayEntry, HorseLite } from "./data";
import { daysBetween, phoneToday } from "./dates";
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
  /** The day's visits and the types of visit (missing on copies kept by older versions: show no visits then). */
  appointments?: AppointmentLite[];
  appointmentTypes?: AppointmentTypeLite[];
  /** Other visits of the same types for the same horses (see aroundPairs): when each is next due, what's booked. */
  appointmentsAround?: AppointmentLite[];
  /** The "type|horse" pairs appointmentsAround was loaded for (a visit joining the day on the phone isn't covered). */
  aroundPairs?: string[];
  /**
   * When the list was loaded from the server. Changes made on this phone since
   * are in the copy too, but not ones made elsewhere. (Missing on copies kept
   * by older versions of the app.)
   */
  loadedAt?: number;
  /** When this phone last had this list (shown, or brought up to date). */
  savedAt: number;
  /** The account it belongs to (null without Clerk). */
  userId: string | null;
};

const KEY = "barnbook:days:v1";
const KEEP = 14;

/** The lines a change adds to a day, made on the phone (new lines, or a repeated list). */
export function addedLines(item: OutboxItem): DayEntry[] | undefined {
  if (item.name !== "addEntries" && item.name !== "copyDay") return undefined;
  const lines = (item.meta as { entries?: unknown } | undefined)?.entries;
  return Array.isArray(lines) ? (lines as DayEntry[]) : undefined;
}

/** Horses in work as changes made on the phone leave them: renamed, recoloured, archived, back in work, deleted. */
export function applyHorseChanges(horses: HorseLite[], changes: OutboxItem[]): HorseLite[] {
  let out = horses;
  for (const item of changes) {
    const [first, second] = item.args as [unknown, unknown];
    if (item.name === "updateHorse") {
      const h = first as { id: string; name: string; color: string };
      const name = h.name.trim();
      if (out.some((x) => x.id === h.id)) {
        out = out.map((x) => (x.id === h.id ? { ...x, name: name || x.name, color: h.color } : x));
      }
    } else if ((item.name === "setHorseArchived" && second === true) || item.name === "deleteHorse") {
      if (out.some((x) => x.id === first)) out = out.filter((x) => x.id !== first);
    } else if (item.name === "setHorseArchived" && second === false) {
      // Back in work: the change carries the horse (ones queued by older versions don't).
      const h = item.meta as HorseLite | undefined;
      if (h && h.id === first && typeof h.name === "string" && !out.some((x) => x.id === h.id)) {
        out = [...out, { id: h.id, name: h.name, color: h.color }];
      }
    }
  }
  return out;
}

/** Work types as changes made on the phone leave them: renamed, recoloured, archived. */
export function applyActivityChanges(activities: ActivityLite[], changes: OutboxItem[]): ActivityLite[] {
  let out = activities;
  for (const item of changes) {
    const [first, second] = item.args as [unknown, unknown];
    if (item.name === "updateActivityType") {
      const a = first as { id: string; name: string; color: string };
      if (out.some((x) => x.id === a.id)) {
        out = out.map((x) => (x.id === a.id ? { ...x, name: a.name.trim() || x.name, color: a.color } : x));
      }
    } else if (item.name === "setActivityArchived") {
      if (out.some((x) => x.id === first && x.archived !== second)) {
        out = out.map((x) => (x.id === first ? { ...x, archived: second as boolean } : x));
      }
    }
  }
  return out;
}

/** Layers changes (waiting on the phone, or just confirmed) over a day's entries. */
export function applyDayChanges(entries: DayEntry[], changes: OutboxItem[], date: string): DayEntry[] {
  let out = entries;
  for (const item of changes) {
    const [first, second] = item.args as [unknown, unknown];
    switch (item.name) {
      case "addEntries":
      case "copyDay": {
        const added = (addedLines(item) ?? []).filter((e) => e.date === date && !out.some((o) => o.id === e.id));
        if (added.length) out = [...out, ...added];
        break;
      }
      case "setEntryStatus": {
        const status = second as EntryStatus;
        // The time she finished it, as sent (the server keeps the same). A
        // change queued by an older version has none: it's sent with when it
        // was made, which counts unless the horse was already finished.
        const sentAt = (item.args as unknown[])[2];
        out = out.map((e) => {
          if (e.id !== first) return e;
          const completedAt =
            status === "planned"
              ? null
              : typeof sentAt === "number"
                ? sentAt
                : e.status !== "planned" && e.completedAt != null
                  ? e.completedAt
                  : item.createdAt;
          return { ...e, status, completedAt };
        });
        break;
      }
      case "saveEntryNote":
        out = out.map((e) => (e.id === first ? { ...e, note: second as string } : e));
        break;
      case "setEntryActivities":
        out = out.map((e) => (e.id === first ? { ...e, activityIds: second as string[] } : e));
        break;
      case "deleteEntry":
        out = out.filter((e) => e.id !== first);
        break;
      case "updateHorse": {
        const h = first as { id: string; name: string; color: string };
        const name = h.name.trim();
        if (out.some((e) => e.horseId === h.id)) {
          out = out.map((e) => (e.horseId === h.id ? { ...e, horseName: name || e.horseName, horseColor: h.color } : e));
        }
        break;
      }
      case "deleteHorse":
        if (out.some((e) => e.horseId === first)) out = out.filter((e) => e.horseId !== first);
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
  // The days nearest today, so looking far back or planning far ahead can't
  // push out today's (or tomorrow's).
  const today = phoneToday();
  const distance = (c: DayCopy) => Math.abs(daysBetween(today, c.date));
  const kept = [...copies]
    .sort((a, b) => distance(a) - distance(b) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // full or private mode: just don't keep a copy
  }
}

const waitingForSignIn = new Map<string, Omit<DayCopy, "savedAt" | "userId">>();
/** Changes confirmed while views wait for sign-in, with the account each was saved to. */
let confirmedWhileWaiting: { item: OutboxItem; owner: string | null }[] = [];
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
        const changes = confirmedWhileWaiting;
        waitingForSignIn.clear();
        confirmedWhileWaiting = [];
        const me = currentUser();
        if (me === undefined) return;
        for (const view of waiting) {
          // Changes confirmed (and patched into the stored copies) since it was captured.
          let v: Omit<DayCopy, "savedAt" | "userId"> | null = view;
          for (const ch of changes) if (v && ch.owner === me) v = patchDay(v, ch.item);
          if (v) saveDayCopy(v);
        }
      }, 500);
    }
    return;
  }
  const copies = load();
  const kept = copies.find((d) => d.date === copy.date && d.userId === userId);
  // A list shown from an older load (Next's cache) doesn't replace a copy
  // loaded since: that one has every change from this phone too.
  if (kept?.loadedAt !== undefined && copy.loadedAt !== undefined && kept.loadedAt > copy.loadedAt) return;
  const others = copies.filter((d) => d !== kept);
  store([{ ...copy, savedAt: Date.now(), userId }, ...others]);
}

export function readDayCopy(date: string): DayCopy | null {
  const userId = currentUser();
  if (userId === undefined) return null;
  return load().find((d) => d.date === date && d.userId === userId) ?? null;
}

type DayView = Omit<DayCopy, "savedAt" | "userId">;

/**
 * One confirmed change applied to a day's copy (or to a day's view waiting to
 * be kept). Null: the copy no longer shows the day as it is.
 */
function patchDay<T extends DayView>(copy: T, item: OutboxItem): T | null {
  const second = (item.args as unknown[])[1];
  let c = copy;
  const entries = applyDayChanges(c.entries, [item], c.date);
  if (entries !== c.entries) c = { ...c, entries };
  const horses = applyHorseChanges(c.horses, [item]);
  if (horses !== c.horses) c = { ...c, horses };
  const activities = applyActivityChanges(c.activities, [item]);
  if (activities !== c.activities) c = { ...c, activities };
  // Only copies that have them: one kept by an older version can't tell "no visits" from "not known".
  if (c.appointments) {
    const day = c.date;
    const shown = applyAppointmentChanges(c.appointments, [item], (a) => a.date === day);
    if (shown !== c.appointments) c = { ...c, appointments: shown };
  }
  if (c.appointmentTypes) {
    const types = applyAppointmentTypeChanges(c.appointmentTypes, [item]);
    if (types !== c.appointmentTypes) c = { ...c, appointmentTypes: types };
  }
  if (c.appointmentsAround) {
    // Kept up to date for every pair it was loaded for (even while none of the day's visits has it), and the day's own.
    const keep = keepPairs([...(c.aroundPairs ?? []), ...pairsOf(c.appointments ?? [])]);
    const around = applyAppointmentChanges(c.appointmentsAround, [item], keep);
    if (around !== c.appointmentsAround) c = { ...c, appointmentsAround: around };
  }
  switch (item.name) {
    case "createHorse": {
      const h = item.meta as HorseLite | undefined;
      if (h && !c.horses.some((x) => x.id === h.id)) c = { ...c, horses: [...c.horses, h] };
      break;
    }
    case "copyDay":
      // A repeat queued by an older version of the app, without its lines:
      // they get their ids on the server, so this copy no longer shows the day.
      if (c.date === second && !addedLines(item)) return null;
      break;
  }
  return c;
}

/** The server confirmed a change (saved to `owner`'s account): apply it to the copies it touches. */
export function patchDayCopies(item: OutboxItem, owner: string | null = item.userId ?? null) {
  // A day's view waiting for sign-in was captured before this: it gets it too, before it's kept.
  if (waitingForSignIn.size > 0) confirmedWhileWaiting.push({ item, owner });
  const copies = load();
  if (copies.length === 0) return;
  let changed = false;
  const next: DayCopy[] = [];
  for (const copy of copies) {
    if (copy.userId !== owner) {
      next.push(copy);
      continue;
    }
    const c = patchDay(copy, item);
    if (c === null) {
      changed = true;
      continue;
    }
    if (c !== copy) changed = true;
    next.push(c === copy ? copy : { ...c, savedAt: Date.now() });
  }
  if (changed) store(next);
}

/** After signing out: nothing of this account stays on the phone. */
export function clearDayCopies() {
  waitingForSignIn.clear();
  confirmedWhileWaiting = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Horses in work as changes on the phone leave them: added there, renamed, archived, deleted. A–Z. */
export function horsesWithChanges(horses: HorseLite[], changes: OutboxItem[]): HorseLite[] {
  const byId = new Map(horses.map((h) => [h.id, h]));
  for (const item of changes) {
    const h = item.name === "createHorse" ? (item.meta as HorseLite | undefined) : undefined;
    if (h && typeof h.id === "string" && !byId.has(h.id)) byId.set(h.id, h);
  }
  return applyHorseChanges([...byId.values()], changes).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** The "type|horse" pairs of some visits. */
export function pairsOf(visits: readonly AppointmentLite[]): string[] {
  return [...new Set(visits.flatMap((d) => d.horses.map((h) => `${d.typeId}|${h.id}`)))];
}

/** Visits of these "type|horse" pairs. */
export function keepPairs(pairs: Iterable<string>): (a: AppointmentLite) => boolean {
  const set = new Set(pairs);
  return (a) => a.horses.some((h) => set.has(`${a.typeId}|${h.id}`));
}
