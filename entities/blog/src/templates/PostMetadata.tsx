import type { JSX } from "preact";
import { formatDate } from "@brains/ui-library";

export interface PostMetadataProps {
  publishedAt?: string | undefined;
  readingTime?: number | undefined;
  className?: string | undefined;
}

/**
 * Post metadata component - displays date and reading time.
 * Author is omitted as it's redundant on a personal blog (name is in header).
 */
export const PostMetadata = ({
  publishedAt,
  readingTime,
  className = "",
}: PostMetadataProps): JSX.Element => {
  return (
    <div className={`text-sm text-theme-muted ${className}`}>
      {publishedAt && <span>{formatDate(publishedAt, { style: "long" })}</span>}
      {publishedAt && readingTime && <span> • </span>}
      {readingTime && <span>{readingTime} min read</span>}
    </div>
  );
};
