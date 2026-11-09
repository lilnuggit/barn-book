"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useRef, useState, useTransition } from "react";
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

export function AddHorseButton() {
  const offline = useOffline();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // One id per new horse, so tapping Save twice can't create it twice.
  const draftId = useRef<string | null>(null);

  function save() {
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    draftId.current ??= crypto.randomUUID();
    const horse = { id: draftId.current, name: trimmed, color };
    const result = run("createHorse", [horse], { key: `horse:${horse.id}`, meta: horse });

    function reset() {
      draftId.current = null;
      setName("");
      setError(null);
      setColor(PALETTE[(PALETTE.indexOf(color as (typeof PALETTE)[number]) + 1) % PALETTE.length]);
      setOpen(false);
    }

    if (offline) {
      // Saved on the phone; it'll appear in the list once it syncs.
      reset();
      toast(`${trimmed} will be added when you’re back online`);
      return;
    }
    startTransition(async () => {
      const r = await result;
      const message = problem(r);
      if (message) return setError(message);
      if (r.ok) {
        reset();
        toast(`Added ${trimmed}`);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={headerButtonClass}>
        <Plus className="size-4" strokeWidth={2.5} /> Add horse
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New horse"
        onSave={save}
        saveLabel={isPending ? "Saving…" : "Save"}
        saveDisabled={!name.trim() || isPending}
        dirty={name.trim().length > 0}
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(horse.name);
  const [color, setColor] = useState(horse.color);
  const [notes, setNotes] = useState(horse.notes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = name !== horse.name || color !== horse.color || notes !== horse.notes;

  function openSheet() {
    setName(horse.name);
    setColor(horse.color);
    setNotes(horse.notes);
    setError(null);
    setOpen(true);
  }

  function save() {
    if (!name.trim() || isPending) return;
    startTransition(async () => {
      const result = await run("updateHorse", [{ id: horse.id, name, color, notes }], { persist: false });
      const message = problem(result);
      if (message) return setError(message);
      if (result.ok) {
        setOpen(false);
        toast("Saved");
      }
    });
  }

  function toggleArchive() {
    if (isPending) return;
    startTransition(async () => {
      const result = await run("setHorseArchived", [horse.id, !horse.archived], { persist: false });
      const message = problem(result);
      if (message) return setError(message);
      if (result.ok) {
        setOpen(false);
        toast(horse.archived ? `${horse.name} is back in work` : `${horse.name} archived`);
      }
    });
  }

  function remove() {
    if (isPending) return;
    const what =
      horse.entryCount > 0
        ? `Delete ${horse.name} and all ${horse.entryCount} logged ${horse.entryCount === 1 ? "entry" : "entries"}? This can’t be undone.`
        : `Delete ${horse.name}?`;
    if (!window.confirm(what)) return;
    startTransition(async () => {
      const result = await run("deleteHorse", [horse.id], { persist: false });
      const message = problem(result);
      if (message) return setError(message);
      if (result.ok) {
        setOpen(false);
        toast(`Deleted ${horse.name}`);
        router.replace("/horses");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={openSheet} className={headerButtonClass}>
        <Pencil className="size-4" /> Edit
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${horse.name}`}
        onSave={save}
        saveLabel={isPending ? "Saving…" : "Save"}
        saveDisabled={!name.trim() || isPending}
        dirty={dirty}
      >
        <div className="space-y-5">
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
              disabled={isPending}
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
              disabled={isPending}
              onClick={remove}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left text-[16px] font-medium text-danger active:bg-danger-soft"
            >
              <Trash2 className="size-5" /> Delete horse and history
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
