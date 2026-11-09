"use client";

import { CloudOff } from "lucide-react";
import { useOffline } from "next/offline";

export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-lg">
        <CloudOff className="size-4" />
        No signal — changes will save when you’re back online
      </div>
    </div>
  );
}
