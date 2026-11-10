"use client";

import { useSyncExternalStore } from "react";

/*
 * A screen's code is downloaded the first time it's opened. If that happens
 * with no signal, the download fails (the browser tries once more), and Next
 * won't try it again for that screen, so it can stay blank after the signal
 * returns. A reload fixes it, but only the rider can know whether now is a
 * good moment (an open sheet would be lost), so the tab bar offers one.
 */

const missing = new Set<string>();
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

function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  // Load events don't bubble, but they do pass the window while capturing.
  window.addEventListener(
    "error",
    (e) => {
      const path = codePath(e.target);
      if (path && !missing.has(path)) {
        missing.add(path);
        for (const listener of listeners) listener();
      }
    },
    true,
  );
  window.addEventListener(
    "load",
    (e) => {
      const path = codePath(e.target);
      if (path && missing.delete(path)) for (const listener of listeners) listener();
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

/** Some of the app's code failed to download and hasn't loaded since. */
export function useMissingCode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => missing.size > 0,
    () => false,
  );
}
