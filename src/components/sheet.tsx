"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * iOS-style bottom sheet built on <dialog>, so focus and Escape work for free.
 *
 * Two layouts:
 * - default: title on the left, a "Done" button on the right;
 * - with `onSave`: "Cancel" and "Save" across the top (Save stays visible
 *   above the keyboard), and closing with unsaved changes asks first.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  onSave,
  saveLabel = "Save",
  saveDisabled = false,
  dirty = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Has unsaved edits: Cancel, Escape, and tapping outside ask before discarding. */
  dirty?: boolean;
  /**
   * A save has been sent. Closing is still allowed (without signal it could
   * wait a long time) but it can't be discarded any more, so don't ask.
   */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /** What the parent wants. */
  const openRef = useRef(open);
  /** The next close event is one the sheet caused itself (screen hidden), not the rider. */
  const closingItself = useRef(false);

  // Opens and closes with the parent. A layout effect, so the sheet is open
  // before the parent's own layout effects run (a field inside can then take
  // the keyboard), also when its screen shows again: layout effects run again
  // then, this one first.
  useLayoutEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A modal <dialog> blocks the whole page. If this sheet's screen is hidden
  // (Next keeps recent screens mounted but hidden, and a screen can be hidden
  // for a moment while it reloads) or removed while it's open, close it so it
  // can't linger as an invisible layer that swallows every tap. That's not the
  // rider closing it, so the parent isn't told (its draft is kept), and it
  // opens again when the screen shows again (the effect above).
  useLayoutEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) {
        closingItself.current = true;
        dialog.close();
      }
    };
  }, []);

  function requestClose() {
    if (dirty && !busy && !window.confirm("Discard your changes?")) return;
    onClose();
  }

  const button = "min-h-11 rounded-full px-3 text-[17px] active:opacity-60";

  return (
    <dialog
      ref={ref}
      className="sheet shadow-2xl"
      aria-label={title}
      onClose={() => {
        // Fired after every close, including ours; only report closes the
        // parent doesn't know about yet (so it isn't told twice), not the
        // sheet's own when its screen was hidden, and not one that's stale
        // because the sheet has been opened again since.
        if (closingItself.current) {
          closingItself.current = false;
          return;
        }
        if (openRef.current && !ref.current?.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault(); // Escape: same rules as Cancel
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose(); // tap on the dimmed backdrop
      }}
    >
      <div className="flex justify-center pt-2 pb-1">
        <span className="h-1.5 w-10 rounded-full bg-line" />
      </div>

      {onSave ? (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between">
            <button type="button" onClick={requestClose} className={`${button} text-ink-2`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
              className={`${button} font-semibold text-brand disabled:opacity-40`}
            >
              {saveLabel}
            </button>
          </div>
          <h2 className="px-2 pt-1 font-serif text-[22px] leading-tight font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 px-2 text-sm text-ink-3">{subtitle}</p>}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 pt-1 pr-3 pb-3 pl-5">
          <div className="min-w-0 pt-1">
            <h2 className="font-serif text-[22px] leading-tight font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
          </div>
          <button type="button" onClick={requestClose} className={`${button} font-semibold text-brand`}>
            Done
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
      {footer ? (
        <div className="border-t border-line bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {footer}
        </div>
      ) : (
        <div className="pb-[env(safe-area-inset-bottom)]" />
      )}
    </dialog>
  );
}

/** An error shown inside a sheet, where a toast would be hidden from screen readers. */
export function SheetError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[15px] font-medium text-danger">
      {message}
    </p>
  );
}
