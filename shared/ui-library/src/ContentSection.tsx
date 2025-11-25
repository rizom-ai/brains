import type { JSX } from "preact";
import { ContentListItem } from "./ContentListItem";

export interface ContentItem {
  id: string;
  url: string;
  title: string;
  date: string;
  description?: string | undefined;
}

export interface ContentSectionProps {
  title: string;
  items: ContentItem[];
  viewAllUrl?: string | undefined;
  emptyMessage?: string | undefined;
}

/**
 * Reusable content section with three-column layout
 * Used for Essays, Presentations, and other content lists
 */
export const ContentSection = ({
  title,
  items,
  viewAllUrl,
  emptyMessage,
}: ContentSectionProps): JSX.Element => {
  return (
    <section>
      <div className="grid md:grid-cols-[200px_1px_1fr] gap-y-2 gap-x-0 md:gap-12 items-start">
        <h2 className="text-xl md:text-2xl font-semibold text-heading">
          {title}
        </h2>
        <div className="border-t md:border-t-0 md:border-l border-theme md:self-stretch"></div>
        <div className="mt-6 md:mt-0">
          {items.length === 0 ? (
            <p className="text-theme-muted italic">
              {emptyMessage ?? `No ${title.toLowerCase()} yet.`}
            </p>
          ) : (
            <>
              <ul className="space-y-10">
                {items.map((item) => (
                  <ContentListItem
                    key={item.id}
                    url={item.url}
                    title={item.title}
                    date={item.date}
                    description={item.description}
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
          )}
        </div>
      </div>
    </section>
  );
};
