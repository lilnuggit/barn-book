import type { Metadata } from "next";
import { Suspense } from "react";
import { AppointmentsFallback } from "@/components/appointments/appointments-fallback";
import { AppointmentsScreen } from "@/components/appointments/appointments-screen";
import { requireUserId } from "@/lib/auth";
import { getActiveHorses, getAppointmentBook, getAppointmentTypes, getDoneWindow } from "@/lib/data";
import { isISODate } from "@/lib/dates";
import { getRequestPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Visits" };

// The whole screen sits in one Suspense, so the tab's prefetched shell is just
// the fallback, which can draw the screen from the copy kept on the phone.
export default function VisitsPage({ searchParams }: PageProps<"/visits">) {
  return (
    <Suspense fallback={<AppointmentsFallback />}>
      <Visits searchParams={searchParams} />
    </Suspense>
  );
}

async function Visits({ searchParams }: { searchParams: PageProps<"/visits">["searchParams"] }) {
  const userId = await requireUserId();
  const [{ today, locale }, params] = await Promise.all([getRequestPrefs(), searchParams]);
  // ?since=YYYY-MM-DD: "Show older visits" (Done goes back to that day).
  const done = await getDoneWindow(userId, today, isISODate(params.since) ? params.since : undefined);
  const [appointments, types, horses] = await Promise.all([
    getAppointmentBook(userId, today, { doneSince: done.since }),
    getAppointmentTypes(userId),
    getActiveHorses(userId),
  ]);
  // When this was read, so the copy kept on the phone can say how old it is.
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request
  const loadedAt = Date.now();
  return (
    <AppointmentsScreen
      today={today}
      locale={locale}
      loadedAt={loadedAt}
      appointments={appointments}
      types={types}
      horses={horses}
      doneSince={done.since}
      nextSince={done.nextSince}
      extended={done.extended}
    />
  );
}
