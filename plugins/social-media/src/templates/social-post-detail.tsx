import type { JSX } from "preact";
import {
  Head,
  Breadcrumb,
  StatusBadge,
  type BreadcrumbItem,
} from "@brains/ui-library";
import type { EnrichedSocialPost } from "../schemas/social-post";

export interface SocialPostDetailProps {
  post: EnrichedSocialPost;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const SocialPostDetailTemplate = ({
  post,
}: SocialPostDetailProps): JSX.Element => {
  const title = `Social Post - ${post.frontmatter.platform}`;
  const description = post.body.slice(0, 160);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    {
      label: post.listLabel ?? "Social Posts",
      href: post.listUrl ?? "/social-posts",
    },
    { label: post.frontmatter.platform },
  ];

  const linkedInUrl = post.frontmatter.platformPostId
    ? `https://www.linkedin.com/feed/update/${post.frontmatter.platformPostId}`
    : null;

  return (
    <>
      <Head title={title} description={description} />
      <section className="social-post-detail">
        <div className="container mx-auto px-6 md:px-8 py-12 md:py-20">
          <div className="max-w-3xl mx-auto">
            <Breadcrumb items={breadcrumbItems} />

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-heading mb-4">
              {post.frontmatter.title}
            </h1>

            {/* Status and metadata */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <StatusBadge status={post.frontmatter.status} />
              <span className="text-sm text-theme-muted uppercase">
                {post.frontmatter.platform}
              </span>
              <span className="text-sm text-theme-muted font-mono">
                {post.id}
              </span>
              {post.frontmatter.queueOrder !== undefined && (
                <span className="text-sm text-theme-muted">
                  Queue position: #{post.frontmatter.queueOrder}
                </span>
              )}
            </div>

            {/* Cover image */}
            {post.coverImageUrl && (
              <div className="mb-8">
                <img
                  src={post.coverImageUrl}
                  alt={post.frontmatter.title}
                  className="w-full rounded-lg object-cover"
                />
              </div>
            )}

            {/* Post content */}
            <div className="bg-theme-subtle rounded-lg border border-theme p-8 mb-8">
              <p className="text-lg text-theme leading-relaxed whitespace-pre-wrap">
                {post.body}
              </p>
            </div>

            {/* Metadata section */}
            <div className="space-y-4 text-sm text-theme-muted">
              <div>
                <span className="font-medium">Created:</span>{" "}
                {formatDate(post.created)}
              </div>
              {post.frontmatter.publishedAt && (
                <div>
                  <span className="font-medium">Published:</span>{" "}
                  {formatDate(post.frontmatter.publishedAt)}
                </div>
              )}
              {linkedInUrl && (
                <div>
                  <a
                    href={linkedInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                  >
                    View on LinkedIn →
                  </a>
                </div>
              )}
              {post.frontmatter.lastError && (
                <div className="text-red-600">
                  <span className="font-medium">Last error:</span>{" "}
                  {post.frontmatter.lastError}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
