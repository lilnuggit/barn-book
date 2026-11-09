/** Color keys stored in the database; the actual colors live in globals.css. */
export const PALETTE = ["sage", "sky", "indigo", "plum", "rose", "amber", "clay", "slate"] as const;

export type PaletteColor = (typeof PALETTE)[number];

export function isPaletteColor(value: unknown): value is PaletteColor {
  return typeof value === "string" && (PALETTE as readonly string[]).includes(value);
}

export function colorClass(color: string) {
  return `tone-${isPaletteColor(color) ? color : "slate"}`;
}

/** Starting list, from the daily to-do list this app replaces. Editable in Settings. */
export const DEFAULT_ACTIVITIES: { name: string; color: PaletteColor }[] = [
  { name: "Hack", color: "clay" },
  { name: "GW", color: "plum" },
  { name: "Dressage", color: "indigo" },
  { name: "Trot Sets", color: "sky" },
  { name: "Equiband", color: "rose" },
  { name: "Lesson – Dressage", color: "indigo" },
  { name: "Lesson – Show Jumping", color: "amber" },
  { name: "Lesson – XC", color: "sage" },
  { name: "XC Schooling", color: "sage" },
  { name: "Show Jump", color: "amber" },
  { name: "Pole Work", color: "amber" },
  { name: "Conditioning", color: "sky" },
];
