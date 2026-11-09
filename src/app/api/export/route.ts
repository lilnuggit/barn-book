import { requireUserId } from "@/lib/auth";
import { getActivityTypes, getAllEntriesForExport } from "@/lib/data";
import { getRequestPrefs } from "@/lib/prefs";

function csvCell(value: string) {
  // Stop spreadsheet apps from treating a note like "=..." as a formula.
  const safe = /^[=@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const STATUS_LABEL = { planned: "To do", done: "Done", skipped: "Skipped" } as const;

export async function GET() {
  const userId = await requireUserId();
  const [rows, activities, { today }] = await Promise.all([
    getAllEntriesForExport(userId),
    getActivityTypes(userId),
    getRequestPrefs(),
  ]);
  const names = new Map(activities.map((a) => [a.id, a.name]));

  const lines = [
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
  ].map((cells) => cells.map((c) => csvCell(String(c ?? ""))).join(","));

  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="barn-book-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
