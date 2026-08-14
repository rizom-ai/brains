import type { JSX } from "react";
import type { BlogPostView } from "./blog-view-schema";
import type { PaginationInfo } from "@brains/sdk/entities";
import { ContentArchive, type ContentItem, Head } from "@rizom/brain-ui";

export interface BlogListProps {
  posts: BlogPostView[];
  pageTitle: string | null;
  pageLabel: string | null;
  pagination: PaginationInfo | null;
  baseUrl: string | null;
}

const BLOG_DISPLAY_LABEL = "Essays";

/**
 * Blog list template - clean, minimal design for reading-focused content
 */
export const BlogListTemplate = ({
  posts,
  pageTitle,
  pageLabel,
  pagination,
  baseUrl,
}: BlogListProps): JSX.Element => {
  // Map posts to ContentItem format
  const postItems: ContentItem[] = posts.map((post) => ({
    id: post.id,
    url: post.url,
    title: post.metadata.title,
    date: post.metadata.publishedAt ?? post.created,
    description: post.frontmatter.excerpt,
    series:
      post.frontmatter.seriesName && post.frontmatter.seriesIndex
        ? {
            name: post.frontmatter.seriesName,
            index: post.frontmatter.seriesIndex,
          }
        : undefined,
  }));

  const label =
    pageLabel && pageLabel !== "Posts" ? pageLabel : BLOG_DISPLAY_LABEL;
  const title = pageTitle && pageTitle !== "Posts" ? pageTitle : label;
  const totalCount = pagination?.totalItems ?? posts.length;
  const description = `Browse all ${totalCount} ${totalCount === 1 ? "essay" : "essays"}`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="blog-list bg-theme">
        <div className="container mx-auto max-w-[1100px] px-6 py-16 md:px-12 md:py-24">
          <ContentArchive
            label={label}
            items={postItems}
            pagination={pagination}
            baseUrl={baseUrl ?? "/posts"}
          />
        </div>
      </div>
    </>
  );
};
