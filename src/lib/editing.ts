"use client";

/**
 * The rider is in the middle of something: a sheet is open or a text field
 * has the keyboard. Switching the screen to another day now would throw away
 * the sheet (and what's being typed in it), so callers wait for a better moment.
 */
export function busyEditing(): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector("dialog[open]")) return true;
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "date", "range"].includes(el.type);
}
