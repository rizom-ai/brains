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
    {target.metadata.section && (
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

interface ScorePart {
  /** The part's name, or its first section's title where it has none. */
  label: string;
  first: ScoreEntry;
  sections: ScoreEntry[];
}

/** Consecutive sections of the same part form one row of the score. */
function partsOf(score: ScoreEntry[]): ScorePart[] {
  return score.reduce<ScorePart[]>((parts, section) => {
    const last = parts.at(-1);
    if (last && section.part !== null && last.first.part === section.part) {
      last.sections.push(section);
      return parts;
    }
    return [
      ...parts,
      {
        label: section.part ?? section.title,
        first: section,
        sections: [section],
      },
    ];
  }, []);
}

const Score = ({ score }: { score: ScoreEntry[] }): JSX.Element => {
  const longest = Math.max(1, ...score.map((section) => section.length));
  return (
    <div>
      <p className={`${bookClasses.label} m-0 mb-6`}>
        Score — one stroke per section, as tall as its text
      </p>
      {partsOf(score).map((part) => (
        <div
          key={part.first.slug}
          className={`${bookClasses.rule} grid gap-x-6 gap-y-2 py-4 md:grid-cols-[13rem_1fr_3rem] md:items-end`}
        >
          <a
            href={`/books/${part.first.slug}`}
            className={`${bookClasses.link} font-heading text-lg italic`}
            lang="de"
          >
            {part.label}
          </a>
          <div className="flex flex-wrap items-end gap-x-[1px] gap-y-2">
            {part.sections.map((section) => (
              <a
                key={section.slug}
                href={`/books/${section.slug}`}
                title={[section.section, section.title]
                  .filter(Boolean)
                  .join(" · ")}
                style={{
                  height: `${Math.max(4, Math.round((section.length / longest) * TALLEST_STROKE))}px`,
                }}
                className="block w-[2px] bg-[var(--color-heading)] opacity-85 hover:bg-brand hover:opacity-100"
              />
            ))}
          </div>
          <span className="font-mono text-xs text-theme-light md:text-right">
            {part.sections.length}
          </span>
        </div>
      ))}
    </div>
  );
};

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
        className="m-0 mt-5 font-heading text-5xl leading-[0.95] font-normal tracking-[-0.02em] text-heading md:text-6xl"
        lang="de"
      >
        {entry.metadata.title}
      </h1>
      <BookDetails book={book} />
      <p className="m-0 mt-2 font-mono text-sm text-theme-muted">
        {count(total, "section")}
      </p>
      <Source entry={entry} book={book} />
      <Pager prev={null} next={next} />
    </header>
    <Score score={score} />
  </article>
);

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
      <p className="book-siglum m-0 text-3xl leading-none text-heading md:text-4xl">
        {entry.metadata.section ?? entry.metadata.order}
      </p>
      <p className="m-0 mt-4 font-mono text-xs leading-relaxed text-theme-muted">
        <a href={bookHref(book)} className={bookClasses.link} lang="de">
          {book.metadata.title}
        </a>
        <br />
        {book.frontmatter.year !== null && `${book.frontmatter.year} · `}
        section {entry.metadata.order} of {total}
      </p>
    </aside>
    <div className="min-w-0">
      <h1
        className="m-0 mb-8 text-5xl leading-none font-normal text-heading md:text-6xl"
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
    {themes.length > 0 && (
      <aside className="md:col-start-2 lg:col-start-3 lg:pt-3">
        <p className={`${bookClasses.label} m-0 mb-3`}>
          Themes in this section
        </p>
        <ul className="m-0 list-none p-0">
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
      </aside>
    )}
  </article>
);

export const BookDetailTemplate = (props: BookDetailProps): JSX.Element =>
  props.entry.metadata.order === 0 ? (
    <TitleView {...props} />
  ) : (
    <SectionView {...props} />
  );
