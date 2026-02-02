import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import { z } from "@brains/utils";
import { paginationInfoSchema, createTemplate } from "@brains/plugins";
import { Head, Pagination, formatDate, StatusBadge } from "@brains/ui-library";
import { newsletterStatusSchema } from "../schemas/newsletter";

/**
 * Newsletter list item schema for template data
 */
export const newsletterListItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: newsletterStatusSchema,
  excerpt: z.string(),
  created: z.string(),
  sentAt: z.string().optional(),
  url: z.string(),
});

export type NewsletterListItem = z.infer<typeof newsletterListItemSchema>;

/**
 * Newsletter list schema
 */
export const newsletterListSchema = z.object({
  newsletters: z.array(newsletterListItemSchema),
  totalCount: z.number(),
  pagination: paginationInfoSchema.nullable(),
});

export type NewsletterListData = z.infer<typeof newsletterListSchema>;

export interface NewsletterListProps {
  newsletters: NewsletterListItem[];
  totalCount: number;
  pageTitle?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

/**
 * Newsletter list template - displays all newsletters with status badges
 */
export const NewsletterListTemplate = ({
  newsletters,
  totalCount,
  pageTitle,
  pagination,
  baseUrl = "/newsletters",
}: NewsletterListProps): JSX.Element => {
  const title = pageTitle ?? "Newsletters";
  const description = `Browse all ${totalCount} ${totalCount === 1 ? "newsletter" : "newsletters"}`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="newsletter-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl py-16 md:py-24">
          <section>
            <div className="grid md:grid-cols-[200px_1px_1fr] gap-y-2 gap-x-0 md:gap-12 items-start">
              <h2 className="text-xl md:text-2xl font-semibold text-heading">
                {title}
              </h2>
              <div className="border-t md:border-t-0 md:border-l border-theme md:self-stretch" />
              <div className="mt-6 md:mt-0">
                {newsletters.length === 0 ? (
                  <p className="text-theme-muted italic">No newsletters yet.</p>
                ) : (
                  <ul className="space-y-10">
                    {newsletters.map((newsletter) => (
                      <li key={newsletter.id}>
                        <a
                          href={newsletter.url}
                          className="block group hover:opacity-80 transition-opacity"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-medium text-heading group-hover:text-brand transition-colors">
                                {newsletter.subject}
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                <StatusBadge status={newsletter.status} />
                                <span className="text-sm text-theme-muted">
                                  {formatDate(
                                    newsletter.sentAt ?? newsletter.created,
                                    { style: "long" },
                                  )}
                                </span>
                              </div>
                              {newsletter.excerpt && (
                                <p className="mt-2 text-sm text-theme-muted line-clamp-2">
                                  {newsletter.excerpt}
                                </p>
                              )}
                            </div>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              baseUrl={baseUrl}
            />
          )}
        </div>
      </div>
    </>
  );
};

/**
 * Newsletter list template definition
 */
export const newsletterListTemplate = createTemplate<
  NewsletterListData,
  NewsletterListProps
>({
  name: "newsletter-list",
  description: "Newsletter list page template",
  schema: newsletterListSchema,
  dataSourceId: "newsletter:entities",
  requiredPermission: "public",
  layout: {
    component: NewsletterListTemplate,
    interactive: false,
  },
});
