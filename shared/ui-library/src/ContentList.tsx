import type { JSX } from "preact";
import { ContentListItem } from "./ContentListItem";
import type { ContentItem } from "./ContentSection";

export interface ContentListProps {
  items: ContentItem[];
  viewAllUrl?: string | undefined;
  viewAllLabel?: string | undefined;
  emptyMessage?: string | undefined;
}

/**
 * Body-only content list — items plus an optional view-all link.
 *
 * Companion to {@link SectionHeader}. Use this when you want to compose a
 * section header and a list separately (e.g. an editorial homepage that
 * renders its own grid layout). For a self-contained section with a built-in
 * heading, use {@link ContentSection}.
 */
export const ContentList = ({
  items,
  viewAllUrl,
  viewAllLabel,
  emptyMessage,
}: ContentListProps): JSX.Element => {
  if (items.length === 0) {
    return (
      <p className="text-theme-muted italic">
        {emptyMessage ?? "Nothing here yet."}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-10">
        {items.map((item, index) => (
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
            {viewAllLabel ?? "View All →"}
          </a>
        </div>
      )}
    </>
  );
};
