"use client";

import { useEffect, useState } from "react";
import { useNoSignal } from "@/lib/sync";

/**
 * Under a screen's placeholders: if it's still loading after a few seconds
 * (no signal, or a connection that hangs), say so, rather than leaving grey
 * blocks with no explanation.
 */
export function StillLoading() {
  const noSignal = useNoSignal();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  if (!slow && !noSignal) return null;
  return (
    <p role="status" className="mt-6 px-2 text-center text-[15px] text-ink-2">
      {noSignal
        ? "No signal — this screen will load once you’re back online. Your changes are kept on this phone."
        : "Still loading — no answer from the server yet. Your changes are kept on this phone."}
    </p>
  );
}
