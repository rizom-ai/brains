import { Fragment, type JSX } from "preact";
import type { ContentItem } from "./ContentSection";

export interface ContentArchivePagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  hasNextPage?: boolean | undefined;
  hasPrevPage?: boolean | undefined;
}

export interface ContentArchiveProps {
  /** Screen-reader-only page heading. */
  title: string;
  items: ContentItem[];
  pagination?: ContentArchivePagination | null | undefined;
  baseUrl?: string | undefined;
  emptyMessage?: string | undefined;
}

interface ArchiveRowProps {
  item: ContentItem;
  ordinal: number;
  ordinalWidth: number;
}

type FeaturedRowProps = ArchiveRowProps;

interface YearBreakProps {
  year: string;
  count: number;
  label: string;
  latestDate: string;
}

const railGridClass =
  "grid grid-cols-1 gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:gap-14";

const formatOrdinal = (value: number, width: number): string =>
  String(Math.max(0, value)).padStart(width, "0");

const formatArchiveDate = (date: string): string =>
  new Date(date).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const formatDayMonth = (date: string): string =>
  new Date(date).toLocaleDateString("en-GB", {
    month: "short",
    day: "2-digit",
  });

const normalizeArchiveTitle = (title: string): string =>
  title.trim().replace(/\s+-\s+Page\s+\d+$/i, "");

const getYear = (date: string): string => {
  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? String(year) : "Undated";
};

const getPageUrl = (baseUrl: string, page: number): string => {
  if (page === 1) {
    return baseUrl;
  }

  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBase}/page/${page}`;
};

const getItemLabel = (title: string): string => {
  const normalized = title.trim().toLowerCase();

  if (normalized.endsWith("ies")) {
    return normalized.slice(0, -3) + "y";
  }

  if (normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return normalized || "entry";
};

const SeriesLabel = ({
  series,
}: Pick<ContentItem, "series">): JSX.Element | null => {
  if (!series) {
    return null;
  }

  return (
    <span className="inline-block font-mono text-[0.65rem] uppercase tracking-[0.2em] text-accent">
      <span className="mr-1 text-theme-light">
        {String(series.index).padStart(3, "0")}
      </span>
      {series.name}
    </span>
  );
};

const FeaturedRow = ({
  item,
  ordinal,
  ordinalWidth,
}: FeaturedRowProps): JSX.Element => (
  <section
    aria-label="Latest"
    className={`${railGridClass} mb-14 border-b border-rule pb-[4.5rem]`}
  >
    <div className="flex flex-row items-baseline gap-6 pt-0.5 md:flex-col md:items-start md:gap-0">
      <span className="font-heading text-[clamp(4rem,9vw,7.4rem)] font-light leading-[0.82] tracking-[-0.045em] text-accent [font-variant-numeric:tabular-nums] [font-variation-settings:'opsz'_144,'SOFT'_30] md:mb-[18px]">
        {formatOrdinal(ordinal, ordinalWidth)}
      </span>
      <div className="flex w-full max-w-[168px] flex-col gap-1.5 border-rule-strong pt-2 font-mono md:border-t md:pt-3">
        <span className="text-[0.625rem] uppercase tracking-[0.26em] text-theme-light">
          Latest
        </span>
        <time
          dateTime={item.date}
          className="text-xs tracking-[0.04em] text-theme-muted [font-variant-numeric:tabular-nums]"
        >
          {formatArchiveDate(item.date)}
        </time>
      </div>
    </div>
    <div className="min-w-0">
      <a href={item.url} className="group block text-inherit no-underline">
        {item.series && (
          <div className="mb-[22px]">
            <SeriesLabel series={item.series} />
          </div>
        )}
        <h2 className="mb-[22px] max-w-[15ch] font-heading text-[clamp(2.4rem,5vw,3.75rem)] font-normal leading-[0.98] tracking-[-0.028em] text-heading transition-colors duration-150 [font-variation-settings:'opsz'_144,'SOFT'_30] [text-wrap:balance] group-hover:text-accent">
          {item.title}
        </h2>
        {item.description && (
          <p className="max-w-[50ch] font-heading text-[clamp(1.1rem,1.5vw,1.32rem)] font-normal italic leading-[1.45] text-theme-muted [font-variation-settings:'opsz'_24,'SOFT'_70]">
            {item.description}
          </p>
        )}
      </a>
    </div>
  </section>
);

const ArchiveRow = ({
  item,
  ordinal,
  ordinalWidth,
}: ArchiveRowProps): JSX.Element => (
  <li className="group grid grid-cols-1 items-baseline gap-3 border-t border-rule py-[22px] transition-colors duration-150 hover:bg-[rgb(from_var(--color-accent)_r_g_b_/_0.025)] md:grid-cols-[200px_minmax(0,1fr)] md:gap-14">
    <a href={item.url} className="contents text-inherit no-underline">
      <div className="flex flex-row items-baseline gap-3.5 pt-0.5 md:flex-col md:gap-1">
        <span className="font-heading text-[1.55rem] font-normal leading-none tracking-[-0.02em] text-theme transition-colors duration-150 [font-variant-numeric:tabular-nums] [font-variation-settings:'opsz'_72,'SOFT'_40] group-hover:text-accent">
          {formatOrdinal(ordinal, ordinalWidth)}
        </span>
        <time
          dateTime={item.date}
          className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-theme-light [font-variant-numeric:tabular-nums]"
        >
          {formatArchiveDate(item.date)}
        </time>
      </div>
      <div className="min-w-0">
        {item.series && (
          <div className="mb-2">
            <SeriesLabel series={item.series} />
          </div>
        )}
        <h3 className="mb-2 font-heading text-[clamp(1.2rem,1.85vw,1.5rem)] font-medium leading-[1.2] tracking-[-0.016em] text-heading transition-colors duration-150 [font-variation-settings:'opsz'_48,'SOFT'_40] [text-wrap:balance] group-hover:text-accent">
          {item.title}
        </h3>
        {item.description && (
          <p className="max-w-[62ch] text-[0.90625rem] leading-[1.55] text-theme-muted">
            {item.description}
          </p>
        )}
      </div>
    </a>
  </li>
);

const YearBreak = ({
  year,
  count,
  label,
  latestDate,
}: YearBreakProps): JSX.Element => (
  <div
    className={`${railGridClass} relative items-baseline py-3 before:absolute before:left-0 before:right-0 before:top-3.5 before:h-px before:bg-rule-strong md:py-[18px] md:pt-14 md:before:top-6`}
  >
    <span className="pt-7 font-heading text-[clamp(2.4rem,5.4vw,3.6rem)] font-light italic leading-[0.95] tracking-[-0.025em] text-accent [font-variant-numeric:tabular-nums] [font-variation-settings:'opsz'_144,'SOFT'_30] md:pt-0">
      {year}
    </span>
    <span className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-theme-light [font-variant-numeric:tabular-nums] md:pt-1.5">
      {count} {label}
      {count === 1 ? "" : "s"} · finished {formatDayMonth(latestDate)}
    </span>
  </div>
);

interface ArchivePaginationProps {
  pagination: ContentArchivePagination | null | undefined;
  baseUrl: string;
}

const ArchivePagination = ({
  pagination,
  baseUrl,
}: ArchivePaginationProps): JSX.Element | null => {
  if (!pagination || pagination.totalPages <= 1) {
    return null;
  }

  const width = Math.max(2, String(pagination.totalPages).length);
  const hasPrevPage = pagination.hasPrevPage ?? pagination.currentPage > 1;
  const hasNextPage =
    pagination.hasNextPage ?? pagination.currentPage < pagination.totalPages;

  return (
    <nav
      aria-label="Pagination"
      className={`${railGridClass} mt-16 border-t border-rule pt-6 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-theme-light [font-variant-numeric:tabular-nums]`}
    >
      <span>
        {formatOrdinal(pagination.currentPage, width)} /{" "}
        {formatOrdinal(pagination.totalPages, width)}
      </span>
      <span className="flex items-baseline justify-between gap-6">
        {hasPrevPage ? (
          <a
            href={getPageUrl(baseUrl, pagination.currentPage - 1)}
            className="text-theme-muted no-underline transition-colors duration-150 hover:text-brand"
          >
            ← Newer
          </a>
        ) : (
          <span aria-disabled="true" className="opacity-30">
            ← Newer
          </span>
        )}
        {hasNextPage ? (
          <a
            href={getPageUrl(baseUrl, pagination.currentPage + 1)}
            className="text-theme-muted no-underline transition-colors duration-150 hover:text-brand"
          >
            Older →
          </a>
        ) : (
          <span aria-disabled="true" className="opacity-30">
            Older →
          </span>
        )}
      </span>
    </nav>
  );
};

export const ContentArchive = ({
  title,
  items,
  pagination,
  baseUrl = "",
  emptyMessage,
}: ContentArchiveProps): JSX.Element => {
  const totalItems = pagination?.totalItems ?? items.length;
  const currentPage = pagination?.currentPage ?? 1;
  const normalizedTitle = normalizeArchiveTitle(title);
  const firstOrdinal = pagination
    ? totalItems - (currentPage - 1) * pagination.pageSize
    : totalItems;
  const ordinalWidth = Math.max(3, String(totalItems).length);
  const shouldFeature = currentPage === 1 && items.length > 0;
  const archiveItems = shouldFeature ? items.slice(1) : items;
  const itemLabel = getItemLabel(normalizedTitle);

  return (
    <section aria-labelledby="content-archive-title">
      <h1 id="content-archive-title" className="sr-only">
        {normalizedTitle}
      </h1>

      <div className="mb-10 flex items-center gap-2.5 font-mono text-[0.7rem] font-medium uppercase tracking-[0.22em] text-accent">
        <span className="h-px w-[18px] bg-accent" aria-hidden="true" />
        <span>{normalizedTitle}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-theme-muted italic">
          {emptyMessage ?? `No ${normalizedTitle.toLowerCase()} yet.`}
        </p>
      ) : (
        <>
          {shouldFeature && items[0] && (
            <FeaturedRow
              item={items[0]}
              ordinal={firstOrdinal}
              ordinalWidth={ordinalWidth}
            />
          )}

          {archiveItems.length > 0 && (
            <>
              <header className="mb-7 flex items-baseline justify-between gap-6 font-mono text-[0.68rem] uppercase tracking-[0.24em] text-theme-light">
                <span>Archive</span>
                <span className="text-theme-muted">
                  {shouldFeature
                    ? "Older entries"
                    : `Page ${formatOrdinal(currentPage, 2)}`}
                </span>
              </header>

              <ol className="m-0 list-none p-0">
                {archiveItems.map((item, index) => {
                  const absoluteIndex = shouldFeature ? index + 1 : index;
                  const ordinal = firstOrdinal - absoluteIndex;
                  const year = getYear(item.date);
                  const previousYear =
                    index > 0
                      ? getYear(archiveItems[index - 1]?.date ?? "")
                      : year;
                  const showYearBreak = index > 0 && year !== previousYear;
                  const yearCount = archiveItems.filter(
                    (archiveItem) => getYear(archiveItem.date) === year,
                  ).length;

                  return (
                    <Fragment key={item.id}>
                      {showYearBreak && (
                        <YearBreak
                          year={year}
                          count={yearCount}
                          label={itemLabel}
                          latestDate={item.date}
                        />
                      )}
                      <ArchiveRow
                        item={item}
                        ordinal={ordinal}
                        ordinalWidth={ordinalWidth}
                      />
                    </Fragment>
                  );
                })}
              </ol>
            </>
          )}

          <ArchivePagination pagination={pagination} baseUrl={baseUrl} />
        </>
      )}
    </section>
  );
};
