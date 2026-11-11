import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getActivityTypes, getAllEntriesForExport, getAppointmentsForExport, getHorsesForExport } from "@/lib/data";
import { getRequestPrefs } from "@/lib/prefs";

function csvCell(value: string) {
  // Spreadsheets read a cell starting with = + - @ as a formula (so a note like
  // "- trot work" shows #NAME?). A leading apostrophe keeps it as text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csv(rows: string[][]) {
  return `﻿${rows.map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const STATUS_LABEL = { planned: "To do", done: "Done", skipped: "Skipped" } as const;

/**
 * /api/export → training log; /api/export?what=horses → each horse and its
 * About notes; /api/export?what=visits → every visit, newest first.
 */
export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  const { today } = await getRequestPrefs();
  const what = request.nextUrl.searchParams.get("what");
  const horsesOnly = what === "horses";

  let body: string;
  if (what === "visits") {
    const rows = await getAppointmentsForExport(userId);
    body = csv([
      ["Date", "Time", "Type", "Horses", "Status", "Note"],
      ...rows.map((r) => [
        r.date,
        r.time ?? "",
        r.type,
        r.horses,
        r.done ? "Done" : r.date >= today ? "Booked" : "Not checked off",
        r.note,
      ]),
    ]);
  } else if (horsesOnly) {
    const rows = await getHorsesForExport(userId);
    body = csv([
      ["Horse", "Color", "Status", "About"],
      ...rows.map((h) => [h.name, h.color, h.archivedAt ? "Archived" : "In work", h.notes]),
    ]);
  } else {
    const [rows, activities] = await Promise.all([getAllEntriesForExport(userId), getActivityTypes(userId)]);
    const names = new Map(activities.map((a) => [a.id, a.name]));
    body = csv([
      ["Date", "Horse", "Work", "Status", "Note"],
      ...rows.map((r) => [
        r.date,
        r.horse,
        r.activityIds
          .map((id) => names.get(id))
          .filter(Boolean)
          .join("; "),
        STATUS_LABEL[r.status],
        r.note,
      ]),
    ]);
  }

  const name = what === "visits" ? "barn-book-visits" : horsesOnly ? "barn-book-horses" : "barn-book-log";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
