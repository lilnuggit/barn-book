"use client";

import { Check, ChevronDown, CloudOff, Minus, Trash2 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { EntryStatus } from "@/db/schema";
import type { SyncResult } from "@/lib/action-result";
import type { ActivityLite, DayEntry } from "@/lib/data";
import { colorClass } from "@/lib/palette";
import { useNoSignal } from "@/lib/sync";
import { fitToText } from "../fit-to-text";
import { ToggleChip } from "../toggle-chip";
import { ActivityChip, cx } from "../ui";

export function EntryCard({
  entry,
  activities,
  activityById,
  expanded,
  waiting,
  noteSyncing,
  typing,
  onTyping,
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
  /** Has changes saved on the phone that haven't reached the server yet. */
  waiting: boolean;
  /** A note for this entry is still waiting on the phone. */
  noteSyncing: boolean;
  /** She's typing this entry's note (also on another copy of this screen). */
  typing: boolean;
  onTyping: (typing: boolean) => void;
  onToggleExpanded: () => void;
  onStatus: (status: EntryStatus) => void;
  onNote: (note: string) => Promise<SyncResult>;
  onActivities: (ids: string[]) => void;
  onRemove: () => void;
}) {
  const done = entry.status === "done";
  const skipped = entry.status === "skipped";
  const chips = entry.activityIds.map((id) => activityById.get(id)).filter((a) => a !== undefined);

  return (
    <li
      data-entry={entry.id}
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
              {waiting && (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-3">
                  <CloudOff className="size-3.5" aria-hidden /> Not synced yet
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
          <NoteField
            entryId={entry.id}
            initial={entry.note}
            syncing={noteSyncing}
            stuck={waiting}
            typing={typing}
            onTyping={onTyping}
            onSave={onNote}
          />

          <WorkEditor entry={entry} activities={activities} onActivities={onActivities} />

          <div className="flex items-center justify-between gap-3">
            <StatusSwitch status={entry.status} onChange={onStatus} />
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove ${entry.horseName} from this day?`)) onRemove();
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-medium text-danger active:opacity-70"
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
          className="-my-2 -mr-2 min-h-11 rounded-full px-3 text-[15px] font-semibold text-brand active:opacity-70"
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
      data-check
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
            "min-h-11 rounded-full px-3.5 text-sm font-semibold transition-colors",
            status === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * What she has typed in each note box and not yet handed to the phone's queue.
 * A copy of the screen that takes over meanwhile (the live list replacing the
 * one kept on the phone) carries on with it, so even the last few letters
 * aren't lost. Without unsent typing it starts from the note as it is now
 * (which may be newer, from another device), not from the old box's text.
 */
const typedNotes = new Map<string, { text: string; unsent: boolean }>();

/**
 * Saves a moment after typing stops, when the field loses focus, when the
 * phone locks or the app is backgrounded, and when the card closes. Each save
 * lands on the phone first (so it survives a dropped signal or iOS closing the
 * app). The label follows the phone's queue, so "Saved" only shows once the
 * server has it — even if that happens later, after an automatic retry.
 */
function NoteField({
  entryId,
  initial,
  syncing,
  stuck,
  typing: typingHere,
  onTyping,
  onSave,
}: {
  entryId: string;
  initial: string;
  /** This entry's note is still waiting on the phone. */
  syncing: boolean;
  /** Changes can't go out right now (no signal, or an earlier one failed). */
  stuck: boolean;
  /** She was typing here (on this or another copy of the screen): carry on. */
  typing: boolean;
  onTyping: (typing: boolean) => void;
  onSave: (note: string) => Promise<SyncResult>;
}) {
  const id = useId();
  const noSignal = useNoSignal();
  // Typing carried over from the box this one replaced (see typedNotes).
  const [carried] = useState(() => {
    const t = typingHere ? typedNotes.get(entryId) : undefined;
    return t?.unsent ? t.text : null;
  });
  const [value, setValue] = useState(carried ?? initial);
  const [sent, setSent] = useState(false);
  // Typed here and not handed to the phone's queue yet.
  const [typing, setTyping] = useState(false);
  // The box has the keyboard...
  const [focused, setFocused] = useState(false);
  // ...and she has typed in it since it last took the note: what's in it is hers.
  const [edited, setEdited] = useState(carried !== null);
  const [shownInitial, setShownInitial] = useState(initial);
  if (initial !== shownInitial && !typing && !(focused && edited)) {
    // The note changed somewhere else (another device, another copy of this
    // screen), or her own save came back: show that, unless she's in the
    // middle of her own edit. Spaces or new lines at the ends don't count:
    // that's only the server tidying what she typed.
    setShownInitial(initial);
    if (initial.trim() !== value.trim()) {
      setValue(initial);
      setEdited(false);
    }
  }
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastSent = useRef(initial);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onSaveRef = useRef(onSave);

  useLayoutEffect(() => {
    latest.current = value;
    onSaveRef.current = onSave;
    if (ref.current) fitToText(ref.current);
  });

  function flush() {
    clearTimeout(timer.current);
    setTyping(false);
    const next = latest.current;
    if (typedNotes.has(entryId)) typedNotes.set(entryId, { text: next, unsent: false });
    if (next.trim() === lastSent.current.trim()) return;
    lastSent.current = next;
    setSent(true);
    void onSaveRef.current(next);
  }

  // Shown text that matches the note (from elsewhere, or her own save coming
  // back from the server) counts as already saved.
  useEffect(() => {
    if (latest.current.trim() === initial.trim()) lastSent.current = latest.current;
  }, [initial]);

  // This screen replaced another copy of itself while she was typing here:
  // keep the keyboard up, with the cursor at the end. If she was mid-edit
  // there, carry on with that box's text (she may have typed a letter or two
  // more while this one was being drawn; the other box has just sent it).
  useEffect(() => {
    const el = ref.current;
    if (!typingHere || !el || document.activeElement === el) return;
    const typed = typedNotes.get(entryId);
    if (carried !== null && typed && typed.text !== el.value) {
      el.value = typed.text; // so the cursor goes to the end of it
      lastSent.current = typed.text;
      setValue(typed.text);
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // Only when it first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTypingRef = useRef(onTyping);
  useLayoutEffect(() => {
    onTypingRef.current = onTyping;
  });
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      flush();
      onTypingRef.current(false); // the keyboard goes when the app does
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      // Don't lose typing when the card closes or the screen changes.
      flush();
      // Removed while it had the keyboard (the browser then says nothing):
      // she's no longer typing here, unless this note's box on the screen
      // that took over has the keyboard now.
      setTimeout(() => {
        const el = document.activeElement;
        if (el instanceof HTMLTextAreaElement && el.dataset.noteFor === entryId) return;
        typedNotes.delete(entryId);
        onTypingRef.current(false);
      }, 0);
    };
    // Set up once; flush and the entry go by refs and don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = syncing
    ? noSignal || stuck
      ? { text: "Saved on this phone — will sync", tone: "text-ink-3" }
      : { text: "Saving…", tone: "text-ink-3" }
    : sent
      ? { text: "Saved", tone: "text-done" }
      : null;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
          Note
        </label>
        {label && (
          <span role="status" className={cx("text-xs font-medium", label.tone)}>
            {label.text}
          </span>
        )}
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={2}
        maxLength={4000}
        placeholder="How did it go? What did you work on?"
        data-note-for={entryId}
        onChange={(e) => {
          setValue(e.target.value);
          typedNotes.set(entryId, { text: e.target.value, unsent: true });
          setEdited(true);
          setTyping(true);
          setSent(false); // new text isn't saved yet: no "Saved" until it is
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 900);
        }}
        onFocus={() => {
          setFocused(true);
          onTyping(true);
        }}
        onBlur={() => {
          flush();
          setFocused(false);
          setEdited(false); // what she typed is saved now
          typedNotes.delete(entryId);
          // Unless the same note has the keyboard again at once (another copy
          // of this screen took over).
          const el = ref.current;
          setTimeout(() => {
            if (document.activeElement?.tagName !== "TEXTAREA" || document.activeElement === el) onTyping(false);
          }, 0);
        }}
        className="block w-full resize-none rounded-xl bg-surface-2 px-3.5 py-2.5 leading-snug text-ink placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-brand/50 focus:outline-none"
      />
    </div>
  );
}
