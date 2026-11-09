"use client";

import { Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createHorse } from "@/app/actions";
import type { ActivityLite, HorseLite } from "@/lib/data";
import { PALETTE } from "@/lib/palette";
import { Sheet } from "../sheet";
import { toast } from "../toast";
import { ToggleChip } from "../toggle-chip";
import { cx } from "../ui";

export function AddSheet({
  open,
  onClose,
  title,
  horses,
  activities,
  horseIdsOnDay,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  horses: HorseLite[];
  activities: ActivityLite[];
  horseIdsOnDay: Set<string>;
  onAdd: (horseIds: string[], activityIds: string[], note: string, knownHorses: HorseLite[]) => void;
}) {
  const [horseIds, setHorseIds] = useState<string[]>([]);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<HorseLite[]>([]);
  const [newName, setNewName] = useState("");
  const [showNewHorse, setShowNewHorse] = useState(false);
  const [, startCreate] = useTransition();

  const allHorses = useMemo(() => {
    const known = new Set(horses.map((h) => h.id));
    return [...horses, ...created.filter((h) => !known.has(h.id))].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [horses, created]);

  const addingFirstHorse = allHorses.length === 0;
  const newHorseOpen = showNewHorse || addingFirstHorse;

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function addNewHorse() {
    const name = newName.trim();
    if (!name) return;
    const horse: HorseLite = { id: crypto.randomUUID(), name, color: PALETTE[allHorses.length % PALETTE.length] };
    setCreated((c) => [...c, horse]);
    setHorseIds((ids) => [...ids, horse.id]);
    setNewName("");
    setShowNewHorse(false);
    startCreate(async () => {
      try {
        const result = await createHorse(horse);
        if (!result.ok) toast(result.error);
      } catch (error) {
        console.error(error);
        toast("Couldn’t save that horse — please try again");
      }
    });
  }

  function submit() {
    if (horseIds.length === 0) return;
    onAdd(horseIds, activityIds, note.trim(), allHorses);
    const names = horseIds.map((id) => allHorses.find((h) => h.id === id)?.name).filter(Boolean);
    toast(names.length === 1 ? `Added ${names[0]}` : `Added ${names.length} horses`);
    setHorseIds([]);
    setActivityIds([]);
    setNote("");
  }

  const count = horseIds.length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Pick horses and what they’re doing. Add as many as you like."
      footer={
        <button
          type="button"
          disabled={count === 0}
          onClick={submit}
          className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-brand-ink active:opacity-80 disabled:opacity-40"
        >
          {count === 0 ? "Pick a horse" : count === 1 ? "Add to list" : `Add ${count} horses`}
        </button>
      }
    >
      <section>
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Horses</h3>
        <div className="flex flex-wrap gap-2">
          {allHorses.map((h) => (
            <ToggleChip
              key={h.id}
              selected={horseIds.includes(h.id)}
              color={h.color}
              onClick={() => setHorseIds((ids) => toggle(ids, h.id))}
              badge={
                horseIdsOnDay.has(h.id) ? (
                  <span className="ml-0.5 size-1.5 rounded-full bg-tone-solid" title="Already on this day" />
                ) : undefined
              }
            >
              {h.name}
            </ToggleChip>
          ))}
          {!newHorseOpen && (
            <button
              type="button"
              onClick={() => setShowNewHorse(true)}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 py-1.5 text-[15px] font-medium text-brand ring-1 ring-brand/40 ring-inset active:opacity-70"
            >
              <Plus className="size-4" /> New horse
            </button>
          )}
        </div>

        {newHorseOpen && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addNewHorse();
            }}
          >
            <input
              autoFocus={showNewHorse}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={addingFirstHorse ? "Your first horse’s name" : "Horse’s name"}
              maxLength={60}
              enterKeyHint="done"
              autoCapitalize="words"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:ring-2 focus:ring-brand/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="rounded-xl bg-brand-soft px-4 font-semibold text-brand disabled:opacity-50"
            >
              Save
            </button>
          </form>
        )}
        {allHorses.some((h) => horseIdsOnDay.has(h.id)) && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
            <span className="size-1.5 rounded-full bg-ink-3" /> already on this day’s list
          </p>
        )}
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Work</h3>
        <div className="flex flex-wrap gap-2">
          {activities
            .filter((a) => !a.archived)
            .map((a) => (
              <ToggleChip
                key={a.id}
                selected={activityIds.includes(a.id)}
                color={a.color}
                onClick={() => setActivityIds((ids) => toggle(ids, a.id))}
              >
                {a.name}
              </ToggleChip>
            ))}
        </div>
      </section>

      <section className="mt-6">
        <label htmlFor="add-note" className="mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
          Note <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="add-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. lesson at 10, front shoes on"
          maxLength={4000}
          enterKeyHint="done"
          className={cx(
            "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3",
            "focus:ring-2 focus:ring-brand/50 focus:outline-none",
          )}
        />
      </section>
    </Sheet>
  );
}
