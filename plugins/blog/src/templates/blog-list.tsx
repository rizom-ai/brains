import type { JSX } from "preact";
import type { BlogPost } from "../schemas/blog-post";

export interface BlogListProps {
  posts: BlogPost[];
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
            <article
              key={post.id}
              className="blog-post-preview bg-theme-subtle rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              {post.metadata.coverImage && (
                <img
                  src={post.metadata.coverImage}
                  alt={post.metadata.title}
                  className="w-full h-48 object-cover rounded-lg mb-4"
                />
              )}

              <h2 className="text-2xl font-semibold mb-2 text-theme">
                <a
                  href={`/posts/${post.metadata.slug}`}
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
                    • {new Date(post.metadata.publishedAt).toLocaleDateString()}
                  </span>
                )}
                {post.metadata.status === "draft" && (
                  <span className="ml-2 px-2 py-1 bg-theme-muted rounded text-xs">
                    Draft
                  </span>
                )}
              </div>

              {post.metadata.seriesName && (
                <div className="text-sm text-brand mb-3">
                  {post.metadata.seriesName} - Part {post.metadata.seriesIndex}
                </div>
              )}

              <p className="text-theme-muted">{post.metadata.excerpt}</p>
            </article>
          ))}

          {posts.length === 0 && (
            <p className="text-theme-muted text-center py-12">
              No blog posts yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
