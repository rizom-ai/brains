import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import { Card } from "@brains/ui-library";

export interface PostNavigationProps {
  prevPost: EnrichedBlogPost | null;
  nextPost: EnrichedBlogPost | null;
}

/**
 * Post navigation component - displays prev/next links at bottom of article.
 */
export const PostNavigation = ({
  prevPost,
  nextPost,
}: PostNavigationProps): JSX.Element | null => {
  if (!prevPost && !nextPost) {
    return null;
  }

  return (
    <nav className="border-t border-theme pt-8 mt-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {prevPost ? (
          <Card href={prevPost.url} variant="compact">
            <span className="text-xs text-theme-muted uppercase tracking-wide">
              Previous
            </span>
            <span className="block mt-1 font-medium text-heading group-hover:text-brand transition-colors truncate">
              {prevPost.frontmatter.title}
            </span>
          </Card>
        ) : (
          <div />
        )}
        {nextPost && (
          <Card href={nextPost.url} variant="compact" className="md:text-right">
            <span className="text-xs text-theme-muted uppercase tracking-wide">
              Next
            </span>
            <span className="block mt-1 font-medium text-heading group-hover:text-brand transition-colors truncate">
              {nextPost.frontmatter.title}
            </span>
          </Card>
        )}
      </div>
    </nav>
  );
};
