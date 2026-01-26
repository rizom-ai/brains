import type { JSX } from "preact";
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
import type { SeriesListItem } from "../schemas/series";

export interface SeriesListProps {
  series: SeriesListItem[];
}

/**
 * Series list template - displays all series
 */
export const SeriesListTemplate = ({
  series,
}: SeriesListProps): JSX.Element => {
  const title = "Series";
  const description = `${series.length} ${series.length === 1 ? "series" : "series"} of essays`;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Series" },
  ];

  if (series.length === 0) {
    return (
      <>
        <Head title={title} description={description} />
        <section className="series-list-section flex-grow min-h-screen">
          <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
            <Breadcrumb items={breadcrumbItems} />
            <EmptyState message="No series yet." />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Head title={title} description={description} />
      <section className="series-list-section flex-grow min-h-screen">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl py-20">
          <Breadcrumb items={breadcrumbItems} />

          <ListPageHeader
            title="Series"
            count={series.length}
            singularLabel="series"
            className="mb-8"
          />

          <div className="space-y-4">
            {series.map((item) => (
              <Card key={item.slug} variant="horizontal">
                {item.coverImageUrl && (
                  <CardImage
                    src={item.coverImageUrl}
                    alt={item.title}
                    size="small"
                  />
                )}
                <div className="flex-grow">
                  <CardTitle href={`/series/${item.slug}`}>
                    {item.title}
                  </CardTitle>
                  <CardMetadata>
                    {item.postCount} {item.postCount === 1 ? "post" : "posts"}
                  </CardMetadata>
                  {item.description && (
                    <p className="text-theme-muted">{item.description}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};
