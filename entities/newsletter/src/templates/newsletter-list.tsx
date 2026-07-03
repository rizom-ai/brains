import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { createTemplate, type Template } from "@brains/plugins";
import {
  Head,
  Pagination,
  formatDate,
  StatusBadge,
  Card,
  CardTitle,
  CardMetadata,
} from "@brains/ui-library";
type NewsletterTemplateStatus =
  | "generating"
  | "draft"
  | "queued"
  | "published"
  | "failed";

const newsletterStatusSchema: z.ZodType<
  NewsletterTemplateStatus,
  NewsletterTemplateStatus
> = z.enum(["generating", "draft", "queued", "published", "failed"]);

const paginationInfoSchema: z.ZodType<PaginationInfo> = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

/**
 * Newsletter list item schema for template data
 */
export interface NewsletterListItem {
  id: string;
  subject: string;
  status: NewsletterTemplateStatus;
  excerpt: string;
  created: string;
  sentAt?: string | undefined;
  url: string;
}

export const newsletterListItemSchema: z.ZodType<NewsletterListItem> = z.object(
  {
    id: z.string(),
    subject: z.string(),
    status: newsletterStatusSchema,
    excerpt: z.string(),
    created: z.string(),
    sentAt: z.string().optional(),
    url: z.string(),
  },
);

/**
 * Newsletter list schema
 */
export interface NewsletterListData {
  newsletters: NewsletterListItem[];
  totalCount: number;
  pagination: PaginationInfo | null;
}

export const newsletterListSchema: z.ZodType<NewsletterListData> = z.object({
  newsletters: z.array(newsletterListItemSchema),
  totalCount: z.number(),
  pagination: paginationInfoSchema.nullable(),
});

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
