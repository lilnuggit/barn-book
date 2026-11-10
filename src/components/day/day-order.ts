"use client";

import { useLayoutEffect, useRef } from "react";
import type { DayEntry } from "@/lib/data";

/**
 * The day's list as shown: horses still to do first, in the list's order;
 * then the ones done or skipped, in the order they were finished (the latest
 * at the bottom). A horse just checked off whose card is still open (`held`)
 * stays in its place until the card closes, so the note box doesn't jump away.
 */
export function orderForToday(entries: DayEntry[], held: string | null): DayEntry[] {
  const toDo = entries.filter((e) => e.status === "planned" || e.id === held);
  const finished = entries.filter((e) => e.status !== "planned" && e.id !== held);
  // Stable: horses finished at the same moment (or before times were kept) stay in list order.
  finished.sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  return [...toDo, ...finished];
}

/**
 * Slides cards to their new places when the order changes (a horse going down
 * after it's checked off, or back up when it's unchecked), so it's clear where
 * it went. Returns the ref for the list; its cards carry data-entry ids.
 */
export function useCardMoves(order: string[]) {
  const list = useRef<HTMLUListElement>(null);
  const last = useRef<{ order: string; tops: Map<string, number> } | null>(null);
  const key = order.join(",");
  // Every commit: the places before a change are where the cards were drawn
  // last (opening or closing a card moves the ones below it too).
  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) {
      last.current = null;
      return;
    }
    const base = ul.getBoundingClientRect().top;
    const cards = new Map<string, HTMLElement>();
    for (const el of ul.querySelectorAll<HTMLElement>(":scope > [data-entry]")) {
      if (el.dataset.entry) cards.set(el.dataset.entry, el);
    }
    const tops = new Map<string, number>();
    for (const [id, el] of cards) tops.set(id, el.getBoundingClientRect().top - base);
    const before = last.current;
    last.current = { order: key, tops };
    if (!before || before.order === key) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, el] of cards) {
      const from = before.tops.get(id);
      const to = tops.get(id);
      if (from === undefined || to === undefined || Math.abs(from - to) < 1) continue;
      el.animate?.([{ transform: `translateY(${from - to}px)` }, { transform: "none" }], {
        duration: 280,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  });
  return list;
}
