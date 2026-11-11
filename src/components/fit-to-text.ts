/**
 * Sizes a note box to what's typed in it. It's set to "auto" for a moment to
 * measure, which makes what it's in (the page, a sheet) shorter: scrolled to
 * the end, the browser pulls the scroll back for good, and the page jumped
 * while she typed. The scroll positions it's in are put back as they were.
 */
export function fitToText(el: HTMLTextAreaElement) {
  const kept: [Element, number][] = [];
  for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop > 0) kept.push([p, p.scrollTop]);
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
  for (const [p, top] of kept) if (p.scrollTop !== top) p.scrollTop = top;
}
