import type { JSX } from "preact";
import { Head } from "@brains/ui-library";
import type { PaginationInfo } from "@brains/plugins";
import type { DocWithData } from "../schemas/doc";
import {
  DocsDesignStyles,
  DocsHeader,
  docsClasses,
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
        <DocsHeader ecosystemHref="#ecosystem" />
        <div className={docsClasses.wrap}>
          <section className="border-b border-[var(--docs-text)] py-14 md:py-24 md:pb-[72px]">
            <p className={`${docsClasses.label} mb-8`}>
              Handbook · Brains docs
            </p>
            <h1
              className={`${docsClasses.display} m-0 max-w-[16ch] text-5xl leading-[1.05] tracking-[-0.02em] md:text-7xl`}
            >
              Build, run, and publish{" "}
              <em className="text-[var(--docs-accent)]">brains.</em>
            </h1>
            <p className="mt-8 max-w-[52ch] text-lg leading-[1.65] text-[var(--docs-text-muted)]">
              Documentation for composing brain models, managing markdown
              entities, wiring interfaces, and shipping generated sites.
            </p>
            <dl className="mt-10 flex flex-wrap gap-7 docs-font-label text-xs tracking-[0.06em] text-[var(--docs-text-light)] md:mt-14 md:gap-12">
              <div>
                <strong className="mb-0.5 block font-medium text-[var(--docs-text)]">
                  {docs.length}
                </strong>
                Documents
              </div>
              <div>
                <strong className="mb-0.5 block font-medium text-[var(--docs-text)]">
                  {groups.length}
                </strong>
                Sections
              </div>
              <div>
                <strong className="mb-0.5 block font-medium text-[var(--docs-text)]">
                  April 2026
                </strong>
                Updated
              </div>
            </dl>
            <div className="mt-9 flex flex-wrap gap-3.5">
              {firstDoc && (
                <a
                  className={docsClasses.primaryButton}
                  href={hrefFor(firstDoc)}
                >
                  Start reading
                </a>
              )}
              <a className={docsClasses.button} href="#sections">
                Browse sections
              </a>
            </div>
          </section>

          <section
            className="grid items-start gap-10 py-12 md:grid-cols-[200px_minmax(0,1fr)] md:gap-20 md:py-20 md:pb-[120px]"
            id="sections"
          >
            <aside
              className="docs-rail sticky top-8 hidden docs-font-label text-xs tracking-[0.06em] text-[var(--docs-text-light)] min-[861px]:block"
              aria-label="Documentation sections"
            >
              <p className="m-0 mb-3.5 font-medium text-[var(--docs-text)]">
                Sections
              </p>
              <ol className="m-0 list-none p-0">
                {groups.map((group, index) => (
                  <li
                    className="grid grid-cols-[32px_1fr] gap-2 py-1.5"
                    key={group.section}
                  >
                    <span className="docs-font-display text-[var(--docs-text-light)] italic">
                      {romanNumeral(index)}.
                    </span>
                    <a
                      className="text-[var(--docs-text-muted)] hover:text-[var(--docs-accent)]"
                      href={`#${sectionId(index)}`}
                    >
                      {group.section}
                    </a>
                  </li>
                ))}
              </ol>
            </aside>

            <div>
              {groups.map((group, index) => (
                <article
                  className="mb-16 last:mb-0"
                  id={sectionId(index)}
                  key={group.section}
                >
                  <header className="mb-2 grid grid-cols-[36px_auto_1fr] items-baseline gap-x-3 border-b border-[var(--docs-border)] pb-3.5 md:grid-cols-[48px_auto_1fr] md:gap-x-5">
                    <span className="text-right docs-font-display text-3xl leading-[1.1] text-[var(--docs-accent)] italic md:text-4xl">
                      {romanNumeral(index)}.
                    </span>
                    <h2
                      className={`${docsClasses.display} m-0 text-3xl leading-[1.1] tracking-[-0.015em] md:text-4xl`}
                    >
                      {group.section}
                    </h2>
                    <span className="docs-chapter__leader" />
                  </header>
                  <ol className="m-0 list-none p-0">
                    {group.docs.map((doc) => (
                      <li
                        className="border-b border-[var(--docs-border-light)] last:border-b-0"
                        key={doc.id}
                      >
                        <a
                          className="group block py-[18px] pl-12 md:pl-[68px]"
                          href={hrefFor(doc)}
                        >
                          <p className="m-0 text-[22px] leading-[1.2] tracking-[-0.005em] transition-colors duration-150 group-hover:text-[var(--docs-accent)]">
                            {doc.metadata.title}
                          </p>
                          {doc.metadata.description && (
                            <p className="mt-1.5 mb-0 max-w-[70ch] text-sm leading-[1.55] text-[var(--docs-text-muted)]">
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
