"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useRef, useState } from "react";
import type { SyncResult } from "@/lib/action-result";
import { PALETTE } from "@/lib/palette";
import { notePageChange, run, usePendingWrites } from "@/lib/sync";
import { ColorPicker } from "../color-picker";
import { headerButtonClass } from "../page-header";
import { Sheet, SheetError } from "../sheet";
import { toast } from "../toast";

// Every change here is stored on the phone first (like the day's list), so it
// survives a dropped signal and iOS closing the app, and goes out in order.

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";
const labelClass = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase";

const SAVED_ON_PHONE = "Saved on this phone — it’ll sync when it can";
const SAVED_OFFLINE = "No signal — saved on this phone, it’ll sync when you’re back online";

/**
 * Each opening of a sheet is a session. A save that finishes after its sheet
 * was closed (or closed and opened again) must not close or reset the new one.
 */
function useSheetSession() {
  const current = useRef(0);
  const [openSession, setOpenSession] = useState(0);
  const [busySession, setBusySession] = useState<number | null>(null);
  return {
    busy: busySession !== null && busySession === openSession,
    begin() {
      current.current += 1;
      setOpenSession(current.current);
    },
    end() {
      current.current += 1;
    },
    async send(result: Promise<SyncResult>): Promise<{ result: SyncResult; stillOpen: boolean }> {
      const s = current.current;
      setBusySession(s);
      const r = await result;
      setBusySession((b) => (b === s ? null : b));
      return { result: r, stillOpen: s === current.current };
    },
  };
}

export function AddHorseButton() {
  const offline = useOffline();
  const session = useSheetSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  // What's in the form right now, for results that arrive after the sheet closed.
  const form = useRef({ name: "", color: PALETTE[0] as string });
  // Saving the same name and color again reuses the id (so a double tap, a
  // retry, or saving again after closing can't create two horses).
  const draft = useRef<{ id: string; content: string } | null>(null);

  function changeName(value: string) {
    form.current.name = value;
    setName(value);
  }

  function changeColor(value: string) {
    form.current.color = value;
    setColor(value);
  }

  function openSheet() {
    session.begin();
    setError(null);
    setOpen(true);
  }

  function close() {
    if (session.busy) toast(SAVED_ON_PHONE);
    session.end();
    setOpen(false);
  }

  /** The horse is saved (or stored on the phone): clear the form for the next one. */
  function resetForm(savedColor: string) {
    draft.current = null;
    changeName("");
    changeColor(PALETTE[(PALETTE.indexOf(savedColor as (typeof PALETTE)[number]) + 1) % PALETTE.length]);
    setError(null);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed || session.busy) return;
    const content = `${trimmed}|${color}`;
    if (draft.current?.content !== content) draft.current = { id: crypto.randomUUID(), content };
    const horse = { id: draft.current.id, name: trimmed, color };
    const sending = run("createHorse", [horse], { key: `horse:${horse.id}`, meta: horse });

    if (offline) {
      resetForm(color);
      session.end();
      setOpen(false);
      toast(`${trimmed} will be added when you’re back online`);
      return;
    }
    void session.send(sending).then(({ result, stillOpen }) => {
      if (result.ok || result.reason === "failed") {
        // "failed" is still stored on the phone and retried automatically.
        const formUnchanged = `${form.current.name.trim()}|${form.current.color}` === content;
        if (stillOpen || formUnchanged) resetForm(color);
        if (stillOpen) {
          session.end();
          setOpen(false);
        }
        toast(result.ok ? `Added ${trimmed}` : `${trimmed}: ${SAVED_ON_PHONE.toLowerCase()}`);
        return;
      }
      if (result.reason === "invalid") {
        if (stillOpen) setError(result.error);
        else toast(result.error);
      }
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
              onChange={(e) => changeName(e.target.value)}
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
            <ColorPicker value={color} onChange={changeColor} label="Horse color" />
          </div>
        </form>
      </Sheet>
    </>
  );
}

type HorseFields = { name: string; color: string; notes: string };

export function EditHorseButton({
  horse,
}: {
  horse: { id: string; name: string; color: string; notes: string; archived: boolean; entryCount: number };
}) {
  const router = useRouter();
  const offline = useOffline();
  const pending = usePendingWrites();
  const session = useSheetSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(horse.name);
  const [color, setColor] = useState(horse.color);
  const [notes, setNotes] = useState(horse.notes);
  const [error, setError] = useState<string | null>(null);
  const [startedFrom, setStartedFrom] = useState<HorseFields>(horse);

  const dirty = name !== startedFrom.name || color !== startedFrom.color || notes !== startedFrom.notes;

  function openSheet() {
    // Start from an edit that hasn't synced yet, if there is one, so saving
    // again can't undo it.
    const unsynced = pending.findLast(
      (i) => i.name === "updateHorse" && (i.args[0] as { id: string }).id === horse.id,
    )?.args[0] as HorseFields | undefined;
    const fields = unsynced ?? horse;
    session.begin();
    setStartedFrom(fields);
    setName(fields.name);
    setColor(fields.color);
    setNotes(fields.notes);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (session.busy) toast(SAVED_ON_PHONE);
    session.end();
    setOpen(false);
  }

  /** Stores the change; closes right away offline, else once the server answers. */
  function submit(sending: Promise<SyncResult>, done: string) {
    if (offline) {
      session.end();
      setOpen(false);
      toast(SAVED_OFFLINE);
      return;
    }
    void session.send(sending).then(({ result, stillOpen }) => {
      if (!result.ok && result.reason === "invalid") {
        if (stillOpen) setError(result.error);
        else toast(result.error);
        return;
      }
      if (!result.ok && result.reason === "signed-out") return; // the app is going to sign-in
      if (stillOpen) {
        session.end();
        setOpen(false);
      }
      toast(result.ok ? done : SAVED_ON_PHONE);
    });
  }

  function save() {
    if (!name.trim() || session.busy) return;
    submit(run("updateHorse", [{ id: horse.id, name, color, notes }], { key: `horse-edit:${horse.id}` }), "Saved");
  }

  function toggleArchive() {
    if (session.busy) return;
    submit(
      run("setHorseArchived", [horse.id, !horse.archived], { key: `horse-archive:${horse.id}` }),
      horse.archived ? `${horse.name} is back in work` : `${horse.name} archived`,
    );
  }

  function remove() {
    const what =
      horse.entryCount > 0
        ? `Delete ${horse.name} and all ${horse.entryCount} logged ${horse.entryCount === 1 ? "entry" : "entries"}? This can’t be undone.`
        : `Delete ${horse.name}?`;
    if (!window.confirm(what)) return;
    session.end();
    setOpen(false);
    // Leave the horse's page right after the delete is handed to the server.
    // That order matters: a page change started before a save waits for the
    // server's answer (with a weak signal, a long wait), one started after it
    // doesn't. If older changes are still going out first, leave anyway.
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      clearTimeout(fallback);
      notePageChange("/horses");
      router.replace("/horses");
    };
    const fallback = setTimeout(leave, 400);
    // With no signal the page change itself waits for the connection, so say
    // what's happening now rather than when the server finally answers.
    if (offline) toast(`No signal — ${horse.name} will be deleted when you’re back online`);
    void run("deleteHorse", [horse.id], { key: `horse-delete:${horse.id}`, onSend: leave }).then((result) => {
      if (result.ok) toast(`Deleted ${horse.name}`);
      else if (result.reason === "invalid") toast(result.error);
      else if (result.reason === "failed" && !offline) toast(`${horse.name} will be deleted when it syncs`);
    });
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
