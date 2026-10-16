import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import { ContentArchive, Head, type ContentItem } from "@brains/ui-library";
import type { EnrichedWhitepaper } from "../schemas/whitepaper";

export interface WhitepaperListProps {
  whitepapers: EnrichedWhitepaper[];
  pageTitle?: string;
  pageLabel?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

const WHITEPAPER_DISPLAY_LABEL = "White papers";

export const WhitepaperListTemplate = ({
  whitepapers,
  pageTitle,
  pageLabel,
  pagination,
  baseUrl = "/whitepapers",
}: WhitepaperListProps): JSX.Element => {
  const items: ContentItem[] = whitepapers.map((whitepaper) => ({
    id: whitepaper.id,
    url: whitepaper.url ?? `/whitepapers/${whitepaper.metadata.slug}`,
    title: whitepaper.metadata.title,
    date: whitepaper.metadata.publishedAt || whitepaper.created,
    description:
      whitepaper.frontmatter.abstract ?? whitepaper.frontmatter.thesis,
  }));

  const label = pageLabel ?? WHITEPAPER_DISPLAY_LABEL;
  const title = pageTitle ?? label;
  const totalCount = pagination?.totalItems ?? whitepapers.length;
  const description = `Browse all ${totalCount} ${
    totalCount === 1 ? "white paper" : "white papers"
  }`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="whitepaper-list bg-theme">
        <div className="container mx-auto max-w-[1100px] px-6 py-16 md:px-12 md:py-24">
          <ContentArchive
            label={label}
            items={items}
            pagination={pagination}
            baseUrl={baseUrl}
          />
        </div>
      </div>
    </>
  );
};
