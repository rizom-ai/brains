import type { JSX } from "preact";
import type { BlogPostWithData } from "../datasources/blog-datasource";

export interface SeriesNavigationProps {
  currentPost: BlogPostWithData;
  seriesPosts: BlogPostWithData[] | null;
  prevPost: BlogPostWithData | null;
  nextPost: BlogPostWithData | null;
}

/**
 * Series navigation component for blog posts.
 * Displays series info box and prev/next navigation when applicable.
 */
export const SeriesNavigation = ({
  currentPost,
  seriesPosts,
  prevPost,
  nextPost,
}: SeriesNavigationProps): JSX.Element => {
  return (
    <>
      {/* Series Info Box */}
      {currentPost.frontmatter.seriesName && seriesPosts && (
        <div className="bg-theme-subtle p-4 rounded-lg mb-6">
          <h3 className="font-semibold mb-2 text-theme">
            Series: {currentPost.frontmatter.seriesName}
          </h3>
          <ol className="list-decimal list-inside space-y-1">
            {seriesPosts.map((seriesPost) => (
              <li
                key={seriesPost.id}
                className={
                  seriesPost.id === currentPost.id
                    ? "font-bold text-brand"
                    : "text-theme"
                }
              >
                {seriesPost.id === currentPost.id ? (
                  <span>{seriesPost.frontmatter.title}</span>
                ) : (
                  <a
                    href={`/posts/${seriesPost.metadata.slug}`}
                    className="hover:text-brand"
                  >
                    {seriesPost.frontmatter.title}
                  </a>
                )}
                {seriesPost.frontmatter.status === "draft" && (
                  <span className="ml-2 text-xs text-theme-muted">(Draft)</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Prev/Next Navigation */}
      {(prevPost || nextPost) && (
        <nav className="flex justify-between items-center border-t border-theme pt-6 mt-12">
          {prevPost ? (
            <a
              href={`/posts/${prevPost.metadata.slug}`}
              className="text-brand hover:underline"
            >
              ← Previous: {prevPost.frontmatter.title}
            </a>
          ) : (
            <div />
          )}
          {nextPost && (
            <a
              href={`/posts/${nextPost.metadata.slug}`}
              className="text-brand hover:underline text-right"
            >
              Next: {nextPost.frontmatter.title} →
            </a>
          )}
        </nav>
      )}
    </>
  );
};
