import type { JSX } from "preact";
import { Head, MarkdownContent } from "@brains/ui-library";
import type { DocWithData } from "../schemas/doc";
import {
  DocsDesignStyles,
  DocsFooter,
  DocsHeader,
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
        <div className="docs-wrap docs-detail-wrap">
          <nav className="docs-breadcrumb" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span>/</span>
            <a href="/docs">Docs</a>
            <span>/</span>
            <span>{doc.metadata.title}</span>
          </nav>

          <div className="docs-detail-grid">
            <aside
              className="docs-detail-rail"
              aria-label="Documentation navigation"
            >
              <nav className="docs-rail">
                <p className="docs-rail__heading">Documentation</p>
                <ol>
                  {groups.map((group, index) => {
                    const isActiveGroup = index === activeGroupIndex;
                    return (
                      <li
                        className={`docs-rail__section${isActiveGroup ? " is-active" : ""}`}
                        key={group.section}
                      >
                        <a
                          className="docs-rail__section-title"
                          href={`/docs#${sectionId(index)}`}
                        >
                          <span className="docs-rail__num">
                            {romanNumeral(index)}.
                          </span>{" "}
                          {group.section}
                        </a>
                        {isActiveGroup && (
                          <ol>
                            {group.docs.map((item) => {
                              const active =
                                item.metadata.slug === doc.metadata.slug;
                              return (
                                <li key={item.id}>
                                  <a
                                    className="docs-rail__doc"
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

            <article className="docs-article">
              <header className="docs-article__header">
                <p className="docs-label docs-article__kicker">
                  <span className="docs-label__numeral">
                    {romanNumeral(activeGroupIndex)}.
                  </span>{" "}
                  {doc.metadata.section}
                  {currentIndex >= 0
                    ? ` · ${currentIndex + 1}/${orderedDocs.length}`
                    : ""}
                </p>
                <h1 className="docs-article__title">{doc.metadata.title}</h1>
                {doc.metadata.description && (
                  <p className="docs-article__desc">
                    {doc.metadata.description}
                  </p>
                )}
              </header>

              <div className="docs-article__body">
                <MarkdownContent markdown={doc.body} />
              </div>

              {(prevDoc || nextDoc) && (
                <nav
                  className="docs-article__footer"
                  aria-label="Previous and next docs"
                >
                  {prevDoc ? (
                    <a className="docs-page-link" href={hrefFor(prevDoc)}>
                      <span className="docs-page-link__label">Previous</span>
                      <span className="docs-page-link__title">
                        ← {prevDoc.metadata.title}
                      </span>
                    </a>
                  ) : (
                    <span />
                  )}
                  {nextDoc && (
                    <a
                      className="docs-page-link docs-page-link--next"
                      href={hrefFor(nextDoc)}
                    >
                      <span className="docs-page-link__label">Next</span>
                      <span className="docs-page-link__title">
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
