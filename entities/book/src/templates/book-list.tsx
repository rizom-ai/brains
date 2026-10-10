import type { JSX } from "react";
import type { BookWithData } from "../schemas/book";
import { count } from "../lib/count";
import { bookClasses, bookHref } from "./book-design";

export interface BookListProps {
  books: BookWithData[];
}

/** The longest book's spine height; every other spine is to scale. */
const TALLEST = 280;

interface Spine {
  book: BookWithData;
  year: number;
  title: string;
  label: string;
  height: number;
  published: boolean;
}

function spinesOf(books: BookWithData[]): Spine[] {
  const dated = books.filter(
    (book): book is BookWithData & { frontmatter: { year: number } } =>
      book.frontmatter.year !== null,
  );
  const longest = Math.max(
    1,
    ...dated.map((book) => book.frontmatter.length ?? 0),
  );
  return [...dated]
    .sort((a, b) => a.frontmatter.year - b.frontmatter.year)
    .map((book) => ({
      book,
      year: book.frontmatter.year,
      title: book.metadata.title,
      label: book.frontmatter.shortTitle ?? book.metadata.title,
      height: Math.max(
        6,
        Math.round(((book.frontmatter.length ?? 0) / longest) * TALLEST),
      ),
      published: book.frontmatter.published !== false,
    }));
}

/** A vertical label fits when the spine is taller than its letters. */
function fits(label: string, height: number): boolean {
  return height >= label.length * 6.4 + 18;
}

/** The author most of the books are by. */
function authorOf(books: BookWithData[]): string | null {
  const counts = books.reduce<Map<string, number>>((tally, book) => {
    const author = book.frontmatter.author;
    return author ? tally.set(author, (tally.get(author) ?? 0) + 1) : tally;
  }, new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * A title too long for its spine stands just outside it: above a published
 * book, below a posthumous one. The spine itself carries the accessible
 * name, so the outside label is hidden from assistive technology.
 */
const OutsideLabel = ({ spine }: { spine: Spine }): JSX.Element => (
  <a
    href={bookHref(spine.book)}
    aria-hidden="true"
    tabIndex={-1}
    className={`flex w-[18px] justify-center no-underline text-theme-muted hover:text-brand ${
      spine.published ? "pb-1" : "pt-1"
    }`}
  >
    <span
      className="rotate-180 font-heading text-[11px] whitespace-nowrap [writing-mode:vertical-rl]"
      lang="de"
    >
      {spine.label}
    </span>
  </a>
);

/** A spine, its title inside it, or just outside where it does not fit. */
const SpineLink = ({ spine }: { spine: Spine }): JSX.Element =>
  fits(spine.label, spine.height) ? (
    <SpineBlock spine={spine} />
  ) : (
    <div
      className={`flex shrink-0 ${spine.published ? "flex-col justify-end" : "flex-col-reverse justify-end"}`}
    >
      <OutsideLabel spine={spine} />
      <SpineBlock spine={spine} />
    </div>
  );

const SpineBlock = ({ spine }: { spine: Spine }): JSX.Element => (
  <a
    href={bookHref(spine.book)}
    aria-label={`${spine.title}, ${spine.year}`}
    title={`${spine.title}, ${spine.year}`}
    data-published={spine.published ? "true" : "false"}
    style={{ height: `${spine.height}px` }}
    className={`flex w-[18px] shrink-0 justify-center overflow-hidden no-underline transition-transform duration-200 ${
      spine.published
        ? "items-end bg-[var(--color-heading)] text-theme-inverse hover:-translate-y-2 hover:bg-brand"
        : "items-start border border-t-0 border-[var(--color-heading)] text-heading hover:translate-y-1.5 hover:bg-[var(--color-accent-soft)]"
    }`}
  >
    {fits(spine.label, spine.height) && (
      <span
        className="rotate-180 py-2 font-heading text-[11px] font-semibold whitespace-nowrap [writing-mode:vertical-rl]"
        lang="de"
      >
        {spine.label}
      </span>
    )}
  </a>
);

/**
 * One column per year, each at least as wide as its spines, so busy years
 * widen and nothing overlaps while quiet years keep the scale. Published
 * books stand on the axis; posthumous writings hang below it.
 */
const Horizon = ({ spines }: { spines: Spine[] }): JSX.Element => {
  const first = Math.min(...spines.map((spine) => spine.year));
  const last = Math.max(...spines.map((spine) => spine.year));
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const step = years.length > 13 ? 2 : 1;
  const below = Math.max(
    24,
    ...spines.filter((spine) => !spine.published).map((spine) => spine.height),
  );
  const inYear = (year: number, published: boolean): Spine[] =>
    spines.filter(
      (spine) => spine.year === year && spine.published === published,
    );
  return (
    <div
      className="mx-4 hidden md:grid"
      style={{
        gridTemplateColumns: `repeat(${years.length}, minmax(min-content, 1fr))`,
      }}
    >
      {years.map((year) => (
        <div
          key={`above-${year}`}
          className="flex items-end gap-[2px] border-b-[1.5px] border-[var(--color-heading)] pr-[2px]"
          style={{ height: `${TALLEST + 24}px` }}
        >
          {inYear(year, true).map((spine) => (
            <SpineLink key={spine.book.id} spine={spine} />
          ))}
        </div>
      ))}
      {years.map((year) => (
        <div
          key={`below-${year}`}
          className="flex items-start gap-[2px] pr-[2px]"
          style={{ minHeight: `${below}px` }}
        >
          {inYear(year, false).map((spine) => (
            <SpineLink key={spine.book.id} spine={spine} />
          ))}
        </div>
      ))}
      {years.map((year) => (
        <span
          key={`year-${year}`}
          className="pt-5 font-mono text-[11px] text-theme-light"
        >
          {(year - first) % step === 0 || year === last ? year : ""}
        </span>
      ))}
    </div>
  );
};

/** Small screens read the horizon as a list of books by year. */
const YearList = ({ spines }: { spines: Spine[] }): JSX.Element => {
  const longest = Math.max(1, ...spines.map((spine) => spine.height));
  return (
    <ol className="book-year-list m-0 list-none border-t-[1.5px] border-[var(--color-heading)] p-0 px-4 md:hidden">
      {spines.map((spine) => (
        <li
          key={spine.book.id}
          className={`${bookClasses.rule} grid grid-cols-[3rem_1fr_auto] items-center gap-3 py-3`}
        >
          <span className="font-mono text-xs text-theme-light">
            {spine.year}
          </span>
          <a
            href={bookHref(spine.book)}
            className={`${bookClasses.link} font-heading text-lg ${spine.published ? "" : "italic text-theme-muted"}`}
            lang="de"
          >
            {spine.title}
          </a>
          <span
            className={`block h-1.5 ${spine.published ? "bg-[var(--color-heading)]" : "border border-[var(--color-heading)]"}`}
            style={{
              width: `${Math.max(4, Math.round((spine.height / longest) * 72))}px`,
            }}
          />
        </li>
      ))}
    </ol>
  );
};

/** The work as one horizon: each book a spine at its year, as tall as its text. */
export const BookListTemplate = ({ books }: BookListProps): JSX.Element => {
  const spines = spinesOf(books);
  const author = authorOf(books);
  const sections = books.reduce(
    (sum, book) => sum + (book.frontmatter.sections ?? 0),
    0,
  );
  const years = spines.map((spine) => spine.year);
  return (
    <section className="mx-auto w-full max-w-[76rem] py-14 md:py-20">
      <header className="mb-10 grid gap-8 px-4 md:grid-cols-[1fr_22rem] md:items-end">
        <h1 className="m-0 font-heading text-7xl leading-[0.86] font-normal tracking-[-0.035em] text-heading md:text-9xl">
          The <em>Work</em>
          {years.length > 0 && (
            <span className="mt-5 flex items-center gap-4 text-3xl tracking-normal text-theme-muted md:text-4xl">
              {Math.min(...years)}
              <span className="inline-block h-[2px] w-14 bg-current" />
              {Math.max(...years)}
            </span>
          )}
        </h1>
        <p className="m-0 border-l border-rule-strong pl-5 font-mono text-[13px] leading-relaxed text-theme-muted">
          {author && (
            <>
              <span className="text-heading">{author}</span>
              <br />
            </>
          )}
          {count(books.length, "book")} · {count(sections, "section")}
          <br />
          each spine as tall as its text
          <br />
          above the line: published · below: posthumous
        </p>
      </header>
      <Horizon spines={spines} />
      <YearList spines={spines} />
    </section>
  );
};
