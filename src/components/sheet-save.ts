"use client";

import { useEffect, useRef, useState } from "react";
import type { SyncResult } from "@/lib/action-result";

export const SAVED_ON_PHONE = "Saved on this phone — it’ll sync when it can";
export const SAVED_OFFLINE = "No signal — saved on this phone, it’ll sync when you’re back online";

/**
 * Each opening of a sheet is a session. A save that finishes after its sheet
 * was closed (or closed and opened again) must not close or reset the new one,
 * and only the session that sent a save shows it as busy.
 */
export function useSheetSession() {
  const current = useRef(0);
  const [session, setSession] = useState(0);
  const [busySession, setBusySession] = useState<number | null>(null);
  return {
    busy: busySession !== null && busySession === session,
    begin() {
      current.current += 1;
      setSession(current.current);
    },
    end() {
      current.current += 1;
      setSession(current.current);
    },
    async send(result: Promise<SyncResult>): Promise<{ result: SyncResult; stillOpen: boolean }> {
      const s = current.current;
      setBusySession(s);
      const r = await result;
      setBusySession((b) => (b === s ? null : b));
      return { result: r, stillOpen: s === current.current };
    },
  };
}

/**
 * A sheet waiting for the server's answer to a save. The save is already
 * stored on the phone, so don't keep the rider waiting once the signal is
 * known to be gone (that can turn out only after the save was sent) or the
 * server is this slow: `stop` closes the sheet and says it's on the phone.
 * The answer, when it comes, is still reported by whoever sent the save.
 */
export function useStopWaiting(busy: boolean, offline: boolean, stop: () => void, ms = 8000) {
  const latest = useRef(stop);
  useEffect(() => {
    latest.current = stop;
  });
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => latest.current(), offline ? 0 : ms);
    return () => clearTimeout(timer);
  }, [busy, offline, ms]);
}
