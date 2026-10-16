import type { JSX } from "react";
import type { BookWithData } from "../schemas/book";
import { count } from "../lib/count";
import { bookClasses, bookHref } from "./book-design";

export interface BookListProps {
  books: BookWithData[];
}

/** The longest book's spine height; every other spine is to scale. */
const TALLEST = 280;

/** A spine's width where the horizon has room, and the gap after each. */
const SPINE = 18;
const SPINE_GAP = 2;
/** The narrowest spine that still carries its title. */
const TITLED_SPINE = 14;
/** The narrowest a crowded shelf's spines get. */
const THINNEST_SPINE = 3;
/** A run of more years without books than this folds into one break. */
const GAP_YEARS = 5;
const BREAK_WIDTH = 28;
/** The room a year's label needs before the next one may stand. */
const LABEL_ROOM = 36;

/**
 * The width the horizon gets from each breakpoint up: the screen less its
 * margins, capped by the section's 76rem. Below the first it fits, the work
 * reads as the year list.
 */
const WIDEST = {
  width: 1184,
  horizon: "hidden xl:grid",
  list: "xl:hidden",
} as const;
const SCREENS = [
  { width: 736, horizon: "hidden md:grid", list: "md:hidden" },
  { width: 992, horizon: "hidden lg:grid", list: "lg:hidden" },
  WIDEST,
] as const;
type Screen = (typeof SCREENS)[number];

interface Spine {
  book: BookWithData;
  year: number;
  title: string;
  label: string;
  height: number;
  published: boolean;
}

interface YearColumn {
  kind: "year";
  year: number;
  above: Spine[];
  below: Spine[];
}

interface GapColumn {
  kind: "gap";
  from: number;
  to: number;
}

type Column = YearColumn | GapColumn;

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

/** The most spines a year stands side by side, above or below the line. */
function depth(column: YearColumn): number {
  return Math.max(column.above.length, column.below.length);
}

/**
 * One column per year, from the first book to the last; a long run of years
 * without books folds into one break, so a late edition does not stretch the
 * horizon over decades of nothing.
 */
function columnsOf(spines: Spine[]): Column[] {
  if (spines.length === 0) return [];
  const first = Math.min(...spines.map((spine) => spine.year));
  const last = Math.max(...spines.map((spine) => spine.year));
  const years = Array.from({ length: last - first + 1 }, (_, i): YearColumn => {
    const inYear = spines.filter((spine) => spine.year === first + i);
    return {
      kind: "year",
      year: first + i,
      above: inYear.filter((spine) => spine.published),
      below: inYear.filter((spine) => !spine.published),
    };
  });
  const runs = years.reduce<YearColumn[][]>((runs, column) => {
    const run = runs.at(-1);
    return run?.[0] && depth(run[0]) === 0 && depth(column) === 0
      ? [...runs.slice(0, -1), [...run, column]]
      : [...runs, [column]];
  }, []);
  return runs.flatMap((run): Column[] => {
    const [start] = run;
    const end = run.at(-1);
    return start && end && depth(start) === 0 && run.length > GAP_YEARS
      ? [{ kind: "gap", from: start.year, to: end.year }]
      : run;
  });
}

/** The least width a column takes with spines this wide. */
function widthOf(column: Column, spine: number): number {
  if (column.kind === "gap") return BREAK_WIDTH;
  return depth(column) === 0 ? SPINE_GAP : depth(column) * (spine + SPINE_GAP);
}

function widthOfAll(columns: Column[], spine: number): number {
  return columns.reduce((sum, column) => sum + widthOf(column, spine), 0);
}

/**
 * The narrowest screen the horizon fits with full spines; a shelf too crowded
 * for even the widest gets spines as narrow as it needs.
 */
function fit(columns: Column[]): { screen: Screen; spine: number } {
  const roomy = SCREENS.find(
    (screen) => widthOfAll(columns, SPINE) <= screen.width,
  );
  if (roomy) return { screen: roomy, spine: SPINE };
  const spines = columns.reduce(
    (sum, column) => sum + (column.kind === "year" ? depth(column) : 0),
    0,
  );
  const spine = Math.floor(
    (WIDEST.width - widthOfAll(columns, 0)) / Math.max(1, spines),
  );
  return { screen: WIDEST, spine: Math.max(THINNEST_SPINE, spine) };
}

/**
 * The years whose labels stand on the axis: years with books, each at least a
 * label's room after the one before, the first and the last always. A column
 * is never narrower than its least width, so labels spaced by it never meet.
 */
function axisYears(columns: Column[], spine: number): Set<number> {
  const { booked } = columns.reduce<{
    x: number;
    booked: { year: number; x: number }[];
  }>(
    (acc, column) => ({
      x: acc.x + widthOf(column, spine),
      booked:
        column.kind === "year" && depth(column) > 0
          ? [...acc.booked, { year: column.year, x: acc.x }]
          : acc.booked,
    }),
    { x: 0, booked: [] },
  );
  const [first] = booked;
  if (!first) return new Set();
  const last = booked.length > 1 ? booked.at(-1) : undefined;
  const spaced = booked
    .slice(1, -1)
    .reduce(
      (labelled, year) =>
        year.x - (labelled.at(-1)?.x ?? 0) >= LABEL_ROOM
          ? [...labelled, year]
          : labelled,
      [first],
    );
  const closing =
    last && spaced.length > 1 && last.x - (spaced.at(-1)?.x ?? 0) < LABEL_ROOM
      ? spaced.slice(0, -1)
      : spaced;
  return new Set(
    [...closing, ...(last ? [last] : [])].map((year) => year.year),
  );
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
const OutsideLabel = ({
  spine,
  width,
}: {
  spine: Spine;
  width: number;
}): JSX.Element => (
  <a
    href={bookHref(spine.book)}
    aria-hidden="true"
    tabIndex={-1}
    style={{ width: `${width}px` }}
    className={`flex justify-center no-underline text-theme-muted hover:text-brand ${
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

/**
 * A spine, its title inside it, or just outside where it does not fit. A
 * spine too narrow for letters leaves its title to its hover and the list.
 */
const SpineLink = ({
  spine,
  width,
}: {
  spine: Spine;
  width: number;
}): JSX.Element => {
  if (width < TITLED_SPINE)
    return <SpineBlock spine={spine} width={width} titled={false} />;
  if (fits(spine.label, spine.height))
    return <SpineBlock spine={spine} width={width} titled />;
  return (
    <div
      className={`flex shrink-0 ${spine.published ? "flex-col justify-end" : "flex-col-reverse justify-end"}`}
    >
      <OutsideLabel spine={spine} width={width} />
      <SpineBlock spine={spine} width={width} titled={false} />
    </div>
  );
};

const SpineBlock = ({
  spine,
  width,
  titled,
}: {
  spine: Spine;
  width: number;
  titled: boolean;
}): JSX.Element => (
  <a
    href={bookHref(spine.book)}
    aria-label={`${spine.title}, ${spine.year}`}
    title={`${spine.title}, ${spine.year}`}
    data-published={spine.published ? "true" : "false"}
    style={{ height: `${spine.height}px`, width: `${width}px` }}
    className={`flex shrink-0 justify-center overflow-hidden no-underline transition-transform duration-200 ${
      spine.published
        ? "items-end bg-[var(--color-heading)] text-theme-inverse hover:-translate-y-2 hover:bg-brand"
        : "items-start border border-t-0 border-[var(--color-heading)] text-heading hover:translate-y-1.5 hover:bg-[var(--color-accent-soft)]"
    }`}
  >
    {titled && (
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
 * widen and nothing overlaps while quiet years keep the scale; a long quiet
 * run is one break in the line. Published books stand on the axis;
 * posthumous writings hang below it.
 */
const Horizon = ({
  columns,
  screen,
  spine,
}: {
  columns: Column[];
  screen: Screen;
  spine: number;
}): JSX.Element => {
  const below = Math.max(
    24,
    ...columns.flatMap((column) =>
      column.kind === "year" ? column.below.map((each) => each.height) : [],
    ),
  );
  const labelled = axisYears(columns, spine);
  const gapKey = (column: GapColumn): string => `${column.from}–${column.to}`;
  return (
    <div
      className={`mx-4 ${screen.horizon}`}
      style={{
        gridTemplateColumns: columns
          .map((column) =>
            column.kind === "gap"
              ? `${BREAK_WIDTH}px`
              : "minmax(min-content, 1fr)",
          )
          .join(" "),
      }}
    >
      {columns.map((column) =>
        column.kind === "gap" ? (
          <div
            key={`above-${gapKey(column)}`}
            data-gap={gapKey(column)}
            title={gapKey(column)}
            className="relative"
            style={{ height: `${TALLEST + 24}px` }}
          >
            <span
              aria-hidden="true"
              className="absolute -bottom-[0.55em] left-1/2 -translate-x-1/2 font-mono text-[13px] leading-none text-theme-light"
            >
              {"//"}
            </span>
          </div>
        ) : (
          <div
            key={`above-${column.year}`}
            className="flex items-end gap-[2px] border-b-[1.5px] border-[var(--color-heading)] pr-[2px]"
            style={{ height: `${TALLEST + 24}px` }}
          >
            {column.above.map((each) => (
              <SpineLink key={each.book.id} spine={each} width={spine} />
            ))}
          </div>
        ),
      )}
      {columns.map((column) =>
        column.kind === "gap" ? (
          <div key={`below-${gapKey(column)}`} />
        ) : (
          <div
            key={`below-${column.year}`}
            className="flex items-start gap-[2px] pr-[2px]"
            style={{ minHeight: `${below}px` }}
          >
            {column.below.map((each) => (
              <SpineLink key={each.book.id} spine={each} width={spine} />
            ))}
          </div>
        ),
      )}
      {columns.map((column) =>
        column.kind === "gap" ? (
          <span key={`year-${gapKey(column)}`} className="block h-9" />
        ) : (
          <span key={`year-${column.year}`} className="relative block h-9">
            {labelled.has(column.year) && (
              <span
                data-axis-year={column.year}
                className="absolute top-5 left-0 font-mono text-[11px] text-theme-light"
              >
                {column.year}
              </span>
            )}
          </span>
        ),
      )}
    </div>
  );
};

/** Screens too narrow for the horizon read it as a list of books by year. */
const YearList = ({
  spines,
  screen,
}: {
  spines: Spine[];
  screen: Screen;
}): JSX.Element => {
  const longest = Math.max(1, ...spines.map((spine) => spine.height));
  return (
    <ol
      className={`book-year-list m-0 list-none border-t-[1.5px] border-[var(--color-heading)] p-0 px-4 ${screen.list}`}
    >
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
  const columns = columnsOf(spines);
  const { screen, spine } = fit(columns);
  const author = authorOf(books);
  const sections = books.reduce(
    (sum, book) => sum + (book.frontmatter.sections ?? 0),
    0,
  );
  const years = spines.map((each) => each.year);
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
      <Horizon columns={columns} screen={screen} spine={spine} />
      <YearList spines={spines} screen={screen} />
    </section>
  );
};
