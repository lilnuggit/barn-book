import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityTypes, entries, horses, type EntryStatus } from "@/db/schema";
import { addDays, lastDayOfMonth } from "./dates";
import { DEFAULT_ACTIVITIES } from "./palette";
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
  return db
    .select(entryWithHorse)
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.userId, userId), eq(entries.date, date)))
    .orderBy(asc(entries.sortOrder), asc(entries.createdAt));
}

export type CopySuggestion = { date: string; count: number; horseNames: string[] };

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
    .select({ date: entries.date, horseName: horses.name })
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.userId, userId), inArray(entries.date, candidates), isNull(horses.archivedAt)))
    .orderBy(asc(entries.sortOrder), asc(entries.createdAt));

  return candidates
    .map((d) => {
      const names = rows.filter((r) => r.date === d).map((r) => r.horseName);
      return { date: d, count: names.length, horseNames: [...new Set(names)] };
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
