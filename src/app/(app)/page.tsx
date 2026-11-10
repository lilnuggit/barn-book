import type { Metadata } from "next";
import { Suspense } from "react";
import { DayView } from "@/components/day/day-view";
import { Skeleton } from "@/components/ui";
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
    <Suspense fallback={<DaySkeleton />}>
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

  return (
    <DayView
      key={date}
      date={date}
      today={today}
      pinned={isISODate(params.d)}
      locale={locale}
      entries={entries}
      horses={horses}
      activities={activities}
      suggestions={suggestions}
    />
  );
}

function DaySkeleton() {
  return (
    <>
      <div className="bg-header pt-safe">
        <div className="mx-auto max-w-xl px-4 pt-2 pb-5">
          <div className="h-11" />
          <div className="h-4 w-16 rounded bg-header-fill" />
          <div className="mt-2 h-8 w-64 rounded-lg bg-header-fill" />
          <div className="mt-5 h-1.5 rounded-full bg-header-fill" />
        </div>
      </div>
      <div className="mx-auto max-w-xl space-y-3 px-4 pt-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[76px] rounded-2xl" />
        ))}
      </div>
    </>
  );
}
