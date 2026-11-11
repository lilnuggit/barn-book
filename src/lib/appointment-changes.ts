/*
 * Layers visit changes (waiting on the phone, or just confirmed) over lists
 * from the server or from a copy kept on the phone. Pure; applying the same
 * change twice gives the same result, because copies are saved with changes
 * already in them and layered again.
 */
import type { AppointmentLite, AppointmentTypeLite, Every } from "./appointments";

/** The part of an outbox item this needs (OutboxItem fits). */
export type Change = { name: string; args: unknown[]; meta?: unknown };

/** meta on createAppointment, updateAppointment and setAppointmentDone: the visit as the change leaves it. */
export type AppointmentMeta = { appointment: AppointmentLite; label: string };

export const APPOINTMENT_ACTIONS: ReadonlySet<string> = new Set([
  "createAppointment",
  "updateAppointment",
  "setAppointmentDone",
  "deleteAppointment",
  "createAppointmentType",
  "updateAppointmentType",
  "setAppointmentTypeArchived",
  "reorderAppointmentTypes",
]);

function shown(item: Change): AppointmentLite | undefined {
  const a = (item.meta as Partial<AppointmentMeta> | undefined)?.appointment;
  return a && typeof a.id === "string" && Array.isArray(a.horses) && a.horses.length > 0 ? a : undefined;
}

function same(a: AppointmentLite, b: AppointmentLite) {
  return (
    a.typeId === b.typeId &&
    a.date === b.date &&
    a.time === b.time &&
    a.note === b.note &&
    a.done === b.done &&
    a.horses.length === b.horses.length &&
    a.horses.every((h, i) => h.id === b.horses[i]!.id && h.name === b.horses[i]!.name && h.color === b.horses[i]!.color)
  );
}

/**
 * `keep` says which visits belong in the list (Today: that day's), so an edit
 * that moves a visit takes it off one day's list and puts it on another's.
 * Returns the same array when nothing changes.
 */
export function applyAppointmentChanges(
  list: AppointmentLite[],
  changes: readonly Change[],
  keep: (a: AppointmentLite) => boolean = () => true,
): AppointmentLite[] {
  let out = list;
  for (const item of changes) {
    const [first, second] = item.args as [unknown, unknown];
    switch (item.name) {
      case "createAppointment": {
        const a = shown(item);
        // Once the list has it (the server's copy), that wins.
        if (a && keep(a) && !out.some((x) => x.id === a.id)) out = [...out, a];
        break;
      }
      case "updateAppointment": {
        const a = shown(item);
        if (!a) break;
        const now = out.find((x) => x.id === a.id);
        // An edit never changes "done": the list's own (with any check-off since) stays.
        const next = now ? { ...a, done: now.done } : a;
        if (!keep(next)) {
          if (now) out = out.filter((x) => x.id !== a.id);
        } else if (!now) {
          out = [...out, next];
        } else if (!same(now, next)) {
          out = out.map((x) => (x.id === a.id ? next : x));
        }
        break;
      }
      case "setAppointmentDone": {
        const done = second === true;
        const now = out.find((x) => x.id === first);
        if (now) {
          if (now.done !== done) out = out.map((x) => (x.id === first ? { ...x, done } : x));
        } else {
          // Checked off on another screen: the day's list it belongs to shows it too.
          const a = shown(item);
          if (a && keep({ ...a, done })) out = [...out, { ...a, done }];
        }
        break;
      }
      case "deleteAppointment":
        if (out.some((x) => x.id === first)) out = out.filter((x) => x.id !== first);
        break;
      case "updateHorse": {
        const h = first as { id: string; name: string; color: string };
        const name = h.name.trim();
        if (out.some((a) => a.horses.some((x) => x.id === h.id && (x.name !== (name || x.name) || x.color !== h.color)))) {
          out = out.map((a) =>
            a.horses.some((x) => x.id === h.id)
              ? { ...a, horses: a.horses.map((x) => (x.id === h.id ? { ...x, name: name || x.name, color: h.color } : x)) }
              : a,
          );
        }
        break;
      }
      case "deleteHorse":
        // As on the server: a shared visit stays for the other horses; one for this horse alone goes.
        if (out.some((a) => a.horses.some((x) => x.id === first))) {
          out = out
            .map((a) => (a.horses.some((x) => x.id === first) ? { ...a, horses: a.horses.filter((x) => x.id !== first) } : a))
            .filter((a) => a.horses.length > 0);
        }
        break;
    }
  }
  return out;
}

type TypeArgs = { id: string; name: string; color: string; every: Every | null };

/** Types of visit as changes on the phone leave them: added, renamed, recoloured, reminder changed, archived, moved. */
export function applyAppointmentTypeChanges(types: AppointmentTypeLite[], changes: readonly Change[]): AppointmentTypeLite[] {
  let out = types;
  for (const item of changes) {
    const [first, second] = item.args as [unknown, unknown];
    switch (item.name) {
      case "createAppointmentType": {
        const t = first as TypeArgs;
        if (!out.some((x) => x.id === t.id)) {
          out = [...out, { id: t.id, name: t.name.trim(), color: t.color, archived: false, every: t.every ?? null }];
        }
        break;
      }
      case "updateAppointmentType": {
        const t = first as TypeArgs;
        const now = out.find((x) => x.id === t.id);
        const name = t.name.trim() || now?.name || "";
        if (
          now &&
          (now.name !== name ||
            now.color !== t.color ||
            now.every?.count !== t.every?.count ||
            now.every?.unit !== t.every?.unit)
        ) {
          out = out.map((x) => (x.id === t.id ? { ...x, name, color: t.color, every: t.every ?? null } : x));
        }
        break;
      }
      case "setAppointmentTypeArchived":
        if (out.some((x) => x.id === first && x.archived !== second)) {
          out = out.map((x) => (x.id === first ? { ...x, archived: second === true } : x));
        }
        break;
      case "reorderAppointmentTypes": {
        const rank = new Map((first as string[]).map((id, i) => [id, i]));
        const sorted = [...out].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
        if (sorted.some((t, i) => t !== out[i])) out = sorted;
        break;
      }
    }
  }
  return out;
}

/** Visits with changes stuck on the phone (no signal, or they can't get through): "Not synced yet". */
export function waitingAppointmentIds(pending: readonly Change[], stuck: boolean): Set<string> {
  const ids = new Set<string>();
  if (!stuck) return ids;
  for (const item of pending) {
    const first = item.args[0];
    if (item.name === "createAppointment" || item.name === "updateAppointment") {
      const id = (first as { id?: unknown } | undefined)?.id;
      if (typeof id === "string") ids.add(id);
    } else if ((item.name === "setAppointmentDone" || item.name === "deleteAppointment") && typeof first === "string") {
      ids.add(first);
    }
  }
  return ids;
}

/** Types of visit with changes stuck on the phone (Settings). */
export function waitingAppointmentTypeIds(pending: readonly Change[], stuck: boolean): Set<string> {
  const ids = new Set<string>();
  if (!stuck) return ids;
  for (const item of pending) {
    const first = item.args[0];
    if (item.name === "createAppointmentType" || item.name === "updateAppointmentType") {
      const id = (first as { id?: unknown } | undefined)?.id;
      if (typeof id === "string") ids.add(id);
    } else if (item.name === "setAppointmentTypeArchived" && typeof first === "string") {
      ids.add(first);
    }
  }
  return ids;
}
