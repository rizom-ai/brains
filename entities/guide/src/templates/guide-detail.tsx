import type { JSX } from "react";
import { DocsPageShell, docsClasses } from "@brains/docs-chrome";
import { MarkdownContent } from "@brains/ui-library";
import type { GuideWithData } from "../schemas/guide";

export interface GuideDetailProps {
  guide: GuideWithData;
  otherGuides: GuideWithData[];
}

export const GuideDetailTemplate = ({
  guide,
}: GuideDetailProps): JSX.Element => (
  <DocsPageShell
    title={guide.metadata.title}
    description={guide.metadata.for}
    detail
    footer
    contentClassName="pt-16"
  >
    <article className="mx-auto max-w-3xl py-8 pb-24">
      <header className="mb-10 border-b border-[var(--docs-border)] pb-8">
        <p className={`${docsClasses.label} m-0 mb-6`}>
          {guide.metadata.persona}
        </p>
        <h1
          className={`${docsClasses.display} m-0 max-w-[18ch] text-4xl leading-[1.05] tracking-[-0.02em] md:text-6xl`}
        >
          {guide.metadata.title}
        </h1>
        <p className="mt-6 max-w-[56ch] docs-font-display text-[22px] font-[350] leading-[1.5] text-[var(--docs-text-muted)]">
          {guide.metadata.for}
        </p>
      </header>

      <div className="docs-article__body">
        <MarkdownContent markdown={guide.body} />
      </div>
    </article>
  </DocsPageShell>
);
