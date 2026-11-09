import type { SVGProps } from "react";
import { SHOE_HOLES, SHOE_PATH } from "./horseshoe-path";

/** Outline horseshoe, sized and colored like a lucide icon. */
export function HorseshoeIcon({ strokeWidth = 1.7, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d={SHOE_PATH} stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      {SHOE_HOLES.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={0.75} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Solid horseshoe used as the logo mark. */
export function HorseshoeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <mask id="shoe-holes">
        <rect width="24" height="24" fill="white" />
        {SHOE_HOLES.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={0.62} fill="black" />
        ))}
      </mask>
      <path d={SHOE_PATH} fill="currentColor" mask="url(#shoe-holes)" />
    </svg>
  );
}
