"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import type { DayEntry } from "@/lib/data";

/**
 * The day's list as shown: horses still to do first, in the list's order;
 * then the ones done or skipped, in the order they were finished (the latest
 * at the bottom). A horse goes down as soon as it's checked off.
 */
export function orderForToday(entries: DayEntry[]): DayEntry[] {
  const toDo = entries.filter((e) => e.status === "planned");
  const finished = entries.filter((e) => e.status !== "planned");
  // Stable: horses finished at the same moment (or before times were kept) stay in list order.
  finished.sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  return [...toDo, ...finished];
}

function cardsOf(ul: HTMLUListElement): HTMLElement[] {
  return [...ul.querySelectorAll<HTMLElement>(":scope > [data-entry]")];
}

const SLIDE_MS = 280;

/** Cards that have just moved, and the timer that lets each take taps again. */
const settling = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * A card that has just moved takes no taps until it has settled in its new
 * place (with or without the slide): the second tap of a quick double tap on
 * a horse's circle mustn't check off the next horse, just slid under her finger.
 */
function settle(el: HTMLElement) {
  clearTimeout(settling.get(el));
  el.style.pointerEvents = "none";
  settling.set(
    el,
    setTimeout(() => {
      settling.delete(el);
      el.style.pointerEvents = "";
    }, SLIDE_MS + 70),
  );
}

/**
 * Slides cards to their new places when she changes the order (a horse going
 * down after it's checked off, or back up when it's unchecked), so it's clear
 * where it went. Returns the list's ref and `before`: call `before(id)` in the handler, just before the change: it
 * notes where every card is on screen right then (mid-slide included), and the
 * card she tapped (`id`) is kept under her finger. Changes that don't come
 * from her (data from the server) don't slide.
 */
export function useCardMoves() {
  const list = useRef<HTMLUListElement>(null);
  const snapshot = useRef<{ tops: Map<string, number>; anchor: string | null } | null>(null);
  const before = useCallback((anchor: string | null = null) => {
    const ul = list.current;
    if (!ul) return;
    const tops = new Map<string, number>();
    for (const el of cardsOf(ul)) tops.set(el.dataset.entry ?? "", el.getBoundingClientRect().top);
    snapshot.current = { tops, anchor };
  }, []);
  useLayoutEffect(() => {
    const snap = snapshot.current;
    snapshot.current = null;
    const ul = list.current;
    if (!snap || !ul) return;
    const cards = cardsOf(ul);
    // Slides still running would skew where the cards now are.
    for (const el of cards) for (const a of el.getAnimations?.() ?? []) a.cancel();
    const anchor = cards.find((el) => el.dataset.entry === snap.anchor);
    const from = anchor ? snap.tops.get(anchor.dataset.entry ?? "") : undefined;
    if (anchor && from !== undefined) {
      const shift = anchor.getBoundingClientRect().top - from;
      if (Math.abs(shift) >= 1) window.scrollBy(0, shift);
    }
    // With reduced motion the cards jump to their places instead of sliding (and still take no taps for a moment).
    const noSlide = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (const el of cards) {
      const was = snap.tops.get(el.dataset.entry ?? "");
      if (was === undefined) continue;
      const delta = was - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      settle(el);
      if (noSlide) continue;
      el.animate?.([{ transform: `translateY(${delta}px)` }, { transform: "none" }], {
        duration: SLIDE_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  });
  return [list, before] as const;
}
