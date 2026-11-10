import type { Metadata } from "next";
import { Suspense } from "react";
import { DayFallback } from "@/components/day/day-fallback";
import { DayView } from "@/components/day/day-view";
import { requireUserId } from "@/lib/auth";
import {
  getActiveHorses,
  getActivityTypes,
  getCopySuggestions,
  getDayEntries,
} from "@/lib/data";
import { isISODate } from "@/lib/dates";
import { getRequestPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DayFallback />}>
      <Day searchParams={searchParams} />
    </Suspense>
  );
}

async function Day({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const userId = await requireUserId();
  const [{ today, locale }, params] = await Promise.all([getRequestPrefs(), searchParams]);
  const date = isISODate(params.d) ? params.d : today;

  const [entries, horses, activities] = await Promise.all([
    getDayEntries(userId, date),
    getActiveHorses(userId),
    getActivityTypes(userId),
  ]);
  const suggestions = entries.length === 0 ? await getCopySuggestions(userId, date) : [];
  // When this was read, so the copy kept on the phone can say how old it is.
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request
  const loadedAt = Date.now();

  return (
    <DayView
      key={date}
      date={date}
      today={today}
      pinned={isISODate(params.d)}
      loadedAt={loadedAt}
      locale={locale}
      entries={entries}
      horses={horses}
      activities={activities}
      suggestions={suggestions}
    />
  );
}
