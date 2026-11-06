import type { JSX } from "react";
import type { BlogPostView } from "./blog-view-schema";
import type { PaginationInfo } from "@brains/plugins";
import { ContentArchive, type ContentItem, Head } from "@brains/ui-library";

export interface BlogListProps {
  posts: BlogPostView[];
  pageTitle: string | null;
  pageLabel: string | null;
  pagination: PaginationInfo | null;
  baseUrl: string | null;
}

const BLOG_DISPLAY_LABEL = "Essays";

/**
 * Maps a post to the list item both the essay archive and site homepages
 * render.
 */
export const blogPostToContentItem = (post: BlogPostView): ContentItem => ({
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
});

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
  const postItems = posts.map(blogPostToContentItem);

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
