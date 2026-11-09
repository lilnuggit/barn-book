import type { ReactNode } from "react";
import { colorClass } from "@/lib/palette";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function ActivityChip({
  name,
  color,
  size = "sm",
  muted = false,
}: {
  name: string;
  color: string;
  size?: "sm" | "md";
  muted?: boolean;
}) {
  return (
    <span
      className={cx(
        colorClass(color),
        "inline-flex max-w-full items-center truncate rounded-full bg-tone-bg font-medium text-tone-fg",
        size === "sm" ? "px-2 py-0.5 text-[13px]" : "px-3 py-1 text-sm",
        muted && "opacity-60",
      )}
    >
      {name}
    </span>
  );
}

export function HorseAvatar({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cx(
        colorClass(color),
        "inline-flex shrink-0 items-center justify-center rounded-full bg-tone-bg font-serif font-semibold text-tone-fg",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-10 text-[15px]",
        size === "lg" && "size-16 text-2xl",
      )}
    >
      {initials || "?"}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl bg-surface shadow-card ring-1 ring-line", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 text-ink-3">{icon}</div>}
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {children && <div className="mt-2 text-[15px] text-ink-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}
