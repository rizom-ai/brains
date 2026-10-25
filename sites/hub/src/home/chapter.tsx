import type { JSX, ReactNode } from "react";
import { emphasize } from "../emphasis";

/**
 * A chapter of the story: its number and label, its headline and its
 * words in a card, and the scene the field draws while it is read. The
 * scene's captions travel with it as JSON, so the drawing's words live in
 * the brain with the chapter's. `length` is how many screens it lasts.
 */
export function Chapter({
  id,
  scene,
  number,
  label,
  headline,
  length,
  captions,
  children,
}: {
  id: string;
  scene: string;
  number: string;
  label: string;
  headline: string;
  length: "2.2" | "2.6" | "2.8" | "3";
  captions: Record<string, string>;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className="hub-ch"
      id={id}
      data-hub-scene={scene}
      data-hub-label={number}
      data-hub-captions={JSON.stringify(captions)}
      data-len={length}
    >
      <div className="hub-card">
        <p className="hub-cap">
          {number} <span>· {label}</span>
        </p>
        <h2 className="hub-head">{emphasize(headline)}</h2>
        {children}
      </div>
    </section>
  );
}

/** A chapter's words, one paragraph each. */
export function Paragraphs({ items }: { items: string[] }): JSX.Element {
  return (
    <>
      {items.map((item) => (
        <p key={item} className="hub-text">
          {item}
        </p>
      ))}
    </>
  );
}

/** Two digits, as the story counts cohorts and chapters. */
export function pad(value: number): string {
  return String(value).padStart(2, "0");
}
