"use client";

import { Check, ChevronDown, Minus, Trash2 } from "lucide-react";
import { useOffline } from "next/offline";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { EntryStatus } from "@/db/schema";
import type { ActivityLite, DayEntry } from "@/lib/data";
import { colorClass } from "@/lib/palette";
import { ToggleChip } from "../toggle-chip";
import { ActivityChip, cx } from "../ui";

export function EntryCard({
  entry,
  activities,
  activityById,
  expanded,
  onToggleExpanded,
  onStatus,
  onNote,
  onActivities,
  onRemove,
}: {
  entry: DayEntry;
  activities: ActivityLite[];
  activityById: Map<string, ActivityLite>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onStatus: (status: EntryStatus) => void;
  onNote: (note: string) => void;
  onActivities: (ids: string[]) => void;
  onRemove: () => void;
}) {
  const done = entry.status === "done";
  const skipped = entry.status === "skipped";
  const chips = entry.activityIds.map((id) => activityById.get(id)).filter((a) => a !== undefined);

  return (
    <li
      className={cx(
        "overflow-hidden rounded-2xl bg-surface shadow-card ring-1 transition-colors",
        expanded ? "ring-brand/40" : "ring-line",
      )}
    >
      <div className="flex items-start pr-2 pl-1">
        <CheckButton status={entry.status} name={entry.horseName} onClick={() => onStatus(done ? "planned" : "done")} />
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 py-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cx(colorClass(entry.horseColor), "size-2 shrink-0 rounded-full bg-tone-solid")} />
              <span className={cx("truncate text-[17px] font-semibold", (done || skipped) && "text-ink-2")}>
                {entry.horseName}
              </span>
              {skipped && (
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-3">
                  Skipped
                </span>
              )}
            </div>
            {chips.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((a) => (
                  <ActivityChip key={a.id} name={a.name} color={a.color} muted={skipped} />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-3">No work picked yet</p>
            )}
            {!expanded && entry.note && (
              <p className="mt-2 line-clamp-2 text-[15px] leading-snug whitespace-pre-line text-ink-2">{entry.note}</p>
            )}
          </div>
          <ChevronDown
            aria-hidden
            className={cx("mt-0.5 size-5 shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-line px-4 pt-3 pb-4">
          <NoteField initial={entry.note} onSave={onNote} />

          <WorkEditor entry={entry} activities={activities} onActivities={onActivities} />

          <div className="flex items-center justify-between gap-3">
            <StatusSwitch status={entry.status} onChange={onStatus} />
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove ${entry.horseName} from this day?`)) onRemove();
              }}
              className="flex items-center gap-1.5 rounded-full px-2 py-2 text-[15px] font-medium text-danger active:opacity-70"
            >
              <Trash2 className="size-4" /> Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** The card already shows the chosen work, so the full picker opens on request. */
function WorkEditor({
  entry,
  activities,
  onActivities,
}: {
  entry: DayEntry;
  activities: ActivityLite[];
  onActivities: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState(entry.activityIds.length === 0);
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Work</p>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className="-mr-1 rounded-full px-2 py-1 text-[15px] font-semibold text-brand active:opacity-70"
        >
          {editing ? "Done" : "Change"}
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          {activities
            .filter((a) => !a.archived || entry.activityIds.includes(a.id))
            .map((a) => {
              const selected = entry.activityIds.includes(a.id);
              return (
                <ToggleChip
                  key={a.id}
                  selected={selected}
                  color={a.color}
                  onClick={() =>
                    onActivities(
                      selected ? entry.activityIds.filter((id) => id !== a.id) : [...entry.activityIds, a.id],
                    )
                  }
                >
                  {a.name}
                </ToggleChip>
              );
            })}
        </div>
      )}
    </div>
  );
}

function CheckButton({ status, name, onClick }: { status: EntryStatus; name: string; onClick: () => void }) {
  const done = status === "done";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `${name}: done. Tap to undo` : `Mark ${name} done`}
      className="grid size-[52px] shrink-0 place-items-center"
    >
      <span
        key={status}
        className={cx(
          "grid size-7 place-items-center rounded-full border-2 transition-colors",
          done && "animate-pop border-done bg-done text-surface",
          status === "skipped" && "border-ink-3/40 bg-surface-2 text-ink-3",
          status === "planned" && "border-ink-3/60",
        )}
      >
        {done && <Check className="size-4" strokeWidth={3.2} />}
        {status === "skipped" && <Minus className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

const STATUS_OPTIONS: { value: EntryStatus; label: string }[] = [
  { value: "planned", label: "To do" },
  { value: "done", label: "Done" },
  { value: "skipped", label: "Skipped" },
];

function StatusSwitch({ status, onChange }: { status: EntryStatus; onChange: (s: EntryStatus) => void }) {
  return (
    <div role="radiogroup" aria-label="Status" className="flex rounded-full bg-surface-2 p-1">
      {STATUS_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={status === o.value}
          onClick={() => status !== o.value && onChange(o.value)}
          className={cx(
            "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
            status === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Saves a moment after typing stops, when the field loses focus, and when it closes. */
function NoteField({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const id = useId();
  const offline = useOffline();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastSaved = useRef(initial);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onSaveRef = useRef(onSave);

  useLayoutEffect(() => {
    latest.current = value;
    onSaveRef.current = onSave;
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    }
  });

  function flush() {
    clearTimeout(timer.current);
    const next = latest.current;
    if (next.trim() === lastSaved.current.trim()) return;
    lastSaved.current = next;
    onSaveRef.current(next);
    setSaved(true);
  }

  // Don't lose typing when the card closes or the screen changes.
  useEffect(() => () => flush(), []);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
          Note
        </label>
        {saved &&
          (offline ? (
            <span className="text-xs font-medium text-ink-3">Saves when you’re back online</span>
          ) : (
            <span className="text-xs font-medium text-done">Saved</span>
          ))}
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={2}
        maxLength={4000}
        placeholder="How did it go? What did you work on?"
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 900);
        }}
        onBlur={flush}
        className="block w-full resize-none rounded-xl bg-surface-2 px-3.5 py-2.5 leading-snug text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none"
      />
    </div>
  );
}
