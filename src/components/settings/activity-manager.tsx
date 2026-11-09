"use client";

import { ArrowDown, ArrowUp, ChevronRight, Plus } from "lucide-react";
import { useOffline } from "next/offline";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import type { SyncResult } from "@/lib/action-result";
import type { ActivityLite } from "@/lib/data";
import { PALETTE } from "@/lib/palette";
import { run } from "@/lib/sync";
import { ColorPicker } from "../color-picker";
import { Sheet, SheetError } from "../sheet";
import { toast } from "../toast";
import { ActivityChip, cx, SectionTitle } from "../ui";

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";

function problem(result: SyncResult): string | null {
  if (result.ok) return null;
  if (result.reason === "invalid") return result.error;
  if (result.reason === "failed") return "Couldn’t reach the server — please try again.";
  return null; // signed out: the app is taking you to sign in
}

export function ActivityManager({ activities }: { activities: ActivityLite[] }) {
  const active = activities.filter((a) => !a.archived);
  const archived = activities.filter((a) => a.archived);
  const [ordered, setOrdered] = useOptimistic(active);
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<ActivityLite | null>(null);
  const [, startTransition] = useTransition();

  function move(index: number, by: -1 | 1) {
    const next = [...ordered];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    startTransition(async () => {
      setOrdered(next);
      const message = problem(await run("reorderActivityTypes", [next.map((a) => a.id)], { persist: false }));
      if (message) toast(message);
    });
  }

  function restore(a: ActivityLite) {
    startTransition(async () => {
      const result = await run("setActivityArchived", [a.id, false], { persist: false });
      const message = problem(result);
      if (message) toast(message);
      else if (result.ok) toast(`${a.name} is back on the list`);
    });
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
        {ordered.map((a, i) => (
          <li key={a.id} className="flex items-center border-b border-line last:border-b-0">
            {reordering ? (
              <div className="flex w-full items-center justify-between py-1 pr-1 pl-4">
                <ActivityChip name={a.name} color={a.color} size="md" />
                <div className="flex">
                  <button
                    type="button"
                    aria-label={`Move ${a.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                  >
                    <ArrowUp className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${a.name} down`}
                    disabled={i === ordered.length - 1}
                    onClick={() => move(i, 1)}
                    className="grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                  >
                    <ArrowDown className="size-5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(a)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-surface-2"
              >
                <ActivityChip name={a.name} color={a.color} size="md" />
                <ChevronRight className="size-5 text-ink-3" aria-hidden />
              </button>
            )}
          </li>
        ))}
        <li>
          <AddActivityRow nextColor={PALETTE[ordered.length % PALETTE.length]} />
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

      <EditActivitySheet activity={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function AddActivityRow({ nextColor }: { nextColor: string }) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    startTransition(async () => {
      const result = await run("createActivityType", [{ name: trimmed, color: nextColor }], { persist: false });
      const message = problem(result);
      if (message) return toast(message);
      if (result.ok) {
        // Keep anything typed since tapping Add.
        setName((n) => (n.trim() === trimmed ? "" : n));
        toast(`Added ${trimmed}`);
      }
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
        disabled={!name.trim() || isPending}
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
  // Each opening is a session; a save that lands after its sheet closed
  // must not close or change the one that's open now.
  const [openSession, setOpenSession] = useState(0);
  const [busySession, setBusySession] = useState<number | null>(null);
  const session = useRef(0);
  const busy = busySession !== null && busySession === openSession;

  // Start from the tapped work type each time the sheet opens.
  if (activity && activity.id !== shownId) {
    setShownId(activity.id);
    setName(activity.name);
    setColor(activity.color);
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

  const dirty = activity !== null && (name !== activity.name || color !== activity.color);

  function close() {
    if (busy) {
      toast(offline ? "No signal — your changes will save when you’re back online" : "Still saving your changes…");
    }
    onClose();
  }

  function submit(call: () => Promise<SyncResult>, done?: string) {
    if (busy) return;
    const s = openSession;
    setBusySession(s);
    void call().then((result) => {
      setBusySession((b) => (b === s ? null : b));
      const stillOpen = s === session.current;
      const message = problem(result);
      if (message) {
        if (stillOpen) setError(message);
        else toast(message);
        return;
      }
      if (!result.ok) return;
      if (done) toast(done);
      if (stillOpen) onClose();
    });
  }

  function save() {
    if (!activity || !name.trim()) return;
    submit(() => run("updateActivityType", [{ id: activity.id, name, color }], { persist: false }));
  }

  function archive() {
    if (!activity) return;
    submit(() => run("setActivityArchived", [activity.id, true], { persist: false }), `${activity.name} archived`);
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
