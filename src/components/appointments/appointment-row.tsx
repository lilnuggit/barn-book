"use client";

import { CalendarClock, Check, ChevronRight, CloudOff } from "lucide-react";
import {
  shortHorseList,
  sortHorses,
  spokenHorseList,
  visitName,
  whenLabel,
  type AppointmentLite,
  type AppointmentTypeLite,
} from "@/lib/appointments";
import { ActivityChip, cx } from "../ui";

/**
 * A visit in a list (Today's card, the Visits screen): a circle to check it
 * off (today and earlier), and the rest opens it. Checking one off never
 * moves it.
 */
export function AppointmentRow({
  appointment: a,
  type,
  today,
  locale,
  withDay,
  tick,
  waiting,
  onCheck,
  onOpen,
}: {
  appointment: AppointmentLite;
  type: AppointmentTypeLite | undefined;
  today: string;
  locale: string;
  /** Show the day as well as the time (not on a day's own list). */
  withDay: boolean;
  /** live: a circle to check it off; static: a done mark; none: not yet (a future day). */
  tick: "live" | "static" | "none";
  /** Has changes stuck on the phone (no signal, or they can't get through). */
  waiting: boolean;
  onCheck?: (done: boolean) => void;
  onOpen: () => void;
}) {
  const name = visitName(type?.name ?? "Visit");
  // One order everywhere (before and after the server has it), whatever order the visit arrived in.
  const sorted = sortHorses(a.horses, locale);
  const horses = spokenHorseList(sorted, locale);
  const when = whenLabel(a, today, locale, withDay);
  return (
    <li className="flex items-start pr-2 pl-1">
      <div className="grid size-[52px] shrink-0 place-items-center">
        {tick === "live" ? (
          <button
            type="button"
            onClick={() => onCheck?.(!a.done)}
            aria-pressed={a.done}
            aria-label={a.done ? `${name} for ${horses}: done. Tap to undo` : `Mark the ${name} for ${horses} done`}
            className="grid size-[52px] place-items-center"
          >
            <span
              key={String(a.done)}
              className={cx(
                "grid size-7 place-items-center rounded-full border-2 transition-colors",
                a.done ? "animate-pop border-done bg-done text-surface" : "border-ink-3/60",
              )}
            >
              {a.done && <Check className="size-4" strokeWidth={3.2} />}
            </span>
          </button>
        ) : tick === "static" ? (
          <span
            role="img"
            aria-label="Done"
            className="grid size-7 place-items-center rounded-full border-2 border-done bg-done text-surface"
          >
            <Check className="size-4" strokeWidth={3.2} />
          </span>
        ) : (
          <CalendarClock className="size-5 text-ink-3" aria-hidden />
        )}
      </div>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <ActivityChip
              name={type?.name ?? "Visit"}
              color={type?.color ?? "slate"}
              muted={a.done || Boolean(type?.archived)}
            />
            {when && (
              <span className={cx("shrink-0 text-[15px] font-semibold tabular-nums", a.done && "text-ink-2")}>
                {when}
              </span>
            )}
            {waiting && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-3">
                <CloudOff className="size-3.5" aria-hidden /> Not synced yet
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[15px] text-ink-2">{shortHorseList(sorted)}</p>
          {a.note && <p className="mt-0.5 truncate text-[14px] text-ink-3">{a.note}</p>}
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  );
}
