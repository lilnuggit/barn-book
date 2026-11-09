import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { todayInTimeZone } from "./dates";

export type RequestPrefs = {
  timeZone: string;
  locale: string;
  today: string;
};

function validTimeZone(tz: string | null | undefined) {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function pickLocale(acceptLanguage: string | null) {
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();
  if (first) {
    try {
      const [supported] = Intl.DateTimeFormat.supportedLocalesOf(first);
      if (supported) return supported;
    } catch {
      // invalid tag
    }
  }
  return "en-US";
}

/**
 * "Today" depends on where the phone is, not where the server is. The app
 * stores the phone's time zone in a cookie (see TimeZoneSync); before that's
 * set, Vercel's IP-based guess is used.
 */
export const getRequestPrefs = cache(async (): Promise<RequestPrefs> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const timeZone =
    validTimeZone(cookieStore.get("tz")?.value) ??
    validTimeZone(headerStore.get("x-vercel-ip-timezone")) ??
    "UTC";
  const locale = pickLocale(headerStore.get("accept-language"));
  await connection(); // "today" must be computed per request, never prerendered
  return { timeZone, locale, today: todayInTimeZone(timeZone) };
});
