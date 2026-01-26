import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import { Head, Pagination } from "@brains/ui-library";
import type { EnrichedSocialPost } from "../schemas/social-post";

export interface SocialPostListProps {
  posts: EnrichedSocialPost[];
  pageTitle?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-yellow-100 text-yellow-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const SocialPostListTemplate = ({
  posts,
  pageTitle,
  pagination,
  baseUrl = "/social-posts",
}: SocialPostListProps): JSX.Element => {
  const title = pageTitle ?? "Social Posts";
  const totalCount = pagination?.totalItems ?? posts.length;
  const description = `Browse all ${totalCount} social ${totalCount === 1 ? "post" : "posts"}`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="social-post-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl py-16 md:py-24">
          <h1 className="text-3xl md:text-4xl font-bold text-heading mb-8">
            {title}
          </h1>

          {posts.length === 0 ? (
            <p className="text-theme-muted italic">No social posts yet.</p>
          ) : (
            <ul className="space-y-6">
              {posts.map((post) => (
                <li key={post.id}>
                  <a
                    href={post.url}
                    className="block p-6 bg-surface rounded-lg border border-theme hover:border-brand transition-colors"
                  >
                    <div className="flex gap-4">
                      {post.coverImageUrl && (
                        <img
                          src={post.coverImageUrl}
                          alt={post.frontmatter.title}
                          className="w-24 h-24 object-cover rounded shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h2 className="text-lg font-semibold text-heading">
                            {post.frontmatter.title}
                          </h2>
                          <time className="text-sm text-theme-muted shrink-0">
                            {formatDate(
                              post.frontmatter.publishedAt ?? post.created,
                            )}
                          </time>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${STATUS_COLORS[post.frontmatter.status] ?? STATUS_COLORS["draft"]}`}
                          >
                            {post.frontmatter.status}
                          </span>
                          <span className="text-xs text-theme-muted uppercase">
                            {post.frontmatter.platform}
                          </span>
                          <span className="text-xs text-theme-muted font-mono">
                            {post.id}
                          </span>
                        </div>
                        <p className="text-theme leading-relaxed">
                          {truncateText(post.body, 200)}
                        </p>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}

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
