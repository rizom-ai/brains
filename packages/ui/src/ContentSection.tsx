import type { JSX } from "preact";
import { ContentListItem, type SeriesInfo } from "./ContentListItem";

export interface ContentItem {
  id: string;
  url: string;
  title: string;
  date: string;
  description?: string | undefined;
  series?: SeriesInfo | undefined;
}

export interface ContentSectionProps {
  title: string;
  items?: ContentItem[] | undefined;
  children?: JSX.Element | undefined;
  viewAllUrl?: string | undefined;
  emptyMessage?: string | undefined;
  variant?: "divided" | "stacked" | undefined;
}

/**
 * Reusable content section with three-column layout
 * Used for Essays, Presentations, About, and other content sections
 * Supports either list items or custom children content
 */
export const ContentSection = ({
  title,
  items,
  children,
  viewAllUrl,
  emptyMessage,
  variant = "divided",
}: ContentSectionProps): JSX.Element => {
  const hasItems = items && items.length > 0;
  const hasContent = hasItems ?? children;

  const content = !hasContent ? (
    <p className="text-theme-muted italic">
      {emptyMessage ?? `No ${title.toLowerCase()} yet.`}
    </p>
  ) : children ? (
    <>
      {children}
      {viewAllUrl && (
        <div className="mt-10">
          <a
            href={viewAllUrl}
            className="text-sm font-medium text-brand hover:text-brand-dark uppercase tracking-wide"
          >
            Learn More →
          </a>
        </div>
      )}
    </>
  ) : (
    <>
      <ul className="space-y-10">
        {items?.map((item, index) => (
          <ContentListItem
            key={item.id}
            url={item.url}
            title={item.title}
            date={item.date}
            description={item.description}
            series={item.series}
            featured={index === 0}
          />
        ))}
      </ul>
      {viewAllUrl && (
        <div className="mt-10">
          <a
            href={viewAllUrl}
            className="text-sm font-medium text-brand hover:text-brand-dark uppercase tracking-wide"
          >
            View All {title} →
          </a>
        </div>
      )}
    </>
  );

  if (variant === "stacked") {
    return (
      <section>
        <div className="border-t border-theme pt-8">
          <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-8">
            {title}
          </h2>
          <div>{content}</div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="grid md:grid-cols-[200px_1px_1fr] gap-y-2 gap-x-0 md:gap-12 items-start">
        <h2 className="text-xl md:text-2xl font-semibold text-heading">
          {title}
        </h2>
        <div className="border-t md:border-t-0 md:border-l border-theme md:self-stretch"></div>
        <div className="mt-6 md:mt-0">{content}</div>
      </div>
    </section>
  );
};
