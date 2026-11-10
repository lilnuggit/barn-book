"use client";

import { CalendarCheck, CloudOff, NotebookText, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { Suspense } from "react";
import { reloadIfReachable, useStuckScreen } from "@/lib/missing-code";
import { toast } from "./toast";
import { useNoSignal, usePendingWrites, useSyncStuck } from "@/lib/sync";
import { HorseshoeIcon } from "./icons";
import { cx } from "./ui";

const TABS = [
  { href: "/", segment: null, label: "Today", Icon: CalendarCheck },
  { href: "/horses", segment: "horses", label: "Horses", Icon: HorseshoeIcon },
  { href: "/history", segment: "history", label: "History", Icon: NotebookText },
  { href: "/settings", segment: "settings", label: "Settings", Icon: Settings },
] as const;

export function TabBar() {
  return (
    // The active tab is read from the URL, which isn't known while prerendering
    // pages like /horses/[id]; the bar itself still renders immediately.
    <Suspense fallback={<TabBarView active={undefined} />}>
      <ActiveTabBar />
    </Suspense>
  );
}

function ActiveTabBar() {
  const segment = useSelectedLayoutSegment();
  return <TabBarView active={segment === "__PAGE__" ? null : segment} />;
}

function TabBarView({ active }: { active: string | null | undefined }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-safe backdrop-blur-xl backdrop-saturate-150"
    >
      <StuckScreen />
      <SyncStatus />
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map(({ href, segment: s, label, Icon }) => {
          const isActive = active === s;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium",
                  isActive ? "text-brand" : "text-ink-3",
                )}
              >
                <Icon className="size-6" strokeWidth={isActive ? 2.1 : 1.7} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * A screen opened with no signal whose code couldn't download stays on its
 * placeholders (see missing-code). Once the signal is back, offer a reload:
 * the rider picks the moment (an open sheet would be lost; changes themselves
 * are saved on the phone). Shown above the tabs, clear of the + button.
 */
function StuckScreen() {
  const offline = useNoSignal();
  const stuck = useStuckScreen(!offline);
  if (!stuck) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+10.5rem)] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink py-1 pr-1 pl-4 text-[15px] font-medium text-canvas shadow-lg">
        <span>This screen couldn’t load.</span>
        <button
          type="button"
          onClick={() =>
            void reloadIfReachable().then((reloading) => {
              if (!reloading) toast("Still no signal — try again in a moment");
            })
          }
          className="min-h-11 rounded-full px-3 font-semibold underline"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

/** A slim line above the tabs: no signal, or changes that can't get through yet. */
function SyncStatus() {
  const offline = useNoSignal();
  const pending = usePendingWrites();
  // Changes go strictly in order: while the first can't get through, everything behind it waits too.
  const stuck = useSyncStuck() ? pending.length : 0;

  if (!offline && stuck === 0) return null;
  return (
    <p
      role="status"
      className={cx(
        "pointer-events-none flex items-center justify-center gap-1.5 px-4 py-1 text-center text-xs font-medium",
        offline ? "bg-ink text-canvas" : "bg-brand-soft text-brand",
      )}
    >
      {offline ? (
        <>
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">No signal — changes will sync later</span>
        </>
      ) : (
        <>
          <RefreshCw className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {stuck} {stuck === 1 ? "change" : "changes"} waiting to sync — retrying
          </span>
        </>
      )}
    </p>
  );
}
