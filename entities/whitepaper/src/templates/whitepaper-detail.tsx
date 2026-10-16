import type { JSX } from "preact";
import { calculateReadingTime } from "@brains/utils";
import { Head, MarkdownContent } from "@brains/ui-library";
import type { EnrichedWhitepaper } from "../schemas/whitepaper";

export interface WhitepaperDetailProps {
  whitepaper: EnrichedWhitepaper;
  prevWhitepaper: EnrichedWhitepaper | null;
  nextWhitepaper: EnrichedWhitepaper | null;
}

const formatDate = (date: string): string =>
  new Date(date).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const resolveWhitepaperUrl = (whitepaper: EnrichedWhitepaper): string =>
  whitepaper.url ?? `/whitepapers/${whitepaper.metadata.slug}`;

const WhitepaperNavigation = ({
  prevWhitepaper,
  nextWhitepaper,
}: Pick<
  WhitepaperDetailProps,
  "prevWhitepaper" | "nextWhitepaper"
>): JSX.Element | null => {
  if (!prevWhitepaper && !nextWhitepaper) return null;

  return (
    <nav
      aria-label="White paper navigation"
      className="mt-16 grid gap-4 border-t border-rule pt-8 md:grid-cols-2"
    >
      {prevWhitepaper ? (
        <a
          href={resolveWhitepaperUrl(prevWhitepaper)}
          className="block rounded-sm border border-rule p-5 no-underline transition-colors hover:border-accent"
        >
          <span className="mb-2 block font-mono text-[0.65rem] uppercase tracking-[0.18em] text-theme-light">
            Previous
          </span>
          <span className="font-heading text-lg text-heading">
            {prevWhitepaper.metadata.title}
          </span>
        </a>
      ) : (
        <span />
      )}
      {nextWhitepaper && (
        <a
          href={resolveWhitepaperUrl(nextWhitepaper)}
          className="block rounded-sm border border-rule p-5 text-right no-underline transition-colors hover:border-accent"
        >
          <span className="mb-2 block font-mono text-[0.65rem] uppercase tracking-[0.18em] text-theme-light">
            Next
          </span>
          <span className="font-heading text-lg text-heading">
            {nextWhitepaper.metadata.title}
          </span>
        </a>
      )}
    </nav>
  );
};

export const WhitepaperDetailTemplate = ({
  whitepaper,
  prevWhitepaper,
  nextWhitepaper,
}: WhitepaperDetailProps): JSX.Element => {
  const readingTime = calculateReadingTime(whitepaper.body);
  const publishedAt = whitepaper.frontmatter.publishedAt;
  const description =
    whitepaper.frontmatter.abstract ??
    whitepaper.frontmatter.thesis ??
    whitepaper.frontmatter.subtitle ??
    `White paper: ${whitepaper.metadata.title}`;

  return (
    <>
      <Head title={whitepaper.metadata.title} description={description} />
      <article className="whitepaper-detail bg-theme">
        <div className="container mx-auto max-w-[1040px] px-6 py-16 md:px-12 md:py-24">
          <nav
            aria-label="Breadcrumb"
            className="mb-12 text-[13px] text-theme-muted"
          >
            <a
              href="/"
              className="text-inherit no-underline transition-colors hover:text-brand"
            >
              Home
            </a>
            <span className="mx-2 text-theme-light" aria-hidden="true">
              /
            </span>
            <a
              href={whitepaper.listUrl ?? "/whitepapers"}
              className="text-inherit no-underline transition-colors hover:text-brand"
            >
              {whitepaper.listLabel ?? "White papers"}
            </a>
            <span className="mx-2 text-theme-light" aria-hidden="true">
              /
            </span>
            <span className="font-medium text-heading" aria-current="page">
              {whitepaper.metadata.title}
            </span>
          </nav>

          <header className="mb-14 border-b border-rule pb-10">
            <p className="mb-5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-accent">
              {whitepaper.typeLabel ?? "White paper"}
            </p>
            <h1 className="max-w-[860px] font-heading text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-heading md:text-7xl">
              {whitepaper.metadata.title}
            </h1>
            {whitepaper.frontmatter.subtitle && (
              <p className="mt-6 max-w-[760px] font-heading text-2xl font-normal italic leading-snug text-theme-muted">
                {whitepaper.frontmatter.subtitle}
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-theme-light">
              {publishedAt && (
                <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
              )}
              {readingTime > 0 && <span>{readingTime} min read</span>}
              {whitepaper.frontmatter.status && (
                <span>{whitepaper.frontmatter.status}</span>
              )}
            </div>
          </header>

          {(whitepaper.frontmatter.abstract ||
            whitepaper.frontmatter.thesis) && (
            <aside className="mb-12 grid gap-6 rounded-sm bg-surface p-6 md:grid-cols-2 md:p-8">
              {whitepaper.frontmatter.abstract && (
                <section>
                  <h2 className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-theme-light">
                    Abstract
                  </h2>
                  <p className="m-0 leading-7 text-theme-muted">
                    {whitepaper.frontmatter.abstract}
                  </p>
                </section>
              )}
              {whitepaper.frontmatter.thesis && (
                <section>
                  <h2 className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-theme-light">
                    Thesis
                  </h2>
                  <p className="m-0 leading-7 text-theme-muted">
                    {whitepaper.frontmatter.thesis}
                  </p>
                </section>
              )}
            </aside>
          )}

          {whitepaper.frontmatter.audience?.length ? (
            <section className="mb-12 border-y border-rule py-5">
              <h2 className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-theme-light">
                Audience
              </h2>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {whitepaper.frontmatter.audience.map((audience) => (
                  <li
                    key={audience}
                    className="rounded-full border border-rule px-3 py-1 text-sm text-theme-muted"
                  >
                    {audience}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="prose prose-theme max-w-none">
            <MarkdownContent markdown={whitepaper.body} />
          </div>

          {whitepaper.frontmatter.keywords?.length ? (
            <footer className="mt-12 flex flex-wrap gap-2 border-t border-rule pt-6">
              {whitepaper.frontmatter.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full bg-surface px-3 py-1 text-sm text-theme-muted"
                >
                  {keyword}
                </span>
              ))}
            </footer>
          ) : null}

          <WhitepaperNavigation
            prevWhitepaper={prevWhitepaper}
            nextWhitepaper={nextWhitepaper}
          />
        </div>
      </article>
    </>
  );
};
