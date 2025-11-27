import type { JSX } from "preact";
import { markdownToHtml, calculateReadingTime } from "@brains/utils";
import { ProseContent, Head } from "@brains/ui-library";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import { SeriesSidebar, SeriesCollapsible } from "./SeriesSidebar";
import { PostNavigation } from "./PostNavigation";
import { PostMetadata } from "./PostMetadata";

export interface BlogPostProps {
  post: EnrichedBlogPost;
  prevPost: EnrichedBlogPost | null;
  nextPost: EnrichedBlogPost | null;
  seriesPosts: EnrichedBlogPost[] | null;
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
  const readingTime = calculateReadingTime(post.body);
  const hasSeries = Boolean(post.frontmatter.seriesName && seriesPosts);

  return (
    <>
      <Head
        title={post.frontmatter.title}
        description={post.frontmatter.excerpt}
        {...(post.frontmatter.coverImage && {
          ogImage: post.frontmatter.coverImage,
        })}
        ogType="article"
      />
      <section className="blog-post-section">
        <div className="container mx-auto px-6 md:px-8 py-12 md:py-20">
          {/* Two-column layout wrapper */}
          <div
            className={`flex gap-12 ${hasSeries ? "max-w-5xl" : "max-w-3xl"} mx-auto`}
          >
            {/* Main content column */}
            <div className="flex-1 max-w-3xl">
              {/* Cover Image */}
              {post.frontmatter.coverImage && (
                <img
                  src={post.frontmatter.coverImage}
                  alt={post.frontmatter.title}
                  className="w-full h-80 md:h-96 object-cover rounded-lg mb-8 shadow-lg"
                />
              )}

              {/* Title */}
              <h1 className="text-4xl md:text-5xl font-bold text-heading leading-tight tracking-tight mb-4">
                {post.frontmatter.title}
              </h1>

              {/* Metadata: Date + Reading time */}
              <PostMetadata
                publishedAt={post.frontmatter.publishedAt}
                readingTime={readingTime}
                className="mb-8"
              />

              {/* Mobile: Collapsible series navigation */}
              <SeriesCollapsible currentPost={post} seriesPosts={seriesPosts} />

              {/* Post Content */}
              <ProseContent html={htmlContent} />

              {/* Prev/Next Navigation */}
              <PostNavigation prevPost={prevPost} nextPost={nextPost} />
            </div>

            {/* Desktop: Series sidebar */}
            <SeriesSidebar currentPost={post} seriesPosts={seriesPosts} />
          </div>
        </div>
      </section>
    </>
  );
};
