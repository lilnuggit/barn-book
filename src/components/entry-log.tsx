import Link from "next/link";
import type { ActivityLite, DayEntry } from "@/lib/data";
import { dayHeading } from "@/lib/dates";
import { colorClass } from "@/lib/palette";
import { StatusIcon } from "./status-icon";
import { ActivityChip, cx } from "./ui";

/** Entries grouped under day headings; each heading opens that day's list. */
export function EntryLog({
  entries,
  activityById,
  today,
  locale,
  showHorse,
  highlight,
}: {
  entries: DayEntry[];
  activityById: Map<string, ActivityLite>;
  today: string;
  locale: string;
  showHorse: boolean;
  highlight?: string;
}) {
  const groups = new Map<string, DayEntry[]>();
  for (const e of entries) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);

  return (
    <div className="space-y-5">
      {[...groups].map(([date, items]) => {
        const done = items.filter((e) => e.status === "done").length;
        return (
          <section key={date}>
            <Link
              href={date === today ? "/" : `/?d=${date}`}
              className="mb-1.5 flex items-baseline justify-between gap-2 px-1"
            >
              <h3 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
                {dayHeading(date, today, locale)}
              </h3>
              {showHorse && items.length > 1 && (
                <span className="text-xs text-ink-3 tabular-nums">
                  {done} of {items.length} done
                </span>
              )}
            </Link>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
              {items.map((e) => {
                const chips = e.activityIds.map((id) => activityById.get(id)).filter((a) => a !== undefined);
                return (
                  <li key={e.id} className="flex gap-3 px-4 py-3">
                    <StatusIcon status={e.status} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      {showHorse && (
                        <p className="mb-1 flex items-center gap-2 text-[16px] leading-tight font-semibold">
                          <span className={cx(colorClass(e.horseColor), "size-2 rounded-full bg-tone-solid")} />
                          {e.horseName}
                        </p>
                      )}
                      {chips.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {chips.map((a) => (
                            <ActivityChip key={a.id} name={a.name} color={a.color} muted={e.status === "skipped"} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-3">No work picked</p>
                      )}
                      {e.note && (
                        <p className="mt-1.5 text-[15px] leading-snug whitespace-pre-line text-ink-2">
                          <Highlight text={e.note} query={highlight} />
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    parts.push(text.slice(i, at));
    parts.push(
      <mark key={at} className="rounded bg-brand-soft px-0.5 text-ink">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  parts.push(text.slice(i));
  return parts;
}
