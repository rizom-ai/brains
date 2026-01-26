import type { JSX } from "preact";
import type { EnrichedBlogPost } from "../schemas/blog-post";
import {
  Card,
  CardImage,
  CardTitle,
  CardMetadata,
  ListPageHeader,
  EmptyState,
  Head,
  Breadcrumb,
  type BreadcrumbItem,
} from "@brains/ui-library";
import { calculateReadingTime } from "@brains/utils";
import { PostMetadata } from "./PostMetadata";

export interface SeriesDetailProps {
  seriesName: string;
  posts: EnrichedBlogPost[];
  coverImageUrl?: string;
  description?: string;
}

/**
 * Series detail template - displays all posts in a specific series
 */
export const SeriesDetailTemplate = ({
  seriesName,
  posts,
  coverImageUrl,
  description: seriesDescription,
}: SeriesDetailProps): JSX.Element => {
  const title = `Series: ${seriesName}`;
  const description =
    seriesDescription ??
    `${posts.length} ${posts.length === 1 ? "post" : "posts"} in the ${seriesName} series`;

  // Handle empty series
  if (posts.length === 0) {
    return (
      <>
        <Head title={title} description={description} />
        <section className="series-list-section flex-grow min-h-screen">
          <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
            <EmptyState message="No posts in this series yet." />
          </div>
        </section>
      </>
    );
  }

  // Safe to access - we've already returned early if posts is empty
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Series", href: "/series" },
    { label: seriesName },
  ];

  return (
    <>
      <Head title={title} description={description} />
      <section className="series-list-section flex-grow min-h-screen">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
          <Breadcrumb items={breadcrumbItems} />

          {coverImageUrl && (
            <div className="mb-8 rounded-lg overflow-hidden">
              <img
                src={coverImageUrl}
                alt={`Cover image for ${seriesName} series`}
                className="w-full h-48 md:h-64 object-cover"
              />
            </div>
          )}

          <ListPageHeader
            title={`Series: ${seriesName}`}
            count={posts.length}
            singularLabel="post"
            description="in this series"
            className="mb-4"
          />

          {seriesDescription && (
            <p className="text-theme-muted mb-8">{seriesDescription}</p>
          )}

          <div className="space-y-6">
            {posts.map((post) => (
              <Card key={post.id} variant="horizontal">
                {post.coverImageUrl && (
                  <CardImage
                    src={post.coverImageUrl}
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

                  <CardTitle href={post.url}>
                    {post.frontmatter.title}
                  </CardTitle>

                  <CardMetadata>
                    <PostMetadata
                      publishedAt={post.frontmatter.publishedAt}
                      readingTime={calculateReadingTime(post.body)}
                    />
                  </CardMetadata>

                  <p className="text-theme-muted">{post.frontmatter.excerpt}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};
