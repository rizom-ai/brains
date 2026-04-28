import type { ComponentChildren, JSX } from "preact";
import { Head } from "@brains/ui-library";
import type { DocWithData } from "../schemas/doc";
import {
  DocsDesignStyles,
  DocsFooter,
  DocsHeader,
  docsClasses,
  type GroupedDocs,
  hrefFor,
  romanNumeral,
  sectionId,
} from "./docs-design";

interface DocsPageShellProps {
  title: string;
  description: string;
  children: ComponentChildren;
  detail?: boolean;
  footer?: boolean;
  contentClassName?: string;
}

export const DocsPageShell = ({
  title,
  description,
  children,
  detail = false,
  footer = false,
  contentClassName = "",
}: DocsPageShellProps): JSX.Element => (
  <>
    <Head title={title} description={description} />
    <DocsDesignStyles />
    <div className={`docs-handbook${detail ? " docs-handbook--detail" : ""}`}>
      <DocsHeader />
      <div className={`${docsClasses.wrap} ${contentClassName}`.trim()}>
        {children}
        {footer && <DocsFooter />}
      </div>
    </div>
  </>
);

interface DocsListHeroProps {
  docsCount: number;
  sectionsCount: number;
  startDoc?: DocWithData | undefined;
}

export const DocsListHero = ({
  docsCount,
  sectionsCount,
  startDoc,
}: DocsListHeroProps): JSX.Element => (
  <section className="border-b border-[var(--docs-text)] py-14 md:py-24 md:pb-[72px]">
    <p className={`${docsClasses.label} mb-8`}>Handbook · Brains docs</p>
    <h1
      className={`${docsClasses.display} m-0 max-w-[16ch] text-5xl leading-[1.05] tracking-[-0.02em] md:text-7xl`}
    >
      Build, run, and publish{" "}
      <em className="text-[var(--docs-accent)]">brains.</em>
    </h1>
    <p className="mt-8 max-w-[52ch] text-lg leading-[1.65] text-[var(--docs-text-muted)]">
      Documentation for composing brain models, managing markdown entities,
      wiring interfaces, and shipping generated sites.
    </p>
    <dl className="mt-10 flex flex-wrap gap-7 docs-font-label text-xs tracking-[0.06em] text-[var(--docs-text-light)] md:mt-14 md:gap-12">
      <div>
        <strong className="mb-0.5 block font-medium text-[var(--docs-text)]">
          {docsCount}
        </strong>
        Documents
      </div>
      <div>
        <strong className="mb-0.5 block font-medium text-[var(--docs-text)]">
          {sectionsCount}
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
      {startDoc && (
        <a className={docsClasses.primaryButton} href={hrefFor(startDoc)}>
          Start reading
        </a>
      )}
      <a className={docsClasses.button} href="#sections">
        Browse sections
      </a>
    </div>
  </section>
);

export const DocsSectionIndex = ({
  groups,
}: {
  groups: GroupedDocs;
}): JSX.Element => (
  <aside
    className="docs-rail sticky top-8 hidden docs-font-label text-xs tracking-[0.06em] text-[var(--docs-text-light)] min-[861px]:block"
    aria-label="Documentation sections"
  >
    <p className="m-0 mb-3.5 font-medium text-[var(--docs-text)]">Sections</p>
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
);

export const DocsChapter = ({
  group,
  index,
}: {
  group: GroupedDocs[number];
  index: number;
}): JSX.Element => (
  <article className="mb-16 last:mb-0" id={sectionId(index)}>
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
);

export const DocsBreadcrumb = ({ title }: { title: string }): JSX.Element => (
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
    <span>{title}</span>
  </nav>
);

interface DocsDetailSidebarProps {
  groups: GroupedDocs;
  activeGroupIndex: number;
  activeSlug: string;
}

export const DocsDetailSidebar = ({
  groups,
  activeGroupIndex,
  activeSlug,
}: DocsDetailSidebarProps): JSX.Element => (
  <aside
    className="docs-detail-rail sticky top-24 hidden max-h-[calc(100vh-120px)] overflow-auto pr-2 min-[861px]:block"
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
                    const active = item.metadata.slug === activeSlug;
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
);

interface DocsPagerProps {
  prevDoc: DocWithData | null;
  nextDoc: DocWithData | null;
}

export const DocsPager = ({
  prevDoc,
  nextDoc,
}: DocsPagerProps): JSX.Element | null => {
  if (!prevDoc && !nextDoc) return null;

  return (
    <nav
      className="mt-12 grid grid-cols-1 gap-5 border-t border-[var(--docs-border)] pt-7 md:grid-cols-2"
      aria-label="Previous and next docs"
    >
      {prevDoc ? (
        <a
          className="group border-t border-[var(--docs-border-light)] pt-[18px] transition-colors duration-150 hover:border-[var(--docs-accent)]"
          href={hrefFor(prevDoc)}
        >
          <span className="block docs-font-label text-[10.5px] uppercase tracking-[0.22em] text-[var(--docs-text-light)]">
            Previous
          </span>
          <span className="mt-2 block docs-font-display text-[22px] leading-[1.2] text-[var(--docs-heading)] transition-colors duration-150 group-hover:text-[var(--docs-accent)]">
            ← {prevDoc.metadata.title}
          </span>
        </a>
      ) : (
        <span />
      )}
      {nextDoc && (
        <a
          className="group border-t border-[var(--docs-border-light)] pt-[18px] text-left transition-colors duration-150 hover:border-[var(--docs-accent)] md:text-right"
          href={hrefFor(nextDoc)}
        >
          <span className="block docs-font-label text-[10.5px] uppercase tracking-[0.22em] text-[var(--docs-text-light)]">
            Next
          </span>
          <span className="mt-2 block docs-font-display text-[22px] leading-[1.2] text-[var(--docs-heading)] transition-colors duration-150 group-hover:text-[var(--docs-accent)]">
            {nextDoc.metadata.title} →
          </span>
        </a>
      )}
    </nav>
  );
};
