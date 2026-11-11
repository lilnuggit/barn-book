import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HorseAppointments } from "@/components/appointments/horse-appointments";
import { EntryLog } from "@/components/entry-log";
import { EditHorseButton } from "@/components/horses/horse-sheets";
import { PageHeader } from "@/components/page-header";
import { StillLoading } from "@/components/still-loading";
import { WaitingChangesNote } from "@/components/waiting-note";
import { ActivityChip, Card, cx, SectionTitle, Skeleton } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import {
  countHorseEntries,
  countHorseOnlyAppointments,
  getActiveHorses,
  getActivityTypes,
  getAppointmentBook,
  getAppointmentTypes,
  getHorse,
  getHorseHistory,
  getHorseStats,
  type ActivityLite,
  type HorseStats,
} from "@/lib/data";
import { addDays, agoLabel, dayOfWeek, firstDayOfWeek, formatShort, monthOf, weekdayLabels } from "@/lib/dates";
import { getRequestPrefs } from "@/lib/prefs";
import { isUUID } from "@/lib/validate";

export const metadata: Metadata = { title: "Horse" };

const PAGE = 40;
const MAX_SHOWN = 2000;

export default function HorsePage({ params, searchParams }: PageProps<"/horses/[id]">) {
  return (
    <Suspense fallback={<HorseSkeleton />}>
      <HorseDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function HorseDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/horses/[id]">["params"];
  searchParams: PageProps<"/horses/[id]">["searchParams"];
}) {
  const userId = await requireUserId();
  const [{ id }, query, { today, locale }] = await Promise.all([params, searchParams, getRequestPrefs()]);
  if (!isUUID(id)) notFound();

  const shown = Math.min(Math.max(Number(query.show) || PAGE, PAGE), MAX_SHOWN);
  const [horse, stats, history, activities, entryCount, appointments, appointmentTypes, horses, visitCount] =
    await Promise.all([
      getHorse(userId, id),
      getHorseStats(userId, id, today),
      getHorseHistory(userId, id, shown),
      getActivityTypes(userId),
      countHorseEntries(userId, id),
      getAppointmentBook(userId, today, { horseId: id }),
      getAppointmentTypes(userId),
      getActiveHorses(userId),
      countHorseOnlyAppointments(userId, id),
    ]);
  if (!horse) notFound();

  const activityById = new Map(activities.map((a) => [a.id, a]));
  const loggedIds = new Set(stats.activities.map((a) => a.activityId));
  const neverLogged = activities.filter((a) => !a.archived && !loggedIds.has(a.id));

  return (
    <>
      <PageHeader
        back={{ href: "/horses", label: "Horses" }}
        eyebrow={horse.archivedAt ? "Archived" : undefined}
        title={horse.name}
        action={
          <EditHorseButton
            horse={{
              id: horse.id,
              name: horse.name,
              color: horse.color,
              notes: horse.notes,
              archived: horse.archivedAt !== null,
              entryCount,
              visitCount,
            }}
          />
        }
      >
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat value={stats.week} label="last 7 days" />
          <Stat value={stats.month} label="last 30 days" />
          <Stat value={stats.total} label="all time" />
        </div>
        <p className="mt-2 text-xs text-header-ink-2">Sessions marked done</p>
      </PageHeader>

      <div className="mx-auto max-w-xl space-y-8 px-4 pt-5">
        <WaitingChangesNote />
        {horse.notes && (
          <section>
            <SectionTitle>About</SectionTitle>
            <Card className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line">{horse.notes}</Card>
          </section>
        )}

        <HorseAppointments
          horse={{ id: horse.id, name: horse.name, color: horse.color, archived: horse.archivedAt !== null }}
          appointments={appointments}
          types={appointmentTypes}
          horses={horses}
          today={today}
          locale={locale}
        />

        <section>
          <SectionTitle>Last 6 weeks</SectionTitle>
          <Card className="p-3">
            <RecentGrid days={stats.recentDays} today={today} locale={locale} activityById={activityById} />
          </Card>
        </section>

        <section>
          <SectionTitle>Last time they did…</SectionTitle>
          {stats.activities.length > 0 ? (
            <LastDone stats={stats} activityById={activityById} today={today} locale={locale} />
          ) : (
            <Card className="px-4 py-3 text-[15px] text-ink-3">
              Nothing marked done yet. Check {horse.name} off on the Today list and it’ll show up here.
            </Card>
          )}
          {stats.activities.length > 0 && neverLogged.length > 0 && (
            <p className="mt-2 px-1 text-sm text-ink-3">
              Not logged yet: {neverLogged.map((a) => a.name).join(", ")}
            </p>
          )}
        </section>

        <section>
          <SectionTitle>Log</SectionTitle>
          {history.rows.length > 0 ? (
            <>
              <EntryLog
                entries={history.rows}
                activityById={activityById}
                today={today}
                locale={locale}
                showHorse={false}
              />
              {history.hasMore && shown < MAX_SHOWN && (
                <Link
                  href={`/horses/${horse.id}?show=${shown + PAGE * 2}`}
                  scroll={false}
                  className="mt-4 block rounded-2xl py-3 text-center text-[16px] font-semibold text-brand ring-1 ring-line active:bg-surface-2"
                >
                  Show older entries
                </Link>
              )}
              {history.hasMore && shown >= MAX_SHOWN && (
                <Link
                  href={`/history?m=${monthOf(history.rows[history.rows.length - 1]!.date)}`}
                  className="mt-4 block rounded-2xl py-3 text-center text-[16px] font-semibold text-brand ring-1 ring-line active:bg-surface-2"
                >
                  Older entries are in History
                </Link>
              )}
            </>
          ) : (
            <Card className="px-4 py-3 text-[15px] text-ink-3">No entries yet.</Card>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-header-fill px-3 py-2.5">
      <p className="font-serif text-2xl leading-none font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-header-ink-2">{label}</p>
    </div>
  );
}

function RecentGrid({
  days,
  today,
  locale,
  activityById,
}: {
  days: HorseStats["recentDays"];
  today: string;
  locale: string;
  activityById: Map<string, ActivityLite>;
}) {
  const weekStart = firstDayOfWeek(locale);
  const intoWeek = (dayOfWeek(today) - weekStart + 7) % 7;
  const start = addDays(today, -intoWeek - 35);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDate = new Map<string, string[][]>();
  for (const d of days) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d.activityIds]);
  // Each square takes the color of the first thing done that day.
  const shownIds = new Set<string>();
  for (const d of cells) {
    const first = byDate.get(d)?.flat()[0];
    if (first) shownIds.add(first);
  }
  const legend = [...activityById.values()].filter((a) => shownIds.has(a.id));

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-ink-3">
        {weekdayLabels(locale, weekStart).map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((d) => {
          const worked = byDate.get(d);
          const future = d > today;
          const firstActivity = worked?.flat()[0];
          const tone = worked ? (activityById.get(firstActivity ?? "")?.color ?? "slate") : null;
          return (
            <Link
              key={d}
              href={d === today ? "/" : `/?d=${d}`}
              aria-label={`${formatShort(d, locale)}: ${worked ? `${worked.length} done` : "nothing logged"}`}
              className={cx(
                "relative grid h-9 place-items-center rounded-lg text-[13px] tabular-nums",
                tone ? `tone-${tone} bg-tone-solid font-semibold text-surface` : "bg-surface-2 text-ink-3",
                future && "opacity-35",
                d === today && "ring-2 ring-brand ring-offset-2 ring-offset-surface",
              )}
            >
              {Number(d.slice(8))}
              {worked && worked.length > 1 && (
                <span className="absolute top-0.5 right-1 text-[9px] leading-none font-bold">{worked.length}</span>
              )}
            </Link>
          );
        })}
      </div>
      {legend.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {legend.map((a) => (
            <ActivityChip key={a.id} name={a.name} color={a.color} />
          ))}
        </div>
      )}
    </div>
  );
}

function LastDone({
  stats,
  activityById,
  today,
  locale,
}: {
  stats: HorseStats;
  activityById: Map<string, ActivityLite>;
  today: string;
  locale: string;
}) {
  return (
    <Card>
      <ul className="divide-y divide-line">
        {stats.activities.map((a) => {
          const type = activityById.get(a.activityId);
          if (!type) return null;
          const ago = agoLabel(a.lastDate, today, locale);
          return (
            <li key={a.activityId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <ActivityChip name={type.name} color={type.color} size="md" muted={type.archived} />
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-medium">{ago.charAt(0).toUpperCase() + ago.slice(1)}</p>
                <p className="text-xs text-ink-3 tabular-nums">
                  {a.month > 0 ? `${a.month}× in 30 days` : `${a.total}× total`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function HorseSkeleton() {
  return (
    <>
      <div className="bg-header pt-safe">
        <div className="mx-auto max-w-xl px-4 pt-2 pb-5">
          <div className="h-11" />
          <div className="h-8 w-40 rounded-lg bg-header-fill" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[62px] rounded-xl bg-header-fill" />
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-5">
        <Skeleton className="h-64 rounded-2xl" />
        <StillLoading />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </>
  );
}
