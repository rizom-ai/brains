import type { JSX } from "react";
import { DocsPageShell, docsClasses } from "@brains/docs-chrome";
import type { GuideWithData } from "../schemas/guide";

export interface GuideListProps {
  guides: GuideWithData[];
}

function guideHref(guide: GuideWithData): string {
  return `/guides/${guide.metadata.slug}`;
}

export const GuideListTemplate = ({ guides }: GuideListProps): JSX.Element => (
  <DocsPageShell title="Guides" description="Moving into a brain">
    <section className="py-14 md:py-24">
      <h1
        className={`${docsClasses.display} m-0 text-5xl leading-[1.05] tracking-[-0.02em] md:text-7xl`}
      >
        Guides
      </h1>
      <ol className="mt-10 list-none p-0">
        {guides.map((guide) => (
          <li
            className="border-b border-[var(--docs-border-light)] last:border-b-0"
            key={guide.id}
          >
            <a className="group block py-[18px]" href={guideHref(guide)}>
              <p className={`${docsClasses.label} m-0 mb-1.5`}>
                {guide.metadata.persona}
              </p>
              <p className="m-0 text-[22px] leading-[1.2] transition-colors duration-150 group-hover:text-[var(--docs-accent)]">
                {guide.metadata.title}
              </p>
              <p className="mt-1.5 mb-0 max-w-[70ch] text-sm leading-[1.55] text-[var(--docs-text-muted)]">
                {guide.metadata.for}
              </p>
            </a>
          </li>
        ))}
      </ol>
    </section>
  </DocsPageShell>
);
