import type { JSX } from "react";
import { MarkdownContent } from "@rizom/brain-ui";
import type { NoteDetailPage } from "../datasources/seminar-notes-datasource";
import { seminarClasses } from "./seminar-design";

export type NoteDetailProps = NoteDetailPage;

/** One note: its title and its text as written, quotes and links kept. */
export const NoteDetailTemplate = ({ note }: NoteDetailProps): JSX.Element => (
  <article className={`${seminarClasses.frame} py-10 md:py-16`} lang="en">
    <p className={`m-0 ${seminarClasses.label}`}>
      <a className={seminarClasses.quiet} href="/notes">
        Notes
      </a>
    </p>
    <h1 className="m-0 mt-5 max-w-[60rem] font-heading text-5xl font-normal leading-[0.95] tracking-[-0.03em] text-heading md:text-7xl">
      {note.title}
    </h1>
    <MarkdownContent
      markdown={note.body}
      className="seminar-voice seminar-note mt-10 max-w-[44rem]"
    />
  </article>
);
