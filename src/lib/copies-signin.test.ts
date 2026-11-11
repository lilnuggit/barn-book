import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppointmentLite } from "./appointments";
import { patchAppointmentsCopy, saveAppointmentsCopy } from "./appointments-copy";
import { addDays, phoneToday } from "./dates";
import { patchDayCopies, readDayCopy, saveDayCopy } from "./day-copy";
import type { OutboxItem } from "./sync";

// The phone with Clerk still loading (data-auth="clerk", no window.Clerk yet): copies wait for sign-in.
const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  document: { documentElement: { dataset: { auth: "clerk" } } },
});

const D1 = phoneToday();
const bella = { id: "h-bella", name: "Bella", color: "sage" };
const farrier = { id: "t-far", name: "Farrier", color: "clay", archived: false, every: { count: 6, unit: "week" as const } };
const visit: AppointmentLite = { id: "A", typeId: farrier.id, date: D1, time: null, horses: [bella], note: "", done: false };
const tick: OutboxItem = {
  id: "i1",
  name: "setAppointmentDone",
  args: ["A", true],
  meta: { appointment: { ...visit, done: true }, label: "x" },
  createdAt: 1,
  attempts: 0,
  userId: null,
};

test("a view waiting for sign-in gets the changes confirmed meanwhile before it's kept", async () => {
  // Stored earlier for this account, then a newer view of each screen waits for sign-in to load.
  mem.set("barnbook:visits:v1", JSON.stringify({ locale: "en-US", appointments: [visit], types: [farrier], horses: [bella], loadedAt: 1, savedAt: 1, userId: "u1" }));
  saveAppointmentsCopy({ locale: "en-US", appointments: [visit], types: [farrier], horses: [bella], loadedAt: 5 });
  saveDayCopy({ date: D1, today: D1, locale: "en-US", entries: [], horses: [bella], activities: [], suggestions: [], loadedAt: 5, appointments: [visit], appointmentTypes: [farrier] });
  // The tick is confirmed (the server said it saved it to u1) while Clerk still loads.
  patchAppointmentsCopy(tick, "u1");
  patchDayCopies(tick, "u1");
  assert.equal(JSON.parse(mem.get("barnbook:visits:v1")!).appointments[0].done, true);
  // Clerk loads: the waiting views are kept, with the tick in them.
  Object.assign(globalThis, { window: { Clerk: { loaded: true, status: "ready", user: { id: "u1" } } } });
  await new Promise((r) => setTimeout(r, 1300));
  const visits = JSON.parse(mem.get("barnbook:visits:v1")!);
  assert.equal(visits.loadedAt, 5);
  assert.equal(visits.appointments[0].done, true);
  assert.deepEqual(readDayCopy(D1)!.appointments!.map((a) => a.done), [true]);
  assert.equal(addDays(D1, 0), D1);
});
