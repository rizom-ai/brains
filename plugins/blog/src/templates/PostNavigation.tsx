import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";

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
    <nav className="flex justify-between items-center border-t border-theme pt-8 mt-16">
      {prevPost ? (
        <a href={prevPost.url} className="text-brand hover:underline">
          ← Previous: {prevPost.frontmatter.title}
        </a>
      ) : (
        <div />
      )}
      {nextPost && (
        <a
          href={nextPost.url}
          className="text-brand hover:underline text-right"
        >
          Next: {nextPost.frontmatter.title} →
        </a>
      )}
    </nav>
  );
};
