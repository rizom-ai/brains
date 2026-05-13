import type { JSX } from "preact";
import { calculateReadingTime } from "@brains/utils";
import { MarkdownContent, Head, CoverImage } from "@brains/ui-library";
import type { EnrichedBlogPost } from "../schemas/blog-post";

export interface BlogPostProps {
  post: EnrichedBlogPost;
  prevPost: EnrichedBlogPost | null;
  nextPost: EnrichedBlogPost | null;
  seriesPosts: EnrichedBlogPost[] | null;
}

const railGridClass =
  "grid grid-cols-1 gap-7 md:grid-cols-[140px_minmax(0,720px)] md:gap-14";

const formatPostDate = (date: string): string =>
  new Date(date).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const getSeriesPosition = (
  post: EnrichedBlogPost,
  seriesPosts: EnrichedBlogPost[] | null,
): number | undefined => {
  if (seriesPosts) {
    const index = seriesPosts.findIndex(
      (seriesPost) => seriesPost.id === post.id,
    );
    if (index >= 0) {
      return index + 1;
    }
  }

  return post.frontmatter.seriesIndex;
};

const PostBreadcrumb = ({ post }: { post: EnrichedBlogPost }): JSX.Element => {
  const items = [
    { label: "Home", href: "/" },
    { label: post.listLabel, href: post.listUrl },
    ...(post.frontmatter.seriesName
      ? [
          {
            label: post.frontmatter.seriesName,
            href: post.seriesUrl,
          },
        ]
      : []),
    { label: post.frontmatter.title },
  ];

  return (
    <nav aria-label="Breadcrumb" className="mb-16 text-[13px] text-theme-muted">
      <ol className="flex flex-wrap gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="inline-flex items-center gap-1"
            >
              {index > 0 && (
                <span className="mx-1.5 text-theme-light" aria-hidden="true">
                  /
                </span>
              )}
              {isLast || !item.href ? (
                <span
                  className="font-medium text-heading"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="text-inherit no-underline transition-colors duration-150 hover:text-brand"
                >
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

interface PostRailProps {
  post: EnrichedBlogPost;
  readingTime: number;
  seriesPosition?: number | undefined;
}

const PostRail = ({
  post,
  readingTime,
  seriesPosition,
}: PostRailProps): JSX.Element => (
  <aside
    aria-label="Post details"
    className="relative flex flex-row flex-wrap gap-6 border-t border-rule-strong pt-3.5 before:absolute before:-top-px before:left-0 before:h-px before:w-14 before:bg-accent md:flex-col md:gap-[18px] md:pt-[18px]"
  >
    {post.frontmatter.publishedAt && (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-theme-light">
          Published
        </span>
        <time
          dateTime={post.frontmatter.publishedAt}
          className="text-sm text-theme [font-variant-numeric:tabular-nums]"
        >
          {formatPostDate(post.frontmatter.publishedAt)}
        </time>
      </div>
    )}

    {readingTime > 0 && (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-theme-light">
          Reading
        </span>
        <span className="text-sm text-theme [font-variant-numeric:tabular-nums]">
          {readingTime} min
        </span>
      </div>
    )}

    {post.frontmatter.seriesName && (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-theme-light">
          Series
        </span>
        <span className="text-sm text-theme [font-variant-numeric:tabular-nums]">
          {seriesPosition && (
            <span className="mr-1.5 font-mono text-[0.6875rem] text-theme-light">
              {String(seriesPosition).padStart(3, "0")}
            </span>
          )}
          {post.seriesUrl ? (
            <a
              href={post.seriesUrl}
              className="border-b border-transparent text-inherit no-underline transition-colors duration-150 hover:border-brand hover:text-brand"
            >
              {post.frontmatter.seriesName}
            </a>
          ) : (
            post.frontmatter.seriesName
          )}
        </span>
      </div>
    )}
  </aside>
);

interface SeriesEndmatterProps {
  currentPost: EnrichedBlogPost;
  seriesPosts: EnrichedBlogPost[] | null;
  seriesPosition?: number | undefined;
}

const SeriesEndmatter = ({
  currentPost,
  seriesPosts,
  seriesPosition,
}: SeriesEndmatterProps): JSX.Element | null => {
  if (!currentPost.frontmatter.seriesName || !seriesPosts?.length) {
    return null;
  }

  return (
    <section className="border-t border-rule pt-6" aria-label="Series">
      <header className="mb-[18px] flex items-baseline justify-between gap-6">
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-theme-light">
          Series
        </span>
        <span className="font-heading text-[15px] font-normal italic text-theme-muted [font-variation-settings:'opsz'_24,'SOFT'_60]">
          {currentPost.frontmatter.seriesName}
          {seriesPosition
            ? ` · Part ${seriesPosition} of ${seriesPosts.length}`
            : ""}
        </span>
      </header>
      <ol className="m-0 list-none p-0">
        {seriesPosts.map((seriesPost, index) => {
          const isCurrent = seriesPost.id === currentPost.id;
          return (
            <li
              key={seriesPost.id}
              className="grid grid-cols-[36px_minmax(0,1fr)] items-baseline gap-3.5 py-2"
            >
              {isCurrent ? (
                <span className="contents" aria-current="page">
                  <span className="pt-0.5 font-mono text-[0.6875rem] text-accent [font-variant-numeric:tabular-nums]">
                    {index + 1}.
                  </span>
                  <span className="text-[15.5px] leading-[1.4] text-theme">
                    {seriesPost.frontmatter.title}
                  </span>
                </span>
              ) : (
                <a
                  href={seriesPost.url}
                  className="contents text-theme-muted no-underline transition-colors duration-150 hover:text-theme"
                >
                  <span className="pt-0.5 font-mono text-[0.6875rem] text-theme-light [font-variant-numeric:tabular-nums]">
                    {index + 1}.
                  </span>
                  <span className="text-[15.5px] leading-[1.4]">
                    {seriesPost.frontmatter.title}
                  </span>
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

interface AdjacentPostsProps {
  prevPost: EnrichedBlogPost | null;
  nextPost: EnrichedBlogPost | null;
}

const AdjacentPosts = ({
  prevPost,
  nextPost,
}: AdjacentPostsProps): JSX.Element | null => {
  if (!prevPost && !nextPost) {
    return null;
  }

  return (
    <nav
      className="mt-14 grid grid-cols-1 gap-5 border-t border-rule pt-6 md:grid-cols-2 md:gap-9"
      aria-label="Adjacent posts"
    >
      {prevPost ? (
        <a
          href={prevPost.url}
          className="block text-inherit no-underline group"
        >
          <span className="mb-2 block font-mono text-[0.65625rem] uppercase tracking-[0.18em] text-theme-light">
            ← Previous
          </span>
          <span className="block font-heading text-[1.15rem] font-medium leading-[1.3] tracking-[-0.014em] text-heading transition-colors duration-150 [font-variation-settings:'opsz'_36,'SOFT'_40] group-hover:text-accent">
            {prevPost.frontmatter.title}
          </span>
        </a>
      ) : (
        <span aria-hidden="true" />
      )}

      {nextPost && (
        <a
          href={nextPost.url}
          className="block text-inherit no-underline group md:text-right"
        >
          <span className="mb-2 block font-mono text-[0.65625rem] uppercase tracking-[0.18em] text-theme-light">
            Next →
          </span>
          <span className="block font-heading text-[1.15rem] font-medium leading-[1.3] tracking-[-0.014em] text-heading transition-colors duration-150 [font-variation-settings:'opsz'_36,'SOFT'_40] group-hover:text-accent">
            {nextPost.frontmatter.title}
          </span>
        </a>
      )}
    </nav>
  );
};

/**
 * Blog post detail template - displays individual blog post with editorial marginalia.
 */
export const BlogPostTemplate = ({
  post,
  prevPost,
  nextPost,
  seriesPosts,
}: BlogPostProps): JSX.Element => {
  const readingTime = calculateReadingTime(post.body);
  const seriesPosition = getSeriesPosition(post, seriesPosts);

  return (
    <>
      <Head
        title={post.frontmatter.title}
        description={post.frontmatter.excerpt}
        {...(post.coverImageUrl && {
          ogImage: post.coverImageUrl,
        })}
        ogType="article"
      />
      <article className="blog-post-section bg-theme">
        <div className="mx-auto max-w-[1100px] px-5 py-16 md:px-14 md:pb-24">
          <PostBreadcrumb post={post} />

          <header className={`${railGridClass} mb-14`}>
            <PostRail
              post={post}
              readingTime={readingTime}
              seriesPosition={seriesPosition}
            />
            <div className="pt-0 md:pt-3">
              <h1 className="font-heading text-[clamp(2.4rem,5.4vw,4rem)] font-normal leading-[0.98] tracking-[-0.028em] text-heading [font-variation-settings:'opsz'_144,'SOFT'_30] [text-wrap:balance]">
                {post.frontmatter.title}
              </h1>
            </div>
          </header>

          {post.coverImageUrl &&
            post.coverImageWidth &&
            post.coverImageHeight && (
              <CoverImage
                src={post.coverImageUrl}
                alt={post.frontmatter.title}
                width={post.coverImageWidth}
                height={post.coverImageHeight}
                srcset={post.coverImageSrcset}
                sizes={post.coverImageSizes}
                className="mb-16 rounded-[14px]"
              />
            )}

          <div className={railGridClass}>
            <div aria-hidden="true" />
            <MarkdownContent
              markdown={post.body}
              className="max-w-none font-sans text-theme prose-p:text-[18px] prose-p:leading-[1.72] prose-p:text-theme prose-p:[text-wrap:pretty] prose-h2:border-0 prose-h2:pb-0 prose-h2:font-heading prose-h2:text-[clamp(1.5rem,2.6vw,1.9rem)] prose-h2:font-semibold prose-h2:leading-[1.15] prose-h2:tracking-[-0.022em] prose-h2:text-heading prose-h2:[font-variation-settings:'opsz'_72,'SOFT'_40] prose-em:text-accent prose-strong:text-heading prose-a:text-brand prose-a:decoration-[1px] prose-a:underline-offset-[0.22em] prose-code:bg-theme-muted prose-code:text-theme prose-pre:bg-theme-subtle prose-pre:text-theme prose-blockquote:border-rule-strong prose-blockquote:text-theme-muted prose-blockquote:italic prose-li:marker:text-theme-light prose-img:rounded-[14px]"
            />
          </div>

          <div className={`${railGridClass} mt-[72px]`}>
            <div aria-hidden="true" />
            <div>
              <SeriesEndmatter
                currentPost={post}
                seriesPosts={seriesPosts}
                seriesPosition={seriesPosition}
              />
              <AdjacentPosts prevPost={prevPost} nextPost={nextPost} />
            </div>
          </div>
        </div>
      </article>
    </>
  );
};
