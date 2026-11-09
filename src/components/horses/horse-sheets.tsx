"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useRef, useState } from "react";
import type { SyncResult } from "@/lib/action-result";
import { PALETTE } from "@/lib/palette";
import { run } from "@/lib/sync";
import { ColorPicker } from "../color-picker";
import { headerButtonClass } from "../page-header";
import { Sheet, SheetError } from "../sheet";
import { toast } from "../toast";

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";
const labelClass = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase";

function problem(result: SyncResult): string | null {
  if (result.ok) return null;
  if (result.reason === "invalid") return result.error;
  if (result.reason === "failed") return "Couldn’t reach the server — please try again.";
  return null; // signed out: the app is taking you to sign in
}

/**
 * Each opening of a sheet is a session. A save that finishes after its sheet
 * was closed (or closed and opened again) must not close or reset the new one.
 */
function useSheetSession() {
  const current = useRef(0);
  const [openSession, setOpenSession] = useState(0);
  const [busySession, setBusySession] = useState<number | null>(null);
  return {
    current,
    busy: busySession !== null && busySession === openSession,
    begin() {
      current.current += 1;
      setOpenSession(current.current);
    },
    end() {
      current.current += 1;
    },
    async send(call: () => Promise<SyncResult>): Promise<{ result: SyncResult; stillOpen: boolean }> {
      const s = current.current;
      setBusySession(s);
      const result = await call();
      setBusySession((b) => (b === s ? null : b));
      return { result, stillOpen: s === current.current };
    },
  };
}

function busyCloseMessage(offline: boolean) {
  return offline ? "No signal — your changes will save when you’re back online" : "Still saving your changes…";
}

export function AddHorseButton() {
  const offline = useOffline();
  const session = useSheetSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  // Saving the same name and color again reuses the id (so a double tap or a
  // retry can't create two horses); anything different is a new horse.
  const draft = useRef<{ id: string; content: string } | null>(null);

  function openSheet() {
    session.begin();
    setError(null);
    setOpen(true);
  }

  function close() {
    if (session.busy) toast(busyCloseMessage(offline));
    session.end();
    setOpen(false);
  }

  function finish() {
    draft.current = null;
    setName("");
    setError(null);
    setColor(PALETTE[(PALETTE.indexOf(color as (typeof PALETTE)[number]) + 1) % PALETTE.length]);
    session.end();
    setOpen(false);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed || session.busy) return;
    const content = `${trimmed}|${color}`;
    if (draft.current?.content !== content) draft.current = { id: crypto.randomUUID(), content };
    const horse = { id: draft.current.id, name: trimmed, color };
    const sending = run("createHorse", [horse], { key: `horse:${horse.id}`, meta: horse });

    if (offline) {
      // Saved on the phone; it shows up once it syncs.
      finish();
      toast(`${trimmed} will be added when you’re back online`);
      return;
    }
    void session
      .send(() => sending)
      .then(({ result, stillOpen }) => {
        if (result.ok || result.reason === "failed") {
          // "failed" is still saved on the phone and retried automatically.
          if (stillOpen) finish();
          else draft.current = null;
          toast(result.ok ? `Added ${trimmed}` : `${trimmed} is saved on this phone and will be added when it syncs`);
          return;
        }
        const message = problem(result);
        if (message && stillOpen) setError(message);
        else if (message) toast(message);
      });
  }

  return (
    <>
      <button type="button" onClick={openSheet} className={headerButtonClass}>
        <Plus className="size-4" strokeWidth={2.5} /> Add horse
      </button>
      <Sheet
        open={open}
        onClose={close}
        title="New horse"
        onSave={save}
        saveLabel={session.busy ? "Saving…" : "Save"}
        saveDisabled={!name.trim() || session.busy}
        dirty={name.trim().length > 0}
        busy={session.busy}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-5"
        >
          <SheetError message={error} />
          <div>
            <label htmlFor="new-horse-name" className={labelClass}>
              Name
            </label>
            <input
              id="new-horse-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Barn name"
              maxLength={60}
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="done"
              className={inputClass}
            />
          </div>
          <div>
            <p className={labelClass}>Color</p>
            <ColorPicker value={color} onChange={setColor} label="Horse color" />
          </div>
        </form>
      </Sheet>
    </>
  );
}

export function EditHorseButton({
  horse,
}: {
  horse: { id: string; name: string; color: string; notes: string; archived: boolean; entryCount: number };
}) {
  const router = useRouter();
  const offline = useOffline();
  const session = useSheetSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(horse.name);
  const [color, setColor] = useState(horse.color);
  const [notes, setNotes] = useState(horse.notes);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== horse.name || color !== horse.color || notes !== horse.notes;

  function openSheet() {
    session.begin();
    setName(horse.name);
    setColor(horse.color);
    setNotes(horse.notes);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (session.busy) toast(busyCloseMessage(offline));
    session.end();
    setOpen(false);
  }

  /** Sends a change; reports the outcome in the sheet if it's still open, else as a toast. */
  function submit(call: () => Promise<SyncResult>, done: string, after?: () => void) {
    if (session.busy) return;
    void session.send(call).then(({ result, stillOpen }) => {
      const message = problem(result);
      if (message) {
        if (stillOpen) setError(message);
        else toast(message);
        return;
      }
      if (!result.ok) return;
      if (stillOpen) {
        session.end();
        setOpen(false);
      }
      toast(done);
      after?.();
    });
  }

  function save() {
    if (!name.trim()) return;
    submit(() => run("updateHorse", [{ id: horse.id, name, color, notes }], { persist: false }), "Saved");
  }

  function toggleArchive() {
    submit(
      () => run("setHorseArchived", [horse.id, !horse.archived], { persist: false }),
      horse.archived ? `${horse.name} is back in work` : `${horse.name} archived`,
    );
  }

  function remove() {
    const what =
      horse.entryCount > 0
        ? `Delete ${horse.name} and all ${horse.entryCount} logged ${horse.entryCount === 1 ? "entry" : "entries"}? This can’t be undone.`
        : `Delete ${horse.name}?`;
    if (!window.confirm(what)) return;
    submit(
      () => run("deleteHorse", [horse.id], { persist: false }),
      `Deleted ${horse.name}`,
      () => {
        // Leave the deleted horse's page, but don't pull the user off another one.
        if (window.location.pathname === `/horses/${horse.id}`) router.replace("/horses");
      },
    );
  }

  return (
    <>
      <button type="button" onClick={openSheet} className={headerButtonClass}>
        <Pencil className="size-4" /> Edit
      </button>
      <Sheet
        open={open}
        onClose={close}
        title={`Edit ${horse.name}`}
        onSave={save}
        saveLabel={session.busy ? "Saving…" : "Save"}
        saveDisabled={!name.trim() || session.busy}
        dirty={dirty}
        busy={session.busy}
      >
        <fieldset disabled={session.busy} className="space-y-5">
          <SheetError message={error} />
          <div>
            <label htmlFor="edit-horse-name" className={labelClass}>
              Name
            </label>
            <input
              id="edit-horse-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoCapitalize="words"
              autoComplete="off"
              className={inputClass}
            />
          </div>
          <div>
            <p className={labelClass}>Color</p>
            <ColorPicker value={color} onChange={setColor} label="Horse color" />
          </div>
          <div>
            <label htmlFor="edit-horse-notes" className={labelClass}>
              About <span className="font-normal normal-case">(feed, shoeing, quirks…)</span>
            </label>
            <textarea
              id="edit-horse-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Anything you want to remember about this horse"
              className={`${inputClass} resize-none leading-snug`}
            />
          </div>
          <div className="space-y-1 border-t border-line pt-3">
            <button
              type="button"
              onClick={toggleArchive}
              className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left text-[16px] font-medium text-ink active:bg-surface-2"
            >
              {horse.archived ? (
                <ArchiveRestore className="size-5 text-ink-3" />
              ) : (
                <Archive className="size-5 text-ink-3" />
              )}
              <span>
                {horse.archived ? "Bring back into work" : "Archive"}
                <span className="block text-sm font-normal text-ink-3">
                  {horse.archived
                    ? "Shows up again when you plan a day."
                    : "Sold, retired, or away? Hides them from planning but keeps their history."}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={remove}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left text-[16px] font-medium text-danger active:bg-danger-soft"
            >
              <Trash2 className="size-5" /> Delete horse and history
            </button>
          </div>
        </fieldset>
      </Sheet>
    </>
  );
}
