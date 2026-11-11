"use client";

import { useId, useMemo } from "react";
import type { AppointmentLite, AppointmentTypeLite } from "@/lib/appointments";
import { AppointmentRow } from "./appointment-row";
import { checkOffAppointment, type SaveContext } from "./save";
import { openAppointment } from "./sheet-state";

/** A day's visits, in a tinted card above its horses. They don't count towards "x of y done". */
export function DayAppointments({
  date,
  appointments,
  types,
  waiting,
  ctx,
}: {
  date: string;
  /** As shown, in the day's order. */
  appointments: AppointmentLite[];
  types: AppointmentTypeLite[];
  waiting: Set<string>;
  ctx: SaveContext;
}) {
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const headingId = useId();
  if (appointments.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-visits-on={date} className="mb-4">
      <h2 id={headingId} className="sr-only">
        Visits
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line">
        {appointments.map((a) => (
          <AppointmentRow
            key={a.id}
            appointment={a}
            type={typeById.get(a.typeId)}
            today={ctx.today}
            locale={ctx.locale}
            withDay={false}
            // A checked-off visit dated ahead (another time zone, another phone) shows it's done.
            tick={date <= ctx.today ? "live" : a.done ? "static" : "none"}
            waiting={waiting.has(a.id)}
            onCheck={(done) => checkOffAppointment(a, done, ctx)}
            onOpen={() => openAppointment(`day:${date}`, a)}
          />
        ))}
      </ul>
    </section>
  );
}
