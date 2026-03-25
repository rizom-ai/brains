import type { JSX } from "preact";
import type { SeriesListItem } from "../schemas/series";
import {
  Card,
  CardTitle,
  CardMetadata,
  CoverImage,
  ListPageHeader,
  EmptyState,
  Head,
  Breadcrumb,
  type BreadcrumbItem,
} from "@brains/ui-library";

/**
 * A member entity in the series — generic, not blog-specific.
 * Uses the enriched entity shape added by site-builder (url, frontmatter).
 */
interface SeriesMember {
  id: string;
  url?: string;
  frontmatter?: {
    title?: string;
    seriesIndex?: number;
    excerpt?: string;
    publishedAt?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface SeriesDetailProps {
  seriesName: string;
  posts: SeriesMember[];
  series: SeriesListItem;
  description?: string;
}

export const SeriesDetailTemplate = ({
  seriesName,
  posts,
  series,
  description: seriesDescription,
}: SeriesDetailProps): JSX.Element => {
  const coverImageUrl = series.coverImageUrl;
  const title = `Series: ${seriesName}`;
  const description =
    seriesDescription ??
    `${posts.length} ${posts.length === 1 ? "part" : "parts"} in the ${seriesName} series`;

  if (posts.length === 0) {
    return (
      <>
        <Head title={title} description={description} />
        <section className="series-list-section flex-grow min-h-screen">
          <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
            <EmptyState message="No content in this series yet." />
          </div>
        </section>
      </>
    );
  }

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

          {coverImageUrl &&
            series.coverImageWidth &&
            series.coverImageHeight && (
              <CoverImage
                src={coverImageUrl}
                alt={`Cover image for ${seriesName} series`}
                width={series.coverImageWidth}
                height={series.coverImageHeight}
                className="mb-8"
              />
            )}

          <ListPageHeader
            title={`Series: ${seriesName}`}
            count={posts.length}
            singularLabel="part"
            description="in this series"
            className="mb-4"
          />

          {seriesDescription && (
            <p className="text-theme-muted mb-8">{seriesDescription}</p>
          )}

          <div className="space-y-6">
            {posts.map((member, index) => {
              const memberTitle =
                member.frontmatter?.title ??
                (member.metadata?.["title"] as string | undefined) ??
                member.id;
              const seriesIndex = member.frontmatter?.seriesIndex ?? index + 1;
              const excerpt =
                member.frontmatter?.excerpt ??
                (member.metadata?.["excerpt"] as string | undefined);

              return (
                <Card key={member.id} variant="horizontal">
                  <div className="flex-grow">
                    <CardMetadata className="mb-2">
                      <div className="text-sm text-brand">
                        Part {seriesIndex} of {posts.length}
                      </div>
                    </CardMetadata>

                    {member.url ? (
                      <CardTitle href={member.url}>{memberTitle}</CardTitle>
                    ) : (
                      <CardTitle>{memberTitle}</CardTitle>
                    )}

                    {excerpt && <p className="text-theme-muted">{excerpt}</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
};
