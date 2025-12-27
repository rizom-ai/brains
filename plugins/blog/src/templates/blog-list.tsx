import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import type { PaginationInfo } from "@brains/datasource";
import {
  ContentSection,
  type ContentItem,
  Head,
  Pagination,
} from "@brains/ui-library";

export interface BlogListProps {
  posts: EnrichedBlogPost[];
  pageTitle?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

/**
 * Blog list template - clean, minimal design for reading-focused content
 */
export const BlogListTemplate = ({
  posts,
  pageTitle,
  pagination,
  baseUrl = "/posts",
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
  const totalCount = pagination?.totalItems ?? posts.length;
  const description = `Browse all ${totalCount} ${totalCount === 1 ? "essay" : "essays"}`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="blog-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl py-16 md:py-24">
          <ContentSection title={title} items={postItems} />
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              baseUrl={baseUrl}
            />
          )}
        </div>
      </div>
    </>
  );
};
