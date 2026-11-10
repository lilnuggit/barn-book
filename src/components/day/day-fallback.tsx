"use client";

import { useOffline } from "next/offline";
import { useEffect, useState } from "react";
import { readDayCopy, type DayCopy } from "@/lib/day-copy";
import { isISODate, todayInTimeZone } from "@/lib/dates";
import { DaySkeleton } from "./day-skeleton";
import { DayView } from "./day-view";

/**
 * Shown while a day's list loads. With no signal that can take until the
 * signal returns, so draw the day from the copy kept on the phone instead.
 */
export function DayFallback() {
  const offline = useOffline();
  const [copy, setCopy] = useState<{ day: DayCopy; pinned: boolean } | null>(null);

  useEffect(() => {
    if (!offline) return;
    const d = new URLSearchParams(window.location.search).get("d");
    const pinned = isISODate(d);
    const date = pinned ? d : todayInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const day = readDayCopy(date);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the phone's storage, only known after mount
    setCopy(day ? { day, pinned } : null);
  }, [offline]);

  if (!copy) {
    return (
      <>
        <DaySkeleton />
        {offline && (
          <p role="status" className="mx-auto mt-6 max-w-xl px-6 text-center text-[15px] text-ink-2">
            No signal — this day will load once you’re back online.
          </p>
        )}
      </>
    );
  }
  const { day, pinned } = copy;
  return (
    <DayView
      key={day.date}
      date={day.date}
      today={day.today}
      pinned={pinned}
      savedAt={day.savedAt}
      locale={day.locale}
      entries={day.entries}
      horses={day.horses}
      activities={day.activities}
      suggestions={day.suggestions}
    />
  );
}
