import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import type { BookWithData } from "../schemas/book";
import type { ScoreEntry, Theme } from "../datasources/book-datasource";
import { count } from "../lib/count";
import { bookClasses, bookHref, licenseLabel } from "./book-design";

export interface BookDetailProps {
  entry: BookWithData;
  book: BookWithData;
  prev: BookWithData | null;
  next: BookWithData | null;
  /** Sections in the book, not counting its title entry. */
  total: number;
  /** On a book's title page, every section in reading order. */
  score: ScoreEntry[];
  /** On a section page, the topics nearest it. */
  themes: Theme[];
}

const BookDetails = ({ book }: { book: BookWithData }): JSX.Element => (
  <dl className="m-0 mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm text-theme-muted">
    {book.frontmatter.author && (
      <>
        <dt className={bookClasses.label}>Author</dt>
        <dd className="m-0">{book.frontmatter.author}</dd>
      </>
    )}
    {book.frontmatter.year !== null && (
      <>
        <dt className={bookClasses.label}>Year</dt>
        <dd className="m-0">{book.frontmatter.year}</dd>
      </>
    )}
    {book.frontmatter.edition && (
      <>
        <dt className={bookClasses.label}>Edition</dt>
        <dd className="m-0" lang="de">
          {book.frontmatter.edition}
        </dd>
      </>
    )}
  </dl>
);

const Source = ({
  entry,
  book,
}: {
  entry: BookWithData;
  book: BookWithData;
}): JSX.Element => {
  const license = licenseLabel(book);
  return (
    <p
      className={`${bookClasses.rule} m-0 mt-12 pt-4 font-mono text-[13px] leading-relaxed text-theme-light`}
    >
      Source:{" "}
      <a href={entry.frontmatter.source} className={bookClasses.link}>
        {book.frontmatter.attribution ?? entry.frontmatter.source}
      </a>
      {license && <span> · {license}</span>}
    </p>
  );
};

/** Where a link leads: the section's own title, with its siglum. */
const PagerLabel = ({ target }: { target: BookWithData }): JSX.Element => (
  <>
    <span lang="de">{target.metadata.title}</span>
    {target.metadata.section &&
      target.metadata.section !== target.metadata.title && (
        <span className="book-siglum ml-2 text-theme-light">
          {target.metadata.section}
        </span>
      )}
  </>
);

const Pager = ({
  prev,
  next,
}: {
  prev: BookWithData | null;
  next: BookWithData | null;
}): JSX.Element => (
  <nav
    className="mt-10 flex justify-between gap-6 font-mono text-sm"
    aria-label="Sections"
  >
    {prev ? (
      <a href={bookHref(prev)} rel="prev" className={bookClasses.link}>
        ← <PagerLabel target={prev} />
      </a>
    ) : (
      <span />
    )}
    {next && (
      <a href={bookHref(next)} rel="next" className={bookClasses.link}>
        <PagerLabel target={next} /> →
      </a>
    )}
  </nav>
);

/** The tallest stroke in a book's score; every other is to scale. */
const TALLEST_STROKE = 46;

interface ScoreRow {
  /** The heading the row stands for, or its section's title where none. */
  label: string;
  first: ScoreEntry;
  sections: ScoreEntry[];
}

interface ScorePart {
  /** The part's heading; null for a section that stands under none. */
  label: string | null;
  first: ScoreEntry;
  /** Whether the part's sections stand under divisions within it. */
  divided: boolean;
  /** One row per division of the part, or a single row for the whole part. */
  rows: ScoreRow[];
}

/**
 * Consecutive sections sharing the heading at `depth` form one run; a
 * section with no heading there runs alone, under its own title.
 */
function runsAt(sections: ScoreEntry[], depth: number): ScoreRow[] {
  return sections.reduce<ScoreRow[]>((runs, section) => {
    const heading = section.headings[depth];
    const last = runs.at(-1);
    if (
      last &&
      heading !== undefined &&
      last.first.headings[depth] === heading
    ) {
      last.sections.push(section);
      return runs;
    }
    return [
      ...runs,
      { label: heading ?? section.title, first: section, sections: [section] },
    ];
  }, []);
}

/** A book's parts, each divided where its sections stand under divisions. */
function partsOf(score: ScoreEntry[]): ScorePart[] {
  return runsAt(score, 0).map((run): ScorePart => {
    const part = run.first.headings[0] ?? null;
    const divided =
      part !== null && run.sections.some((section) => section.headings[1]);
    return {
      label: part,
      first: run.first,
      divided,
      rows: divided ? runsAt(run.sections, 1) : [run],
    };
  });
}

/** One row of the score: its label, a stroke per section, the count. */
const ScoreLine = ({
  row,
  longest,
  nested,
}: {
  row: ScoreRow;
  longest: number;
  nested: boolean;
}): JSX.Element => (
  <div
    className={`${nested ? "" : bookClasses.rule} grid gap-x-6 gap-y-2 py-4 md:grid-cols-[13rem_1fr_3rem] md:items-end`}
  >
    <a
      href={`/books/${row.first.slug}`}
      className={`${bookClasses.link} font-heading italic ${nested ? "text-base md:pl-4" : "text-lg"}`}
      lang="de"
    >
      {row.label}
    </a>
    <div className="flex flex-wrap items-end gap-x-[1px] gap-y-2">
      {row.sections.map((section) => (
        <a
          key={section.slug}
          href={`/books/${section.slug}`}
          title={[section.section, section.title].filter(Boolean).join(" · ")}
          style={{
            height: `${Math.max(4, Math.round((section.length / longest) * TALLEST_STROKE))}px`,
          }}
          className="block w-[2px] bg-[var(--color-heading)] opacity-85 hover:bg-brand hover:opacity-100"
        />
      ))}
    </div>
    <span className="font-mono text-xs text-theme-light md:text-right">
      {row.sections.length}
    </span>
  </div>
);

/**
 * The score: a row per part, or, where a part has divisions, the part's
 * heading with a row per division beneath it.
 */
const Score = ({ score }: { score: ScoreEntry[] }): JSX.Element => {
  const longest = Math.max(1, ...score.map((section) => section.length));
  return (
    <div>
      <p className={`${bookClasses.label} m-0 mb-6`}>
        Score — one stroke per section, as tall as its text
      </p>
      {partsOf(score).map((part) =>
        part.divided ? (
          <section key={part.first.slug} className={`${bookClasses.rule} pt-4`}>
            <a
              href={`/books/${part.first.slug}`}
              className={`${bookClasses.link} font-heading text-xl italic`}
              lang="de"
            >
              {part.label}
            </a>
            {part.rows.map((row) => (
              <ScoreLine
                key={row.first.slug}
                row={row}
                longest={longest}
                nested
              />
            ))}
          </section>
        ) : (
          part.rows.map((row) => (
            <ScoreLine
              key={row.first.slug}
              row={row}
              longest={longest}
              nested={false}
            />
          ))
        ),
      )}
    </div>
  );
};

/**
 * A book's title sets large in its narrow column; a title with a long word
 * (`Allzumenschliches`) steps down a size so the word fits whole, and only
 * hyphenates beyond that.
 */
function titleSize(title: string): string {
  const longest = Math.max(...title.split(/\s+/).map((word) => word.length));
  if (longest > 14) return "text-4xl md:text-4xl";
  if (longest > 10) return "text-4xl md:text-5xl";
  return "text-5xl md:text-6xl";
}

/** A book's title page: its details beside the score of its sections. */
const TitleView = ({
  entry,
  book,
  next,
  total,
  score,
}: BookDetailProps): JSX.Element => (
  <article className="mx-auto grid w-full max-w-[76rem] gap-x-16 gap-y-12 px-4 py-14 md:grid-cols-[22rem_minmax(0,1fr)] md:py-20">
    <header>
      <p className={`${bookClasses.label} m-0`}>{book.frontmatter.author}</p>
      <h1
        className={`m-0 mt-5 font-heading leading-[0.95] font-normal tracking-[-0.02em] text-heading hyphens-auto ${titleSize(entry.metadata.title)}`}
        lang="de"
      >
        {entry.metadata.title}
      </h1>
      <BookDetails book={book} />
      <p className="m-0 mt-2 font-mono text-sm text-theme-muted">
        {count(total, "section")}
      </p>
      <Source entry={entry} book={book} />
      {next && (
        <nav className="mt-10 flex justify-end font-mono text-sm">
          <a href={bookHref(next)} rel="next" className={bookClasses.link}>
            Begin reading →
          </a>
        </nav>
      )}
    </header>
    <Score score={score} />
  </article>
);

/**
 * Asking the brain about a section names it by its title; the question starts
 * with its siglum, so the answer cites the right passage.
 */
const AskAbout = ({
  siglum,
  title,
}: {
  siglum: string;
  title: string;
}): JSX.Element => (
  <a
    href={`/ask?q=${encodeURIComponent(`About ${siglum}: `)}`}
    className={`${bookClasses.link} block border-t-[1.5px] border-[var(--color-heading)] pt-3 font-heading text-lg italic text-theme-muted`}
    lang="de"
  >
    Ask about {title} →
  </a>
);

/**
 * What a reader asks about: the section's title, but for an editorial unit
 * (a bracketed siglum, `Za-II-[Titel]`) whose title only names its kind,
 * the heading it opens, or the book.
 */
function askTitleOf(entry: BookWithData, book: BookWithData): string {
  if (!entry.metadata.section?.includes("[")) return entry.metadata.title;
  return entry.frontmatter.headings.at(-1) ?? book.metadata.title;
}

/** The longest stretch of a siglum the margin sets on one line at full size. */
const MARGIN_SEGMENT = 9;

/**
 * A siglum breaks at its hyphens; one whose longest segment would overrun the
 * margin is set a size smaller, and only breaks inside a segment beyond that.
 */
const Siglum = ({ siglum }: { siglum: string }): JSX.Element => {
  const longest = Math.max(...siglum.split("-").map((part) => part.length));
  const size =
    longest > MARGIN_SEGMENT ? "text-2xl md:text-2xl" : "text-3xl md:text-4xl";
  return (
    <p
      className={`book-siglum m-0 leading-none text-heading [overflow-wrap:anywhere] ${size}`}
    >
      {siglum}
    </p>
  );
};

/** A section set for reading: siglum and place in the margin, text alone. */
const SectionView = ({
  entry,
  book,
  prev,
  next,
  total,
  themes,
}: BookDetailProps): JSX.Element => (
  <article className="mx-auto grid w-full max-w-[76rem] gap-x-14 gap-y-8 px-4 py-14 md:grid-cols-[13rem_minmax(0,40rem)] md:py-20 lg:grid-cols-[13rem_minmax(0,40rem)_minmax(0,14rem)]">
    <aside className="md:pt-3">
      <Siglum siglum={entry.metadata.section ?? String(entry.metadata.order)} />
      <p className="m-0 mt-4 font-mono text-xs leading-relaxed text-theme-muted">
        <a href={bookHref(book)} className={bookClasses.link} lang="de">
          {book.metadata.title}
        </a>
        {entry.frontmatter.headings.length > 0 && (
          <>
            <br />
            <span lang="de">{entry.frontmatter.headings.join(" · ")}</span>
          </>
        )}
        <br />
        {book.frontmatter.year !== null && `${book.frontmatter.year} · `}
        section {entry.metadata.order} of {total}
      </p>
    </aside>
    <div className="min-w-0">
      <h1
        className="m-0 mb-8 text-5xl leading-none font-normal text-heading hyphens-auto md:text-6xl"
        lang="de"
      >
        {entry.metadata.title}
      </h1>
      <div className="book-text" lang="de">
        <MarkdownContent markdown={entry.body} />
      </div>
      <Source entry={entry} book={book} />
      <Pager prev={prev} next={next} />
    </div>
    <aside className="md:col-start-2 lg:col-start-3 lg:pt-3">
      {themes.length > 0 && (
        <>
          <p className={`${bookClasses.label} m-0 mb-3`}>
            Themes in this section
          </p>
          <ul className="m-0 mb-8 list-none p-0">
            {themes.map((theme) => (
              <li key={theme.id} className={`${bookClasses.rule} py-2`}>
                <a
                  href={`/topics/${theme.id}`}
                  className={`${bookClasses.link} font-heading text-xl italic`}
                >
                  {theme.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <AskAbout
        siglum={entry.metadata.pageTitle}
        title={askTitleOf(entry, book)}
      />
    </aside>
  </article>
);

export const BookDetailTemplate = (props: BookDetailProps): JSX.Element =>
  props.entry.metadata.order === 0 ? (
    <TitleView {...props} />
  ) : (
    <SectionView {...props} />
  );
