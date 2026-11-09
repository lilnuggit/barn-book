"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const EVENT = "barnbook:toast";

/** Shows a short message at the bottom of the screen. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

/**
 * Rendered as a popover so it sits in the browser's top layer, above an open
 * sheet (<dialog>), instead of being hidden underneath it.
 */
export function Toaster() {
  const ref = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onToast(e: Event) {
      clearTimeout(timer);
      setMessage({ text: (e as CustomEvent<string>).detail, key: Date.now() });
      timer = setTimeout(() => setMessage(null), 3200);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      // Re-showing moves it above anything opened since (like a sheet).
      if (message) el.showPopover();
    } catch {
      // Older browsers: it still shows as a normal fixed element.
    }
  }, [message]);

  return (
    <div ref={ref} popover="manual" aria-live="polite" className="toast-layer">
      {message && (
        <div
          key={message.key}
          className="animate-[fade-in_0.18s_ease-out] rounded-full bg-ink px-4 py-2 text-center text-[15px] font-medium text-canvas shadow-lg"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
