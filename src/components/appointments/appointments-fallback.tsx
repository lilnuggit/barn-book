"use client";

import { useEffect, useState } from "react";
import { readAppointmentsCopy, type AppointmentsCopy } from "@/lib/appointments-copy";
import { phoneToday } from "@/lib/dates";
import { useNoSignal } from "@/lib/sync";
import { PageHeader } from "../page-header";
import { StillLoading } from "../still-loading";
import { Skeleton } from "../ui";
import { AppointmentsScreen } from "./appointments-screen";

/**
 * Shown while the Visits tab loads. With no signal (or a connection that
 * hangs) draw it from the copy kept on the phone: at once with no signal,
 * otherwise after a few seconds.
 */
export function AppointmentsFallback() {
  const offline = useNoSignal();
  const [slow, setSlow] = useState(false);
  const [copy, setCopy] = useState<{ copy: AppointmentsCopy; today: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!offline && !slow) return;
    const kept = readAppointmentsCopy();
    // The phone's own date is the best idea of "today" there is without the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the phone's storage, only known after mount
    setCopy(kept ? { copy: kept, today: phoneToday() } : null);
  }, [offline, slow]);

  if (!copy) {
    return (
      <>
        <PageHeader title="Visits" />
        <div className="mx-auto max-w-xl space-y-3 px-4 pt-4">
          <Skeleton className="mb-3 h-4 w-28" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
          {offline ? (
            <p role="status" className="mt-6 px-2 text-center text-[15px] text-ink-2">
              No signal — Visits will load once you’re back online. Today’s visits are on the Today tab.
            </p>
          ) : (
            <StillLoading />
          )}
        </div>
      </>
    );
  }
  const { copy: kept, today } = copy;
  return (
    <AppointmentsScreen
      today={today}
      locale={kept.locale}
      loadedAt={kept.loadedAt}
      savedAt={kept.savedAt}
      appointments={kept.appointments}
      types={kept.types}
      horses={kept.horses}
      doneSince={kept.doneSince}
      nextSince={kept.nextSince ?? null}
      extended={kept.extended ?? false}
    />
  );
}
