import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activityTypes,
  appointmentHorses,
  appointments,
  appointmentTypes,
  entries,
  horses,
  type EntryStatus,
} from "@/db/schema";
import type { AppointmentLite, AppointmentTypeLite } from "./appointments";
import { addDays, lastDayOfMonth } from "./dates";
import { DEFAULT_ACTIVITIES, DEFAULT_APPOINTMENT_TYPES } from "./palette";
import { likePattern } from "./validate";

export type ActivityLite = { id: string; name: string; color: string; archived: boolean };
export type HorseLite = { id: string; name: string; color: string };
export type DayEntry = {
  id: string;
  date: string;
  horseId: string;
  horseName: string;
  horseColor: string;
  status: EntryStatus;
  activityIds: string[];
  note: string;
  /**
   * When it was checked off or skipped (ms), for the order on the day's list:
   * finished horses go to the bottom, the latest last. Only on the day's list.
   */
  completedAt?: number | null;
};

const entryWithHorse = {
  id: entries.id,
  date: entries.date,
  horseId: entries.horseId,
  horseName: horses.name,
  horseColor: horses.color,
  status: entries.status,
  activityIds: entries.activityIds,
  note: entries.note,
};

// ---------- activity types ----------

export async function getActivityTypes(userId: string): Promise<ActivityLite[]> {
  let rows = await db
    .select()
    .from(activityTypes)
    .where(eq(activityTypes.userId, userId))
    .orderBy(asc(activityTypes.sortOrder), asc(activityTypes.name));

  if (rows.length === 0) {
    await db
      .insert(activityTypes)
      .values(DEFAULT_ACTIVITIES.map((a, i) => ({ userId, name: a.name, color: a.color, sortOrder: i })))
      .onConflictDoNothing();
    rows = await db
      .select()
      .from(activityTypes)
      .where(eq(activityTypes.userId, userId))
      .orderBy(asc(activityTypes.sortOrder), asc(activityTypes.name));
  }

  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, archived: r.archivedAt !== null }));
}

// ---------- horses ----------

export async function getActiveHorses(userId: string): Promise<HorseLite[]> {
  return db
    .select({ id: horses.id, name: horses.name, color: horses.color })
    .from(horses)
    .where(and(eq(horses.userId, userId), isNull(horses.archivedAt)))
    .orderBy(sql`lower(${horses.name})`);
}

export type HorseSummary = HorseLite & {
  archived: boolean;
  week: number;
  month: number;
  lastDate: string | null;
  lastActivityIds: string[];
};

export async function getHorseSummaries(userId: string, today: string): Promise<HorseSummary[]> {
  const { rows } = await db.execute<{
    id: string;
    name: string;
    color: string;
    archived: boolean;
    week: number;
    month: number;
    last_date: string | null;
    last_activity_ids: string[] | null;
  }>(sql`
    SELECT h.id, h.name, h.color, (h.archived_at IS NOT NULL) AS archived,
      count(e.id) FILTER (WHERE e.status = 'done' AND e.date > ${addDays(today, -7)} AND e.date <= ${today})::int AS week,
      count(e.id) FILTER (WHERE e.status = 'done' AND e.date > ${addDays(today, -30)} AND e.date <= ${today})::int AS month,
      last.date::text AS last_date,
      last.activity_ids AS last_activity_ids
    FROM ${horses} h
    LEFT JOIN ${entries} e ON e.horse_id = h.id
    LEFT JOIN LATERAL (
      SELECT l.date, l.activity_ids FROM ${entries} l
      WHERE l.horse_id = h.id AND l.status = 'done' AND l.date <= ${today}
      ORDER BY l.date DESC, l.sort_order DESC LIMIT 1
    ) last ON true
    WHERE h.user_id = ${userId}
    GROUP BY h.id, last.date, last.activity_ids
    ORDER BY lower(h.name)
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    archived: r.archived,
    week: r.week,
    month: r.month,
    lastDate: r.last_date,
    lastActivityIds: r.last_activity_ids ?? [],
  }));
}

export async function getHorse(userId: string, horseId: string) {
  const [horse] = await db
    .select()
    .from(horses)
    .where(and(eq(horses.id, horseId), eq(horses.userId, userId)));
  return horse ?? null;
}

export type HorseStats = {
  week: number;
  month: number;
  total: number;
  activities: { activityId: string; lastDate: string; month: number; total: number }[];
  recentDays: { date: string; activityIds: string[] }[];
};

export async function getHorseStats(userId: string, horseId: string, today: string): Promise<HorseStats> {
  const since = addDays(today, -41);
  const [totals, perActivity, recent] = await Promise.all([
    db.execute<{ week: number; month: number; total: number }>(sql`
      SELECT
        count(*) FILTER (WHERE date > ${addDays(today, -7)} AND date <= ${today})::int AS week,
        count(*) FILTER (WHERE date > ${addDays(today, -30)} AND date <= ${today})::int AS month,
        count(*)::int AS total
      FROM ${entries}
      WHERE horse_id = ${horseId} AND user_id = ${userId} AND status = 'done'
    `),
    db.execute<{ activity_id: string; last_date: string; month: number; total: number }>(sql`
      SELECT a.aid AS activity_id, max(e.date)::text AS last_date,
        count(*) FILTER (WHERE e.date > ${addDays(today, -30)} AND e.date <= ${today})::int AS month,
        count(*)::int AS total
      FROM ${entries} e, unnest(e.activity_ids) AS a(aid)
      WHERE e.horse_id = ${horseId} AND e.user_id = ${userId} AND e.status = 'done' AND e.date <= ${today}
      GROUP BY a.aid
      ORDER BY max(e.date) DESC
    `),
    db
      .select({ date: entries.date, activityIds: entries.activityIds })
      .from(entries)
      .where(
        and(
          eq(entries.horseId, horseId),
          eq(entries.userId, userId),
          eq(entries.status, "done"),
          gte(entries.date, since),
          lte(entries.date, today),
        ),
      )
      .orderBy(asc(entries.date), asc(entries.sortOrder)),
  ]);

  const t = totals.rows[0] ?? { week: 0, month: 0, total: 0 };
  return {
    week: t.week,
    month: t.month,
    total: t.total,
    activities: perActivity.rows.map((r) => ({
      activityId: r.activity_id,
      lastDate: r.last_date,
      month: r.month,
      total: r.total,
    })),
    recentDays: recent,
  };
}

export async function countHorseEntries(userId: string, horseId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.horseId, horseId)));
  return row?.n ?? 0;
}

export async function getHorseHistory(userId: string, horseId: string, limit: number) {
  const rows = await db
    .select(entryWithHorse)
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.horseId, horseId), eq(entries.userId, userId)))
    .orderBy(desc(entries.date), desc(entries.sortOrder))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// ---------- days ----------

export async function getDayEntries(userId: string, date: string): Promise<DayEntry[]> {
  const rows = await db
    .select({ ...entryWithHorse, completedAt: entries.completedAt })
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.userId, userId), eq(entries.date, date)))
    .orderBy(asc(entries.sortOrder), asc(entries.createdAt));
  return rows.map((r) => ({ ...r, completedAt: r.completedAt?.getTime() ?? null }));
}

/** A line of a past day's list, as "Repeat list" would copy it. */
export type CopyLine = { horseId: string; horseName: string; horseColor: string; activityIds: string[] };

export type CopySuggestion = {
  date: string;
  count: number;
  horseNames: string[];
  /** The lines to copy, so the phone can show the repeated list at once (missing in copies kept by older versions). */
  lines?: CopyLine[];
};

/** Past days that could be repeated onto an empty day: the last day with a list, and a week ago. */
export async function getCopySuggestions(userId: string, date: string): Promise<CopySuggestion[]> {
  const [latest] = await db
    .select({ date: entries.date })
    .from(entries)
    .where(and(eq(entries.userId, userId), lt(entries.date, date)))
    .orderBy(desc(entries.date))
    .limit(1);

  const candidates = [...new Set([latest?.date, addDays(date, -7)].filter(Boolean) as string[])];
  if (candidates.length === 0) return [];

  const rows = await db
    .select({
      date: entries.date,
      horseId: entries.horseId,
      horseName: horses.name,
      horseColor: horses.color,
      activityIds: entries.activityIds,
    })
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.userId, userId), inArray(entries.date, candidates), isNull(horses.archivedAt)))
    .orderBy(asc(entries.sortOrder), asc(entries.createdAt));

  return candidates
    .map((d) => {
      const lines = rows
        .filter((r) => r.date === d)
        .map(({ horseId, horseName, horseColor, activityIds }) => ({ horseId, horseName, horseColor, activityIds }));
      return {
        date: d,
        count: lines.length,
        horseNames: [...new Set(lines.map((l) => l.horseName))],
        lines,
      };
    })
    .filter((s) => s.count > 0);
}

// ---------- history ----------

export type DayCount = { date: string; done: number; total: number };

export async function getMonthCounts(userId: string, month: string): Promise<DayCount[]> {
  return db
    .select({
      date: entries.date,
      done: sql<number>`count(*) FILTER (WHERE ${entries.status} = 'done')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.date, `${month}-01`),
        lte(entries.date, lastDayOfMonth(month)),
      ),
    )
    .groupBy(entries.date);
}

export async function getMonthLog(userId: string, month: string, today: string): Promise<DayEntry[]> {
  const end = lastDayOfMonth(month) < today ? lastDayOfMonth(month) : today;
  return db
    .select(entryWithHorse)
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.userId, userId), gte(entries.date, `${month}-01`), lte(entries.date, end)))
    .orderBy(desc(entries.date), asc(entries.sortOrder), asc(entries.createdAt));
}

/** Matches notes, horse names, and activity names. */
export async function searchEntries(userId: string, query: string): Promise<DayEntry[]> {
  const pattern = likePattern(query);
  const matchingActivities = db
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(and(eq(activityTypes.userId, userId), sql`${activityTypes.name} ILIKE ${pattern}`));

  return db
    .select(entryWithHorse)
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(
      and(
        eq(entries.userId, userId),
        sql`(
          ${entries.note} ILIKE ${pattern}
          OR ${horses.name} ILIKE ${pattern}
          OR ${entries.activityIds} && ARRAY(${matchingActivities})
        )`,
      ),
    )
    .orderBy(desc(entries.date), asc(entries.sortOrder))
    .limit(100);
}

export async function countEntries(userId: string) {
  const [row] = await db.select({ n: count() }).from(entries).where(eq(entries.userId, userId));
  return row?.n ?? 0;
}

export async function getAllEntriesForExport(userId: string) {
  return db
    .select({
      date: entries.date,
      horse: horses.name,
      status: entries.status,
      activityIds: entries.activityIds,
      note: entries.note,
    })
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(eq(entries.userId, userId))
    .orderBy(desc(entries.date), asc(entries.sortOrder));
}

export async function getHorsesForExport(userId: string) {
  return db
    .select({ name: horses.name, color: horses.color, archivedAt: horses.archivedAt, notes: horses.notes })
    .from(horses)
    .where(eq(horses.userId, userId))
    .orderBy(sql`lower(${horses.name})`);
}

// ---------- visits (appointments) ----------

/** Checked-off visits older than this are left out of the book, except each horse's latest two of each type. */
const DONE_DAYS = 365;

/** The same id for a starting type on every first load, so two first loads at once can't add the list twice. */
function startingTypeId(userId: string, name: string) {
  const h = createHash("md5").update(`${userId}:appointment-type:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const selectAppointmentTypes = (userId: string) =>
  db
    .select()
    .from(appointmentTypes)
    .where(eq(appointmentTypes.userId, userId))
    .orderBy(asc(appointmentTypes.sortOrder), asc(appointmentTypes.name));

/** Types of visit in Settings order, archived ones included. The starting list is added on the first read. */
export async function getAppointmentTypes(userId: string): Promise<AppointmentTypeLite[]> {
  let rows = await selectAppointmentTypes(userId);
  if (rows.length === 0) {
    await db
      .insert(appointmentTypes)
      .values(
        DEFAULT_APPOINTMENT_TYPES.map((t, i) => ({
          id: startingTypeId(userId, t.name),
          userId,
          name: t.name,
          color: t.color,
          intervalCount: t.every?.count ?? null,
          intervalUnit: t.every?.unit ?? null,
          sortOrder: i,
        })),
      )
      .onConflictDoNothing();
    rows = await selectAppointmentTypes(userId);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    archived: r.archivedAt !== null,
    every:
      r.intervalCount !== null && r.intervalUnit !== null ? { count: r.intervalCount, unit: r.intervalUnit } : null,
  }));
}

async function selectAppointments(userId: string, where: SQL): Promise<AppointmentLite[]> {
  const { rows } = await db.execute<{
    id: string;
    type_id: string;
    date: string;
    time: string | null;
    note: string;
    done: boolean;
    horses: HorseLite[];
  }>(sql`
    SELECT a.id, a.type_id, a.date::text AS date, a.time, a.note, a.done,
      json_agg(json_build_object('id', h.id, 'name', h.name, 'color', h.color) ORDER BY lower(h.name), h.id) AS horses
    FROM ${appointments} a
    JOIN ${appointmentTypes} t ON t.id = a.type_id
    JOIN ${appointmentHorses} ah ON ah.appointment_id = a.id
    JOIN ${horses} h ON h.id = ah.horse_id
    WHERE a.user_id = ${userId} AND (${where})
    GROUP BY a.id, t.sort_order
    ORDER BY a.date, a.time ASC NULLS FIRST, t.sort_order, a.created_at
  `);
  return rows.map((r) => ({
    id: r.id,
    typeId: r.type_id,
    date: r.date,
    time: r.time,
    horses: r.horses,
    note: r.note,
    done: r.done,
  }));
}

/** A day's visits (Today's card). */
export function getDayAppointments(userId: string, date: string) {
  return selectAppointments(userId, sql`a.date = ${date}`);
}

/**
 * The book: every visit not checked off (any date), the checked-off ones
 * since `doneSince`, and each horse's latest two of each type however old
 * (the due dates count from the latest; the one before is there if the
 * latest is unticked offline).
 */
function bookWhere(userId: string, doneSince: string) {
  return sql`(
    NOT a.done
    OR a.date >= ${doneSince}
    OR a.id IN (
      SELECT ranked.id FROM (
        SELECT x.id, row_number() OVER (
          PARTITION BY xh.horse_id, x.type_id ORDER BY x.date DESC, x.time DESC NULLS LAST, x.created_at DESC
        ) AS n
        FROM ${appointments} x JOIN ${appointmentHorses} xh ON xh.appointment_id = x.id
        WHERE x.user_id = ${userId} AND x.done
      ) ranked WHERE ranked.n <= 2
    )
  )`;
}

/** What the Visits screen and a horse's page work everything out from (see bookWhere): checked off from the last year, or since `doneSince`. */
export function getAppointmentBook(
  userId: string,
  today: string,
  { horseId, doneSince = addDays(today, -DONE_DAYS) }: { horseId?: string; doneSince?: string } = {},
) {
  const forHorse = horseId
    ? sql` AND a.id IN (SELECT appointment_id FROM ${appointmentHorses} WHERE horse_id = ${horseId})`
    : sql``;
  return selectAppointments(userId, sql`${bookWhere(userId, doneSince)}${forHorse}`);
}

/** Older checked-off visits are added this many at a time ("Show older visits"). */
const OLDER_PAGE = 30;

/**
 * The Visits screen's Done list: every checked-off visit since `since`, a
 * year back, or an earlier day she has asked for (`from`, from "Show older
 * visits": a day, so the list doesn't shift when a visit is added or checked
 * off). `nextSince`: where the next "Show older visits" goes back to (the
 * next 30 older ones, or all of them when fewer are left), or null when there
 * are none.
 */
export async function getDoneWindow(userId: string, today: string, from?: string) {
  const yearAgo = addDays(today, -DONE_DAYS);
  const since = from && from < yearAgo ? (from < "2000-01-01" ? "2000-01-01" : from) : yearAgo;
  const { rows } = await db.execute<{ nth: string | null; oldest: string | null }>(sql`
    WITH older AS (
      SELECT a.date FROM ${appointments} a
      WHERE a.user_id = ${userId} AND a.done AND a.date < ${since}
        AND EXISTS (SELECT 1 FROM ${appointmentHorses} ah WHERE ah.appointment_id = a.id)
    )
    SELECT
      (SELECT date::text FROM older ORDER BY date DESC OFFSET ${OLDER_PAGE - 1} LIMIT 1) AS nth,
      (SELECT min(date)::text FROM older) AS oldest
  `);
  const r = rows[0];
  // Fewer than a page left: all the way back (so a visit logged later from even further back shows too).
  return { since, extended: since < yearAgo, nextSince: r?.nth ?? (r?.oldest ? "2000-01-01" : null) };
}

/**
 * For a day's visits, the others of the same types for the same horses (from
 * the book): what Today needs to say when each horse is next due, and whether
 * the next one is booked already.
 */
export function getAppointmentsAround(userId: string, today: string, date: string) {
  return selectAppointments(
    userId,
    sql`${bookWhere(userId, addDays(today, -DONE_DAYS))} AND EXISTS (
      SELECT 1 FROM ${appointmentHorses} x
      JOIN ${appointmentHorses} dh ON dh.horse_id = x.horse_id
      JOIN ${appointments} d ON d.id = dh.appointment_id
      WHERE x.appointment_id = a.id AND d.user_id = ${userId} AND d.date = ${date} AND d.type_id = a.type_id
    )`,
  );
}

/** Visits for this horse alone: deleting the horse deletes them (shared ones keep the other horses). */
export async function countHorseOnlyAppointments(userId: string, horseId: string) {
  const { rows } = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${appointments} a
    WHERE a.user_id = ${userId}
      AND EXISTS (SELECT 1 FROM ${appointmentHorses} ah WHERE ah.appointment_id = a.id AND ah.horse_id = ${horseId})
      AND NOT EXISTS (SELECT 1 FROM ${appointmentHorses} o WHERE o.appointment_id = a.id AND o.horse_id <> ${horseId})
  `);
  return rows[0]?.n ?? 0;
}

/** Visits with a horse (as the screens and the CSV show them). */
export async function countAppointments(userId: string) {
  const { rows } = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${appointments} a
    WHERE a.user_id = ${userId}
      AND EXISTS (SELECT 1 FROM ${appointmentHorses} ah WHERE ah.appointment_id = a.id)
  `);
  return rows[0]?.n ?? 0;
}

export async function getAppointmentsForExport(userId: string) {
  const { rows } = await db.execute<{
    date: string;
    time: string | null;
    type: string;
    done: boolean;
    note: string;
    horses: string;
  }>(sql`
    SELECT a.date::text AS date, a.time, t.name AS type, a.done, a.note,
      string_agg(h.name, '; ' ORDER BY lower(h.name)) AS horses
    FROM ${appointments} a
    JOIN ${appointmentTypes} t ON t.id = a.type_id
    JOIN ${appointmentHorses} ah ON ah.appointment_id = a.id
    JOIN ${horses} h ON h.id = ah.horse_id
    WHERE a.user_id = ${userId}
    GROUP BY a.id, t.name
    ORDER BY a.date DESC, a.time ASC NULLS FIRST, a.created_at DESC
  `);
  return rows;
}
