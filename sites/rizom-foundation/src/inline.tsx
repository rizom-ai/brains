import type { JSX } from "react";

/** A `{ label, href }` link, as every door and call to action is authored. */
export interface Door {
  label: string;
  href: string;
}

/**
 * Authored inline marks in running text: `**strong**` and `[label](href)`.
 * Everything else is the words as written.
 */
export function inline(text: string): (string | JSX.Element)[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    const strong = /^\*\*([^*]+)\*\*$/.exec(part);
    if (strong) return <strong key={`${i}-${part}`}>{strong[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={`${i}-${part}`} href={link[2]}>
          {link[1]}
        </a>
      );
    }
    return part;
  });
}
