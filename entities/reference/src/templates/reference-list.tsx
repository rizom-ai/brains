import type { JSX } from "react";
import { formatDate } from "@rizom/brain-ui";
import { createTemplate } from "@brains/sdk/internal/presentation";
import { z } from "@brains/utils/zod";
import { referenceStatusSchema } from "../schemas/reference";

type ReferenceListItemSchema = z.ZodObject<{
  id: z.ZodString;
  kind: z.ZodString;
  title: z.ZodString;
  summary: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  author: z.ZodString;
  authorSite: z.ZodString;
  url: z.ZodURL;
  publishedAt: z.ZodString;
  kicker: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof referenceStatusSchema;
}>;

/** A reference as a site shows it: what a reader sees, and where it leads. */
export const referenceListItemSchema: ReferenceListItemSchema = z.object({
  id: z.string(),
  /** The kind of entity pointed to, as its author's brain names it. */
  kind: z.string(),
  title: z.string(),
  summary: z.string().nullable().default(null),
  author: z.string(),
  authorSite: z.string(),
  url: z.url(),
  publishedAt: z.string(),
  /** What sets the entry apart: a post's series, else what kind of thing it is. */
  kicker: z.string().nullable().default(null),
  status: referenceStatusSchema,
});

export type ReferenceListItem = z.output<typeof referenceListItemSchema>;

export const referenceListSchema: z.ZodObject<{
  references: z.ZodArray<ReferenceListItemSchema>;
}> = z.object({ references: z.array(referenceListItemSchema) });

export type ReferenceListData = z.output<typeof referenceListSchema>;

/**
 * A selection of what other brains publish. Each entry is its kicker (a
 * post's series or the kind of thing it is, the author and the date), its title and its author's own summary,
 * and leads to the entity on its author's site. There are no local pages.
 */
export const ReferenceList = ({
  references,
}: ReferenceListData): JSX.Element => {
  if (references.length === 0) return <></>;
  return (
    <section className="reference-list w-full max-w-4xl mx-auto p-6">
      <ol className="divide-y divide-theme">
        {references.map((reference) => (
          <li key={reference.id} className="py-6">
            <article>
              <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs uppercase tracking-wide text-theme-muted">
                {reference.kicker && (
                  <span className="text-brand">{reference.kicker}</span>
                )}
                <span>{reference.author}</span>
                <time dateTime={reference.publishedAt}>
                  {formatDate(reference.publishedAt, { style: "long" })}
                </time>
                {reference.status === "draft" && (
                  <span className="rounded border border-theme px-1">
                    Draft
                  </span>
                )}
              </p>
              <h3 className="text-xl font-semibold text-theme">
                <a
                  href={reference.url}
                  rel="noopener"
                  className="hover:text-brand"
                >
                  {reference.title}
                </a>
              </h3>
              {reference.summary && (
                <p className="mt-2 text-theme-muted">{reference.summary}</p>
              )}
              <p className="mt-2 text-sm text-theme-muted">
                {reference.authorSite}
              </p>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
};

export const REFERENCE_LIST_TEMPLATE = "list";
export const REFERENCES_DATA_SOURCE = "references:entities";

export const referenceListTemplate: ReturnType<
  typeof createTemplate<ReferenceListData>
> = createTemplate<ReferenceListData>({
  name: REFERENCE_LIST_TEMPLATE,
  description:
    "A curated selection of what other brains publish, each entry linking to its author's site",
  schema: referenceListSchema,
  dataSourceId: REFERENCES_DATA_SOURCE,
  requiredPermission: "public",
  layout: { component: ReferenceList },
});
