import type { JSX } from "preact";
import { markdownToHtml } from "@brains/utils";
import { ProseContent } from "@brains/ui-library";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import { SeriesNavigation } from "./SeriesNavigation";
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
  // Inject title as h1 into markdown for consistent prose styling
  const markdownWithTitle = `# ${post.frontmatter.title}\n\n${post.body}`;
  const htmlContent = markdownToHtml(markdownWithTitle);

  return (
    <section className="blog-post-section">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl py-20">
        {/* Cover Image */}
        {post.frontmatter.coverImage && (
          <img
            src={post.frontmatter.coverImage}
            alt={post.frontmatter.title}
            className="w-full h-64 object-cover rounded-lg mb-8 shadow-lg"
          />
        )}

        {/* Post Metadata */}
        <PostMetadata
          author={post.frontmatter.author}
          publishedAt={post.frontmatter.publishedAt}
          status={post.frontmatter.status}
          className="mb-4"
        />

        {/* Series Navigation */}
        <SeriesNavigation
          currentPost={post}
          seriesPosts={seriesPosts}
          prevPost={prevPost}
          nextPost={nextPost}
        />

        {/* Post Content (includes title as h1) */}
        <ProseContent html={htmlContent} />
      </div>
    </section>
  );
};
