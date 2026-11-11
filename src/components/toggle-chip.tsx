"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { colorClass } from "@/lib/palette";
import { cx } from "./ui";

export function ToggleChip({
  selected,
  color,
  onClick,
  children,
  badge,
  role,
  muted = false,
}: {
  selected: boolean;
  color: string;
  onClick: () => void;
  children: ReactNode;
  badge?: ReactNode;
  /** One of a radiogroup (pick one), instead of a toggle. */
  role?: "radio";
  /** Not in use any more (archived), shown because it's picked. */
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : selected}
      aria-checked={role ? selected : undefined}
      onClick={onClick}
      className={cx(
        colorClass(color),
        "inline-flex min-h-11 items-center gap-1 rounded-full px-3.5 text-[15px] font-medium ring-1 transition-colors active:scale-[0.97]",
        selected ? "bg-tone-bg text-tone-fg ring-tone-solid" : "bg-surface text-ink-2 ring-line",
        muted && "opacity-60",
      )}
    >
      {selected && <Check className="-ml-0.5 size-4" strokeWidth={2.5} />}
      {children}
      {badge}
    </button>
  );
}
