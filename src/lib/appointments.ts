/*
 * Visits (appointments in code): shared types and pure rules. No "use client",
 * no "server-only": data.ts, actions.ts, the export route and client
 * components all import it. Days are "YYYY-MM-DD" barn days and times are
 * "HH:MM" wall-clock strings: never converted, never parsed with new Date().
 * "today" is always passed in (the phone's, from usePhoneToday).
 */
import type { HorseLite } from "./data";
import { addDays, agoLabel, dayHeading, daysBetween, formatMonthDay, formatShort } from "./dates";

export type Every = { count: number; unit: "week" | "month" };

export type AppointmentTypeLite = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  /** How often it comes round; null = no reminder. */
  every: Every | null;
};

export type AppointmentLite = {
  id: string;
  typeId: string;
  date: string;
  /** "HH:MM" (24 h), or null for any time that day. */
  time: string | null;
  /** By name; can include archived horses. Never empty. */
  horses: HorseLite[];
  note: string;
  done: boolean;
};

// ---------- reminders ----------

/** The Reminder picker's choices, in order (Settings). */
export const EVERY_CHOICES: Every[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16].map((count) => ({ count, unit: "week" as const })),
  ...[1, 2, 3, 4, 6, 9, 12, 18, 24, 36].map((count) => ({ count, unit: "month" as const })),
];

/** What the server accepts (wider than the picker, so the picker can grow without a migration). */
export function isEvery(value: unknown): value is Every {
  const e = value as Every;
  if (!e || typeof e !== "object" || !Number.isInteger(e.count)) return false;
  if (e.unit === "week") return e.count >= 1 && e.count <= 52;
  if (e.unit === "month") return e.count >= 1 && e.count <= 36;
  return false;
}

/** "No reminder", "Every week", "Every 6 weeks", "Every month", "Every 3 months", "Every year", "Every 2 years". */
export function everyLabel(every: Every | null): string {
  if (!every) return "No reminder";
  const { count, unit } = every;
  if (unit === "month" && count % 12 === 0) return count === 12 ? "Every year" : `Every ${count / 12} years`;
  return count === 1 ? `Every ${unit}` : `Every ${count} ${unit}s`;
}

/** "a week", "6 weeks", "a month", "18 months", "a year", "2 years" (for "6 weeks after the last visit"). */
export function everyAfterLabel(every: Every): string {
  const { count, unit } = every;
  if (unit === "month" && count % 12 === 0) return count === 12 ? "a year" : `${count / 12} years`;
  return count === 1 ? `a ${unit}` : `${count} ${unit}s`;
}

/** <option> values: "" (none), "w6", "m12". */
export function everyValue(every: Every | null): string {
  return every ? `${every.unit === "week" ? "w" : "m"}${every.count}` : "";
}

export function parseEveryValue(value: string): Every | null {
  const m = /^([wm])(\d{1,2})$/.exec(value);
  if (!m) return null;
  const every: Every = { count: Number(m[2]), unit: m[1] === "w" ? "week" : "month" };
  return isEvery(every) ? every : null;
}

/** The day `every` after `iso`. Months keep the day of the month, or the month's last day if shorter (as Postgres does). */
export function addEvery(iso: string, every: Every): string {
  if (every.unit === "week") return addDays(iso, every.count * 7);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + every.count;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/** Days before the due date that count as "due": two weeks, or half the gap if that's shorter (weekly PEMF isn't always due). */
export function soonWindow(last: string, due: string): number {
  return Math.min(14, Math.floor(daysBetween(last, due) / 2));
}

// ---------- order ----------

/** Untimed first (like all-day events), then by time. */
function timeOrder(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

/** By day, untimed first, then time, then the types' order in Settings, then id. Done never moves a visit. */
export function appointmentOrder(types: AppointmentTypeLite[]) {
  const rank = new Map(types.map((t, i) => [t.id, i]));
  return (a: AppointmentLite, b: AppointmentLite) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    timeOrder(a.time, b.time) ||
    (rank.get(a.typeId) ?? 1e9) - (rank.get(b.typeId) ?? 1e9) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const isLater = (a: AppointmentLite, b: AppointmentLite) =>
  a.date !== b.date ? a.date > b.date : timeOrder(a.time, b.time) > 0;

// ---------- one horse and one type ----------

/**
 * - booked: something not done is dated today or later (she has acted);
 * - unticked: a past visit after the last one wasn't checked off (did it happen?);
 * - never: no visit checked off yet, so nothing to count from (not nagged);
 * - overdue / due / ok: from the last visit plus the reminder.
 * null: no reminder, or the type or the horse is archived.
 */
export type DueState = "booked" | "unticked" | "never" | "overdue" | "due" | "ok";

export type PairVisits = {
  /** The latest visit checked off. */
  last: AppointmentLite | null;
  /** The earliest not done, dated today or later. */
  next: AppointmentLite | null;
  /** The latest not done, dated before today and after `last`'s day. */
  unticked: AppointmentLite | null;
  /** last + reminder (null without either). */
  due: string | null;
  /** today → due, negative when overdue. */
  daysLeft: number | null;
  state: DueState | null;
};

/** `list`: that type's visits that include that horse. */
export function pairVisits(
  list: AppointmentLite[],
  type: AppointmentTypeLite,
  today: string,
  horseArchived = false,
): PairVisits {
  let last: AppointmentLite | null = null;
  let next: AppointmentLite | null = null;
  let unticked: AppointmentLite | null = null;
  for (const a of list) {
    if (a.done) {
      if (!last || isLater(a, last)) last = a;
    } else if (a.date >= today) {
      if (!next || isLater(next, a)) next = a;
    } else if (!unticked || isLater(a, unticked)) {
      unticked = a;
    }
  }
  if (unticked && last && unticked.date <= last.date) unticked = null;
  const every = type.archived || horseArchived ? null : type.every;
  const due = every && last ? addEvery(last.date, every) : null;
  const daysLeft = due === null ? null : daysBetween(today, due);
  let state: DueState | null;
  if (!every) state = null;
  else if (next) state = "booked";
  else if (unticked) state = "unticked";
  else if (!last || due === null || daysLeft === null) state = "never";
  else if (daysLeft < 0) state = "overdue";
  else if (daysLeft <= soonWindow(last.date, due)) state = "due";
  else state = "ok";
  return { last, next, unticked, due, daysLeft, state };
}

function byPair(appointments: AppointmentLite[]) {
  const map = new Map<string, AppointmentLite[]>();
  for (const a of appointments) {
    for (const h of a.horses) {
      const key = `${h.id}|${a.typeId}`;
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
  }
  return map;
}

// ---------- the Visits screen ----------

export type DueRow = { horse: HorseLite; due: string; daysLeft: number; state: "overdue" | "due" };

export type VisitsBoard = {
  /** Past, not checked off: newest first. */
  toCheck: AppointmentLite[];
  /** Per type with a reminder (Settings order): horses in work overdue or due, most overdue first. */
  due: { type: AppointmentTypeLite; rows: DueRow[] }[];
  dueCount: number;
  /** Per type with a reminder: horses in work with no visit checked off yet. */
  notCounted: { type: AppointmentTypeLite; horses: HorseLite[] }[];
  /** Some active type has a reminder. */
  remindersSet: boolean;
  /** Some horse in work has a visit of a type with a reminder (booked, to check off, or checked off): not day one. */
  anyTracked: boolean;
  /** Today and later, done or not, in day order. */
  comingUp: AppointmentLite[];
  /** Before today and checked off: newest first. */
  done: AppointmentLite[];
};

/** `types` and `horses` (in work) as shown, with changes on the phone already applied. */
export function visitsBoard(
  data: { appointments: AppointmentLite[]; types: AppointmentTypeLite[]; horses: HorseLite[] },
  today: string,
): VisitsBoard {
  const order = appointmentOrder(data.types);
  const sorted = [...data.appointments].sort(order);
  const newestFirst = (list: AppointmentLite[]) =>
    [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : order(a, b)));
  const horses = [...data.horses].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const pairs = byPair(data.appointments);
  const due: VisitsBoard["due"] = [];
  const notCounted: VisitsBoard["notCounted"] = [];
  let remindersSet = false;
  let anyTracked = false;
  for (const type of data.types) {
    if (type.archived || !type.every) continue;
    remindersSet = true;
    const rows: DueRow[] = [];
    const never: HorseLite[] = [];
    for (const horse of horses) {
      const p = pairVisits(pairs.get(`${horse.id}|${type.id}`) ?? [], type, today);
      if (p.state === "never") never.push(horse);
      else anyTracked = true;
      if ((p.state === "overdue" || p.state === "due") && p.due !== null && p.daysLeft !== null) {
        rows.push({ horse, due: p.due, daysLeft: p.daysLeft, state: p.state });
      }
    }
    rows.sort((a, b) => a.daysLeft - b.daysLeft); // stable: names stay A–Z within a day
    if (rows.length) due.push({ type, rows });
    if (never.length) notCounted.push({ type, horses: never });
  }
  return {
    toCheck: newestFirst(sorted.filter((a) => !a.done && a.date < today)),
    due,
    dueCount: due.reduce((n, g) => n + g.rows.length, 0),
    notCounted,
    remindersSet,
    anyTracked,
    comingUp: sorted.filter((a) => a.date >= today),
    done: newestFirst(sorted.filter((a) => a.done && a.date < today)),
  };
}

// ---------- a horse's page ----------

export type HorseVisitRow = PairVisits & { type: AppointmentTypeLite };

/** One row per type this horse has any visit of (archived types included), in Settings order; plus active types with none. */
export function horseVisitRows(
  appointments: AppointmentLite[],
  types: AppointmentTypeLite[],
  horse: { id: string; archived: boolean },
  today: string,
): { rows: HorseVisitRow[]; none: AppointmentTypeLite[] } {
  const pairs = byPair(appointments);
  const rows: HorseVisitRow[] = [];
  const none: AppointmentTypeLite[] = [];
  for (const type of types) {
    const list = pairs.get(`${horse.id}|${type.id}`) ?? [];
    if (list.length) rows.push({ type, ...pairVisits(list, type, today, horse.archived) });
    else if (!type.archived) none.push(type);
  }
  return { rows, none };
}

// ---------- words ----------

/** "Dec 30", or "Dec 30, 2027" in another year. */
export function monthDay(iso: string, today: string, locale: string): string {
  if (iso.slice(0, 4) === today.slice(0, 4)) return formatMonthDay(iso, locale);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** "today", "tomorrow", "yesterday", "Tue, Nov 18" (with the year in another year): mid-sentence. */
export function dayPhrase(iso: string, today: string, locale: string): string {
  const d = daysBetween(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return dayHeading(iso, today, locale);
}

/** "9:30 AM" / "09:30" by locale. Wall-clock: pinned to UTC so it never shifts. */
export function formatTime(hhmm: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(`1970-01-01T${hhmm}:00Z`),
  );
}

/** A row's "when": "Tue, Nov 18 · 9:30 AM" (with the day) or "9:30 AM" (Today's card; "" when untimed). */
export function whenLabel(a: AppointmentLite, today: string, locale: string, withDay: boolean): string {
  const time = a.time ? formatTime(a.time, locale) : "";
  if (!withDay) return time;
  const day = dayHeading(a.date, today, locale);
  return time ? `${day} · ${time}` : day;
}

export type Tone = "danger" | "strong" | "quiet";

/** Overdue: "1 day overdue" … "13 days overdue", "2 weeks overdue" … "8 weeks overdue", "Overdue since Sep 2". Due: "Due today", "Due tomorrow", "Due in 5 days", "Due Dec 30". */
export function dueLabel(due: string, today: string, locale: string): { text: string; tone: Tone } {
  const d = daysBetween(today, due);
  if (d < 0) {
    const late = -d;
    if (late === 1) return { text: "1 day overdue", tone: "danger" };
    if (late < 14) return { text: `${late} days overdue`, tone: "danger" };
    if (late < 60) return { text: `${Math.floor(late / 7)} weeks overdue`, tone: "danger" };
    return { text: `Overdue since ${monthDay(due, today, locale)}`, tone: "danger" };
  }
  if (d === 0) return { text: "Due today", tone: "strong" };
  if (d === 1) return { text: "Due tomorrow", tone: "quiet" };
  if (d < 14) return { text: `Due in ${d} days`, tone: "quiet" };
  return { text: `Due ${monthDay(due, today, locale)}`, tone: "quiet" };
}

/** A horse page row: what's next, and the last visit. */
export function horseRowLines(row: HorseVisitRow, today: string, locale: string): { top: string; tone: Tone; bottom: string } {
  const bottom = row.last ? `Last visit ${agoLabel(row.last.date, today, locale)}` : "No visit checked off yet";
  if (row.next) {
    const time = row.next.time ? ` · ${formatTime(row.next.time, locale)}` : "";
    return { top: `Booked for ${dayPhrase(row.next.date, today, locale)}${time}`, tone: "quiet", bottom };
  }
  if (row.unticked) {
    return { top: `Not checked off · ${dayHeading(row.unticked.date, today, locale)}`, tone: "quiet", bottom };
  }
  if (row.due !== null && row.state !== null && row.state !== "never") {
    const label = dueLabel(row.due, today, locale);
    return { top: label.text, tone: label.tone === "danger" ? "danger" : "quiet", bottom };
  }
  return { top: "Nothing booked", tone: "quiet", bottom };
}

/** "Farrier visit"; a type already called "… visit" isn't doubled. */
export function visitName(typeName: string): string {
  return /\bvisit$/i.test(typeName.trim()) ? typeName.trim() : `${typeName.trim()} visit`;
}

/** "Bella, Max, Pip +2" */
export function shortHorseList(horses: HorseLite[], max = 3): string {
  const names = horses.map((h) => h.name);
  return names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max}` : names.join(", ");
}

/** "Bella, Max and Pip" (screen readers, confirms). */
export function spokenHorseList(horses: HorseLite[], locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(horses.map((h) => h.name));
}

/** Names a visit in a message shown later (meta.label): "Farrier visit on Tue, Nov 18". */
export function appointmentLabel(a: { typeId: string; date: string }, types: AppointmentTypeLite[], locale: string): string {
  const type = types.find((t) => t.id === a.typeId);
  return `${type ? visitName(type.name) : "Visit"} on ${formatShort(a.date, locale)}`;
}

/** When the next one is due after this visit (null without a reminder, or for an archived type). */
export function nextDueAfter(a: AppointmentLite, type: AppointmentTypeLite | undefined): string | null {
  return type && !type.archived && type.every ? addEvery(a.date, type.every) : null;
}

export type AfterVisit = {
  /** This visit + the reminder (null without one, or for an archived type). */
  due: string | null;
  /** Its horses in work for which this is the last visit of the type, with nothing booked (or to check off) since. */
  bookFor: HorseLite[];
  /** The earliest visit of the type after this one, not checked off, for one of its horses. */
  booked: AppointmentLite | null;
  /** For some horse in work on it, no later visit of the type is checked off: due dates count from this one. */
  isLast: boolean;
  /** Its horses in work whose other visits aren't all known (left out of the rest). */
  unknown: HorseLite[];
};

/**
 * What comes after a visit, for its horses in work, from the visits known
 * around it, by the same rules as Due (pairVisits): whether it's the visit due
 * dates count from, and whether the next one is booked already (or happened
 * and wasn't checked off: a visit not done, dated after it or today or later).
 * `known`: the horses whose visits of the type are all in `around` (Today
 * only has some); the others are left out, rather than offered a booking that
 * may already exist.
 */
export function afterVisit(
  visit: AppointmentLite,
  type: AppointmentTypeLite | undefined,
  around: readonly AppointmentLite[],
  inWork: ReadonlySet<string>,
  today: string,
  known: (horseId: string) => boolean = () => true,
): AfterVisit {
  const others = around.filter((a) => a.id !== visit.id && a.typeId === visit.typeId);
  const bookFor: HorseLite[] = [];
  const unknown: HorseLite[] = [];
  let booked: AppointmentLite | null = null;
  let isLast = false;
  for (const h of visit.horses) {
    if (!inWork.has(h.id)) continue;
    if (!known(h.id)) {
      unknown.push(h);
      continue;
    }
    const his = others.filter((a) => a.horses.some((x) => x.id === h.id));
    if (his.some((a) => a.done && isLater(a, visit))) continue; // a later one is checked off: count from that
    isLast = true;
    const pending = his.filter((a) => !a.done && (a.date > visit.date || a.date >= today));
    for (const a of pending) if (!booked || isLater(booked, a)) booked = a;
    if (pending.length === 0) bookFor.push(h);
  }
  return { due: nextDueAfter(visit, type), bookFor, booked, isLast, unknown };
}

/** A visit's horses in the order they're shown: by name for the phone's language, then id (the same everywhere). */
export function sortHorses(horses: readonly HorseLite[], locale: string): HorseLite[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return [...horses].sort((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
