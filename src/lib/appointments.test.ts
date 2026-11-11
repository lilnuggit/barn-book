import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addEvery,
  afterVisit,
  appointmentLabel,
  appointmentOrder,
  dayPhrase,
  dueLabel,
  everyAfterLabel,
  everyLabel,
  everyValue,
  formatTime,
  horseRowLines,
  horseVisitRows,
  isEvery,
  nextDueAfter,
  pairVisits,
  parseEveryValue,
  shortHorseList,
  sortHorses,
  soonWindow,
  spokenHorseList,
  visitName,
  visitsBoard,
  whenLabel,
  EVERY_CHOICES,
  type AppointmentLite,
  type AppointmentTypeLite,
} from "./appointments";
import {
  applyAppointmentChanges,
  applyAppointmentTypeChanges,
  waitingAppointmentIds,
  type Change,
} from "./appointment-changes";

const TODAY = "2026-11-10";
const L = "en-US";
const bella = { id: "h-bella", name: "Bella", color: "sage" };
const max = { id: "h-max", name: "Max", color: "sky" };
const pip = { id: "h-pip", name: "Pip", color: "rose" };
const farrier: AppointmentTypeLite = { id: "t-far", name: "Farrier", color: "clay", archived: false, every: { count: 6, unit: "week" } };
const dentist: AppointmentTypeLite = { id: "t-den", name: "Dentist", color: "sky", archived: false, every: { count: 12, unit: "month" } };
const vet: AppointmentTypeLite = { id: "t-vet", name: "Vet", color: "rose", archived: false, every: null };
const pemf: AppointmentTypeLite = { id: "t-pemf", name: "PEMF", color: "indigo", archived: false, every: { count: 1, unit: "week" } };
const TYPES = [farrier, vet, dentist, pemf];

let n = 0;
function appt(p: Partial<AppointmentLite> & { typeId: string; date: string }): AppointmentLite {
  return { id: `a${++n}`, time: null, horses: [bella], note: "", done: false, ...p };
}

describe("reminder arithmetic", () => {
  test("weeks", () => assert.equal(addEvery("2026-09-29", { count: 6, unit: "week" }), "2026-11-10"));
  test("month ends clamp like Postgres", () => {
    assert.equal(addEvery("2026-01-31", { count: 1, unit: "month" }), "2026-02-28");
    assert.equal(addEvery("2026-08-31", { count: 6, unit: "month" }), "2027-02-28");
    assert.equal(addEvery("2024-02-29", { count: 12, unit: "month" }), "2025-02-28");
    assert.equal(addEvery("2027-03-31", { count: 1, unit: "month" }), "2027-04-30");
    assert.equal(addEvery("2027-12-31", { count: 2, unit: "month" }), "2028-02-29");
    assert.equal(addEvery("2026-11-10", { count: 36, unit: "month" }), "2029-11-10");
  });
  test("window: half the gap, two weeks at most", () => {
    assert.equal(soonWindow("2026-11-03", "2026-11-10"), 3); // weekly
    assert.equal(soonWindow("2026-10-27", "2026-11-10"), 7); // fortnightly
    assert.equal(soonWindow("2026-09-29", "2026-11-10"), 14); // 6 weeks
    assert.equal(soonWindow("2025-11-10", "2026-11-10"), 14); // yearly
  });
  test("labels and values", () => {
    assert.deepEqual(
      [null, { count: 1, unit: "week" }, { count: 6, unit: "week" }, { count: 1, unit: "month" }, { count: 12, unit: "month" }, { count: 18, unit: "month" }, { count: 24, unit: "month" }].map((e) =>
        everyLabel(e as never),
      ),
      ["No reminder", "Every week", "Every 6 weeks", "Every month", "Every year", "Every 18 months", "Every 2 years"],
    );
    assert.equal(everyAfterLabel({ count: 6, unit: "week" }), "6 weeks");
    assert.equal(everyAfterLabel({ count: 1, unit: "week" }), "a week");
    assert.equal(everyAfterLabel({ count: 12, unit: "month" }), "a year");
    assert.equal(everyValue({ count: 6, unit: "week" }), "w6");
    assert.deepEqual(parseEveryValue("m12"), { count: 12, unit: "month" });
    assert.equal(parseEveryValue("w53"), null);
    assert.equal(parseEveryValue(""), null);
    assert.ok(EVERY_CHOICES.every(isEvery));
    assert.ok(!isEvery({ count: 0, unit: "week" }) && !isEvery({ count: 37, unit: "month" }) && !isEvery({ count: 2, unit: "day" }));
    assert.ok(!isEvery({ count: 1.5, unit: "week" }) && !isEvery(null) && !isEvery({ count: 6 }));
  });
});

describe("order", () => {
  test("day, untimed first, time, type order, id", () => {
    const list = [
      appt({ id: "x3", typeId: vet.id, date: TODAY, time: "09:00" }),
      appt({ id: "x1", typeId: dentist.id, date: TODAY }),
      appt({ id: "x2", typeId: farrier.id, date: TODAY }),
      appt({ id: "x0", typeId: farrier.id, date: "2026-11-09", time: "18:00" }),
      appt({ id: "x4", typeId: farrier.id, date: TODAY, time: "08:30" }),
    ];
    assert.deepEqual([...list].sort(appointmentOrder(TYPES)).map((a) => a.id), ["x0", "x2", "x1", "x4", "x3"]);
  });
});

describe("one horse and one type", () => {
  test("no reminder: no state, but last and next", () => {
    const p = pairVisits([appt({ typeId: vet.id, date: "2026-10-01", done: true }), appt({ typeId: vet.id, date: "2026-11-20" })], vet, TODAY);
    assert.equal(p.state, null);
    assert.equal(p.last?.date, "2026-10-01");
    assert.equal(p.next?.date, "2026-11-20");
  });
  test("never: nothing checked off", () => {
    assert.equal(pairVisits([], farrier, TODAY).state, "never");
  });
  test("due today after exactly 6 weeks", () => {
    const p = pairVisits([appt({ typeId: farrier.id, date: "2026-09-29", done: true })], farrier, TODAY);
    assert.deepEqual([p.state, p.due, p.daysLeft], ["due", TODAY, 0]);
  });
  test("overdue, ok, and the edge of the window", () => {
    assert.equal(pairVisits([appt({ typeId: farrier.id, date: "2026-09-20", done: true })], farrier, TODAY).state, "overdue");
    // due Nov 24 = 14 days: still "due"; Nov 25 = 15 days: "ok"
    assert.equal(pairVisits([appt({ typeId: farrier.id, date: "2026-10-13", done: true })], farrier, TODAY).state, "due");
    assert.equal(pairVisits([appt({ typeId: farrier.id, date: "2026-10-14", done: true })], farrier, TODAY).state, "ok");
  });
  test("weekly isn't due the day after a visit", () => {
    assert.equal(pairVisits([appt({ typeId: pemf.id, date: "2026-11-09", done: true })], pemf, TODAY).state, "ok");
    assert.equal(pairVisits([appt({ typeId: pemf.id, date: "2026-11-06", done: true })], pemf, TODAY).state, "due");
  });
  test("booked wins (today counts), even over a past unticked one", () => {
    const list = [
      appt({ typeId: farrier.id, date: "2026-08-01", done: true }),
      appt({ typeId: farrier.id, date: "2026-11-01" }),
      appt({ typeId: farrier.id, date: TODAY }),
    ];
    const p = pairVisits(list, farrier, TODAY);
    assert.equal(p.state, "booked");
    assert.equal(p.next?.date, TODAY);
  });
  test("a past visit not checked off asks, rather than overdue", () => {
    const list = [appt({ typeId: farrier.id, date: "2026-08-01", done: true }), appt({ typeId: farrier.id, date: "2026-11-08" })];
    const p = pairVisits(list, farrier, TODAY);
    assert.equal(p.state, "unticked");
    assert.equal(p.unticked?.date, "2026-11-08");
  });
  test("an unticked one on or before the last visit changes nothing", () => {
    const list = [appt({ typeId: farrier.id, date: "2026-10-01" }), appt({ typeId: farrier.id, date: "2026-10-01", done: true })];
    const p = pairVisits(list, farrier, TODAY);
    assert.equal(p.unticked, null);
    assert.equal(p.state, "due"); // due Nov 12, within the two-week window
  });
  test("unticked with no last visit", () => {
    assert.equal(pairVisits([appt({ typeId: farrier.id, date: "2026-11-01" })], farrier, TODAY).state, "unticked");
  });
  test("archived type or horse: no state", () => {
    const list = [appt({ typeId: farrier.id, date: "2026-01-01", done: true })];
    assert.equal(pairVisits(list, { ...farrier, archived: true }, TODAY).state, null);
    assert.equal(pairVisits(list, farrier, TODAY, true).state, null);
  });
  test("a done visit dated ahead (another time zone) just pushes the due date", () => {
    const p = pairVisits([appt({ typeId: farrier.id, date: "2026-11-11", done: true })], farrier, TODAY);
    assert.equal(p.due, "2026-12-23");
    assert.equal(p.state, "ok");
  });
  test("last: the latest checked off, whatever order they come in", () => {
    const list = [
      appt({ typeId: farrier.id, date: "2026-10-01", done: true, time: "09:00" }),
      appt({ typeId: farrier.id, date: "2026-10-01", done: true }),
      appt({ typeId: farrier.id, date: "2026-08-01", done: true }),
    ];
    assert.equal(pairVisits(list, farrier, TODAY).last?.time, "09:00");
  });
});

describe("the Visits screen", () => {
  const list = [
    appt({ id: "f1", typeId: farrier.id, date: "2026-09-20", done: true, horses: [bella, max] }), // both overdue (due Nov 1)
    appt({ id: "f2", typeId: farrier.id, date: "2026-11-12", horses: [max] }), // Max booked
    appt({ id: "d1", typeId: dentist.id, date: "2025-11-12", done: true, horses: [bella] }), // Bella due Nov 12 (2 days)
    appt({ id: "v1", typeId: vet.id, date: "2026-11-09", time: "10:30", horses: [pip] }), // to check off
    appt({ id: "v2", typeId: vet.id, date: "2026-10-01", done: true, horses: [pip] }),
    appt({ id: "v3", typeId: vet.id, date: TODAY, done: true, horses: [pip] }),
  ];
  const board = visitsBoard({ appointments: list, types: TYPES, horses: [pip, max, bella] }, TODAY);
  test("to check off: past, not done, newest first", () => assert.deepEqual(board.toCheck.map((a) => a.id), ["v1"]));
  test("due groups in Settings order, most overdue first", () => {
    assert.deepEqual(
      board.due.map((g) => [g.type.name, g.rows.map((r) => `${r.horse.name}:${r.state}:${r.daysLeft}`)]),
      [
        ["Farrier", ["Bella:overdue:-9"]],
        ["Dentist", ["Bella:due:2"]],
      ],
    );
    assert.equal(board.dueCount, 2);
  });
  test("not counted yet: reminder types × horses with no visit checked off", () => {
    assert.deepEqual(
      board.notCounted.map((g) => [g.type.name, g.horses.map((h) => h.name)]),
      [
        ["Farrier", ["Pip"]],
        ["Dentist", ["Max", "Pip"]],
        ["PEMF", ["Bella", "Max", "Pip"]],
      ],
    );
    assert.ok(board.remindersSet && board.anyTracked);
  });
  test("coming up: today on, done or not; done: before today, newest first", () => {
    assert.deepEqual(board.comingUp.map((a) => a.id), ["v3", "f2"]);
    assert.deepEqual(board.done.map((a) => a.id), ["v2", "f1", "d1"]);
  });
  test("day one: reminders set, nothing counted", () => {
    const b = visitsBoard({ appointments: [], types: TYPES, horses: [bella] }, TODAY);
    assert.ok(b.remindersSet && !b.anyTracked && b.dueCount === 0);
  });
  test("archived horses aren't passed in, archived types are skipped", () => {
    const b = visitsBoard({ appointments: list, types: [{ ...farrier, archived: true }, dentist], horses: [bella] }, TODAY);
    assert.deepEqual(b.due.map((g) => g.type.name), ["Dentist"]);
  });
});

describe("a horse's page", () => {
  const list = [
    appt({ typeId: farrier.id, date: "2026-09-20", done: true, horses: [bella, max] }),
    appt({ typeId: farrier.id, date: "2026-11-18", time: "09:30", horses: [bella] }),
    appt({ typeId: dentist.id, date: "2025-08-01", done: true, horses: [bella] }),
    appt({ typeId: vet.id, date: "2026-11-03", horses: [bella] }),
  ];
  const { rows, none } = horseVisitRows(list, TYPES, { id: bella.id, archived: false }, TODAY);
  test("rows per type with any visit, in order; the rest listed", () => {
    assert.deepEqual(rows.map((r) => r.type.name), ["Farrier", "Vet", "Dentist"]);
    assert.deepEqual(none.map((t) => t.name), ["PEMF"]);
  });
  test("lines", () => {
    assert.deepEqual(
      rows.map((r) => horseRowLines(r, TODAY, L)),
      [
        { top: "Booked for Wed, Nov 18 · 9:30 AM", tone: "quiet", bottom: "Last visit 7 weeks ago" },
        { top: "Not checked off · Tue, Nov 3", tone: "quiet", bottom: "No visit checked off yet" },
        { top: "Overdue since Aug 1", tone: "danger", bottom: "Last visit Aug 1, 2025" },
      ],
    );
  });
  test("archived horse: last and next only", () => {
    const r = horseVisitRows(list, TYPES, { id: max.id, archived: true }, TODAY).rows;
    assert.deepEqual(horseRowLines(r[0]!, TODAY, L).top, "Nothing booked");
  });
});

describe("words", () => {
  test("due labels at each threshold", () => {
    const at = (d: number) => dueLabel(new Date(Date.UTC(2026, 10, 10 + d)).toISOString().slice(0, 10), TODAY, L).text;
    assert.deepEqual(
      [-1, -13, -14, -59, -60, 0, 1, 13, 14].map(at),
      ["1 day overdue", "13 days overdue", "2 weeks overdue", "8 weeks overdue", "Overdue since Sep 11", "Due today", "Due tomorrow", "Due in 13 days", "Due Nov 24"],
    );
    assert.equal(dueLabel("2027-01-05", TODAY, L).text, "Due Jan 5, 2027");
  });
  test("times never shift, and follow the locale", () => {
    assert.equal(formatTime("09:30", "en-US"), "9:30 AM");
    assert.equal(formatTime("21:05", "en-GB"), "21:05");
    assert.equal(formatTime("00:00", "en-US"), "12:00 AM");
  });
  test("day phrases", () => {
    assert.deepEqual(
      ["2026-11-10", "2026-11-11", "2026-11-09", "2026-11-18", "2027-01-05"].map((d) => dayPhrase(d, TODAY, L)),
      ["today", "tomorrow", "yesterday", "Wed, Nov 18", "Tue, Jan 5, 2027"],
    );
    const a = appt({ typeId: farrier.id, date: "2026-11-18", time: "08:00" });
    assert.equal(whenLabel(a, TODAY, L, true), "Wed, Nov 18 · 8:00 AM");
    assert.equal(whenLabel(a, TODAY, L, false), "8:00 AM");
    assert.equal(whenLabel({ ...a, time: null }, TODAY, L, false), "");
  });
  test("names", () => {
    assert.equal(visitName("Farrier"), "Farrier visit");
    assert.equal(visitName("Vet visit"), "Vet visit");
    assert.equal(shortHorseList([bella, max, pip, { ...pip, id: "x", name: "Rio" }, { ...pip, id: "y", name: "Zed" }]), "Bella, Max, Pip +2");
    assert.equal(spokenHorseList([bella, max, pip], L), "Bella, Max, and Pip");
    assert.equal(appointmentLabel({ typeId: farrier.id, date: "2026-11-18" }, TYPES, L), "Farrier visit on Wed, Nov 18");
    assert.equal(nextDueAfter(appt({ typeId: farrier.id, date: TODAY }), farrier), "2026-12-22");
    assert.equal(nextDueAfter(appt({ typeId: vet.id, date: TODAY }), vet), null);
  });
});

describe("changes layered on screen", () => {
  const base = appt({ id: "A", typeId: farrier.id, date: TODAY, horses: [bella, max] });
  const meta = (a: AppointmentLite) => ({ appointment: a, label: "Farrier visit on Tue, Nov 10" });
  const ch = (name: string, args: unknown[], m?: unknown): Change => ({ name, args, meta: m });
  const onDay = (d: string) => (a: AppointmentLite) => a.date === d;

  test("nothing to do: same array", () => {
    const list = [base];
    assert.equal(applyAppointmentChanges(list, [ch("saveEntryNote", ["x", "y"])]), list);
    assert.equal(applyAppointmentChanges(list, [ch("createAppointment", [{ id: "A" }], meta(base))]), list);
    assert.equal(applyAppointmentChanges(list, [ch("updateAppointment", [{ id: "A" }], meta(base))]), list);
  });
  test("create shows on its day only", () => {
    const b = appt({ id: "B", typeId: vet.id, date: "2026-11-11" });
    assert.deepEqual(applyAppointmentChanges([], [ch("createAppointment", [{ id: "B" }], meta(b))], onDay(TODAY)), []);
    assert.deepEqual(applyAppointmentChanges([], [ch("createAppointment", [{ id: "B" }], meta(b))], onDay("2026-11-11")), [b]);
  });
  test("an edit moving a visit leaves one day and joins the other; it keeps the list's done", () => {
    const moved = { ...base, date: "2026-11-12", done: false };
    const c = ch("updateAppointment", [{ id: "A" }], meta(moved));
    assert.deepEqual(applyAppointmentChanges([{ ...base, done: true }], [c], onDay(TODAY)), []);
    assert.deepEqual(applyAppointmentChanges([], [c], onDay("2026-11-12")), [moved]);
    assert.equal(applyAppointmentChanges([{ ...base, done: true }], [c])[0]!.done, true);
  });
  test("check-off: in the list, or added from meta when it belongs", () => {
    const tick = ch("setAppointmentDone", ["A", true], meta({ ...base, done: true }));
    assert.equal(applyAppointmentChanges([base], [tick])[0]!.done, true);
    assert.deepEqual(applyAppointmentChanges([], [tick], onDay(TODAY)), [{ ...base, done: true }]);
    assert.deepEqual(applyAppointmentChanges([], [tick], onDay("2026-11-11")), []);
  });
  test("tick, edit, untick ends not done with the edit kept", () => {
    const edited = { ...base, note: "fronts only", done: true };
    const out = applyAppointmentChanges(
      [base],
      [ch("setAppointmentDone", ["A", true], meta({ ...base, done: true })), ch("updateAppointment", [{ id: "A" }], meta(edited)), ch("setAppointmentDone", ["A", false], meta({ ...edited, done: false }))],
    );
    assert.deepEqual(out, [{ ...base, note: "fronts only", done: false }]);
  });
  test("horse renamed or deleted", () => {
    const renamed = applyAppointmentChanges([base], [ch("updateHorse", [{ id: bella.id, name: " Belle ", color: "plum", notes: "" }])]);
    assert.deepEqual(renamed[0]!.horses[0], { id: bella.id, name: "Belle", color: "plum" });
    const solo = appt({ id: "S", typeId: vet.id, date: TODAY, horses: [max] });
    const out = applyAppointmentChanges([base, solo], [ch("deleteHorse", [max.id])]);
    assert.deepEqual(out.map((a) => [a.id, a.horses.map((h) => h.name)]), [["A", ["Bella"]]]);
  });
  test("every change applied twice equals once", () => {
    const changes: Change[] = [
      ch("createAppointment", [{ id: "B" }], meta(appt({ id: "B", typeId: vet.id, date: TODAY }))),
      ch("updateAppointment", [{ id: "A" }], meta({ ...base, time: "09:00" })),
      ch("setAppointmentDone", ["A", true], meta({ ...base, done: true })),
      ch("deleteAppointment", ["B"]),
      ch("updateHorse", [{ id: max.id, name: "Maxi", color: "sky" }]),
      ch("deleteHorse", [bella.id]),
    ];
    for (const c of changes) {
      const once = applyAppointmentChanges([base], [c], onDay(TODAY));
      assert.deepEqual(applyAppointmentChanges(once, [c], onDay(TODAY)), once, c.name);
    }
  });
  test("types: added, edited, archived, moved; twice equals once", () => {
    const changes: Change[] = [
      ch("createAppointmentType", [{ id: "t-new", name: " Physio ", color: "amber", every: { count: 4, unit: "week" } }]),
      ch("updateAppointmentType", [{ id: vet.id, name: "Vet", color: "rose", every: { count: 12, unit: "month" } }]),
      ch("setAppointmentTypeArchived", [pemf.id, true]),
      ch("reorderAppointmentTypes", [["t-new", dentist.id, farrier.id, vet.id, pemf.id]]),
    ];
    const once = applyAppointmentTypeChanges(TYPES, changes);
    assert.deepEqual(once.map((t) => [t.name, t.archived, everyLabel(t.every)]), [
      ["Physio", false, "Every 4 weeks"],
      ["Dentist", false, "Every year"],
      ["Farrier", false, "Every 6 weeks"],
      ["Vet", false, "Every year"],
      ["PEMF", true, "Every week"],
    ]);
    assert.equal(applyAppointmentTypeChanges(once, changes), once);
    assert.equal(applyAppointmentTypeChanges(TYPES, [ch("updateAppointmentType", [{ ...farrier }])]), TYPES);
  });
  test("Not synced yet: only when stuck, only visits", () => {
    const pending = [
      ch("createAppointment", [{ id: "A" }]),
      ch("setAppointmentDone", ["B", true]),
      ch("setEntryStatus", ["E", "done"]),
      ch("setAppointmentTypeArchived", ["T", true]),
    ];
    assert.deepEqual([...waitingAppointmentIds(pending, true)], ["A", "B"]);
    assert.equal(waitingAppointmentIds(pending, false).size, 0);
  });
});

describe("after a visit (Book the next one, the check-off toast)", () => {
  const far: AppointmentTypeLite = { id: "far", name: "Farrier", color: "clay", archived: false, every: { count: 6, unit: "week" } };
  const H1 = { id: "h1", name: "Bella", color: "sage" };
  const H2 = { id: "h2", name: "Max", color: "sky" };
  const v = (id: string, date: string, done: boolean, horses = [H1, H2], typeId = "far"): AppointmentLite => ({
    id, typeId, date, time: null, horses, note: "", done,
  });
  const inWork = new Set(["h1", "h2"]);
  const T0 = "2026-11-10";
  test("the last visit, nothing booked since: book for both, due 6 weeks on", () => {
    const a = v("a", "2026-11-10", true);
    const r = afterVisit(a, far, [a], inWork, T0);
    assert.deepEqual(r.bookFor.map((h) => h.id), ["h1", "h2"]);
    assert.equal(r.due, "2026-12-22");
    assert.equal(r.booked, null);
    assert.equal(r.isLast, true);
  });
  test("the next one booked: nothing to book, and the booking is found", () => {
    const a = v("a", "2026-11-10", true);
    const b = v("b", "2026-12-22", false);
    const r = afterVisit(a, far, [a, b], inWork, T0);
    assert.deepEqual(r.bookFor, []);
    assert.equal(r.booked?.id, "b");
    assert.equal(r.isLast, true);
  });
  test("booked for one horse only: book for the other", () => {
    const a = v("a", "2026-11-10", true);
    const b = v("b", "2026-12-20", false, [H1]);
    const r = afterVisit(a, far, [a, b], inWork, T0);
    assert.deepEqual(r.bookFor.map((h) => h.id), ["h2"]);
    assert.equal(r.booked?.id, "b");
  });
  test("a later visit checked off: this isn't the one due dates count from", () => {
    const old = v("old", "2026-10-06", true);
    const later = v("later", "2026-10-20", true);
    const r = afterVisit(old, far, [old, later], inWork, T0);
    assert.equal(r.isLast, false);
    assert.deepEqual(r.bookFor, []);
  });
  test("other types and horses not in work don't count", () => {
    const a = v("a", "2026-11-10", true);
    const vet = v("vet", "2026-12-01", false, [H1, H2], "vet");
    const r = afterVisit(a, far, [a, vet], new Set(["h1"]), T0);
    assert.deepEqual(r.bookFor.map((h) => h.id), ["h1"]);
    assert.equal(r.booked, null);
  });
  test("a later visit not checked off (to check off) counts as booked, not to book again", () => {
    const a = v("a", "2026-09-29", true);
    const b = v("b", "2026-11-09", false);
    const r = afterVisit(a, far, [a, b], inWork, T0);
    assert.deepEqual(r.bookFor, []);
    assert.equal(r.booked?.id, "b");
  });
  test("no reminder: no due date", () => {
    const a = v("a", "2026-11-10", true);
    assert.equal(afterVisit(a, { ...far, every: null }, [a], inWork, T0).due, null);
  });
});

describe("a visit's horses in order", () => {
  test("by name for the language, then id", () => {
    const hs = [
      { id: "2", name: "Zed", color: "sage" },
      { id: "3", name: "Émile", color: "sage" },
      { id: "1", name: "duke", color: "sage" },
      { id: "0", name: "Duke", color: "sage" },
    ];
    assert.deepEqual(sortHorses(hs, "en-US").map((h) => h.id), ["0", "1", "3", "2"]);
  });
});

describe("after a visit: same day, and horses not known", () => {
  const far: AppointmentTypeLite = { id: "far", name: "Farrier", color: "clay", archived: false, every: { count: 6, unit: "week" } };
  const H1 = { id: "h1", name: "Bella", color: "sage" };
  const H2 = { id: "h2", name: "Max", color: "sky" };
  const inWork = new Set(["h1", "h2"]);
  test("a booking later the same past day, never checked off, isn't the next one (as Due sees it)", () => {
    const done: AppointmentLite = { id: "d", typeId: "far", date: "2026-10-06", time: "09:00", horses: [H1], note: "", done: true };
    const leftover: AppointmentLite = { id: "l", typeId: "far", date: "2026-10-06", time: "14:00", horses: [H1], note: "", done: false };
    const r = afterVisit(done, far, [done, leftover], inWork, "2026-11-10");
    assert.deepEqual(r.bookFor.map((h) => h.id), ["h1"]);
    assert.equal(r.booked, null);
    const p = pairVisits([done, leftover], far, "2026-11-10");
    assert.equal(p.unticked, null);
  });
  test("today: a later booking today is the next one", () => {
    const done: AppointmentLite = { id: "d", typeId: "far", date: "2026-11-10", time: "09:00", horses: [H1], note: "", done: true };
    const later: AppointmentLite = { id: "l", typeId: "far", date: "2026-11-10", time: "14:00", horses: [H1], note: "", done: false };
    const r = afterVisit(done, far, [done, later], inWork, "2026-11-10");
    assert.deepEqual(r.bookFor, []);
    assert.equal(r.booked?.id, "l");
  });
  test("a horse whose visits aren't all known is left out", () => {
    const a: AppointmentLite = { id: "a", typeId: "far", date: "2026-11-10", time: null, horses: [H1, H2], note: "", done: true };
    const r = afterVisit(a, far, [a], inWork, "2026-11-10", (id) => id === "h1");
    assert.deepEqual(r.bookFor.map((h) => h.id), ["h1"]);
    const none = afterVisit(a, far, [a], inWork, "2026-11-10", () => false);
    assert.deepEqual(none.bookFor, []);
    assert.equal(none.isLast, false);
  });
});

test("after a visit: the horses it couldn't tell about are reported", () => {
  const far: AppointmentTypeLite = { id: "far", name: "Farrier", color: "clay", archived: false, every: { count: 6, unit: "week" } };
  const H1 = { id: "h1", name: "Bella", color: "sage" };
  const H2 = { id: "h2", name: "Max", color: "sky" };
  const a: AppointmentLite = { id: "a", typeId: "far", date: "2026-11-10", time: null, horses: [H1, H2], note: "", done: true };
  const b: AppointmentLite = { id: "b", typeId: "far", date: "2026-11-20", time: null, horses: [H1], note: "", done: false };
  const r = afterVisit(a, far, [a, b], new Set(["h1", "h2"]), "2026-11-10", (id) => id === "h1");
  assert.deepEqual(r.bookFor, []);
  assert.equal(r.booked?.id, "b");
  assert.deepEqual(r.unknown.map((h) => h.id), ["h2"]);
});

