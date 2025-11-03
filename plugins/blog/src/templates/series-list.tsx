import type { JSX } from "preact";
import type { BlogPost } from "../schemas/blog-post";

export interface SeriesListProps {
  seriesName: string;
  posts: BlogPost[];
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
                {post.metadata.coverImage && (
                  <img
                    src={post.metadata.coverImage}
                    alt={post.metadata.title}
                    className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                  />
                )}

                <div className="flex-grow">
                  <div className="text-sm text-brand mb-2">
                    Part {post.metadata.seriesIndex} of {posts.length}
                  </div>

                  <h2 className="text-2xl font-semibold mb-2 text-theme">
                    <a
                      href={`/blog/${post.metadata.slug}`}
                      className="hover:text-brand"
                    >
                      {post.metadata.title}
                    </a>
                  </h2>

                  <div className="text-sm text-theme-muted mb-3">
                    <span>{post.metadata.author}</span>
                    {post.metadata.publishedAt && (
                      <span>
                        {" "}
                        •{" "}
                        {new Date(
                          post.metadata.publishedAt,
                        ).toLocaleDateString()}
                      </span>
                    )}
                    {post.metadata.status === "draft" && (
                      <span className="ml-2 px-2 py-1 bg-theme-muted rounded text-xs">
                        Draft
                      </span>
                    )}
                  </div>

                  <p className="text-theme-muted">{post.metadata.excerpt}</p>
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
