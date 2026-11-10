"use client";

import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useEffect, useRef } from "react";
import { todayInTimeZone } from "@/lib/dates";
import { busyEditing } from "@/lib/editing";
import { refreshWhenPossible, renewSession, replay, setKnownOffline } from "@/lib/sync";

const phoneTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Tells the server the phone's time zone (it decides what "today" is). True if it changed. */
function syncTimeZone() {
  const tz = phoneTimeZone();
  const current = document.cookie.match(/(?:^|;\s*)tz=([^;]*)/)?.[1];
  if (!tz || (current ? decodeURIComponent(current) : null) === tz) return false;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax${secure}`;
  return true;
}

/**
 * - Tells the server the phone's time zone, so "today" is right (again when
 *   the app comes back to the foreground, in case the phone has travelled).
 * - Sends any changes still saved on the phone (from a dropped signal, or an
 *   app iOS closed in the background).
 * - When the app comes back to the foreground: renews the sign-in token first
 *   (it expires after a minute away), then syncs, and after a while away also
 *   reloads the data so an app left open overnight shows the new day. The
 *   same when the phone's date changes while the app is open.
 * - When the signal comes back: syncs straight away (not at the next retry,
 *   which can be minutes off after a long outage). Screens that were loading
 *   finish by themselves; reloading data here would also throw away the
 *   screens kept on the phone for the next time the signal goes.
 */
export function AppLifecycle() {
  const router = useRouter();
  const offline = useOffline();
  const wasOffline = useRef(false);

  // Next notices the connection is back even when the phone fires no event
  // (one bar, no data).
  useEffect(() => {
    setKnownOffline(offline);
    if (offline) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    void renewSession().then(replay);
  }, [offline]);

  useEffect(() => {
    if (syncTimeZone()) router.refresh();
    replay();

    let day = todayInTimeZone(phoneTimeZone());
    /** The phone has moved on to another day (or time zone): reload what's on screen. */
    function checkDay() {
      const tzMoved = syncTimeZone();
      const now = todayInTimeZone(phoneTimeZone());
      const dayMoved = now !== day;
      if (!tzMoved && !dayMoved) return false;
      // A new day's list would replace an open sheet and what's typed in it:
      // wait for the next check (a minute, or coming back to the app).
      if (dayMoved && busyEditing()) return false;
      day = now;
      refreshWhenPossible();
      return true;
    }

    let hiddenAt = 0;
    async function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      await renewSession();
      replay();
      // Through the queue rather than router.refresh(): if the sign-in token
      // expired while away, the queue renews it instead of bouncing to sign-in.
      if (!checkDay() && away > 60_000) refreshWhenPossible();
    }
    async function onOnline() {
      await renewSession();
      replay();
    }
    const clock = setInterval(checkDay, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
