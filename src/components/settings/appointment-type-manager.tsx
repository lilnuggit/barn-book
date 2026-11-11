"use client";

import { ArrowDown, ArrowUp, ChevronRight, CloudOff, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SyncResult } from "@/lib/action-result";
import { applyAppointmentTypeChanges, waitingAppointmentTypeIds } from "@/lib/appointment-changes";
import {
  EVERY_CHOICES,
  everyLabel,
  everyValue,
  parseEveryValue,
  type AppointmentTypeLite,
  type Every,
} from "@/lib/appointments";
import { PALETTE } from "@/lib/palette";
import { forgetConfirmedBefore, run, useNoSignal, useOverlayWrites, usePendingWrites, useSyncStuck } from "@/lib/sync";
import { ColorPicker } from "../color-picker";
import { Sheet, SheetError } from "../sheet";
import { SAVED_OFFLINE, SAVED_ON_PHONE, useStopWaiting } from "../sheet-save";
import { toast } from "../toast";
import { ActivityChip, cx, SectionTitle } from "../ui";

// Like the types of work, but the phone chooses each type's id: one added
// with no signal can be edited, moved and booked at once.

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";
const LABEL = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase";
const TAKEN = "Another type of visit already has that name";

function report(result: SyncResult, done?: string) {
  if (result.ok) {
    if (done) toast(done);
  } else if (result.reason === "invalid") {
    toast(result.error);
  }
}

export function AppointmentTypeManager({ types: serverTypes }: { types: AppointmentTypeLite[] }) {
  const overlay = useOverlayWrites();
  const pending = usePendingWrites();
  const offline = useNoSignal();
  const stuck = useSyncStuck();
  const types = useMemo(() => applyAppointmentTypeChanges(serverTypes, overlay), [serverTypes, overlay]);
  const waiting = useMemo(() => waitingAppointmentTypeIds(pending, offline || stuck), [pending, offline, stuck]);
  useEffect(() => forgetConfirmedBefore(Date.now()), [serverTypes]);
  const active = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  function move(id: string, by: -1 | 1) {
    const next = [...active];
    const at = next.findIndex((t) => t.id === id);
    const [item] = next.splice(at, 1);
    next.splice(Math.max(0, Math.min(next.length, at + by)), 0, item!);
    // Archived ones keep their places after the active ones.
    void run("reorderAppointmentTypes", [[...next, ...archived].map((t) => t.id)], {
      key: "appt-type-order",
      replaceInPlace: false,
    }).then((r) => report(r));
  }

  function restore(t: AppointmentTypeLite) {
    void run("setAppointmentTypeArchived", [t.id, false], {
      key: `appt-type-archive:${t.id}`,
      replaceInPlace: false,
    }).then((r) => report(r, `${t.name} is back on the list`));
  }

  const notSynced = (
    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-3">
      <CloudOff className="size-3.5" aria-hidden /> Not synced yet
    </span>
  );

  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => setReordering((r) => !r)}
            className="-my-3 -mr-2 min-h-11 rounded-full px-3 text-[15px] font-semibold text-brand"
          >
            {reordering ? "Done" : "Reorder"}
          </button>
        }
      >
        Types of visit
      </SectionTitle>
      <ul className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
        {active.map((t, place) => (
          <li key={t.id} className="flex items-center border-b border-line last:border-b-0">
            {reordering ? (
              <div className="flex w-full items-center justify-between py-1 pr-1 pl-4">
                <ActivityChip name={t.name} color={t.color} size="md" />
                <div className="flex">
                  <button
                    type="button"
                    aria-label={`Move ${t.name} up`}
                    disabled={place === 0}
                    onClick={() => move(t.id, -1)}
                    className="grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                  >
                    <ArrowUp className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${t.name} down`}
                    disabled={place === active.length - 1}
                    onClick={() => move(t.id, 1)}
                    className="grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                  >
                    <ArrowDown className="size-5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(t.id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left active:bg-surface-2"
              >
                <ActivityChip name={t.name} color={t.color} size="md" />
                <span className="flex min-w-0 items-center gap-2">
                  {waiting.has(t.id) && notSynced}
                  <span className="truncate text-[14px] text-ink-3">{everyLabel(t.every)}</span>
                  <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                </span>
              </button>
            )}
          </li>
        ))}
        <li>
          <AddTypeRow nextColor={PALETTE[active.length % PALETTE.length]} existing={types} />
        </li>
      </ul>
      <p className="mt-2 px-1 text-sm text-ink-3">
        These are the choices when you add a visit. Give one a reminder and Visits shows which horses are due.
        Archiving one hides it but keeps past visits.
      </p>

      {archived.length > 0 && (
        <div className="mt-5">
          <SectionTitle>Archived visit types</SectionTitle>
          <ul className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
            {archived.map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b border-line pr-1 pl-4 last:border-b-0">
                <ActivityChip name={t.name} color={t.color} size="md" muted />
                <span className="flex items-center gap-2">
                  {waiting.has(t.id) && notSynced}
                  <button
                    type="button"
                    onClick={() => restore(t)}
                    className="min-h-11 rounded-full px-3 text-[15px] font-semibold text-brand"
                  >
                    Restore
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditTypeSheet type={types.find((t) => t.id === editing) ?? null} all={types} onClose={() => setEditing(null)} />
    </section>
  );
}

function AddTypeRow({ nextColor, existing }: { nextColor: string; existing: AppointmentTypeLite[] }) {
  const offline = useNoSignal();
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const same = existing.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (same && !same.archived) {
      toast(`“${same.name}” is already on the list`);
      return;
    }
    setName(""); // it shows in the list straight away; clearing it stops a double tap adding it twice
    if (same) {
      void run("setAppointmentTypeArchived", [same.id, false], {
        key: `appt-type-archive:${same.id}`,
        replaceInPlace: false,
      }).then((r) => report(r, `${same.name} is back on the list`));
      return;
    }
    const id = crypto.randomUUID();
    const sending = run("createAppointmentType", [{ id, name: trimmed, color: nextColor, every: null }], {
      key: `appt-type-new:${id}`,
    });
    if (offline) toast(`${trimmed}: ${SAVED_OFFLINE.toLowerCase()}`);
    void sending.then((result) => {
      if (result.ok) toast(`Added ${trimmed}`);
      else if (result.reason === "invalid") toast(`${trimmed}: ${result.error}`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      className="flex items-center gap-2 py-1 pr-1 pl-4"
    >
      <Plus className="size-5 shrink-0 text-ink-3" aria-hidden />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a type of visit"
        aria-label="New type of visit"
        maxLength={60}
        enterKeyHint="done"
        autoCapitalize="words"
        className="min-h-11 min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className={cx(
          "min-h-11 rounded-full px-3 text-[15px] font-semibold text-brand transition-opacity",
          !name.trim() && "opacity-0",
        )}
      >
        Add
      </button>
    </form>
  );
}

function EditTypeSheet({
  type,
  all,
  onClose,
}: {
  type: AppointmentTypeLite | null;
  all: AppointmentTypeLite[];
  onClose: () => void;
}) {
  const offline = useNoSignal();
  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");
  const [every, setEvery] = useState<Every | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [startedFrom, setStartedFrom] = useState({ name: "", color: "slate", every: "" });
  // Each opening is a session; a save that lands after its sheet closed must
  // not close or change the one that's open now.
  const [openSession, setOpenSession] = useState(0);
  const [busySession, setBusySession] = useState<number | null>(null);
  const session = useRef(0);
  const busy = busySession !== null && busySession === openSession;
  const nameId = useId();
  const everyId = useId();

  // Start from the tapped type (including any change not synced yet) each time the sheet opens.
  if (type && type.id !== shownId) {
    setShownId(type.id);
    setName(type.name);
    setColor(type.color);
    setEvery(type.every);
    setStartedFrom({ name: type.name, color: type.color, every: everyValue(type.every) });
    setError(null);
    setOpenSession((n) => n + 1);
  }
  if (!type && shownId !== null) {
    setShownId(null);
    setOpenSession((n) => n + 1);
  }
  useEffect(() => {
    session.current = openSession;
  }, [openSession]);

  const dirty =
    type !== null &&
    (name !== startedFrom.name || color !== startedFrom.color || everyValue(every) !== startedFrom.every);
  // A stored reminder the picker doesn't offer (set elsewhere) is still shown as it is.
  const offered = EVERY_CHOICES.some((e) => everyValue(e) === everyValue(every));

  function close(message = SAVED_ON_PHONE) {
    if (busy) toast(message);
    onClose();
  }
  useStopWaiting(busy, offline, () => close(offline ? SAVED_OFFLINE : SAVED_ON_PHONE));

  function submit(sending: Promise<SyncResult>, done?: string) {
    const s = openSession;
    const was = type?.name ?? "";
    if (offline) {
      onClose();
      toast(SAVED_OFFLINE);
    } else {
      setBusySession(s);
    }
    void sending.then((result) => {
      setBusySession((b) => (b === s ? null : b));
      const stillOpen = !offline && s === session.current;
      if (!result.ok && result.reason === "invalid") {
        // Refused (e.g. the name is taken): in the sheet if it's still open,
        // otherwise as a message, even if it was saved with no signal.
        if (stillOpen) setError(result.error);
        else toast(`${was}: ${result.error}`);
        return;
      }
      // Signed out: the app is going to sign-in. Replaced: a newer save reports.
      if (!result.ok && result.reason !== "failed") return;
      if (stillOpen) {
        onClose();
        toast(result.ok ? (done ?? "Saved") : SAVED_ON_PHONE);
      } else if (result.ok && done) {
        toast(done); // the sheet was closed while it went out: say when it lands
      }
    });
  }

  function save() {
    if (!type || !name.trim() || busy) return;
    const trimmed = name.trim();
    // Only a real rename is checked (as on the server).
    if (
      trimmed.toLowerCase() !== type.name.toLowerCase() &&
      all.some((t) => t.id !== type.id && !t.archived && t.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setError(TAKEN);
      return;
    }
    submit(
      run("updateAppointmentType", [{ id: type.id, name: trimmed, color, every }], {
        key: `appt-type-edit:${type.id}`,
        replaceInPlace: false,
      }),
    );
  }

  function archive() {
    if (!type || busy) return;
    submit(
      run("setAppointmentTypeArchived", [type.id, true], { key: `appt-type-archive:${type.id}`, replaceInPlace: false }),
      `${type.name} archived`,
    );
  }

  return (
    <Sheet
      open={type !== null}
      onClose={close}
      title="Edit visit type"
      onSave={save}
      saveLabel={busy ? "Saving…" : "Save"}
      saveDisabled={!name.trim() || busy}
      dirty={dirty}
      busy={busy}
    >
      {type && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <fieldset disabled={busy} className="space-y-5">
            <SheetError message={error} />
            <div>
              <label htmlFor={nameId} className={LABEL}>
                Name
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error === TAKEN) setError(null);
                }}
                maxLength={60}
                enterKeyHint="done"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={everyId} className={LABEL}>
                Reminder
              </label>
              <select
                id={everyId}
                value={everyValue(every)}
                onChange={(e) => setEvery(parseEveryValue(e.target.value))}
                className={cx(inputClass, "appearance-none text-[16px]")}
              >
                <option value="">No reminder</option>
                {!offered && every && <option value={everyValue(every)}>{everyLabel(every)}</option>}
                <optgroup label="Weeks">
                  {EVERY_CHOICES.filter((e) => e.unit === "week").map((e) => (
                    <option key={everyValue(e)} value={everyValue(e)}>
                      {everyLabel(e)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Months">
                  {EVERY_CHOICES.filter((e) => e.unit === "month").map((e) => (
                    <option key={everyValue(e)} value={everyValue(e)}>
                      {everyLabel(e)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="mt-1.5 px-1 text-[13px] text-ink-3">Counted from each horse’s last visit.</p>
            </div>
            <div>
              <p className={LABEL}>Color</p>
              <ColorPicker value={color} onChange={setColor} label="Visit type color" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <ActivityChip name={name.trim() || "Preview"} color={color} size="md" />
            </div>
            <button
              type="button"
              onClick={archive}
              className="min-h-11 w-full rounded-2xl text-[16px] font-semibold text-danger ring-1 ring-line active:bg-danger-soft"
            >
              Archive this visit type
            </button>
          </fieldset>
        </form>
      )}
    </Sheet>
  );
}
