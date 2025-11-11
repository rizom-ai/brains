import type { JSX } from "preact";

export interface PostMetadataProps {
  author: string;
  publishedAt?: string | undefined;
  status?: string | undefined;
  className?: string | undefined;
}

/**
 * Post metadata component - displays author, date, and draft status.
 * Used consistently across blog post pages, list views, and series pages.
 */
export const PostMetadata = ({
  author,
  publishedAt,
  status,
  className = "",
}: PostMetadataProps): JSX.Element => {
  return (
    <div className={`text-sm text-theme-muted ${className}`}>
      <span>{author}</span>
      {publishedAt && (
        <span>
          {" "}
          •{" "}
          {new Date(publishedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      )}
      {status === "draft" && (
        <span className="ml-2 px-2 py-1 bg-theme-muted rounded text-xs">
          Draft
        </span>
      )}
    </div>
  );
};
