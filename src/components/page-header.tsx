import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  back,
  action,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="bg-header pt-safe text-header-ink">
      <div className={`mx-auto max-w-xl px-4 pb-5 ${back || action ? "pt-2" : "pt-6"}`}>
        {(back || action) && (
          <div className="flex min-h-11 items-center justify-between gap-2">
            {back ? (
              <Link
                href={back.href}
                className="-ml-2 flex min-h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-[16px] font-medium text-header-ink-2"
              >
                <ChevronLeft className="size-6" />
                {back.label}
              </Link>
            ) : (
              <span />
            )}
            {action}
          </div>
        )}
        {eyebrow && (
          <p className="text-[13px] font-semibold tracking-wider text-header-ink-2 uppercase">{eyebrow}</p>
        )}
        <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </header>
  );
}

/** Pill-shaped button that sits on the green header. */
export const headerButtonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-header-fill px-4 text-[15px] font-semibold text-header-ink active:opacity-70";
