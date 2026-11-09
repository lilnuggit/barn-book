"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { renewSession, replay, run } from "@/lib/sync";

/**
 * - Tells the server the phone's time zone, so "today" is right.
 * - Sends any changes still saved on the phone (from a dropped signal, or an
 *   app iOS closed in the background).
 * - When the app comes back to the foreground: renews the sign-in token first
 *   (it expires after a minute away), then syncs, and after a while away also
 *   reloads the data so an app left open overnight shows the new day.
 */
export function AppLifecycle() {
  const router = useRouter();

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
      if (away > 60_000) void run("refreshPage", [], { persist: false });
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
