"use client";

import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useEffect, useRef } from "react";
import { refreshWhenPossible, renewSession, replay } from "@/lib/sync";

/**
 * - Tells the server the phone's time zone, so "today" is right.
 * - Sends any changes still saved on the phone (from a dropped signal, or an
 *   app iOS closed in the background).
 * - When the app comes back to the foreground: renews the sign-in token first
 *   (it expires after a minute away), then syncs, and after a while away also
 *   reloads the data so an app left open overnight shows the new day.
 * - When the signal comes back: syncs straight away (not at the next retry,
 *   which can be minutes off after a long outage) and reloads the page's data,
 *   since a screen opened meanwhile may not have been able to load. (If its
 *   code couldn't be downloaded either, the tab bar offers a reload.)
 */
export function AppLifecycle() {
  const router = useRouter();
  const offline = useOffline();
  const wasOffline = useRef(false);

  // Next notices the connection is back even when the phone fires no event
  // (one bar, no data).
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    void renewSession().then(() => {
      replay();
      refreshWhenPossible();
    });
  }, [offline]);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.match(/(?:^|;\s*)tz=([^;]*)/)?.[1];
    if (tz && (current ? decodeURIComponent(current) : null) !== tz) {
      const secure = location.protocol === "https:" ? "; secure" : "";
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax${secure}`;
      router.refresh();
    }

    replay();

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
      if (away > 60_000) refreshWhenPossible();
    }
    async function onOnline() {
      await renewSession();
      replay();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}

