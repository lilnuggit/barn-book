"use client";

import { currentUser } from "./account";
import type { AppointmentLite, AppointmentTypeLite } from "./appointments";
import { applyAppointmentChanges, applyAppointmentTypeChanges } from "./appointment-changes";
import type { HorseLite } from "./data";
import { applyHorseChanges } from "./day-copy";
import type { OutboxItem } from "./sync";

/*
 * A copy of the Visits screen, kept on the phone (one per account), so the
 * tab opens with no signal: what she last saw (server data plus her changes),
 * with every change the server confirms since applied to it too, wherever
 * she made it. The same idea as day-copy.ts, for one screen.
 */

export type AppointmentsCopy = {
  locale: string;
  appointments: AppointmentLite[];
  types: AppointmentTypeLite[];
  /** Horses in work, including ones added on the phone (for the sheet and the due list). */
  horses: HorseLite[];
  /** The Done list's window: checked off since this day; where "Show older visits" goes back to; whether she asked. */
  doneSince?: string;
  nextSince?: string | null;
  extended?: boolean;
  /** When the screen's data was loaded from the server. */
  loadedAt: number;
  /** When this phone last had it (shown, or brought up to date). */
  savedAt: number;
  /** The account it belongs to (null without Clerk). */
  userId: string | null;
};

const KEY = "barnbook:visits:v1";

function load(): AppointmentsCopy | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as AppointmentsCopy | null;
    return v && Array.isArray(v.appointments) && Array.isArray(v.types) && Array.isArray(v.horses) ? v : null;
  } catch {
    return null;
  }
}

function store(copy: AppointmentsCopy) {
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
  } catch {
    // full or private mode: just don't keep a copy
  }
}

type VisitsView = Omit<AppointmentsCopy, "savedAt" | "userId">;

let waiting: VisitsView | null = null;
/** Changes confirmed while the view waits for sign-in, with the account each was saved to. */
let confirmedWhileWaiting: { item: OutboxItem; owner: string | null }[] = [];
let signInPoll: ReturnType<typeof setInterval> | undefined;

/** One confirmed change applied to the copy (or to the view waiting to be kept). */
function patchView<T extends VisitsView>(copy: T, item: OutboxItem): T {
  const appointments = applyAppointmentChanges(copy.appointments, [item]);
  const types = applyAppointmentTypeChanges(copy.types, [item]);
  let horses = applyHorseChanges(copy.horses, [item]);
  const added = item.name === "createHorse" ? (item.meta as HorseLite | undefined) : undefined;
  if (added && !horses.some((h) => h.id === added.id)) horses = [...horses, added];
  if (appointments === copy.appointments && types === copy.types && horses === copy.horses) return copy;
  return { ...copy, appointments, types, horses };
}

/** Keeps what she sees. Waits for sign-in to load (the copy must be tagged with the account). */
export function saveAppointmentsCopy(copy: Omit<AppointmentsCopy, "savedAt" | "userId">) {
  const userId = currentUser();
  if (userId === undefined) {
    waiting = copy;
    if (!signInPoll) {
      let tries = 0;
      signInPoll = setInterval(() => {
        tries += 1;
        if (currentUser() === undefined && tries < 120) return;
        clearInterval(signInPoll);
        signInPoll = undefined;
        const next = waiting;
        const changes = confirmedWhileWaiting;
        waiting = null;
        confirmedWhileWaiting = [];
        const me = currentUser();
        if (!next || me === undefined) return;
        // Changes confirmed (and patched into the stored copy) since it was captured.
        saveAppointmentsCopy(changes.filter((c) => c.owner === me).reduce((v, c) => patchView(v, c.item), next));
      }, 500);
    }
    return;
  }
  const kept = load();
  // A screen drawn from an older load (Next's cache) doesn't replace a copy loaded since.
  if (kept && kept.userId === userId && kept.loadedAt > copy.loadedAt) return;
  store({ ...copy, savedAt: Date.now(), userId });
}

export function readAppointmentsCopy(): AppointmentsCopy | null {
  const userId = currentUser();
  if (userId === undefined) return null;
  const copy = load();
  return copy && copy.userId === userId ? copy : null;
}

/** The server confirmed a change (saved to `owner`'s account): apply it to the copy. */
export function patchAppointmentsCopy(item: OutboxItem, owner: string | null = item.userId ?? null) {
  // The view waiting for sign-in was captured before this: it gets it too, before it's kept.
  if (waiting) confirmedWhileWaiting.push({ item, owner });
  const copy = load();
  if (!copy || copy.userId !== owner) return;
  const next = patchView(copy, item);
  if (next !== copy) store({ ...next, savedAt: Date.now() });
}

/** After signing out: nothing of this account stays on the phone. */
export function clearAppointmentsCopy() {
  waiting = null;
  confirmedWhileWaiting = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
