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
      <ul className="flex flex-col gap-10">
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
        <a
          href={viewAllUrl}
          className="mt-10 inline-flex items-center gap-2 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-accent pb-1 relative before:content-[''] before:absolute before:left-0 before:right-full before:bottom-0 before:h-px before:bg-accent before:transition-[right] before:duration-300 hover:before:right-0"
        >
          {viewAllLabel ?? "View All"}
          <span aria-hidden="true">→</span>
        </a>
      )}
    </>
  );
};
