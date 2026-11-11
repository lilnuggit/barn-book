"use client";

import type { SyncResult } from "@/lib/action-result";
import type { AppointmentMeta } from "@/lib/appointment-changes";
import {
  afterVisit,
  appointmentLabel,
  dayPhrase,
  monthDay,
  nextDueAfter,
  visitName,
  type AppointmentLite,
  type AppointmentTypeLite,
} from "@/lib/appointments";
import { run } from "@/lib/sync";
import { SAVED_OFFLINE } from "../sheet-save";
import { toast } from "../toast";

/*
 * Every visit change goes through here, so the queue keys and what's shown
 * before the server has it are the same on every screen. Each change carries
 * the whole visit as it leaves it (meta.appointment): that's what screens and
 * the copies kept on the phone draw it from until the server's data arrives.
 */

export type SaveContext = {
  /** As shown (with changes on the phone), for names in messages. */
  types: AppointmentTypeLite[];
  /** The phone's today. */
  today: string;
  locale: string;
  offline: boolean;
  /** The visits known around (as shown), to tell when a horse is next due; missing when the screen doesn't have them. */
  around?: readonly AppointmentLite[];
  /** Horses in work (as shown). */
  inWork?: ReadonlySet<string>;
  /** "type|horse" pairs whose visits are all in `around` (Today); missing: all of them. */
  covered?: ReadonlySet<string>;
};

/** For afterVisit: the horses whose visits of this visit's type are all known. */
export function knownHorses(a: AppointmentLite, covered: ReadonlySet<string> | undefined) {
  return (horseId: string) => !covered || covered.has(`${a.typeId}|${horseId}`);
}

function report(result: SyncResult) {
  if (!result.ok && result.reason === "invalid") toast(result.error);
}

function meta(a: AppointmentLite, ctx: SaveContext): AppointmentMeta {
  return { appointment: a, label: appointmentLabel(a, ctx.types, ctx.locale) };
}

function input(a: AppointmentLite) {
  return { id: a.id, typeId: a.typeId, date: a.date, time: a.time, horseIds: a.horses.map((h) => h.id), note: a.note };
}

function typeName(a: AppointmentLite, ctx: SaveContext) {
  return ctx.types.find((t) => t.id === a.typeId)?.name ?? "Visit";
}

export function addAppointment(a: AppointmentLite, ctx: SaveContext) {
  void run("createAppointment", [{ ...input(a), done: a.done }], { key: `appt-new:${a.id}`, meta: meta(a, ctx) }).then(
    report,
  );
  const name = typeName(a, ctx);
  toast(
    ctx.offline
      ? SAVED_OFFLINE
      : a.done
        ? `${visitName(name)} added`
        : `${name} booked for ${dayPhrase(a.date, ctx.today, ctx.locale)}`,
  );
}

function changedDetails(before: AppointmentLite, after: AppointmentLite) {
  const ids = (a: AppointmentLite) => a.horses.map((h) => h.id).sort().join(",");
  return (
    before.typeId !== after.typeId ||
    before.date !== after.date ||
    before.time !== after.time ||
    before.note !== after.note ||
    ids(before) !== ids(after)
  );
}

/** An edit and a check-off are separate changes, so neither can undo the other (even from another phone). */
export function saveAppointment(before: AppointmentLite, after: AppointmentLite, ctx: SaveContext) {
  if (changedDetails(before, after)) {
    // To the back of the line: it may use a type or horse added since an earlier edit.
    void run("updateAppointment", [input(after)], {
      key: `appt-edit:${after.id}`,
      replaceInPlace: false,
      meta: meta(after, ctx),
    }).then(report);
  }
  if (before.done !== after.done) {
    void run("setAppointmentDone", [after.id, after.done], { key: `appt-done:${after.id}`, meta: meta(after, ctx) }).then(
      report,
    );
  }
  toast(ctx.offline ? SAVED_OFFLINE : "Saved");
}

export function checkOffAppointment(a: AppointmentLite, done: boolean, ctx: SaveContext) {
  const after = { ...a, done };
  void run("setAppointmentDone", [a.id, done], { key: `appt-done:${a.id}`, meta: meta(after, ctx) }).then(report);
  if (!done) return;
  const type = ctx.types.find((t) => t.id === a.typeId);
  const next = nextDueAfter(a, type);
  if (!type || !next || next < ctx.today) return;
  // Only when due dates count from this one: a later visit already checked off counts instead.
  if (ctx.around && ctx.inWork && !afterVisit(after, type, ctx.around, ctx.inWork, ctx.today, knownHorses(a, ctx.covered)).isLast) {
    return;
  }
  toast(`${type.name} done — next due ${monthDay(next, ctx.today, ctx.locale)}`);
}

export function removeAppointment(a: AppointmentLite, ctx: SaveContext) {
  void run("deleteAppointment", [a.id], { key: `appt-delete:${a.id}` }).then(report);
  toast(ctx.offline ? SAVED_OFFLINE : `${visitName(typeName(a, ctx))} deleted`);
}
