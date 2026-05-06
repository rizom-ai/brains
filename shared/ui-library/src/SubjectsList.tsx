import type { JSX } from "preact";

export interface SubjectsListProps {
  /** List of subject labels to render. */
  subjects: string[];
  /**
   * Builder for each subject's link target. Defaults to `/topics/<slug>`,
   * where slug is the lowercased name with whitespace replaced by hyphens.
   */
  hrefFor?: (subject: string) => string;
}

const defaultHrefFor = (subject: string): string =>
  `/topics/${subject.toLowerCase().replace(/\s+/g, "-")}`;

/**
 * Numbered editorial list of subjects (topics, expertise, …) — mono caps
 * indices on the left, Fraunces italic name on the right. Two columns on
 * sm+ widths, single column below. Replaces the pill-chip pattern used in
 * earlier About sections.
 */
export const SubjectsList = ({
  subjects,
  hrefFor = defaultHrefFor,
}: SubjectsListProps): JSX.Element => (
  <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-10 max-w-[40rem] border-t border-theme list-none p-0 m-0">
    {subjects.map((subject, i) => (
      <li key={subject} className="border-b border-theme">
        <a
          href={hrefFor(subject)}
          className="flex items-baseline gap-4 py-3 text-theme transition-[color,padding-left] duration-200 hover:text-accent hover:pl-1"
        >
          <span className="font-mono text-[0.66rem] tracking-[0.18em] text-theme-muted min-w-[1.6rem]">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="font-heading italic font-normal text-[1.05rem]">
            {subject}
          </span>
        </a>
      </li>
    ))}
  </ul>
);
