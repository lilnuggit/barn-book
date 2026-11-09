const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function assertUUID(value: unknown, what = "id"): string {
  if (!isUUID(value)) throw new Error(`Invalid ${what}`);
  return value;
}

export function uuidList(value: unknown, max = 50): string[] {
  if (!Array.isArray(value)) throw new Error("Expected a list");
  const ids = [...new Set(value)];
  if (ids.length > max || !ids.every(isUUID)) throw new Error("Invalid list of ids");
  return ids as string[];
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

/** Escapes LIKE wildcards so a search for "50%" means the literal text. */
export function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
