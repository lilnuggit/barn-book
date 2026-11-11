"use client";

import { useCallback, useEffect, useMemo } from "react";
import { applyAppointmentChanges, applyAppointmentTypeChanges } from "@/lib/appointment-changes";
import {
  horseRowLines,
  horseVisitRows,
  type AppointmentLite,
  type AppointmentTypeLite,
} from "@/lib/appointments";
import type { HorseLite } from "@/lib/data";
import { horsesWithChanges } from "@/lib/day-copy";
import { usePhoneToday } from "@/lib/phone-today";
import { forgetConfirmedBefore, useNoSignal, useOverlayWrites } from "@/lib/sync";
import { ActivityChip, Card, cx, SectionTitle } from "../ui";
import { AppointmentSheet } from "./appointment-sheet";
import { openAppointment, openNewAppointment, useAppointmentScreen } from "./sheet-state";

/** A horse's page: the last and next visit of each type, worked out on the phone with her changes. */
export function HorseAppointments({
  horse,
  appointments,
  types,
  horses,
  today,
  locale,
}: {
  horse: HorseLite & { archived: boolean };
  /** This horse's visits (the book). */
  appointments: AppointmentLite[];
  types: AppointmentTypeLite[];
  /** Horses in work, for the sheet. */
  horses: HorseLite[];
  today: string;
  locale: string;
}) {
  const key = `horse:${horse.id}`;
  useAppointmentScreen(key);
  const now = usePhoneToday(today);
  const overlay = useOverlayWrites();
  const offline = useNoSignal();

  // Archived or back in work on the phone, before the server has it.
  const archived = useMemo(() => {
    const last = overlay.findLast((i) => i.name === "setHorseArchived" && i.args[0] === horse.id);
    return last ? last.args[1] === true : horse.archived;
  }, [overlay, horse.id, horse.archived]);
  const shownTypes = useMemo(() => applyAppointmentTypeChanges(types, overlay), [types, overlay]);
  const shownHorses = useMemo(() => horsesWithChanges(horses, overlay), [horses, overlay]);
  const keep = useCallback((a: AppointmentLite) => a.horses.some((h) => h.id === horse.id), [horse.id]);
  const shown = useMemo(() => applyAppointmentChanges(appointments, overlay, keep), [appointments, overlay, keep]);
  const { rows, none } = useMemo(
    () => horseVisitRows(shown, shownTypes, { id: horse.id, archived }, now),
    [shown, shownTypes, horse.id, archived, now],
  );
  // Fresh data from the server includes everything it confirmed before it arrived.
  useEffect(() => {
    forgetConfirmedBefore(Date.now());
  }, [appointments, types, horses]);
  // On its own page an archived horse can still be picked (muted), for a past visit.
  const self = shownHorses.find((h) => h.id === horse.id) ?? { id: horse.id, name: horse.name, color: horse.color };

  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => openNewAppointment(key, { horseIds: [horse.id] })}
            className="-my-3 -mr-2 min-h-11 rounded-full px-3 text-[15px] font-semibold text-brand"
          >
            Add visit
          </button>
        }
      >
        Visits
      </SectionTitle>
      {rows.length === 0 ? (
        <Card className="px-4 py-3 text-[15px] text-ink-3">
          No visits yet. Add the last one of each type and Barn Book will work out when the next is due.
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const lines = horseRowLines(row, now, locale);
              const open = row.next ?? row.unticked;
              return (
                <li key={row.type.id}>
                  <button
                    type="button"
                    onClick={() =>
                      open ? openAppointment(key, open) : openNewAppointment(key, { typeId: row.type.id, horseIds: [horse.id] })
                    }
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-surface-2"
                  >
                    <ActivityChip name={row.type.name} color={row.type.color} size="md" muted={row.type.archived} />
                    <span className="min-w-0 text-right">
                      <span
                        className={cx(
                          "block text-[15px] font-medium",
                          lines.tone === "danger" && "text-danger",
                        )}
                      >
                        {lines.top}
                      </span>
                      <span className="block text-xs text-ink-3">{lines.bottom}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {rows.length > 0 && none.length > 0 && (
        <p className="mt-2 px-1 text-sm text-ink-3">No visits yet: {none.map((t) => t.name).join(", ")}</p>
      )}
      <AppointmentSheet
        sheetKey={key}
        today={now}
        locale={locale}
        types={shownTypes}
        horses={shownHorses}
        extraHorses={archived ? [self] : []}
        around={shown}
        offline={offline}
      />
    </section>
  );
}
