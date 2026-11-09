import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
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

export type Horse = typeof horses.$inferSelect;
export type ActivityType = typeof activityTypes.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryStatus = (typeof entryStatus.enumValues)[number];
