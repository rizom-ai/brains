import type { JSX } from "react";

/**
 * The paper keys, drawn in the current color (the crown key in brass): the
 * cover scatters all seven, Act I hangs its tag on one and Act II's button
 * carries another.
 */
export interface KeyShape {
  viewBox: string;
  drawing: JSX.Element;
}

const INK = "currentColor";
const BRASS = "var(--palette-mustard)";

const trefoil: KeyShape = {
  viewBox: "0 0 220 90",
  drawing: (
    <>
      <circle cx="28" cy="45" r="16" fill="none" stroke={INK} strokeWidth="9" />
      <circle cx="48" cy="25" r="13" fill="none" stroke={INK} strokeWidth="8" />
      <circle cx="48" cy="65" r="13" fill="none" stroke={INK} strokeWidth="8" />
      <rect x="56" y="39" width="150" height="12" rx="3" fill={INK} />
      <path d="M170 51 h12 v18 h8 v-18 h12 v26 h-32 Z" fill={INK} />
    </>
  ),
};

const ring: KeyShape = {
  viewBox: "0 0 220 84",
  drawing: (
    <>
      <circle
        cx="34"
        cy="42"
        r="24"
        fill="none"
        stroke={INK}
        strokeWidth="12"
      />
      <rect x="56" y="36" width="150" height="12" rx="3" fill={INK} />
      <rect x="170" y="48" width="12" height="20" fill={INK} />
      <rect x="192" y="48" width="10" height="14" fill={INK} />
    </>
  ),
};

const paddle: KeyShape = {
  viewBox: "0 0 220 90",
  drawing: (
    <>
      <path
        fillRule="evenodd"
        d="M10 45 C10 18 26 8 52 8 H70 C84 8 92 20 92 32 V58 C92 70 84 82 70 82 H52 C26 82 10 72 10 45 Z M38 45 a10 10 0 1 0 0.1 0 Z"
        fill={INK}
      />
      <path
        d="M92 34 H206 L214 45 L206 52 L196 52 L190 60 L182 52 L172 60 L164 52 L154 60 L146 52 L136 60 L128 52 L92 52 Z"
        fill={INK}
      />
    </>
  ),
};

const crown: KeyShape = {
  viewBox: "0 0 220 90",
  drawing: (
    <>
      <path
        d="M12 20 L24 40 L38 14 L52 40 L64 20 L60 62 L16 62 Z"
        fill={BRASS}
      />
      <circle cx="38" cy="50" r="6" fill={INK} />
      <rect x="60" y="38" width="146" height="12" rx="3" fill={BRASS} />
      <rect x="176" y="50" width="10" height="18" fill={BRASS} />
      <rect x="194" y="50" width="10" height="12" fill={BRASS} />
    </>
  ),
};

const heart: KeyShape = {
  viewBox: "0 0 220 90",
  drawing: (
    <>
      <path
        fillRule="evenodd"
        d="M40 78 C10 58 4 40 10 26 C16 12 34 10 40 24 C46 10 64 12 70 26 C76 40 70 58 40 78 Z M40 36 a8 8 0 1 0 0.1 0 Z"
        fill={INK}
      />
      <rect x="66" y="38" width="140" height="12" rx="3" fill={INK} />
      <path d="M168 50 h10 v14 h8 v-14 h10 v24 h-28 Z" fill={INK} />
    </>
  ),
};

const oval: KeyShape = {
  viewBox: "0 0 220 90",
  drawing: (
    <>
      <ellipse
        cx="34"
        cy="45"
        rx="26"
        ry="34"
        fill="none"
        stroke={INK}
        strokeWidth="10"
      />
      <rect x="58" y="39" width="150" height="12" rx="3" fill={INK} />
      <path
        d="M160 51 h10 v12 h8 v-12 h10 v20 h8 v-20 h10 v26 h-46 Z"
        fill={INK}
      />
    </>
  ),
};

const disc: KeyShape = {
  viewBox: "0 0 220 90",
  drawing: (
    <>
      <path
        fillRule="evenodd"
        d="M44 6 a39 39 0 1 1 0 78 a39 39 0 1 1 0 -78 Z M30 45 a9 9 0 1 0 0.1 0 Z"
        fill={INK}
      />
      <path
        d="M80 36 H206 V54 H196 L190 46 L184 54 L176 46 L170 54 L162 46 L156 54 L80 54 Z"
        fill={INK}
      />
    </>
  ),
};

export const KEY_SHAPES: Record<
  "trefoil" | "ring" | "paddle" | "crown" | "heart" | "oval" | "disc",
  KeyShape
> = { trefoil, ring, paddle, crown, heart, oval, disc };

export function KeyDrawing({ shape }: { shape: KeyShape }): JSX.Element {
  return (
    <svg viewBox={shape.viewBox} aria-hidden="true">
      {shape.drawing}
    </svg>
  );
}
