import type { JSX } from "react";
import type { SectionDoc } from "../schemas/guide-sections";
import { DocsPageSection } from "@brains/docs-chrome";
import { guideHref } from "../lib/guide-order";
import type { GuideSection } from "../schemas/guide-sections";
import type { GuideWithData } from "../schemas/guide";
import guideSectionsCss from "./guide-sections.css" with { type: "text" };

/** How many reference docs a column shows before folding the rest away. */
const SHOWN_DOCS = 4;

export interface GuideSectionsProps {
  sections: GuideSection[];
}

function sectionId(name: string): string {
  return `guide-section-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

const DocLinks = ({ docs }: { docs: SectionDoc[] }): JSX.Element => (
  <ul className="guide-sections__docs">
    {docs.map((item) => (
      <li key={item.id}>
        <a href={`/docs/${item.slug}`}>{item.title}</a>
      </li>
    ))}
  </ul>
);

const GuideLinks = ({ guides }: { guides: GuideWithData[] }): JSX.Element => (
  <ul className="guide-sections__guides">
    {guides.map((item) => (
      <li key={item.id}>
        <a href={guideHref(item)}>
          <span className="guide-sections__persona">
            {item.metadata.persona}
          </span>
          {item.frontmatter.summary && (
            <span className="guide-sections__summary">
              {item.frontmatter.summary}
            </span>
          )}
        </a>
      </li>
    ))}
  </ul>
);

/**
 * Each docs section as a column of the guides that lead into it and its
 * reference docs, for a docs page whose site introduces the sections above
 * it. The section name heads the column for readers of the outline; the
 * site's own introduction shows it. Without sections there is no band.
 */
export const GuideSectionsTemplate = ({
  sections,
}: GuideSectionsProps): JSX.Element => {
  if (sections.length === 0) return <></>;

  return (
    <DocsPageSection>
      <style>{guideSectionsCss}</style>
      <div className="guide-sections">
        {sections.map((section) => {
          const id = sectionId(section.name);
          const shown = section.docs.slice(0, SHOWN_DOCS);
          const folded = section.docs.slice(SHOWN_DOCS);
          return (
            <section
              className="guide-sections__column"
              aria-labelledby={id}
              key={section.name}
            >
              <h2 className="guide-sections__name" id={id}>
                {section.name}
              </h2>
              {section.guides.length > 0 && (
                <>
                  <h3 className="guide-sections__label">
                    {section.guides.length > 1
                      ? "Which one are you?"
                      : "Walk it through"}
                  </h3>
                  <GuideLinks guides={section.guides} />
                </>
              )}
              {shown.length > 0 && (
                <>
                  <h3 className="guide-sections__label">Reference</h3>
                  <DocLinks docs={shown} />
                </>
              )}
              {folded.length > 0 && (
                <details className="guide-sections__more">
                  <summary>
                    {folded.length} more reference{" "}
                    {folded.length === 1 ? "doc" : "docs"}
                  </summary>
                  <DocLinks docs={folded} />
                </details>
              )}
            </section>
          );
        })}
      </div>
    </DocsPageSection>
  );
};
