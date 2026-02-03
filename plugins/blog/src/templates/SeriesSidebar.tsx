import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import { Card } from "@brains/ui-library";

export interface SeriesSidebarProps {
  currentPost: EnrichedBlogPost;
  seriesPosts: EnrichedBlogPost[] | null;
}

/**
 * Series sidebar component for desktop view.
 * Shows series name, current position, and list of all posts.
 */
export const SeriesSidebar = ({
  currentPost,
  seriesPosts,
}: SeriesSidebarProps): JSX.Element | null => {
  if (!currentPost.frontmatter.seriesName || !seriesPosts) {
    return null;
  }

  const currentIndex = seriesPosts.findIndex((p) => p.id === currentPost.id);
  const position = currentIndex + 1;
  const total = seriesPosts.length;

  return (
    <aside className="hidden lg:block w-64 shrink-0">
      <div className="sticky top-8">
        <Card variant="compact">
          <h3 className="font-semibold text-theme text-sm mb-1">
            {currentPost.frontmatter.seriesName}
          </h3>
          <p className="text-xs text-theme-muted mb-4">
            Part {position} of {total}
          </p>
          <ol className="space-y-2 text-sm">
            {seriesPosts.map((seriesPost, index) => (
              <li
                key={seriesPost.id}
                className={
                  seriesPost.id === currentPost.id
                    ? "text-brand font-medium"
                    : "text-theme-muted hover:text-theme"
                }
              >
                {seriesPost.id === currentPost.id ? (
                  <span className="flex gap-2">
                    <span className="text-brand">{index + 1}.</span>
                    <span>{seriesPost.frontmatter.title}</span>
                  </span>
                ) : (
                  <a
                    href={seriesPost.url}
                    className="flex gap-2 hover:text-brand"
                  >
                    <span>{index + 1}.</span>
                    <span>{seriesPost.frontmatter.title}</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </aside>
  );
};

/**
 * Series collapsible component for mobile view.
 * Uses native <details> element for accordion behavior.
 */
export const SeriesCollapsible = ({
  currentPost,
  seriesPosts,
}: SeriesSidebarProps): JSX.Element | null => {
  if (!currentPost.frontmatter.seriesName || !seriesPosts) {
    return null;
  }

  const currentIndex = seriesPosts.findIndex((p) => p.id === currentPost.id);
  const position = currentIndex + 1;
  const total = seriesPosts.length;

  return (
    <details className="lg:hidden bg-theme-subtle rounded-lg mb-8">
      <summary className="cursor-pointer p-4 text-sm font-medium text-theme">
        Series: {currentPost.frontmatter.seriesName} (Part {position} of {total}
        )
      </summary>
      <ol className="px-4 pb-4 space-y-2 text-sm">
        {seriesPosts.map((seriesPost, index) => (
          <li
            key={seriesPost.id}
            className={
              seriesPost.id === currentPost.id
                ? "text-brand font-medium"
                : "text-theme-muted"
            }
          >
            {seriesPost.id === currentPost.id ? (
              <span className="flex gap-2">
                <span className="text-brand">{index + 1}.</span>
                <span>{seriesPost.frontmatter.title}</span>
              </span>
            ) : (
              <a href={seriesPost.url} className="flex gap-2 hover:text-brand">
                <span>{index + 1}.</span>
                <span>{seriesPost.frontmatter.title}</span>
              </a>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
};
