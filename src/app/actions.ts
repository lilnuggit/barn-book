"use server";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activityTypes, entries, horses, type EntryStatus } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { isISODate } from "@/lib/dates";
import { isPaletteColor, PALETTE } from "@/lib/palette";
import { assertUUID, cleanText, uuidList } from "@/lib/validate";

type Result = { ok: true } | { ok: false; error: string };

const NOTE_MAX = 4000;
const NAME_MAX = 60;

function assertDate(value: unknown): string {
  if (!isISODate(value)) throw new Error("Invalid date");
  return value;
}

async function ownedHorseIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: horses.id })
    .from(horses)
    .where(and(eq(horses.userId, userId), inArray(horses.id, ids)));
  return rows.map((r) => r.id);
}

async function ownedActivityIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(and(eq(activityTypes.userId, userId), inArray(activityTypes.id, ids)));
  const owned = new Set(rows.map((r) => r.id));
  return ids.filter((id) => owned.has(id)); // keep the order they were picked in
}

// ---------- day list ----------

export async function addEntries(input: {
  date: string;
  items: { id: string; horseId: string }[];
  activityIds: string[];
  note?: string;
}) {
  const userId = await requireUserId();
  const date = assertDate(input.date);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
    throw new Error("Invalid items");
  }
  const items = input.items.map((i) => ({ id: assertUUID(i.id), horseId: assertUUID(i.horseId) }));
  const horseIds = new Set(await ownedHorseIds(userId, [...new Set(items.map((i) => i.horseId))]));
  const activityIds = await ownedActivityIds(userId, uuidList(input.activityIds));
  const note = cleanText(input.note, NOTE_MAX);

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${entries.sortOrder}), -1)::int` })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.date, date)));

  const values = items
    .filter((i) => horseIds.has(i.horseId))
    .map((i, index) => ({
      id: i.id,
      userId,
      horseId: i.horseId,
      date,
      activityIds,
      note,
      sortOrder: max + 1 + index,
    }));
  // Client-made ids make a retried request (after a dropped connection) a no-op.
  if (values.length) await db.insert(entries).values(values).onConflictDoNothing();
  refresh();
}

export async function setEntryStatus(id: string, status: EntryStatus) {
  const userId = await requireUserId();
  assertUUID(id);
  if (!["planned", "done", "skipped"].includes(status)) throw new Error("Invalid status");
  await db
    .update(entries)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  refresh();
}

export async function saveEntryNote(id: string, note: string) {
  const userId = await requireUserId();
  assertUUID(id);
  await db
    .update(entries)
    .set({ note: cleanText(note, NOTE_MAX) })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  refresh();
}

export async function setEntryActivities(id: string, activityIds: string[]) {
  const userId = await requireUserId();
  assertUUID(id);
  const ids = await ownedActivityIds(userId, uuidList(activityIds));
  await db
    .update(entries)
    .set({ activityIds: ids })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  refresh();
}

export async function deleteEntry(id: string) {
  const userId = await requireUserId();
  assertUUID(id);
  await db.delete(entries).where(and(eq(entries.id, id), eq(entries.userId, userId)));
  refresh();
}

/** Repeats another day's list (horses and work, not notes) onto an empty day. */
export async function copyDay(fromDate: string, toDate: string) {
  const userId = await requireUserId();
  assertDate(fromDate);
  assertDate(toDate);
  const source = await db
    .select({ horseId: entries.horseId, activityIds: entries.activityIds })
    .from(entries)
    .innerJoin(horses, eq(entries.horseId, horses.id))
    .where(and(eq(entries.userId, userId), eq(entries.date, fromDate), isNull(horses.archivedAt)))
    .orderBy(asc(entries.sortOrder), asc(entries.createdAt));

  await db.transaction(async (tx) => {
    // Guard against a double tap (or a retry) copying the list twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${toDate}`}))`);
    const existing = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.userId, userId), eq(entries.date, toDate)))
      .limit(1);
    if (existing.length || source.length === 0) return;
    await tx.insert(entries).values(
      source.map((s, i) => ({ userId, horseId: s.horseId, activityIds: s.activityIds, date: toDate, sortOrder: i })),
    );
  });
  refresh();
}

// ---------- horses ----------

export async function createHorse(input: { id: string; name: string; color: string }): Promise<Result> {
  const userId = await requireUserId();
  const id = assertUUID(input.id);
  const name = cleanText(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "Give the horse a name" };
  const color = isPaletteColor(input.color) ? input.color : PALETTE[0];
  await db.insert(horses).values({ id, userId, name, color }).onConflictDoNothing();
  refresh();
  return { ok: true };
}

export async function updateHorse(input: { id: string; name: string; color: string; notes: string }): Promise<Result> {
  const userId = await requireUserId();
  const id = assertUUID(input.id);
  const name = cleanText(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "Give the horse a name" };
  await db
    .update(horses)
    .set({
      name,
      color: isPaletteColor(input.color) ? input.color : PALETTE[0],
      notes: cleanText(input.notes, NOTE_MAX),
    })
    .where(and(eq(horses.id, id), eq(horses.userId, userId)));
  refresh();
  return { ok: true };
}

export async function setHorseArchived(id: string, archived: boolean) {
  const userId = await requireUserId();
  assertUUID(id);
  await db
    .update(horses)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(horses.id, id), eq(horses.userId, userId)));
  refresh();
}

export async function deleteHorse(id: string) {
  const userId = await requireUserId();
  assertUUID(id);
  await db.delete(horses).where(and(eq(horses.id, id), eq(horses.userId, userId)));
  redirect("/horses"); // the horse's own page no longer exists
}

// ---------- activity types ----------

export async function createActivityType(input: { name: string; color: string }): Promise<Result> {
  const userId = await requireUserId();
  const name = cleanText(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "Type a name" };
  const color = isPaletteColor(input.color) ? input.color : "slate";

  const [existing] = await db
    .select()
    .from(activityTypes)
    .where(and(eq(activityTypes.userId, userId), sql`lower(${activityTypes.name}) = lower(${name})`));
  if (existing && existing.archivedAt === null) return { ok: false, error: `“${existing.name}” is already on the list` };

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${activityTypes.sortOrder}), -1)::int` })
    .from(activityTypes)
    .where(eq(activityTypes.userId, userId));

  if (existing) {
    await db
      .update(activityTypes)
      .set({ archivedAt: null, name, color, sortOrder: max + 1 })
      .where(eq(activityTypes.id, existing.id));
  } else {
    await db.insert(activityTypes).values({ userId, name, color, sortOrder: max + 1 }).onConflictDoNothing();
  }
  refresh();
  return { ok: true };
}

export async function updateActivityType(input: { id: string; name: string; color: string }): Promise<Result> {
  const userId = await requireUserId();
  const id = assertUUID(input.id);
  const name = cleanText(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "Type a name" };
  const [clash] = await db
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(
      and(
        eq(activityTypes.userId, userId),
        sql`lower(${activityTypes.name}) = lower(${name})`,
        sql`${activityTypes.id} <> ${id}`,
      ),
    );
  if (clash) return { ok: false, error: "Another activity already has that name" };
  await db
    .update(activityTypes)
    .set({ name, color: isPaletteColor(input.color) ? input.color : "slate" })
    .where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
  refresh();
  return { ok: true };
}

export async function setActivityArchived(id: string, archived: boolean) {
  const userId = await requireUserId();
  assertUUID(id);
  await db
    .update(activityTypes)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
  refresh();
}

export async function reorderActivityTypes(orderedIds: string[]) {
  const userId = await requireUserId();
  const ids = uuidList(orderedIds, 200);
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(activityTypes)
        .set({ sortOrder: index })
        .where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
    }
  });
  refresh();
}
