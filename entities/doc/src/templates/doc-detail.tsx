import type { JSX } from "preact";
import { Head, MarkdownContent, Breadcrumb } from "@brains/ui-library";
import type { DocWithData } from "../schemas/doc";

export interface DocDetailProps {
  doc: DocWithData;
  docs: DocWithData[];
  prevDoc: DocWithData | null;
  nextDoc: DocWithData | null;
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
  for (const item of sortDocs(docs)) {
    const section = item.metadata.section;
    groups.set(section, [...(groups.get(section) ?? []), item]);
  }
  return [...groups.entries()].map(([section, sectionDocs]) => ({
    section,
    docs: sectionDocs,
  }));
}

function hrefFor(doc: DocWithData): string {
  return `/docs/${doc.metadata.slug}`;
}

export const DocDetailTemplate = ({
  doc,
  docs,
  prevDoc,
  nextDoc,
}: DocDetailProps): JSX.Element => {
  const groups = groupDocs(docs.length > 0 ? docs : [doc]);

  return (
    <>
      <Head
        title={doc.metadata.title}
        description={doc.metadata.description ?? doc.metadata.section}
      />
      <div className="bg-theme text-theme min-h-screen">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 md:grid-cols-[18rem_minmax(0,1fr)] md:px-10 md:py-14 lg:grid-cols-[19rem_minmax(0,48rem)_14rem]">
          <aside className="hidden md:block">
            <div className="sticky top-8">
              <a
                href="/docs"
                className="text-brand mb-6 inline-flex text-xs font-semibold uppercase tracking-[0.25em]"
              >
                Documentation
              </a>
              <nav className="border-theme bg-bg-card/40 rounded-3xl border p-4">
                {groups.map((group) => (
                  <div key={group.section} className="mb-5 last:mb-0">
                    <p className="text-theme-muted mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em]">
                      {group.section}
                    </p>
                    <ol className="space-y-1">
                      {group.docs.map((item) => {
                        const active = item.metadata.slug === doc.metadata.slug;
                        return (
                          <li key={item.id}>
                            <a
                              href={hrefFor(item)}
                              className={`block rounded-xl px-3 py-2 text-sm transition ${
                                active
                                  ? "bg-brand/10 text-brand"
                                  : "text-theme-muted hover:bg-bg-card hover:text-heading"
                              }`}
                            >
                              {item.metadata.title}
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          <article>
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "Docs", href: "/docs" },
                { label: doc.metadata.title },
              ]}
            />

            <header className="border-theme mt-8 border-b pb-10">
              <p className="text-brand mb-4 text-xs font-semibold uppercase tracking-[0.25em]">
                {doc.metadata.section}
              </p>
              <h1 className="text-heading text-5xl font-semibold tracking-[-0.045em] md:text-6xl">
                {doc.metadata.title}
              </h1>
              {doc.metadata.description && (
                <p className="text-theme-muted mt-5 text-xl leading-8">
                  {doc.metadata.description}
                </p>
              )}
            </header>

            <div className="docs-prose py-10">
              <MarkdownContent markdown={doc.body} />
            </div>

            {(prevDoc || nextDoc) && (
              <nav className="border-theme mt-8 grid gap-4 border-t pt-8 md:grid-cols-2">
                {prevDoc ? (
                  <a
                    className="border-theme hover:border-brand/60 rounded-2xl border p-5 transition"
                    href={hrefFor(prevDoc)}
                  >
                    <span className="text-theme-muted block text-xs uppercase tracking-[0.2em]">
                      Previous
                    </span>
                    <span className="text-heading mt-2 block font-semibold">
                      ← {prevDoc.metadata.title}
                    </span>
                  </a>
                ) : (
                  <span />
                )}
                {nextDoc && (
                  <a
                    className="border-theme hover:border-brand/60 rounded-2xl border p-5 text-right transition"
                    href={hrefFor(nextDoc)}
                  >
                    <span className="text-theme-muted block text-xs uppercase tracking-[0.2em]">
                      Next
                    </span>
                    <span className="text-heading mt-2 block font-semibold">
                      {nextDoc.metadata.title} →
                    </span>
                  </a>
                )}
              </nav>
            )}
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-8 space-y-4">
              <div className="border-theme rounded-3xl border p-5">
                <p className="text-theme-muted text-xs font-semibold uppercase tracking-[0.2em]">
                  Current page
                </p>
                <p className="text-heading mt-3 font-semibold">
                  {doc.metadata.title}
                </p>
                <p className="text-theme-muted mt-2 text-sm leading-6">
                  {doc.metadata.section}
                </p>
              </div>
              <a
                href="/docs"
                className="border-theme hover:border-brand/60 text-heading block rounded-3xl border p-5 text-sm font-semibold transition"
              >
                Browse all docs →
              </a>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
};
