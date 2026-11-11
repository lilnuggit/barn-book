import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const entryStatus = pgEnum("entry_status", ["planned", "done", "skipped"]);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const horses = pgTable(
  "horses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    name: text().notNull(),
    color: text().notNull().default("sage"),
    notes: text().notNull().default(""),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("horses_user_idx").on(t.userId)],
);

export const activityTypes = pgTable(
  "activity_types",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    name: text().notNull(),
    color: text().notNull().default("slate"),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("activity_types_user_name_uq").on(t.userId, t.name)],
);

/** One line on a day's list: a horse, what it's doing, and how it went. */
export const entries = pgTable(
  "entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    horseId: uuid()
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    status: entryStatus().notNull().default("planned"),
    activityIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    note: text().notNull().default(""),
    sortOrder: integer().notNull().default(0),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("entries_user_date_idx").on(t.userId, t.date),
    index("entries_horse_date_idx").on(t.horseId, t.date),
  ],
);

export const intervalUnit = pgEnum("interval_unit", ["week", "month"]);

/** Farrier, Vet… Archived, never deleted. A reminder: every intervalCount intervalUnits (both null: none). */
export const appointmentTypes = pgTable(
  "appointment_types",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    name: text().notNull(),
    color: text().notNull().default("slate"),
    intervalCount: smallint(),
    intervalUnit: intervalUnit(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("appointment_types_user_idx").on(t.userId),
    // Two checks: a CHECK that comes out NULL passes, so the range check alone would let "6, no unit" through.
    check("appointment_types_interval_set_ck", sql`(${t.intervalCount} IS NULL) = (${t.intervalUnit} IS NULL)`),
    check(
      "appointment_types_interval_range_ck",
      sql`${t.intervalUnit} IS NULL OR (${t.intervalUnit} = 'week' AND ${t.intervalCount} BETWEEN 1 AND 52) OR (${t.intervalUnit} = 'month' AND ${t.intervalCount} BETWEEN 1 AND 36)`,
    ),
  ],
);

/** A visit on a day (optionally at a time) for one or more horses. */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    typeId: uuid()
      .notNull()
      .references(() => appointmentTypes.id, { onDelete: "restrict" }),
    date: date({ mode: "string" }).notNull(),
    /** Wall-clock "HH:MM" (24 h) at the barn, or null for any time that day. */
    time: text(),
    note: text().notNull().default(""),
    done: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("appointments_user_date_idx").on(t.userId, t.date),
    check("appointments_time_ck", sql`${t.time} IS NULL OR ${t.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

/** Which horses a visit is for (one or more). */
export const appointmentHorses = pgTable(
  "appointment_horses",
  {
    appointmentId: uuid()
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    horseId: uuid()
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.appointmentId, t.horseId] }), index("appointment_horses_horse_idx").on(t.horseId)],
);

export type Horse = typeof horses.$inferSelect;
export type ActivityType = typeof activityTypes.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryStatus = (typeof entryStatus.enumValues)[number];
export type IntervalUnit = (typeof intervalUnit.enumValues)[number];
