import { Check, Circle, Minus } from "lucide-react";
import type { EntryStatus } from "@/db/schema";
import { cx } from "./ui";

export function StatusIcon({ status, className }: { status: EntryStatus; className?: string }) {
  if (status === "done") {
    return (
      <span
        aria-label="Done"
        className={cx("grid size-5 shrink-0 place-items-center rounded-full bg-done text-surface", className)}
      >
        <Check className="size-3.5" strokeWidth={3.2} />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span
        aria-label="Skipped"
        className={cx("grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3", className)}
      >
        <Minus className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  return <Circle aria-label="Not done" className={cx("size-5 shrink-0 text-ink-3/70", className)} strokeWidth={2} />;
}
