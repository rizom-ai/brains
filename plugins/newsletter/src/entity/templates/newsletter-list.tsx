import type { JSX } from "react";
import type { PaginationInfo } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  createTemplate,
  paginationInfoSchema,
  type Template,
} from "@brains/plugins";
import {
  Head,
  Pagination,
  formatDate,
  StatusBadge,
  Card,
  CardTitle,
  CardMetadata,
} from "@brains/ui-library";
import { newsletterStatusSchema } from "../schemas/newsletter";

/**
 * Newsletter list item schema for template data
 */
export const newsletterListItemSchema: z.ZodObject<{
  id: z.ZodString;
  subject: z.ZodString;
  status: typeof newsletterStatusSchema;
  excerpt: z.ZodString;
  created: z.ZodString;
  sentAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  url: z.ZodString;
}> = z.object({
  id: z.string(),
  subject: z.string(),
  status: newsletterStatusSchema,
  excerpt: z.string(),
  created: z.string(),
  sentAt: z.string().nullable().default(null),
  url: z.string(),
});

export type NewsletterListItem = z.output<typeof newsletterListItemSchema>;

/**
 * Newsletter list schema
 */
export const newsletterListSchema: z.ZodObject<{
  newsletters: z.ZodArray<typeof newsletterListItemSchema>;
  totalCount: z.ZodNumber;
  pagination: z.ZodNullable<typeof paginationInfoSchema>;
}> = z.object({
  newsletters: z.array(newsletterListItemSchema),
  totalCount: z.number(),
  pagination: paginationInfoSchema.nullable(),
});

export type NewsletterListData = z.output<typeof newsletterListSchema>;

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
          <h1 className="text-3xl md:text-4xl font-bold text-heading mb-8">
            {title}
          </h1>

          {newsletters.length === 0 ? (
            <p className="text-theme-muted italic">No newsletters yet.</p>
          ) : (
            <div className="space-y-4">
              {newsletters.map((newsletter) => (
                <Card key={newsletter.id} href={newsletter.url}>
                  <CardTitle className="text-lg">
                    {newsletter.subject}
                  </CardTitle>
                  <CardMetadata>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={newsletter.status} />
                      <span className="text-sm text-theme-muted">
                        {formatDate(newsletter.sentAt ?? newsletter.created, {
                          style: "long",
                        })}
                      </span>
                    </div>
                  </CardMetadata>
                  {newsletter.excerpt && (
                    <p className="text-theme-muted line-clamp-2">
                      {newsletter.excerpt}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}

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
export const newsletterListTemplate: Template = createTemplate<
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
  },
});
