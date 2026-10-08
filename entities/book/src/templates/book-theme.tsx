import type { JSX } from "react";
import type {
  Passage,
  StrandEntry,
} from "../datasources/book-theme-datasource";
import { count } from "../lib/count";
import { bookClasses } from "./book-design";

export interface BookThemeProps {
  theme: { id: string; title: string; summary: string };
  strand: StrandEntry[];
  passages: Passage[];
}

/** A title that only repeats the siglum's last segment says nothing more. */
function namesMore(passage: Passage): boolean {
  return !passage.section?.endsWith(`-${passage.title}`);
}

/** The book holding most of the theme gets the tallest bar. */
const TALLEST_BAR = 120;

/** Each book's share of the theme, standing at its year. */
const Strand = ({ strand }: { strand: StrandEntry[] }): JSX.Element | null => {
  const dated = strand.filter(
    (entry): entry is StrandEntry & { year: number } => entry.year !== null,
  );
  if (dated.length === 0) return null;
  const first = Math.min(...dated.map((entry) => entry.year));
  const last = Math.max(...dated.map((entry) => entry.year));
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const most = Math.max(1, ...dated.map((entry) => entry.sections));
  return (
    <div
      className="mt-12 grid"
      style={{
        gridTemplateColumns: `repeat(${years.length}, minmax(min-content, 1fr))`,
      }}
    >
      {years.map((year) => (
        <div
          key={year}
          className="flex items-end gap-[2px] border-b-[1.5px] border-[var(--color-heading)] pr-[2px]"
          style={{ height: `${TALLEST_BAR + 16}px` }}
        >
          {dated
            .filter((entry) => entry.year === year)
            .map((entry) => (
              <a
                key={entry.book}
                href={`/books/${entry.book}`}
                aria-label={`${entry.title}, ${entry.year}: ${count(entry.sections, "section")}`}
                title={`${entry.title}, ${entry.year}: ${count(entry.sections, "section")}`}
                style={{
                  height: `${Math.max(4, Math.round((entry.sections / most) * TALLEST_BAR))}px`,
                }}
                className={`block w-[10px] shrink-0 no-underline ${
                  entry.published
                    ? "bg-brand hover:opacity-80"
                    : "border border-b-0 border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                }`}
              />
            ))}
        </div>
      ))}
      {years.map((year) => (
        <span
          key={`year-${year}`}
          className="pt-3 font-mono text-[11px] text-theme-light"
        >
          {year === first || year === last ? year : ""}
        </span>
      ))}
    </div>
  );
};

/** A theme traced across the work: where it gathers, and its strongest passages. */
export const BookThemeTemplate = ({
  theme,
  strand,
  passages,
}: BookThemeProps): JSX.Element => {
  const sections = strand.reduce((sum, entry) => sum + entry.sections, 0);
  return (
    <article className="mx-auto w-full max-w-[76rem] px-4 py-14 md:py-20">
      <header>
        <p className={`${bookClasses.label} m-0 text-brand`}>
          {strand.length > 0
            ? `Theme — in ${count(strand.length, "book")} · ${count(sections, "section")}`
            : "Theme"}
        </p>
        <h1
          className="m-0 mt-4 font-heading text-7xl leading-[0.85] font-normal italic tracking-[-0.04em] text-heading md:text-9xl"
          lang="de"
        >
          {theme.title}
        </h1>
        {theme.summary && (
          <p className="m-0 mt-8 max-w-[42rem] text-lg leading-relaxed text-theme-muted">
            {theme.summary}
          </p>
        )}
      </header>
      <Strand strand={strand} />
      {passages.length > 0 && (
        <ol className="m-0 mt-16 grid list-none gap-0 p-0 md:grid-cols-2">
          {passages.map((passage) => (
            <li
              key={passage.slug}
              className={`${bookClasses.rule} py-5 md:pr-8`}
            >
              <a
                href={`/books/${passage.slug}`}
                className={`${bookClasses.link} block`}
              >
                {passage.section && (
                  <span className="book-siglum text-sm text-brand">
                    {passage.section}
                  </span>
                )}
                <span className="mt-1 block font-heading text-2xl" lang="de">
                  {passage.bookTitle}
                </span>
                {namesMore(passage) && (
                  <span className="block text-theme-muted" lang="de">
                    {passage.title}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
};
