import type { JSX } from "preact";
import type { BlogPostWithData } from "../datasources/blog-datasource";
import { Card, CardImage, CardTitle, CardMetadata } from "@brains/ui-library";
import { PostMetadata } from "./PostMetadata";

export interface SeriesListProps {
  seriesName: string;
  posts: BlogPostWithData[];
}

/**
 * Series list template - displays all posts in a specific series
 */
export const SeriesListTemplate = ({
  seriesName,
  posts,
}: SeriesListProps): JSX.Element => {
  return (
    <section className="series-list-section flex-grow min-h-screen">
      <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
        <h1 className="text-4xl font-bold mb-4 text-theme">
          Series: {seriesName}
        </h1>

        <p className="text-theme-muted mb-12">
          {posts.length} {posts.length === 1 ? "post" : "posts"} in this series
        </p>

        <div className="space-y-6">
          {posts.map((post) => (
            <Card key={post.id} variant="horizontal">
              {post.frontmatter.coverImage && (
                <CardImage
                  src={post.frontmatter.coverImage}
                  alt={post.frontmatter.title}
                  size="small"
                />
              )}

              <div className="flex-grow">
                <CardMetadata className="mb-2">
                  <div className="text-sm text-brand">
                    Part {post.frontmatter.seriesIndex} of {posts.length}
                  </div>
                </CardMetadata>

                <CardTitle href={`/posts/${post.metadata.slug}`}>
                  {post.frontmatter.title}
                </CardTitle>

                <CardMetadata>
                  <PostMetadata
                    author={post.frontmatter.author}
                    publishedAt={post.frontmatter.publishedAt}
                    status={post.frontmatter.status}
                  />
                </CardMetadata>

                <p className="text-theme-muted">{post.frontmatter.excerpt}</p>
              </div>
            </Card>
          ))}

          {posts.length === 0 && (
            <p className="text-theme-muted text-center py-12">
              No posts in this series yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
