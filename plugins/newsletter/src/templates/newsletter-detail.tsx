import type { JSX } from "preact";
import { z } from "@brains/utils";
import { markdownToHtml } from "@brains/utils";
import { createTemplate } from "@brains/plugins";
import {
  Head,
  Breadcrumb,
  ProseContent,
  formatDate,
  StatusBadge,
  type BreadcrumbItem,
} from "@brains/ui-library";
import { newsletterStatusSchema } from "../schemas/newsletter";

/**
 * Source entity reference schema
 */
const sourceEntitySchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});

/**
 * Navigation link schema
 */
const navLinkSchema = z.object({
  id: z.string(),
  subject: z.string(),
  url: z.string(),
});

/**
 * Newsletter detail schema
 */
export const newsletterDetailSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: newsletterStatusSchema,
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  sentAt: z.string().optional(),
  scheduledFor: z.string().optional(),
  sourceEntities: z.array(sourceEntitySchema).optional(),
  prevNewsletter: navLinkSchema.nullable().optional(),
  nextNewsletter: navLinkSchema.nullable().optional(),
});

export type NewsletterDetailData = z.infer<typeof newsletterDetailSchema>;

export interface NewsletterDetailProps extends NewsletterDetailData {}

/**
 * Newsletter detail template - displays individual newsletter with navigation
 */
export const NewsletterDetailTemplate = ({
  subject,
  status,
  content,
  created,
  sentAt,
  scheduledFor,
  sourceEntities,
  prevNewsletter,
  nextNewsletter,
}: NewsletterDetailProps): JSX.Element => {
  const htmlContent = markdownToHtml(content);

  // Build breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Newsletters", href: "/newsletters" },
    { label: subject },
  ];

  // Determine display date
  const displayDate = sentAt ?? created;
  const dateLabel = sentAt ? "Sent" : "Created";

  return (
    <>
      <Head title={subject} description={`Newsletter: ${subject}`} />
      <section className="newsletter-detail-section">
        <div className="container mx-auto px-6 md:px-8 py-12 md:py-20">
          <div className="max-w-3xl mx-auto">
            {/* Breadcrumb navigation */}
            <Breadcrumb items={breadcrumbItems} />

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-heading leading-tight tracking-tight mb-4">
              {subject}
            </h1>

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-3 mb-8 text-sm text-theme-muted">
              <StatusBadge status={status} />
              <span>
                {dateLabel}: {formatDate(displayDate, { style: "long" })}
              </span>
              {scheduledFor && status === "queued" && (
                <span>
                  Scheduled for: {formatDate(scheduledFor, { style: "long" })}
                </span>
              )}
            </div>

            {/* Source entities */}
            {sourceEntities && sourceEntities.length > 0 && (
              <div className="mb-8 p-4 bg-theme-muted rounded-lg">
                <h3 className="text-sm font-medium text-heading mb-2">
                  Related Content
                </h3>
                <ul className="space-y-1">
                  {sourceEntities.map((entity) => (
                    <li key={entity.id}>
                      <a
                        href={entity.url}
                        className="text-sm text-brand hover:text-brand-dark transition-colors"
                      >
                        {entity.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Newsletter Content */}
            <ProseContent html={htmlContent} />

            {/* Prev/Next Navigation */}
            {(prevNewsletter || nextNewsletter) && (
              <nav className="mt-12 pt-8 border-t border-theme">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prevNewsletter ? (
                    <a
                      href={prevNewsletter.url}
                      className="group p-4 rounded-lg border border-theme hover:border-brand transition-colors"
                    >
                      <span className="text-xs text-theme-muted uppercase tracking-wide">
                        Newer
                      </span>
                      <span className="block mt-1 font-medium text-heading group-hover:text-brand transition-colors truncate">
                        {prevNewsletter.subject}
                      </span>
                    </a>
                  ) : (
                    <div />
                  )}
                  {nextNewsletter && (
                    <a
                      href={nextNewsletter.url}
                      className="group p-4 rounded-lg border border-theme hover:border-brand transition-colors md:text-right"
                    >
                      <span className="text-xs text-theme-muted uppercase tracking-wide">
                        Older
                      </span>
                      <span className="block mt-1 font-medium text-heading group-hover:text-brand transition-colors truncate">
                        {nextNewsletter.subject}
                      </span>
                    </a>
                  )}
                </div>
              </nav>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

/**
 * Newsletter detail template definition
 */
export const newsletterDetailTemplate = createTemplate<
  NewsletterDetailData,
  NewsletterDetailProps
>({
  name: "newsletter-detail",
  description: "Individual newsletter detail template",
  schema: newsletterDetailSchema,
  dataSourceId: "newsletter:entities",
  requiredPermission: "public",
  layout: {
    component: NewsletterDetailTemplate,
    interactive: false,
  },
});
