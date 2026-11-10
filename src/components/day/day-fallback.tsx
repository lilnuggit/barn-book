"use client";

import { useEffect, useState } from "react";
import { readDayCopy, type DayCopy } from "@/lib/day-copy";
import { isISODate, phoneToday } from "@/lib/dates";
import { useNoSignal } from "@/lib/sync";
import { DaySkeleton } from "./day-skeleton";
import { DayView } from "./day-view";

/**
 * Shown while a day's list loads. With no signal that can take until the
 * signal returns, and on Wi-Fi with no internet the request can just hang:
 * so draw the day from the copy kept on the phone instead (with no signal at
 * once, otherwise after a few seconds).
 */
export function DayFallback() {
  const offline = useNoSignal();
  const [slow, setSlow] = useState(false);
  const [copy, setCopy] = useState<{ day: DayCopy; pinned: boolean; today: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!offline && !slow) return;
    const d = new URLSearchParams(window.location.search).get("d");
    const pinned = isISODate(d);
    // The phone's own date is the best idea of "today" there is without the server.
    const today = phoneToday();
    const day = readDayCopy(pinned ? d : today);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the phone's storage, only known after mount
    setCopy(day ? { day, pinned, today } : null);
  }, [offline, slow]);

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
  const { day, pinned, today } = copy;
  return (
    <DayView
      key={day.date}
      date={day.date}
      today={today}
      pinned={pinned}
      savedAt={day.savedAt}
      loadedAt={day.loadedAt}
      locale={day.locale}
      entries={day.entries}
      horses={day.horses}
      activities={day.activities}
      suggestions={day.suggestions}
    />
  );
}
