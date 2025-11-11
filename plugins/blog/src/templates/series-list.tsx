import type { JSX } from "preact";
import type { BlogPostWithData } from "../datasources/blog-datasource";
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
            <article
              key={post.id}
              className="series-post bg-theme-subtle rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start gap-4">
                {post.frontmatter.coverImage && (
                  <img
                    src={post.frontmatter.coverImage}
                    alt={post.frontmatter.title}
                    className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                  />
                )}

                <div className="flex-grow">
                  <div className="text-sm text-brand mb-2">
                    Part {post.frontmatter.seriesIndex} of {posts.length}
                  </div>

                  <h2 className="text-2xl font-semibold mb-2 text-theme">
                    <a
                      href={`/posts/${post.metadata.slug}`}
                      className="hover:text-brand"
                    >
                      {post.frontmatter.title}
                    </a>
                  </h2>

                  <PostMetadata
                    author={post.frontmatter.author}
                    publishedAt={post.frontmatter.publishedAt}
                    status={post.frontmatter.status}
                    className="mb-3"
                  />

                  <p className="text-theme-muted">{post.frontmatter.excerpt}</p>
                </div>
              </div>
            </article>
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
