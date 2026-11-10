"use client";

import { ArrowDown, ArrowUp, ChevronRight, CloudOff, Plus } from "lucide-react";
import { useOffline } from "next/offline";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyncResult } from "@/lib/action-result";
import type { ActivityLite } from "@/lib/data";
import { PALETTE } from "@/lib/palette";
import { forgetConfirmedBefore, run, useOverlayWrites, usePendingWrites, type OutboxItem } from "@/lib/sync";
import { ColorPicker } from "../color-picker";
import { Sheet, SheetError } from "../sheet";
import { SAVED_OFFLINE, SAVED_ON_PHONE, useStopWaiting } from "../sheet-save";
import { toast } from "../toast";
import { ActivityChip, cx, SectionTitle } from "../ui";

// Every change here is stored on the phone first and shown straight away
// (layered over the server's list), then sent in order with everything else.

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";

const PENDING_PREFIX = "pending:";

function report(result: SyncResult, done?: string) {
  if (result.ok) {
    if (done) toast(done);
  } else if (result.reason === "invalid") {
    toast(result.error);
  }
}

/** Layers work-type changes still waiting on the phone over the server's list. */
function applyPending(list: ActivityLite[], pending: OutboxItem[]): ActivityLite[] {
  let out = list;
  for (const item of pending) {
    const [first, second] = item.args as [unknown, unknown];
    switch (item.name) {
      case "updateActivityType": {
        const p = first as { id: string; name: string; color: string };
        out = out.map((a) => (a.id === p.id ? { ...a, name: p.name.trim() || a.name, color: p.color } : a));
        break;
      }
      case "setActivityArchived":
        out = out.map((a) => (a.id === first ? { ...a, archived: second as boolean } : a));
        break;
      case "reorderActivityTypes": {
        const rank = new Map((first as string[]).map((id, i) => [id, i]));
        out = [...out].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
        break;
      }
      case "createActivityType": {
        const p = first as { name: string; color: string };
        const name = p.name.trim();
        const match = out.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (match) {
          // An archived one with that name comes back (that's what the server
          // does); an active one stays as it is (the server will say so).
          if (match.archived) out = out.map((a) => (a === match ? { ...a, archived: false, color: p.color } : a));
        } else {
          out = [...out, { id: `${PENDING_PREFIX}${item.id}`, name, color: p.color, archived: false }];
        }
        break;
      }
    }
  }
  return out;
}

export function ActivityManager({ activities: serverActivities }: { activities: ActivityLite[] }) {
  const overlay = useOverlayWrites();
  const pending = usePendingWrites();
  const activities = useMemo(() => applyPending(serverActivities, overlay), [serverActivities, overlay]);
  // Added here but not in the page's list yet: still on the phone, or just
  // confirmed (the list refreshes once the other saves have gone out).
  const unsynced = useMemo(() => new Set(pending.map((i) => `${PENDING_PREFIX}${i.id}`)), [pending]);
  useEffect(() => forgetConfirmedBefore(Date.now()), [serverActivities]);
  const active = activities.filter((a) => !a.archived);
  const archived = activities.filter((a) => a.archived);
  // Ones added but not synced yet can't be moved (they have no id yet).
  const movable = active.filter((a) => !a.id.startsWith(PENDING_PREFIX));
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  function move(id: string, by: -1 | 1) {
    const next = [...movable];
    const at = next.findIndex((a) => a.id === id);
    const [item] = next.splice(at, 1);
    next.splice(Math.max(0, Math.min(next.length, at + by)), 0, item!);
    void run("reorderActivityTypes", [next.map((a) => a.id)], { key: "activity-order" }).then((r) => report(r));
  }

  function restore(a: ActivityLite) {
    void run("setActivityArchived", [a.id, false], { key: `activity-archive:${a.id}` }).then((r) =>
      report(r, `${a.name} is back on the list`),
    );
  }

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
        Types of work
      </SectionTitle>
      <ul className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
        {active.map((a) => {
          const fresh = a.id.startsWith(PENDING_PREFIX);
          const place = movable.indexOf(a);
          return (
            <li key={a.id} className="flex items-center border-b border-line last:border-b-0">
              {fresh ? (
                // Can't be edited or moved until it has its id from the server.
                <div className="flex min-h-[3.25rem] w-full items-center justify-between px-4 py-3">
                  <ActivityChip name={a.name} color={a.color} size="md" />
                  {unsynced.has(a.id) && (
                    <span className="flex items-center gap-1 text-xs font-medium text-ink-3">
                      <CloudOff className="size-3.5" aria-hidden /> Not synced yet
                    </span>
                  )}
                </div>
              ) : reordering ? (
                <div className="flex w-full items-center justify-between py-1 pr-1 pl-4">
                  <ActivityChip name={a.name} color={a.color} size="md" />
                  <div className="flex">
                    <button
                      type="button"
                      aria-label={`Move ${a.name} up`}
                      disabled={place === 0}
                      onClick={() => move(a.id, -1)}
                      className="grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                    >
                      <ArrowUp className="size-5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${a.name} down`}
                      disabled={place === movable.length - 1}
                      onClick={() => move(a.id, 1)}
                      className="grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                    >
                      <ArrowDown className="size-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(a.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-surface-2"
                >
                  <ActivityChip name={a.name} color={a.color} size="md" />
                  <ChevronRight className="size-5 text-ink-3" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
        <li>
          <AddActivityRow nextColor={PALETTE[active.length % PALETTE.length]} existing={activities} />
        </li>
      </ul>
      <p className="mt-2 px-1 text-sm text-ink-3">
        These are the choices when you plan a day. Archiving one hides it but keeps it on past entries.
      </p>

      {archived.length > 0 && (
        <div className="mt-5">
          <SectionTitle>Archived work</SectionTitle>
          <ul className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-line pr-1 pl-4 last:border-b-0">
                <ActivityChip name={a.name} color={a.color} size="md" muted />
                <button
                  type="button"
                  onClick={() => restore(a)}
                  className="min-h-11 rounded-full px-3 text-[15px] font-semibold text-brand"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditActivitySheet
        activity={activities.find((a) => a.id === editing) ?? null}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function AddActivityRow({ nextColor, existing }: { nextColor: string; existing: ActivityLite[] }) {
  const offline = useOffline();
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Checked here, not by the server: adding a name that's already there is
    // a no-op on the server, so a save that's sent twice can't fail.
    const same = existing.find((a) => a.name.toLowerCase() === trimmed.toLowerCase());
    if (same && !same.archived) {
      toast(`“${same.name}” is already on the list`);
      return;
    }
    // Clearing the box is what stops a double tap from adding it twice.
    const sending = run("createActivityType", [{ name: trimmed, color: nextColor }], {
      key: `activity-new:${trimmed.toLowerCase()}`,
    });
    setName(""); // it shows in the list straight away
    if (offline) toast(`${trimmed}: ${SAVED_OFFLINE.toLowerCase()}`);
    void sending.then((result) => {
      if (result.ok) toast(same ? `${same.name} is back on the list` : `Added ${trimmed}`);
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
        placeholder="Add a type of work"
        aria-label="New type of work"
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

function EditActivitySheet({ activity, onClose }: { activity: ActivityLite | null; onClose: () => void }) {
  const offline = useOffline();
  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");
  const [error, setError] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [startedFrom, setStartedFrom] = useState({ name: "", color: "slate" });
  // Each opening is a session; a save that lands after its sheet closed must
  // not close or change the one that's open now.
  const [openSession, setOpenSession] = useState(0);
  const [busySession, setBusySession] = useState<number | null>(null);
  const session = useRef(0);
  const busy = busySession !== null && busySession === openSession;

  // Start from the tapped work type (including any change not synced yet)
  // each time the sheet opens.
  if (activity && activity.id !== shownId) {
    setShownId(activity.id);
    setName(activity.name);
    setColor(activity.color);
    setStartedFrom({ name: activity.name, color: activity.color });
    setError(null);
    setOpenSession((n) => n + 1);
  }
  if (!activity && shownId !== null) {
    setShownId(null);
    setOpenSession((n) => n + 1);
  }
  useEffect(() => {
    session.current = openSession;
  }, [openSession]);

  const dirty = activity !== null && (name !== startedFrom.name || color !== startedFrom.color);

  function close(message = SAVED_ON_PHONE) {
    if (busy) toast(message);
    onClose();
  }
  useStopWaiting(busy, offline, () => close(offline ? SAVED_OFFLINE : SAVED_ON_PHONE));

  function submit(sending: Promise<SyncResult>, done?: string) {
    const s = openSession;
    const was = activity?.name ?? "";
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
    if (!activity || !name.trim() || busy) return;
    submit(run("updateActivityType", [{ id: activity.id, name, color }], { key: `activity-edit:${activity.id}` }));
  }

  function archive() {
    if (!activity || busy) return;
    submit(
      run("setActivityArchived", [activity.id, true], { key: `activity-archive:${activity.id}` }),
      `${activity.name} archived`,
    );
  }

  return (
    <Sheet
      open={activity !== null}
      onClose={close}
      title="Edit work type"
      onSave={save}
      saveLabel={busy ? "Saving…" : "Save"}
      saveDisabled={!name.trim() || busy}
      dirty={dirty}
      busy={busy}
    >
      {activity && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <fieldset disabled={busy} className="space-y-5">
            <SheetError message={error} />
            <div>
              <label
                htmlFor="activity-name"
                className="mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase"
              >
                Name
              </label>
              <input
                id="activity-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                enterKeyHint="done"
                className={inputClass}
              />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Color</p>
              <ColorPicker value={color} onChange={setColor} label="Work color" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <ActivityChip name={name.trim() || "Preview"} color={color} size="md" />
            </div>
            <button
              type="button"
              onClick={archive}
              className="min-h-11 w-full rounded-2xl text-[16px] font-semibold text-danger ring-1 ring-line active:bg-danger-soft"
            >
              Archive this work type
            </button>
          </fieldset>
        </form>
      )}
    </Sheet>
  );
}
