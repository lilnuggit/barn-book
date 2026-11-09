"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { createHorse, deleteHorse, setHorseArchived, updateHorse } from "@/app/actions";
import { PALETTE } from "@/lib/palette";
import { ColorPicker } from "../color-picker";
import { headerButtonClass } from "../page-header";
import { Sheet } from "../sheet";
import { toast } from "../toast";

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";
const labelClass = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase";

export function AddHorseButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [isPending, startTransition] = useTransition();

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const result = await createHorse({ id: crypto.randomUUID(), name: trimmed, color });
        if (!result.ok) return toast(result.error);
        toast(`Added ${trimmed}`);
        setName("");
        setColor(PALETTE[(PALETTE.indexOf(color as (typeof PALETTE)[number]) + 1) % PALETTE.length]);
        setOpen(false);
      } catch (error) {
        console.error(error);
        toast("Couldn’t save that horse — please try again");
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
        footer={
          <button
            type="button"
            disabled={!name.trim() || isPending}
            onClick={save}
            className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-brand-ink disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save horse"}
          </button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-5"
        >
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(horse.name);
  const [color, setColor] = useState(horse.color);
  const [notes, setNotes] = useState(horse.notes);
  const [isPending, startTransition] = useTransition();

  function run(work: () => Promise<void>) {
    startTransition(async () => {
      try {
        await work();
      } catch (error) {
        console.error(error);
        toast("Couldn’t save — please try again");
      }
    });
  }

  function save() {
    run(async () => {
      const result = await updateHorse({ id: horse.id, name, color, notes });
      if (!result.ok) return toast(result.error);
      setOpen(false);
      toast("Saved");
    });
  }

  function toggleArchive() {
    run(async () => {
      await setHorseArchived(horse.id, !horse.archived);
      setOpen(false);
      toast(horse.archived ? `${horse.name} is back in work` : `${horse.name} archived`);
    });
  }

  function remove() {
    const what =
      horse.entryCount > 0
        ? `Delete ${horse.name} and all ${horse.entryCount} logged ${horse.entryCount === 1 ? "entry" : "entries"}? This can’t be undone.`
        : `Delete ${horse.name}?`;
    if (!confirm(what)) return;
    setOpen(false);
    toast(`Deleted ${horse.name}`);
    run(() => deleteHorse(horse.id));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(horse.name);
          setColor(horse.color);
          setNotes(horse.notes);
          setOpen(true);
        }}
        className={headerButtonClass}
      >
        <Pencil className="size-4" /> Edit
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${horse.name}`}
        footer={
          <button
            type="button"
            disabled={!name.trim() || isPending}
            onClick={save}
            className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-brand-ink disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        }
      >
        <div className="space-y-5">
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
              {horse.archived ? <ArchiveRestore className="size-5 text-ink-3" /> : <Archive className="size-5 text-ink-3" />}
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
              className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left text-[16px] font-medium text-danger active:bg-danger-soft"
            >
              <Trash2 className="size-5" /> Delete horse and history
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
