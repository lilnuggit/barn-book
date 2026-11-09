"use client";

import { CalendarCheck, NotebookText, Settings } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { Suspense } from "react";
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
