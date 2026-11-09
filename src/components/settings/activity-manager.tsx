"use client";

import { ArrowDown, ArrowUp, ChevronRight, Plus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import {
  createActivityType,
  reorderActivityTypes,
  setActivityArchived,
  updateActivityType,
} from "@/app/actions";
import type { ActivityLite } from "@/lib/data";
import { PALETTE } from "@/lib/palette";
import { ColorPicker } from "../color-picker";
import { Sheet } from "../sheet";
import { toast } from "../toast";
import { ActivityChip, cx, SectionTitle } from "../ui";

const inputClass =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none";

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
      try {
        await reorderActivityTypes(next.map((a) => a.id));
      } catch (error) {
        console.error(error);
        toast("Couldn’t save the new order");
      }
    });
  }

  function restore(a: ActivityLite) {
    startTransition(async () => {
      await setActivityArchived(a.id, false);
      toast(`${a.name} is back on the list`);
    });
  }

  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => setReordering((r) => !r)}
            className="text-[15px] font-semibold text-brand"
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
              <div className="flex w-full items-center justify-between py-1.5 pr-2 pl-4">
                <ActivityChip name={a.name} color={a.color} size="md" />
                <div className="flex">
                  <button
                    type="button"
                    aria-label={`Move ${a.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="grid size-10 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                  >
                    <ArrowUp className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${a.name} down`}
                    disabled={i === ordered.length - 1}
                    onClick={() => move(i, 1)}
                    className="grid size-10 place-items-center rounded-full text-ink-2 disabled:opacity-25"
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
              <li key={a.id} className="flex items-center justify-between border-b border-line px-4 py-2 last:border-b-0">
                <ActivityChip name={a.name} color={a.color} size="md" muted />
                <button
                  type="button"
                  onClick={() => restore(a)}
                  className="rounded-full px-3 py-1.5 text-[15px] font-semibold text-brand"
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
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const result = await createActivityType({ name: trimmed, color: nextColor });
        if (!result.ok) return toast(result.error);
        setName("");
        toast(`Added ${trimmed}`);
      } catch (error) {
        console.error(error);
        toast("Couldn’t add that — please try again");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      className="flex items-center gap-2 py-1.5 pr-2 pl-4"
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
        className="min-w-0 flex-1 bg-transparent py-2 text-ink placeholder:text-ink-3 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim() || isPending}
        className={cx(
          "rounded-full px-3 py-1.5 text-[15px] font-semibold text-brand transition-opacity",
          !name.trim() && "opacity-0",
        )}
      >
        Add
      </button>
    </form>
  );
}

function EditActivitySheet({ activity, onClose }: { activity: ActivityLite | null; onClose: () => void }) {
  return (
    <Sheet open={activity !== null} onClose={onClose} title="Edit work type">
      {activity && <EditActivityForm key={activity.id} activity={activity} onDone={onClose} />}
    </Sheet>
  );
}

function EditActivityForm({ activity, onDone }: { activity: ActivityLite; onDone: () => void }) {
  const [name, setName] = useState(activity.name);
  const [color, setColor] = useState(activity.color);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await updateActivityType({ id: activity.id, name, color });
        if (!result.ok) return toast(result.error);
        onDone();
      } catch (error) {
        console.error(error);
        toast("Couldn’t save — please try again");
      }
    });
  }

  function archive() {
    startTransition(async () => {
      await setActivityArchived(activity.id, true);
      toast(`${activity.name} archived`);
      onDone();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="activity-name" className="mb-2 block text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
          Name
        </label>
        <input
          id="activity-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
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
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={archive}
          disabled={isPending}
          className="flex-1 rounded-2xl py-3 text-[16px] font-semibold text-danger ring-1 ring-line active:bg-danger-soft"
        >
          Archive
        </button>
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="flex-[2] rounded-2xl bg-brand py-3 text-[16px] font-semibold text-brand-ink disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
