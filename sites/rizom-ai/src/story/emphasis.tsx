/** @jsxImportSource react */
import type { JSX } from "react";

/** Authored *emphasis* in a chapter's words is emphasis: the story styles `em`. */
export function emphasize(text: string): (string | JSX.Element)[] {
  return text
    .split(/\*([^*]+)\*/g)
    .map((part, i) =>
      i % 2 === 1 ? <em key={`${i}-${part}`}>{part}</em> : part,
    );
}
