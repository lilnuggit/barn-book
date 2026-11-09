"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Tells the server the phone's time zone (so "today" is right), and refreshes
 * the data when the app comes back to the foreground after a while — an app
 * left open overnight should show the new day.
 */
export function TimeZoneSync() {
  const router = useRouter();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.match(/(?:^|;\s*)tz=([^;]*)/)?.[1];
    if (tz && (current ? decodeURIComponent(current) : null) !== tz) {
      const secure = location.protocol === "https:" ? "; secure" : "";
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax${secure}`;
      router.refresh();
    }

    let hiddenAt = 0;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
        router.refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return null;
}
