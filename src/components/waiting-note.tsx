"use client";

import { CloudOff } from "lucide-react";
import { APPOINTMENT_ACTIONS } from "@/lib/appointment-changes";
import { useNoSignal, usePendingWrites, useSyncStuck } from "@/lib/sync";
import { cx } from "./ui";

/**
 * Screens drawn from what the server sent (History, a horse's page) don't
 * include changes still waiting on the phone. While they're waiting (no
 * signal, or they can't get through), say so, so a horse checked off a moment
 * ago showing as not done isn't taken at face value. Visit changes don't
 * count: these screens don't show visits, and a horse's page layers its
 * visits itself.
 */
export function WaitingChangesNote({ className }: { className?: string }) {
  const noSignal = useNoSignal();
  const stuck = useSyncStuck();
  const pending = usePendingWrites();
  if (!pending.some((i) => !APPOINTMENT_ACTIONS.has(i.name)) || (!noSignal && !stuck)) return null;
  return (
    <p
      role="status"
      className={cx("flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[14px] text-ink-2", className)}
    >
      <CloudOff className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <span>Changes waiting on this phone aren’t shown here yet. They’ll appear once they sync.</span>
    </p>
  );
}
