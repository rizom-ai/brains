import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import {
  Card,
  CardImage,
  CardTitle,
  CardMetadata,
  EmptyState,
} from "@brains/ui-library";
import { PostMetadata } from "./PostMetadata";

export interface BlogListProps {
  posts: EnrichedBlogPost[];
}

/**
 * Blog list template - displays all blog posts
 */
export const BlogListTemplate = ({ posts }: BlogListProps): JSX.Element => {
  return (
    <section className="blog-list-section flex-grow min-h-screen">
      <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
        <h1 className="text-4xl font-bold mb-12 text-theme">Blog Posts</h1>

        <div className="space-y-8">
          {posts.map((post) => (
            <Card key={post.id} variant="vertical">
              {post.frontmatter.coverImage && (
                <CardImage
                  src={post.frontmatter.coverImage}
                  alt={post.frontmatter.title}
                  size="large"
                  className="mb-4"
                />
              )}

              <CardTitle href={post.url}>{post.frontmatter.title}</CardTitle>

              <CardMetadata>
                <PostMetadata
                  author={post.frontmatter.author}
                  publishedAt={post.frontmatter.publishedAt}
                  status={post.frontmatter.status}
                />
              </CardMetadata>

              {post.frontmatter.seriesName && (
                <CardMetadata>
                  <div className="text-sm text-brand">
                    {post.frontmatter.seriesName} - Part{" "}
                    {post.frontmatter.seriesIndex}
                  </div>
                </CardMetadata>
              )}

              <p className="text-theme-muted">{post.frontmatter.excerpt}</p>
            </Card>
          ))}

          {posts.length === 0 && <EmptyState message="No blog posts yet." />}
        </div>
      </div>
    </section>
  );
};
