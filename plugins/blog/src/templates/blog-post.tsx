import type { JSX } from "preact";
import { markdownToHtml } from "@brains/utils";
import type { BlogPostWithData } from "../datasources/blog-datasource";

export interface BlogPostProps {
  post: BlogPostWithData;
  prevPost: BlogPostWithData | null;
  nextPost: BlogPostWithData | null;
  seriesPosts: BlogPostWithData[] | null;
}

/**
 * Blog post detail template - displays individual blog post with series navigation
 */
export const BlogPostTemplate = ({
  post,
  prevPost,
  nextPost,
  seriesPosts,
}: BlogPostProps): JSX.Element => {
  const htmlContent = markdownToHtml(post.body);

  return (
    <section className="blog-post-section flex-grow min-h-screen">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl py-20">
        {/* Cover Image */}
        {post.frontmatter.coverImage && (
          <img
            src={post.frontmatter.coverImage}
            alt={post.frontmatter.title}
            className="w-full h-64 object-cover rounded-lg mb-8 shadow-lg"
          />
        )}

        {/* Post Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4 text-theme">
            {post.frontmatter.title}
          </h1>

          <div className="text-theme-muted mb-4">
            <span>{post.frontmatter.author}</span>
            {post.frontmatter.publishedAt && (
              <span>
                {" "}
                •{" "}
                {new Date(post.frontmatter.publishedAt).toLocaleDateString(
                  undefined,
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                )}
              </span>
            )}
          </div>

          {post.frontmatter.seriesName && seriesPosts && (
            <div className="bg-theme-subtle p-4 rounded-lg mb-6">
              <h3 className="font-semibold mb-2 text-theme">
                Series: {post.frontmatter.seriesName}
              </h3>
              <ol className="list-decimal list-inside space-y-1">
                {seriesPosts.map((seriesPost) => (
                  <li
                    key={seriesPost.id}
                    className={
                      seriesPost.id === post.id
                        ? "font-bold text-brand"
                        : "text-theme"
                    }
                  >
                    {seriesPost.id === post.id ? (
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
                      <span className="ml-2 text-xs text-theme-muted">
                        (Draft)
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </header>

        {/* Post Content */}
        <article
          className="prose prose-lg max-w-none mb-12
            prose-h1:text-4xl prose-h1:font-bold prose-h1:mb-8 prose-h1:mt-0
            prose-h2:text-3xl prose-h2:font-semibold prose-h2:mt-16 prose-h2:mb-6 prose-h2:border-b prose-h2:pb-4
            prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-4
            prose-p:text-lg prose-p:leading-relaxed prose-p:mb-6
            prose-ul:my-6 prose-ul:space-y-3
            prose-ol:my-6 prose-ol:space-y-3
            prose-li:leading-relaxed
            prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
            prose-pre:rounded-lg prose-pre:my-6 prose-pre:p-4 prose-pre:overflow-x-auto prose-pre:text-sm
            prose-blockquote:border-l-4 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:my-6
            prose-hr:my-12
            prose-img:rounded-lg prose-img:shadow-md prose-img:my-8"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

        {/* Series Navigation */}
        {(prevPost || nextPost) && (
          <nav className="flex justify-between items-center border-t border-theme pt-6">
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
      </div>
    </section>
  );
};
