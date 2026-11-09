import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddHorseButton } from "@/components/horses/horse-sheets";
import { HorseshoeMark } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { ActivityChip, EmptyState, HorseAvatar, SectionTitle, Skeleton } from "@/components/ui";
import { requireUserId } from "@/lib/auth";
import { getActivityTypes, getHorseSummaries, type ActivityLite, type HorseSummary } from "@/lib/data";
import { agoLabel } from "@/lib/dates";
import { getRequestPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Horses" };

export default function HorsesPage() {
  return (
    <>
      <PageHeader title="Horses" action={<AddHorseButton />} />
      <div className="mx-auto max-w-xl px-4 pt-4">
        <Suspense fallback={<ListSkeleton />}>
          <HorseList />
        </Suspense>
      </div>
    </>
  );
}

async function HorseList() {
  const userId = await requireUserId();
  const { today, locale } = await getRequestPrefs();
  const [horses, activities] = await Promise.all([getHorseSummaries(userId, today), getActivityTypes(userId)]);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const active = horses.filter((h) => !h.archived);
  const archived = horses.filter((h) => h.archived);

  if (horses.length === 0) {
    return (
      <EmptyState icon={<HorseshoeMark className="size-14 text-brand" />} title="No horses yet">
        Tap <strong>Add horse</strong> above to add the horses you work with.
      </EmptyState>
    );
  }

  return (
    <>
      <SectionTitle>In work · {active.length}</SectionTitle>
      <ul className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
        {active.map((h) => (
          <HorseRow key={h.id} horse={h} activityById={activityById} today={today} locale={locale} />
        ))}
      </ul>
      {active.length === 0 && <p className="px-1 text-[15px] text-ink-3">Every horse is archived.</p>}

      {archived.length > 0 && (
        <details className="group mt-8">
          <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 px-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Archived · {archived.length}
          </summary>
          <ul className="overflow-hidden rounded-2xl bg-surface opacity-80 shadow-card ring-1 ring-line">
            {archived.map((h) => (
              <HorseRow key={h.id} horse={h} activityById={activityById} today={today} locale={locale} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function HorseRow({
  horse,
  activityById,
  today,
  locale,
}: {
  horse: HorseSummary;
  activityById: Map<string, ActivityLite>;
  today: string;
  locale: string;
}) {
  const last = horse.lastActivityIds.map((id) => activityById.get(id)).filter((a) => a !== undefined);
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`/horses/${horse.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
        <HorseAvatar name={horse.name} color={horse.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[17px] font-semibold">{horse.name}</span>
            <span className="shrink-0 text-sm text-ink-3 tabular-nums">
              {horse.week > 0 ? `${horse.week} this week` : ""}
            </span>
          </div>
          {horse.lastDate ? (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-ink-3">
              <span className="shrink-0">{capitalize(agoLabel(horse.lastDate, today, locale))}</span>
              {last.slice(0, 2).map((a) => (
                <ActivityChip key={a.id} name={a.name} color={a.color} />
              ))}
              {last.length > 2 && <span className="shrink-0">+{last.length - 2}</span>}
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-ink-3">Nothing logged yet</p>
          )}
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="mb-3 h-4 w-28" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[68px] rounded-2xl" />
      ))}
    </div>
  );
}
