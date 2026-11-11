import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { AppointmentLite } from "./appointments";
import { clearAppointmentsCopy, patchAppointmentsCopy, readAppointmentsCopy, saveAppointmentsCopy } from "./appointments-copy";
import { addDays, phoneToday } from "./dates";
import { horsesWithChanges, patchDayCopies, readDayCopy, saveDayCopy } from "./day-copy";
import type { OutboxItem } from "./sync";

// The phone's storage and page, as the copies see them (no Clerk: copies belong to null). Read only when called.
const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  document: { documentElement: { dataset: { auth: "local" } } },
});

const D1 = phoneToday();
const D2 = addDays(D1, 1);
const bella = { id: "h-bella", name: "Bella", color: "sage" };
const max = { id: "h-max", name: "Max", color: "sky" };
const farrier = { id: "t-far", name: "Farrier", color: "clay", archived: false, every: { count: 6, unit: "week" as const } };
const visit: AppointmentLite = { id: "A", typeId: farrier.id, date: D1, time: null, horses: [bella, max], note: "", done: false };
let seq = 0;
const item = (name: OutboxItem["name"], args: unknown[], meta?: unknown): OutboxItem => ({
  id: `i${++seq}`,
  name,
  args,
  meta,
  createdAt: Date.now(),
  attempts: 0,
  userId: null,
});
const day = (date: string, extra: object = {}) => ({
  date,
  today: D1,
  locale: "en-US",
  entries: [],
  horses: [bella, max],
  activities: [],
  suggestions: [],
  loadedAt: 1,
  ...extra,
});

beforeEach(() => {
  mem.clear();
  clearAppointmentsCopy();
});

describe("Today's copies", () => {
  test("a confirmed edit moving a visit leaves one day's copy and joins the other's", () => {
    saveDayCopy(day(D1, { appointments: [visit], appointmentTypes: [farrier] }));
    saveDayCopy(day(D2, { appointments: [], appointmentTypes: [farrier] }));
    const moved = { ...visit, date: D2 };
    patchDayCopies(item("updateAppointment", [{ id: "A" }], { appointment: moved, label: "x" }));
    assert.deepEqual(readDayCopy(D1)!.appointments, []);
    assert.deepEqual(readDayCopy(D2)!.appointments, [moved]);
  });
  test("a copy kept by an older version (no visits field) stays without one", () => {
    saveDayCopy(day(D1));
    patchDayCopies(item("createAppointment", [{ id: "A" }], { appointment: visit, label: "x" }));
    assert.equal(readDayCopy(D1)!.appointments, undefined);
  });
  test("a check-off made elsewhere reaches the day's copy; a type rename too", () => {
    saveDayCopy(day(D1, { appointments: [], appointmentTypes: [farrier] }));
    patchDayCopies(item("setAppointmentDone", ["A", true], { appointment: { ...visit, done: true }, label: "x" }));
    patchDayCopies(item("updateAppointmentType", [{ ...farrier, name: "Farrier & trims" }]));
    const c = readDayCopy(D1)!;
    assert.equal(c.appointments![0]!.done, true);
    assert.equal(c.appointmentTypes![0]!.name, "Farrier & trims");
  });
  test("a deleted horse comes off its visits; a visit for it alone goes", () => {
    const solo = { ...visit, id: "S", horses: [max] };
    saveDayCopy(day(D1, { appointments: [visit, solo], appointmentTypes: [farrier] }));
    patchDayCopies(item("deleteHorse", [max.id]));
    assert.deepEqual(readDayCopy(D1)!.appointments!.map((a) => [a.id, a.horses.length]), [["A", 1]]);
  });
});

describe("the Visits copy", () => {
  const base = { locale: "en-US", appointments: [visit], types: [farrier], horses: [bella, max], loadedAt: 10 };
  test("confirmed changes are applied: visits, types, horses", () => {
    saveAppointmentsCopy(base);
    patchAppointmentsCopy(item("setAppointmentDone", ["A", true], { appointment: { ...visit, done: true }, label: "x" }));
    patchAppointmentsCopy(item("createAppointmentType", [{ id: "t-new", name: "Physio", color: "amber", every: null }]));
    patchAppointmentsCopy(item("createHorse", [{ id: "h-pip", name: "Pip", color: "rose" }], { id: "h-pip", name: "Pip", color: "rose" }));
    patchAppointmentsCopy(item("setHorseArchived", [bella.id, true]));
    const c = readAppointmentsCopy()!;
    assert.equal(c.appointments[0]!.done, true);
    assert.deepEqual(c.types.map((t) => t.name), ["Farrier", "Physio"]);
    assert.deepEqual(c.horses.map((h) => h.name), ["Max", "Pip"]);
  });
  test("an older load doesn't replace a newer copy; the same load does", () => {
    saveAppointmentsCopy(base);
    saveAppointmentsCopy({ ...base, appointments: [], loadedAt: 5 });
    assert.equal(readAppointmentsCopy()!.appointments.length, 1);
    saveAppointmentsCopy({ ...base, appointments: [] });
    assert.equal(readAppointmentsCopy()!.appointments.length, 0);
  });
  test("another account's copy isn't read or patched; sign-out clears it", () => {
    mem.set("barnbook:visits:v1", JSON.stringify({ ...base, savedAt: 1, userId: "user_other" }));
    assert.equal(readAppointmentsCopy(), null);
    patchAppointmentsCopy(item("deleteAppointment", ["A"]));
    assert.equal(JSON.parse(mem.get("barnbook:visits:v1")!).appointments.length, 1);
    clearAppointmentsCopy();
    assert.equal(mem.has("barnbook:visits:v1"), false);
  });
});

test("horses in work with changes: added on the phone, renamed, archived, A–Z", () => {
  const out = horsesWithChanges(
    [max, bella],
    [
      item("createHorse", [{}], { id: "h-ace", name: "ace", color: "rose" }),
      item("updateHorse", [{ id: max.id, name: "Maxi", color: "sky", notes: "" }]),
      item("setHorseArchived", [bella.id, true]),
    ],
  );
  assert.deepEqual(out.map((h) => h.name), ["ace", "Maxi"]);
});

test("a horse brought back into work comes back, from the change (one queued without it can't)", () => {
  const out = horsesWithChanges([max], [item("setHorseArchived", [bella.id, false], bella)]);
  assert.deepEqual(out.map((h) => h.name), ["Bella", "Max"]);
  assert.deepEqual(horsesWithChanges([max], [item("setHorseArchived", [bella.id, false])]).map((h) => h.name), ["Max"]);
  assert.deepEqual(horsesWithChanges([max, bella], [item("setHorseArchived", [bella.id, false], bella)]).length, 2);
});

describe("which account a confirmed change is patched into", () => {
  test("the copies of the account it was saved to; not another's", () => {
    saveDayCopy(day(D1, { appointments: [], appointmentTypes: [farrier] }));
    const tick = item("setAppointmentDone", ["A", true], { appointment: { ...visit, done: true }, label: "x" });
    patchDayCopies(tick, "user_someone_else");
    assert.deepEqual(readDayCopy(D1)!.appointments, []);
    patchDayCopies(tick, null);
    assert.deepEqual(readDayCopy(D1)!.appointments!.map((a) => a.done), [true]);
    saveAppointmentsCopy({ locale: "en-US", appointments: [visit], types: [farrier], horses: [bella, max], loadedAt: 1 });
    patchAppointmentsCopy(item("deleteAppointment", ["A"]), "user_someone_else");
    assert.equal(readAppointmentsCopy()!.appointments.length, 1);
    patchAppointmentsCopy(item("deleteAppointment", ["A"]), null);
    assert.equal(readAppointmentsCopy()!.appointments.length, 0);
  });
});

describe("the visits around a day's visits, in its copy", () => {
  test("the next one booked for the same type and horses joins; others don't", () => {
    saveDayCopy(day(D1, { appointments: [visit], appointmentTypes: [farrier], appointmentsAround: [] }));
    const next = { ...visit, id: "N", date: addDays(D1, 42) };
    const vet = { ...visit, id: "V", typeId: "t-vet", date: addDays(D1, 3) };
    const other = { ...visit, id: "O", date: addDays(D1, 5), horses: [{ id: "h-pip", name: "Pip", color: "rose" }] };
    for (const a of [next, vet, other]) patchDayCopies(item("createAppointment", [{ id: a.id }], { appointment: a, label: "x" }));
    assert.deepEqual(readDayCopy(D1)!.appointmentsAround!.map((a) => a.id), ["N"]);
    patchDayCopies(item("deleteAppointment", ["N"]));
    assert.deepEqual(readDayCopy(D1)!.appointmentsAround, []);
  });
});

describe("Today's copy: the visits around", () => {
  test("a booking for a pair it was loaded for is kept while the day briefly hasn't that pair", () => {
    saveDayCopy(day(D1, { appointments: [visit], appointmentTypes: [farrier], appointmentsAround: [], aroundPairs: [`${farrier.id}|${max.id}`, `${farrier.id}|${bella.id}`] }));
    // Max off today's visit, then booked for later, then back on today's visit.
    const without = { ...visit, horses: [bella] };
    patchDayCopies(item("updateAppointment", [{ id: "A" }], { appointment: without, label: "x" }));
    const later = { ...visit, id: "L", date: addDays(D1, 40), horses: [max] };
    patchDayCopies(item("createAppointment", [{ id: "L" }], { appointment: later, label: "x" }));
    patchDayCopies(item("updateAppointment", [{ id: "A" }], { appointment: visit, label: "x" }));
    assert.ok(readDayCopy(D1)!.appointmentsAround!.some((a) => a.id === "L"));
  });
});

