import type { JSX } from "preact";
import { Head } from "@brains/ui-library";
import type { PaginationInfo } from "@brains/plugins";
import type { DocWithData } from "../schemas/doc";

export interface DocListProps {
  docs: DocWithData[];
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

type GroupedDocs = Array<{ section: string; docs: DocWithData[] }>;

function sortDocs(docs: DocWithData[]): DocWithData[] {
  return [...docs].sort((a, b) => {
    const order = a.metadata.order - b.metadata.order;
    if (order !== 0) return order;
    return a.metadata.title.localeCompare(b.metadata.title);
  });
}

function groupDocs(docs: DocWithData[]): GroupedDocs {
  const groups = new Map<string, DocWithData[]>();
  for (const doc of sortDocs(docs)) {
    const section = doc.metadata.section;
    groups.set(section, [...(groups.get(section) ?? []), doc]);
  }
  return [...groups.entries()].map(([section, sectionDocs]) => ({
    section,
    docs: sectionDocs,
  }));
}

function hrefFor(doc: DocWithData): string {
  return `/docs/${doc.metadata.slug}`;
}

export const DocListTemplate = ({ docs }: DocListProps): JSX.Element => {
  const sortedDocs = sortDocs(docs);
  const groups = groupDocs(sortedDocs);
  const readableDocs = sortedDocs.filter(
    (doc) => doc.metadata.slug !== "index",
  );
  const firstDoc = readableDocs[0] ?? sortedDocs[0];
  const featuredDocs = readableDocs.slice(0, 3);

  return (
    <>
      <Head title="Documentation" description="Brains documentation" />
      <div className="bg-theme text-theme min-h-screen">
        <section className="border-theme relative overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="bg-brand/10 absolute -top-24 right-[-8rem] h-72 w-72 rounded-full blur-3xl" />
            <div className="border-theme absolute top-20 right-16 h-40 w-40 rounded-full border" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.2fr_0.8fr] md:px-10 md:py-24">
            <div>
              <p className="text-brand mb-5 text-xs font-semibold uppercase tracking-[0.28em]">
                Brains docs
              </p>
              <h1 className="text-heading max-w-3xl text-5xl font-semibold tracking-[-0.04em] md:text-7xl">
                Build, run, and publish brains.
              </h1>
              <p className="text-theme-muted mt-6 max-w-2xl text-lg leading-8 md:text-xl">
                Practical documentation for composing brain models, managing
                markdown entities, wiring interfaces, and shipping generated
                sites.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                {firstDoc && (
                  <a
                    className="bg-brand text-brand-contrast hover:bg-brand/90 inline-flex rounded-full px-5 py-3 text-sm font-semibold transition"
                    href={hrefFor(firstDoc)}
                  >
                    Start reading
                  </a>
                )}
                <a
                  className="border-theme text-heading hover:border-brand/70 inline-flex rounded-full border px-5 py-3 text-sm font-semibold transition"
                  href="#sections"
                >
                  Browse sections
                </a>
              </div>
            </div>

            <aside className="border-theme bg-bg-card/70 self-end rounded-3xl border p-5 shadow-2xl shadow-black/10 backdrop-blur">
              <div className="text-theme-muted flex items-center justify-between text-xs uppercase tracking-[0.22em]">
                <span>Library</span>
                <span>{docs.length} docs</span>
              </div>
              <div className="mt-5 space-y-3">
                {featuredDocs.map((doc, index) => (
                  <a
                    key={doc.id}
                    className="border-theme hover:border-brand/60 block rounded-2xl border p-4 transition"
                    href={hrefFor(doc)}
                  >
                    <span className="text-brand text-xs font-semibold">
                      0{index + 1} · {doc.metadata.section}
                    </span>
                    <span className="text-heading mt-2 block text-lg font-semibold">
                      {doc.metadata.title}
                    </span>
                    {doc.metadata.description && (
                      <span className="text-theme-muted mt-1 block text-sm leading-6">
                        {doc.metadata.description}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["01", "Configure", "Define a brain model and preset."],
              ["02", "Capture", "Store docs as markdown entities."],
              ["03", "Render", "Build static routes from entities."],
              ["04", "Ship", "Sync content and publish outputs."],
            ].map(([step, title, body]) => (
              <div key={step} className="border-theme rounded-2xl border p-5">
                <p className="text-brand text-xs font-semibold tracking-[0.2em]">
                  {step}
                </p>
                <h2 className="text-heading mt-4 text-lg font-semibold">
                  {title}
                </h2>
                <p className="text-theme-muted mt-2 text-sm leading-6">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="sections"
          className="mx-auto max-w-6xl px-6 pb-20 md:px-10 md:pb-28"
        >
          <div className="border-theme mb-8 flex flex-col justify-between gap-4 border-t pt-8 md:flex-row md:items-end">
            <div>
              <p className="text-brand text-xs font-semibold uppercase tracking-[0.25em]">
                Contents
              </p>
              <h2 className="text-heading mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
                Documentation map
              </h2>
            </div>
            <p className="text-theme-muted max-w-md text-sm leading-6">
              Follow the path from first boot to custom interfaces, or jump
              straight into the section you need.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {groups.map((group) => (
              <section
                key={group.section}
                className="border-theme bg-bg-card/40 rounded-3xl border p-6"
              >
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h3 className="text-heading text-xl font-semibold">
                    {group.section}
                  </h3>
                  <span className="text-theme-muted rounded-full border border-current/20 px-3 py-1 text-xs">
                    {group.docs.length}
                  </span>
                </div>
                <ol className="space-y-3">
                  {group.docs.map((doc) => (
                    <li key={doc.id}>
                      <a
                        className="group border-theme hover:border-brand/60 block rounded-2xl border p-4 transition"
                        href={hrefFor(doc)}
                      >
                        <span className="text-heading group-hover:text-brand block font-semibold transition">
                          {doc.metadata.title}
                        </span>
                        {doc.metadata.description && (
                          <span className="text-theme-muted mt-1 block text-sm leading-6">
                            {doc.metadata.description}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
      </div>
    </>
  );
};
