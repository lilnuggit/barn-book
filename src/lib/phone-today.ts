"use client";

import { useSyncExternalStore } from "react";
import { phoneToday } from "./dates";

function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * The phone's own date. The server's "today" is from when the page loaded; an
 * app left open overnight would otherwise call yesterday "Today" until it can
 * reach the server again.
 */
export function usePhoneToday(serverToday: string) {
  return useSyncExternalStore(subscribeToClock, () => phoneToday(), () => serverToday);
}

/** "at 8:00 AM", or "on Sun, Nov 8 at 8:00 AM" when it wasn't today. */
export function whenLoaded(at: number, locale: string) {
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(at);
  if (phoneToday(new Date(at)) === phoneToday()) return `at ${time}`;
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(at);
  return `on ${day} at ${time}`;
}
