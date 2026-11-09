"use client";

import { useEffect, useState } from "react";

const EVENT = "barnbook:toast";

/** Shows a short message at the bottom of the screen. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onToast(e: Event) {
      clearTimeout(timer);
      setMessage({ text: (e as CustomEvent<string>).detail, key: Date.now() });
      timer = setTimeout(() => setMessage(null), 2600);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
    >
      {message && (
        <div
          key={message.key}
          className="animate-[fade-in_0.18s_ease-out] rounded-full bg-ink px-4 py-2 text-[15px] font-medium text-canvas shadow-lg"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
