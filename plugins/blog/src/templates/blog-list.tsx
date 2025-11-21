import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import { ContentSection, type ContentItem, Head } from "@brains/ui-library";

export interface BlogListProps {
  posts: EnrichedBlogPost[];
  pageTitle?: string;
}

/**
 * Blog list template - clean, minimal design for reading-focused content
 */
export const BlogListTemplate = ({
  posts,
  pageTitle,
}: BlogListProps): JSX.Element => {
  // Map posts to ContentItem format
  const postItems: ContentItem[] = posts.map((post) => ({
    id: post.id,
    url: post.url,
    title: post.metadata.title,
    date: post.metadata.publishedAt || post.created,
    description: post.frontmatter.excerpt,
  }));

  const title = pageTitle ?? "Essays";
  const description = `Browse all ${posts.length} ${posts.length === 1 ? "essay" : "essays"}`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="blog-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl py-16 md:py-24">
          <ContentSection title={title} items={postItems} />
        </div>
      </div>
    </>
  );
};
