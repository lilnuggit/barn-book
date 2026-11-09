/**
 * Calendar-day helpers. Days are plain "YYYY-MM-DD" strings everywhere so a
 * day never shifts because of time zones; formatting pins them to UTC.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isISOMonth(value: unknown): value is string {
  return typeof value === "string" && ISO_MONTH.test(value) && isISODate(`${value}-01`);
}

function toUTC(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

export function dayOfWeek(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function fmt(locale: string, iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(toUTC(iso));
}

/** "Monday, November 9" */
export function formatLong(iso: string, locale: string) {
  return fmt(locale, iso, { weekday: "long", month: "long", day: "numeric" });
}

/** "Mon, Nov 9" */
export function formatShort(iso: string, locale: string) {
  return fmt(locale, iso, { weekday: "short", month: "short", day: "numeric" });
}

/** "Nov 9" */
export function formatMonthDay(iso: string, locale: string) {
  return fmt(locale, iso, { month: "short", day: "numeric" });
}

/** "Monday" */
export function formatWeekday(iso: string, locale: string) {
  return fmt(locale, iso, { weekday: "long" });
}

/** "November 2026" */
export function formatMonthYear(month: string, locale: string) {
  return fmt(locale, `${month}-01`, { month: "long", year: "numeric" });
}

/** "Today", "Yesterday", "Tomorrow", or the weekday. */
export function relativeDayName(iso: string, today: string, locale: string) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return formatWeekday(iso, locale);
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "Mar 4" */
export function agoLabel(iso: string, today: string, locale: string) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 0) return formatMonthDay(iso, locale);
  if (diff < 14) return `${diff} days ago`;
  if (diff < 60) return `${Math.floor(diff / 7)} weeks ago`;
  return formatMonthDay(iso, locale);
}

export function monthOf(iso: string) {
  return iso.slice(0, 7);
}

export function addMonths(month: string, months: number) {
  const d = toUTC(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 7);
}

export function lastDayOfMonth(month: string) {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

/** 0 = Sunday, 1 = Monday */
export function firstDayOfWeek(locale: string): 0 | 1 {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info) return info.firstDay === 7 ? 0 : 1;
  } catch {
    // fall through
  }
  return /-(US|CA|MX|BR|JP|PH|IL|SA)\b/i.test(locale) ? 0 : 1;
}

/** Weeks of ISO dates covering the month; days outside the month are null. */
export function monthGrid(month: string, weekStart: 0 | 1): (string | null)[][] {
  const first = `${month}-01`;
  const last = lastDayOfMonth(month);
  const lead = (dayOfWeek(first) - weekStart + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function weekdayLabels(locale: string, weekStart: 0 | 1) {
  // 2023-01-01 was a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    fmt(locale, addDays("2023-01-01", (i + weekStart) % 7), { weekday: "narrow" }),
  );
}

/** Heading for a day in a log: "Today", "Yesterday", "Mon, Nov 2", or "Mon, Nov 2, 2025" in another year. */
export function dayHeading(iso: string, today: string, locale: string) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  if (iso.slice(0, 4) !== today.slice(0, 4)) {
    return fmt(locale, iso, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  return formatShort(iso, locale);
}
