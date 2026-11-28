import type { JSX } from "react";
import type { NoteListPage } from "../datasources/seminar-notes-datasource";
import { seminarClasses } from "./seminar-design";

export type NoteListProps = NoteListPage;

/** A note opens at /notes/<id>. */
export function noteHref(id: string): string {
  return `/notes/${id}`;
}

/** The brain's notes: each by its title, under its opening sentence. */
export const NoteListTemplate = ({ notes }: NoteListProps): JSX.Element => (
  <div className="seminar-notes" lang="en">
    <section className={seminarClasses.frame}>
      <h2 className={`m-0 pt-7 font-normal ${seminarClasses.label}`}>
        Notes on the three
      </h2>
      {notes.length === 0 ? (
        <p className="m-0 py-12 font-mono text-sm text-theme-light">
          No notes yet.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {notes.map(({ id, title, opening }) => (
            <li
              key={id}
              className={`border-b ${seminarClasses.softRule} py-8 md:py-10`}
            >
              <a className="group block no-underline" href={noteHref(id)}>
                <h3 className="m-0 font-heading text-3xl font-normal leading-tight tracking-[-0.02em] text-heading group-hover:text-[var(--color-accent)] md:text-5xl">
                  {title}
                </h3>
                <p className="m-0 mt-3 max-w-[44rem] text-[1.06rem] leading-relaxed text-theme-muted">
                  {opening}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  </div>
);
