import type { JSX } from "preact";
import { Head } from "@brains/ui-library";
import type { PaginationInfo } from "@brains/plugins";
import type { DocWithData } from "../schemas/doc";
import {
  DocsDesignStyles,
  formatCount,
  groupDocs,
  hrefFor,
  romanNumeral,
  sectionId,
  sortDocs,
} from "./docs-design";

export interface DocListProps {
  docs: DocWithData[];
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

export const DocListTemplate = ({ docs }: DocListProps): JSX.Element => {
  const sortedDocs = sortDocs(docs);
  const groups = groupDocs(sortedDocs);
  const readableDocs = sortedDocs.filter(
    (doc) => doc.metadata.slug !== "index",
  );
  const firstDoc = readableDocs[0] ?? sortedDocs[0];

  return (
    <>
      <Head title="Documentation" description="Brains documentation" />
      <DocsDesignStyles />
      <div className="docs-handbook">
        <div className="docs-wrap">
          <section className="docs-hero">
            <p className="docs-hero__eyebrow">Handbook · Brains docs</p>
            <h1>
              Build, run, and publish <em>brains.</em>
            </h1>
            <p className="docs-hero__intro">
              Documentation for composing brain models, managing markdown
              entities, wiring interfaces, and shipping generated sites.
            </p>
            <dl className="docs-hero__meta">
              <div>
                <strong>{docs.length}</strong>
                Documents
              </div>
              <div>
                <strong>{groups.length}</strong>
                Sections
              </div>
              <div>
                <strong>April 2026</strong>
                Updated
              </div>
            </dl>
            <div className="docs-hero__actions">
              {firstDoc && (
                <a
                  className="docs-button docs-button--primary"
                  href={hrefFor(firstDoc)}
                >
                  Start reading
                </a>
              )}
              <a className="docs-button" href="#sections">
                Browse sections
              </a>
            </div>
          </section>

          <section className="docs-library" id="sections">
            <aside className="docs-rail" aria-label="Documentation sections">
              <p className="docs-rail__heading">Sections</p>
              <ol>
                {groups.map((group, index) => (
                  <li key={group.section}>
                    <span className="docs-rail__num">
                      {romanNumeral(index)}.
                    </span>
                    <a href={`#${sectionId(index)}`}>{group.section}</a>
                  </li>
                ))}
              </ol>
            </aside>

            <div>
              {groups.map((group, index) => (
                <article
                  className="docs-chapter"
                  id={sectionId(index)}
                  key={group.section}
                >
                  <header className="docs-chapter__head">
                    <span className="docs-chapter__numeral">
                      {romanNumeral(index)}.
                    </span>
                    <h2 className="docs-chapter__title">{group.section}</h2>
                    <span className="docs-chapter__leader" />
                    <span className="docs-chapter__count">
                      {formatCount(group.docs.length)}
                    </span>
                  </header>
                  <ol className="docs-chapter__list">
                    {group.docs.map((doc) => (
                      <li key={doc.id}>
                        <a href={hrefFor(doc)}>
                          <p className="docs-doc__title">
                            {doc.metadata.title}
                          </p>
                          {doc.metadata.description && (
                            <p className="docs-doc__desc">
                              {doc.metadata.description}
                            </p>
                          )}
                        </a>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
