"use server";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { activityTypes, entries, horses, type EntryStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { getUserIdOrNull } from "@/lib/auth";
import { isISODate } from "@/lib/dates";
import { isPaletteColor, PALETTE } from "@/lib/palette";
import { assertUUID, cleanText, uuidList, ValidationError } from "@/lib/validate";

// Every action is safe to repeat: writes are keyed by ids the client chose and
// set absolute values, so the phone can retry anything that didn't get through.

const NOTE_MAX = 4000;
const NAME_MAX = 60;

/**
 * Runs a write for the signed-in user. An expired sign-in comes back as
 * { reason: "signed-out" } (never a redirect, which would drop the write) so the
 * client can renew its session and retry.
 */
async function write(fn: (userId: string) => Promise<ActionResult | void>): Promise<ActionResult> {
  const userId = await getUserIdOrNull();
  if (!userId) return { ok: false, reason: "signed-out" };
  try {
    const result = (await fn(userId)) ?? { ok: true };
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: "invalid", error: error.message };
    throw error;
  }
}

function assertDate(value: unknown): string {
  if (!isISODate(value)) throw new ValidationError("Invalid date");
  return value;
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

/**
 * Re-renders the current page with fresh data. Used when the app comes back to
 * the foreground: unlike a plain router refresh it goes through the client
 * queue, which renews an expired sign-in first instead of bouncing to /sign-in.
 */
export async function refreshPage(): Promise<ActionResult> {
  return write(async () => {});
}

// ---------- day list ----------

export async function addEntries(input: {
  date: string;
  items: { id: string; horseId: string }[];
  activityIds: string[];
  note?: string;
}): Promise<ActionResult> {
  return write(async (userId) => {
    const date = assertDate(input?.date);
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
      throw new ValidationError("Pick between 1 and 50 horses");
    }
    const items = input.items.map((i) => ({ id: assertUUID(i?.id), horseId: assertUUID(i?.horseId) }));
    const horseIds = [...new Set(items.map((i) => i.horseId))];
    const owned = await db
      .select({ id: horses.id })
      .from(horses)
      .where(and(eq(horses.userId, userId), inArray(horses.id, horseIds)));
    if (owned.length !== horseIds.length) {
      throw new ValidationError("One of those horses couldn’t be found — it may have been deleted");
    }
    const activityIds = await ownedActivityIds(userId, uuidList(input.activityIds));
    const note = cleanText(input.note, NOTE_MAX);

    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${entries.sortOrder}), -1)::int` })
      .from(entries)
      .where(and(eq(entries.userId, userId), eq(entries.date, date)));

    await db
      .insert(entries)
      .values(
        items.map((i, index) => ({
          id: i.id,
          userId,
          horseId: i.horseId,
          date,
          activityIds,
          note,
          sortOrder: max + 1 + index,
        })),
      )
      .onConflictDoNothing();
  });
}

/** A time from the phone, if it's a plausible one (anything else is ignored). */
function phoneTime(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= Date.UTC(2000, 0, 1) && value < Date.UTC(10000, 0, 1) ? new Date(value) : null;
}

/**
 * `finishedAt` is when she checked it off or skipped it, by the phone's clock
 * (it may reach the server much later): it decides the horse's place at the
 * bottom of the day's list. Changes queued by older versions of the app don't
 * have it; the phone then sends when the change was made (`madeAt`), which
 * counts unless the horse was already finished.
 */
export async function setEntryStatus(
  id: string,
  status: EntryStatus,
  finishedAt?: number | null,
  madeAt?: number,
): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    if (!["planned", "done", "skipped"].includes(status)) throw new ValidationError("Invalid status");
    const at = phoneTime(finishedAt);
    const made = phoneTime(madeAt);
    await db
      .update(entries)
      .set({
        status,
        completedAt:
          status === "planned"
            ? null
            : (at ?? sql`coalesce(${entries.completedAt}, ${made ? made.toISOString() : sql`now()`}::timestamptz)`),
      })
      .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  });
}

export async function saveEntryNote(id: string, note: string): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    await db
      .update(entries)
      .set({ note: cleanText(note, NOTE_MAX) })
      .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  });
}

export async function setEntryActivities(id: string, activityIds: string[]): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    const ids = await ownedActivityIds(userId, uuidList(activityIds));
    await db
      .update(entries)
      .set({ activityIds: ids })
      .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  });
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    await db.delete(entries).where(and(eq(entries.id, id), eq(entries.userId, userId)));
  });
}

/** Repeats another day's list (horses and work, not notes) onto an empty day. */
/**
 * Repeats a past day's list onto another day. The phone sends the lines it
 * shows (with ids it chose, so it can show them, and changes to them, before
 * this has gone through), and they're added as they are. Without lines (a
 * repeat queued by an older version of the app), the past day is copied here,
 * once.
 */
export async function copyDay(
  fromDate: string,
  toDate: string,
  lines?: { id: string; horseId: string; activityIds: string[] }[],
): Promise<ActionResult> {
  return write(async (userId) => {
    assertDate(fromDate);
    assertDate(toDate);
    if (lines !== undefined) return addCopiedLines(userId, toDate, lines);
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
  });
}

async function addCopiedLines(
  userId: string,
  date: string,
  lines: { id: string; horseId: string; activityIds: string[] }[],
): Promise<void> {
  if (!Array.isArray(lines) || lines.length > 200) throw new ValidationError("That list is too long to repeat");
  const items = lines.map((l) => ({
    id: assertUUID(l?.id),
    horseId: assertUUID(l?.horseId),
    activityIds: uuidList(l?.activityIds),
  }));
  if (items.length === 0) return;
  // Horses deleted since the list was shown are left out.
  const owned = new Set(
    (
      await db
        .select({ id: horses.id })
        .from(horses)
        .where(and(eq(horses.userId, userId), inArray(horses.id, [...new Set(items.map((i) => i.horseId))])))
    ).map((h) => h.id),
  );
  const activities = new Set(await ownedActivityIds(userId, [...new Set(items.flatMap((i) => i.activityIds))]));
  const rows = items.filter((i) => owned.has(i.horseId));
  if (rows.length === 0) return;

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${entries.sortOrder}), -1)::int` })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.date, date)));

  // Ids chosen by the phone: a retry adds nothing twice.
  await db
    .insert(entries)
    .values(
      rows.map((i, index) => ({
        id: i.id,
        userId,
        horseId: i.horseId,
        date,
        activityIds: i.activityIds.filter((a) => activities.has(a)),
        sortOrder: max + 1 + index,
      })),
    )
    .onConflictDoNothing();
}

// ---------- horses ----------

export async function createHorse(input: { id: string; name: string; color: string }): Promise<ActionResult> {
  return write(async (userId) => {
    const id = assertUUID(input?.id);
    const name = cleanText(input.name, NAME_MAX);
    if (!name) throw new ValidationError("Give the horse a name");
    const color = isPaletteColor(input.color) ? input.color : PALETTE[0];
    await db.insert(horses).values({ id, userId, name, color }).onConflictDoNothing();
  });
}

export async function updateHorse(input: {
  id: string;
  name: string;
  color: string;
  notes: string;
}): Promise<ActionResult> {
  return write(async (userId) => {
    const id = assertUUID(input?.id);
    const name = cleanText(input.name, NAME_MAX);
    if (!name) throw new ValidationError("Give the horse a name");
    await db
      .update(horses)
      .set({
        name,
        color: isPaletteColor(input.color) ? input.color : PALETTE[0],
        notes: cleanText(input.notes, NOTE_MAX),
      })
      .where(and(eq(horses.id, id), eq(horses.userId, userId)));
  });
}

export async function setHorseArchived(id: string, archived: boolean): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    await db
      .update(horses)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(horses.id, id), eq(horses.userId, userId)));
  });
}

/** The client leaves the horse's page as soon as this is sent; the refresh then updates the list. */
export async function deleteHorse(id: string): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    await db.delete(horses).where(and(eq(horses.id, id), eq(horses.userId, userId)));
  });
}

// ---------- activity types ----------

/**
 * Adds a type of work, or brings back an archived one with that name. If it's
 * already on the list there's nothing to do: the phone checks for that before
 * sending, so this is a save that arrived twice (a dropped answer is resent).
 */
export async function createActivityType(input: { name: string; color: string }): Promise<ActionResult> {
  return write(async (userId) => {
    const name = cleanText(input?.name, NAME_MAX);
    if (!name) throw new ValidationError("Type a name");
    const color = isPaletteColor(input.color) ? input.color : "slate";

    const [existing] = await db
      .select()
      .from(activityTypes)
      .where(and(eq(activityTypes.userId, userId), sql`lower(${activityTypes.name}) = lower(${name})`));
    if (existing && existing.archivedAt === null) return;

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
  });
}

export async function updateActivityType(input: { id: string; name: string; color: string }): Promise<ActionResult> {
  return write(async (userId) => {
    const id = assertUUID(input?.id);
    const name = cleanText(input.name, NAME_MAX);
    if (!name) throw new ValidationError("Type a name");
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
    if (clash) throw new ValidationError("Another type of work already has that name");
    await db
      .update(activityTypes)
      .set({ name, color: isPaletteColor(input.color) ? input.color : "slate" })
      .where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
  });
}

export async function setActivityArchived(id: string, archived: boolean): Promise<ActionResult> {
  return write(async (userId) => {
    assertUUID(id);
    await db
      .update(activityTypes)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
  });
}

export async function reorderActivityTypes(orderedIds: string[]): Promise<ActionResult> {
  return write(async (userId) => {
    const ids = uuidList(orderedIds, 200);
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(activityTypes)
          .set({ sortOrder: index })
          .where(and(eq(activityTypes.id, id), eq(activityTypes.userId, userId)));
      }
    });
  });
}
