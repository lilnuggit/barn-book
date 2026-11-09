"use client";

import { Check } from "lucide-react";
import { PALETTE } from "@/lib/palette";
import { cx } from "./ui";

export function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx(
            `tone-${c}`,
            "grid size-10 place-items-center rounded-full bg-tone-solid text-surface ring-offset-2 ring-offset-surface transition",
            value === c && "ring-2 ring-tone-solid",
          )}
        >
          {value === c && <Check className="size-5" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
