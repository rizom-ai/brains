import type { JSX } from "react";
import { DocsPageSection, DocsPageShell } from "@brains/docs-chrome";
import type { PaginationInfo } from "@brains/plugins";
import type { DocWithData } from "../schemas/doc";
import { groupDocs, sortDocs } from "./docs-design";
import { DocsChapter, DocsListHero, DocsSectionIndex } from "./docs-components";

export interface DocListProps {
  docs: DocWithData[];
  pagination?: PaginationInfo | null;
  baseUrl: string | null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatLatestUpdate(docs: DocWithData[]): string | undefined {
  const latestTimestamp = docs.reduce((latest, doc) => {
    const timestamp = Date.parse(doc.updated);
    return Number.isFinite(timestamp) && timestamp > latest
      ? timestamp
      : latest;
  }, Number.NEGATIVE_INFINITY);

  if (!Number.isFinite(latestTimestamp)) return undefined;

  const latest = new Date(latestTimestamp);
  return `${MONTH_NAMES[latest.getUTCMonth()]} ${latest.getUTCFullYear()}`;
}

const Hero = ({ docs }: { docs: DocWithData[] }): JSX.Element => {
  const sortedDocs = sortDocs(docs);
  const readableDocs = sortedDocs.filter(
    (doc) => doc.metadata.slug !== "index",
  );

  return (
    <DocsListHero
      docsCount={docs.length}
      sectionsCount={groupDocs(sortedDocs).length}
      startDoc={readableDocs[0] ?? sortedDocs[0]}
      updatedLabel={formatLatestUpdate(docs)}
    />
  );
};

const Sections = ({ docs }: { docs: DocWithData[] }): JSX.Element => {
  const groups = groupDocs(sortDocs(docs));

  return (
    <section
      className="grid items-start gap-10 py-12 md:grid-cols-[200px_minmax(0,1fr)] md:gap-20 md:py-20 md:pb-[120px]"
      id="sections"
    >
      <DocsSectionIndex groups={groups} />
      <div>
        {groups.map((group, index) => (
          <DocsChapter group={group} index={index} key={group.section} />
        ))}
      </div>
    </section>
  );
};

const shellProps = {
  title: "Documentation",
  description: "Brains documentation",
};

export const DocListTemplate = ({ docs }: DocListProps): JSX.Element => (
  <DocsPageShell {...shellProps}>
    <Hero docs={docs} />
    <Sections docs={docs} />
  </DocsPageShell>
);

/**
 * The docs home in two parts, so a site can set sections from other plugins
 * between the hero and the sections: the hero opens the page with the header,
 * the sections continue it.
 */
export const DocHomeHeroTemplate = ({ docs }: DocListProps): JSX.Element => (
  <DocsPageShell {...shellProps} continues>
    <Hero docs={docs} />
  </DocsPageShell>
);

export const DocHomeSectionsTemplate = ({
  docs,
}: DocListProps): JSX.Element => (
  <DocsPageSection>
    <Sections docs={docs} />
  </DocsPageSection>
);
