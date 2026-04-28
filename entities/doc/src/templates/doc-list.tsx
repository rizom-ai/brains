import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import type { DocWithData } from "../schemas/doc";
import { groupDocs, sortDocs } from "./docs-design";
import {
  DocsChapter,
  DocsListHero,
  DocsPageShell,
  DocsSectionIndex,
} from "./docs-components";

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
  const startDoc = readableDocs[0] ?? sortedDocs[0];

  return (
    <DocsPageShell title="Documentation" description="Brains documentation">
      <DocsListHero
        docsCount={docs.length}
        sectionsCount={groups.length}
        startDoc={startDoc}
      />

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
    </DocsPageShell>
  );
};
