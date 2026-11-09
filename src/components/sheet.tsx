"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** iOS-style bottom sheet built on <dialog>, so focus and Escape work for free. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  action,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet shadow-2xl"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // tap on the dimmed backdrop
      }}
    >
      <div className="flex justify-center pt-2 pb-1">
        <span className="h-1.5 w-10 rounded-full bg-line" />
      </div>
      <div className="flex items-start justify-between gap-3 px-5 pt-1 pb-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[22px] leading-tight font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {action ?? (
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-full px-3 py-1.5 text-[16px] font-semibold text-brand"
          >
            Done
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
      {footer && (
        <div className="border-t border-line bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {footer}
        </div>
      )}
      {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
    </dialog>
  );
}
