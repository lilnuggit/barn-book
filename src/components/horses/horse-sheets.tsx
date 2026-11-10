"use client";

import { Archive, ArchiveRestore, CloudOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useRef, useState, type ReactNode } from "react";
import type { SyncResult } from "@/lib/action-result";
import { PALETTE } from "@/lib/palette";
import { notePageChange, run, useOverlayWrites, usePendingWrites } from "@/lib/sync";
import { ColorPicker } from "../color-picker";
import { headerButtonClass } from "../page-header";
import { Sheet, SheetError } from "../sheet";
import { SAVED_OFFLINE, SAVED_ON_PHONE, useSheetSession, useStopWaiting } from "../sheet-save";
import { toast } from "../toast";
import { HorseAvatar } from "../ui";

type NewHorse = { id: string; name: string; color: string };

// Every change here is stored on the phone first (like the day's list), so it
// survives a dropped signal and iOS closing the app, and goes out in order.

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";
const labelClass = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase";

export function AddHorseButton() {
  const offline = useOffline();
  const overlay = useOverlayWrites();
  const session = useSheetSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  // What's in the form right now, for results that arrive after the sheet closed.
  const form = useRef({ name: "", color: PALETTE[0] as string });
  // Saving the same name and color again reuses the id (so a double tap or a
  // retry can't create two horses).
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

  /** The horse is saved (or stored on the phone): clear the form for the next one. */
  function resetForm(savedColor: string) {
    draft.current = null;
    changeName("");
    changeColor(PALETTE[(PALETTE.indexOf(savedColor as (typeof PALETTE)[number]) + 1) % PALETTE.length]);
    setError(null);
  }

  function close(message = SAVED_ON_PHONE) {
    if (session.busy) {
      // It's on the phone and goes out by itself: the form starts fresh, so
      // the same horse can't be saved (and created) a second time.
      toast(message);
      resetForm(color);
    }
    session.end();
    setOpen(false);
  }
  useStopWaiting(session.busy, offline, () => close(offline ? SAVED_OFFLINE : SAVED_ON_PHONE));

  function save() {
    const trimmed = name.trim();
    if (!trimmed || session.busy) return;
    const content = `${trimmed}|${color}`;
    // A horse by this name is already on its way (stored on the phone, or just
    // confirmed): save it under the same id, so it can't be created twice.
    const onItsWay = overlay.findLast(
      (i) => i.name === "createHorse" && (i.meta as NewHorse).name.toLowerCase() === trimmed.toLowerCase(),
    )?.meta as NewHorse | undefined;
    if (onItsWay) draft.current = { id: onItsWay.id, content };
    else if (draft.current?.content !== content) draft.current = { id: crypto.randomUUID(), content };
    const horse = { id: draft.current.id, name: trimmed, color };
    const answered = session.send(run("createHorse", [horse], { key: `horse:${horse.id}`, meta: horse }));

    if (offline) {
      resetForm(color);
      session.end();
      setOpen(false);
      toast(`${trimmed} will be added when you’re back online`);
    }
    void answered.then(({ result, stillOpen }) => {
      if (result.ok) {
        // Clear the form if it still holds this horse (not the next one being typed).
        const formUnchanged = `${form.current.name.trim()}|${form.current.color}` === content;
        if (stillOpen || formUnchanged) resetForm(color);
        if (stillOpen) {
          session.end();
          setOpen(false);
        }
        toast(`Added ${trimmed}`);
      } else if (result.reason === "failed") {
        // Stored on the phone and retried automatically. (If the sheet was
        // closed meanwhile, the rider was already told.)
        if (!stillOpen) return;
        resetForm(color);
        session.end();
        setOpen(false);
        toast(`${trimmed}: ${SAVED_ON_PHONE.toLowerCase()}`);
      } else if (result.reason === "invalid") {
        if (stillOpen) setError(result.error);
        else toast(`${trimmed}: ${result.error}`);
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
  horse: fromServer,
}: {
  horse: { id: string; name: string; color: string; notes: string; archived: boolean; entryCount: number };
}) {
  const router = useRouter();
  const offline = useOffline();
  const overlay = useOverlayWrites();
  const session = useSheetSession();
  // Changes not on this page yet (still on the phone, or just confirmed and
  // waiting for the page to refresh): start from those, so saving again can't
  // undo them.
  const edited = overlay.findLast(
    (i) => i.name === "updateHorse" && (i.args[0] as { id: string }).id === fromServer.id,
  )?.args[0] as HorseFields | undefined;
  const archived = overlay.findLast((i) => i.name === "setHorseArchived" && i.args[0] === fromServer.id)?.args[1] as
    | boolean
    | undefined;
  const horse = {
    ...fromServer,
    ...(edited && { name: edited.name, color: edited.color, notes: edited.notes }),
    archived: archived ?? fromServer.archived,
  };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(horse.name);
  const [color, setColor] = useState(horse.color);
  const [notes, setNotes] = useState(horse.notes);
  const [error, setError] = useState<string | null>(null);
  const [startedFrom, setStartedFrom] = useState<HorseFields>(horse);

  const dirty = name !== startedFrom.name || color !== startedFrom.color || notes !== startedFrom.notes;

  function openSheet() {
    session.begin();
    setStartedFrom(horse);
    setName(horse.name);
    setColor(horse.color);
    setNotes(horse.notes);
    setError(null);
    setOpen(true);
  }

  function close(message = SAVED_ON_PHONE) {
    if (session.busy) toast(message);
    session.end();
    setOpen(false);
  }
  useStopWaiting(session.busy, offline, () => close(offline ? SAVED_OFFLINE : SAVED_ON_PHONE));

  /** Stores the change; closes right away offline, else once the server answers. */
  function submit(sending: Promise<SyncResult>, done: string) {
    const answered = session.send(sending);
    if (offline) {
      session.end();
      setOpen(false);
      toast(SAVED_OFFLINE);
    }
    void answered.then(({ result, stillOpen }) => {
      if (!result.ok && result.reason === "invalid") {
        if (stillOpen) setError(result.error);
        else toast(`${horse.name}: ${result.error}`);
        return;
      }
      // Signed out: the app is going to sign-in. Replaced: a newer save reports.
      if (!result.ok && result.reason !== "failed") return;
      if (stillOpen) {
        session.end();
        setOpen(false);
        toast(result.ok ? done : SAVED_ON_PHONE);
      } else if (result.ok) {
        toast(done); // the sheet was closed while it went out: say when it lands
      }
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

/**
 * Horses added on this phone that the server hasn't got yet, so a slow or
 * offline add doesn't look like it didn't happen.
 */
export function HorsesOnTheirWay({ known, children }: { known: string[]; children?: ReactNode }) {
  const pending = usePendingWrites();
  const horses = pending
    .filter((i) => i.name === "createHorse")
    .map((i) => i.meta as NewHorse)
    .filter((h, index, all) => h && !known.includes(h.id) && all.findIndex((x) => x.id === h.id) === index);
  // `children`: what to show when there are none (the empty list's message).
  if (horses.length === 0) return children ?? null;
  return (
    <ul className="mb-4 overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line">
      {horses.map((h) => (
        <li key={h.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
          <HorseAvatar name={h.name} color={h.color} />
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{h.name}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-3">
            <CloudOff className="size-3.5" aria-hidden /> Not synced yet
          </span>
        </li>
      ))}
    </ul>
  );
}
