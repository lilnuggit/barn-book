"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * A screen's code is downloaded the first time it's opened. If that happens
 * with no signal, the download fails (the browser tries once more), and Next
 * won't try it again for that screen, so it can stay blank after the signal
 * returns. A reload fixes it, but only the rider can know whether now is a
 * good moment (an open sheet would be lost), so the app offers one, and only
 * when the screen on show is visibly stuck.
 */

const failed = new Set<string>(); // failed, waiting to see if the browser's own retry works
const missing = new Set<string>(); // failed and not loaded since
const listeners = new Set<() => void>();
let watching = false;

function codePath(el: EventTarget | null): string | null {
  const url = el instanceof HTMLScriptElement ? el.src : el instanceof HTMLLinkElement ? el.href : null;
  if (!url) return null;
  try {
    const { pathname } = new URL(url, window.location.href);
    return pathname.includes("/_next/static/") ? pathname : null;
  } catch {
    return null;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  // A failed download's error reaches the window while capturing.
  window.addEventListener(
    "error",
    (e) => {
      const path = codePath(e.target);
      if (!path) return;
      failed.add(path);
      // The browser retries once, within about half a second.
      setTimeout(() => {
        if (failed.delete(path)) {
          missing.add(path);
          notify();
        }
      }, 1500);
    },
    true,
  );
  // A successful load stops at the document (it never reaches the window).
  document.addEventListener(
    "load",
    (e) => {
      const path = codePath(e.target);
      if (!path) return;
      failed.delete(path);
      if (missing.delete(path)) notify();
    },
    true,
  );
}

function subscribe(listener: () => void) {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useMissingCode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => missing.size > 0,
    () => false,
  );
}

/** Some code is missing and the screen on show has been stuck on its placeholders for a few seconds. */
export function useStuckScreen(active: boolean): boolean {
  const missingCode = useMissingCode();
  const watching = active && missingCode;
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!watching) return;
    let seen = 0;
    const timer = setInterval(() => {
      const placeholders = [...document.querySelectorAll(".animate-pulse")].some((el) => el.checkVisibility?.() ?? true);
      seen = placeholders ? seen + 1 : 0;
      setStuck(seen >= 3);
    }, 1000);
    return () => clearInterval(timer);
  }, [watching]);
  return watching && stuck;
}

/** Reloads only if the server can be reached, so a dead connection can't leave the app on an error page. */
export async function reloadIfReachable(): Promise<boolean> {
  try {
    await fetch(window.location.href, {
      method: "HEAD",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
