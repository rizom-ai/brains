import type { JSX } from "preact";
import { Head, MarkdownContent } from "@brains/ui-library";
import type { DocWithData } from "../schemas/doc";
import {
  DocsDesignStyles,
  DocsFooter,
  DocsHeader,
  docsClasses,
  groupDocs,
  hrefFor,
  romanNumeral,
  sectionId,
  sortDocs,
} from "./docs-design";

export interface DocDetailProps {
  doc: DocWithData;
  docs: DocWithData[];
  prevDoc: DocWithData | null;
  nextDoc: DocWithData | null;
}

export const DocDetailTemplate = ({
  doc,
  docs,
  prevDoc,
  nextDoc,
}: DocDetailProps): JSX.Element => {
  const groups = groupDocs(docs.length > 0 ? docs : [doc]);
  const orderedDocs = sortDocs(docs.length > 0 ? docs : [doc]);
  const currentIndex = orderedDocs.findIndex(
    (item) => item.metadata.slug === doc.metadata.slug,
  );
  const activeGroupIndex = Math.max(
    groups.findIndex((group) =>
      group.docs.some((item) => item.metadata.slug === doc.metadata.slug),
    ),
    0,
  );

  return (
    <>
      <Head
        title={doc.metadata.title}
        description={doc.metadata.description ?? doc.metadata.section}
      />
      <DocsDesignStyles />
      <div className="docs-handbook docs-handbook--detail">
        <DocsHeader />
        <div className={`${docsClasses.wrap} pt-16`}>
          <nav
            className="mb-8 flex flex-wrap items-baseline gap-2.5 docs-font-label text-[11px] uppercase tracking-[0.06em] text-[var(--docs-text-light)]"
            aria-label="Breadcrumb"
          >
            <a
              className="text-[var(--docs-text-muted)] hover:text-[var(--docs-accent)]"
              href="/"
            >
              Home
            </a>
            <span>/</span>
            <a
              className="text-[var(--docs-text-muted)] hover:text-[var(--docs-accent)]"
              href="/docs"
            >
              Docs
            </a>
            <span>/</span>
            <span>{doc.metadata.title}</span>
          </nav>

          <div className="grid items-start gap-10 py-8 pb-24 md:grid-cols-[240px_minmax(0,1fr)] md:gap-20">
            <aside
              className="docs-detail-rail sticky top-24 max-h-[calc(100vh-120px)] overflow-auto pr-2"
              aria-label="Documentation navigation"
            >
              <nav className="docs-font-label text-xs tracking-[0.06em] text-[var(--docs-text-light)]">
                <p className="m-0 mb-4 border-b border-[var(--docs-text)] pb-3 text-[11px] uppercase tracking-[0.08em] text-[var(--docs-text-light)]">
                  Documentation
                </p>
                <ol className="m-0 list-none p-0">
                  {groups.map((group, index) => {
                    const isActiveGroup = index === activeGroupIndex;
                    return (
                      <li
                        className={isActiveGroup ? "mb-[22px]" : "mb-3.5"}
                        key={group.section}
                      >
                        <a
                          className={`mb-2 flex items-baseline gap-2.5 docs-font-label text-[11px] uppercase leading-[1.4] tracking-[0.06em] transition-colors duration-150 hover:text-[var(--docs-text)] ${isActiveGroup ? "text-[var(--docs-text)]" : "text-[var(--docs-text-muted)]"}`}
                          href={`/docs#${sectionId(index)}`}
                        >
                          <span className="docs-font-display text-sm text-[var(--docs-accent)] italic">
                            {romanNumeral(index)}.
                          </span>{" "}
                          {group.section}
                        </a>
                        {isActiveGroup && (
                          <ol className="mt-0.5 list-none p-0">
                            {group.docs.map((item) => {
                              const active =
                                item.metadata.slug === doc.metadata.slug;
                              return (
                                <li key={item.id}>
                                  <a
                                    className={`docs-rail__doc relative block py-1.5 docs-font-body text-sm leading-[1.4] tracking-normal transition-[color,padding-left] duration-150 hover:text-[var(--docs-text)] ${active ? "pl-3.5 font-medium text-[var(--docs-accent)]" : "text-[var(--docs-text-muted)]"}`}
                                    href={hrefFor(item)}
                                    aria-current={active ? "page" : undefined}
                                  >
                                    {item.metadata.title}
                                  </a>
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </aside>

            <article className="min-w-0">
              <header className="mb-10 border-b border-[var(--docs-border)] pb-8">
                <p
                  className={`${docsClasses.label} m-0 mb-6 flex items-baseline gap-3`}
                >
                  <span className="docs-font-display text-lg leading-none tracking-normal normal-case text-[var(--docs-accent)] italic">
                    {romanNumeral(activeGroupIndex)}.
                  </span>{" "}
                  {doc.metadata.section}
                  {currentIndex >= 0
                    ? ` · ${currentIndex + 1}/${orderedDocs.length}`
                    : ""}
                </p>
                <h1
                  className={`${docsClasses.display} m-0 max-w-[18ch] text-4xl leading-[1.05] tracking-[-0.02em] md:text-6xl`}
                >
                  {doc.metadata.title}
                </h1>
                {doc.metadata.description && (
                  <p className="mt-6 max-w-[56ch] docs-font-display text-[22px] font-[350] leading-[1.5] text-[var(--docs-text-muted)]">
                    {doc.metadata.description}
                  </p>
                )}
              </header>

              <div className="docs-article__body">
                <MarkdownContent markdown={doc.body} />
              </div>

              {(prevDoc || nextDoc) && (
                <nav
                  className="mt-12 grid grid-cols-1 gap-5 border-t border-[var(--docs-border)] pt-7 md:grid-cols-2"
                  aria-label="Previous and next docs"
                >
                  {prevDoc ? (
                    <a
                      className="docs-page-link border-t border-[var(--docs-border-light)] pt-[18px] transition-colors duration-150 hover:border-[var(--docs-accent)]"
                      href={hrefFor(prevDoc)}
                    >
                      <span className="block docs-font-label text-[10.5px] uppercase tracking-[0.22em] text-[var(--docs-text-light)]">
                        Previous
                      </span>
                      <span className="docs-page-link__title mt-2 block docs-font-display text-[22px] leading-[1.2] text-[var(--docs-heading)]">
                        ← {prevDoc.metadata.title}
                      </span>
                    </a>
                  ) : (
                    <span />
                  )}
                  {nextDoc && (
                    <a
                      className="docs-page-link border-t border-[var(--docs-border-light)] pt-[18px] text-left transition-colors duration-150 hover:border-[var(--docs-accent)] md:text-right"
                      href={hrefFor(nextDoc)}
                    >
                      <span className="block docs-font-label text-[10.5px] uppercase tracking-[0.22em] text-[var(--docs-text-light)]">
                        Next
                      </span>
                      <span className="docs-page-link__title mt-2 block docs-font-display text-[22px] leading-[1.2] text-[var(--docs-heading)]">
                        {nextDoc.metadata.title} →
                      </span>
                    </a>
                  )}
                </nav>
              )}
            </article>
          </div>
          <DocsFooter />
        </div>
      </div>
    </>
  );
};
