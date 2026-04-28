import type { JSX } from "preact";
import { MarkdownContent } from "@brains/ui-library";
import type { DocWithData } from "../schemas/doc";
import { docsClasses, groupDocs, romanNumeral, sortDocs } from "./docs-design";
import {
  DocsBreadcrumb,
  DocsDetailSidebar,
  DocsPageShell,
  DocsPager,
} from "./docs-components";

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
    <DocsPageShell
      title={doc.metadata.title}
      description={doc.metadata.description ?? doc.metadata.section}
      detail
      footer
      contentClassName="pt-16"
    >
      <DocsBreadcrumb title={doc.metadata.title} />

      <div className="grid items-start gap-10 py-8 pb-24 md:grid-cols-[240px_minmax(0,1fr)] md:gap-20">
        <DocsDetailSidebar
          groups={groups}
          activeGroupIndex={activeGroupIndex}
          activeSlug={doc.metadata.slug}
        />

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

          <DocsPager prevDoc={prevDoc} nextDoc={nextDoc} />
        </article>
      </div>
    </DocsPageShell>
  );
};
