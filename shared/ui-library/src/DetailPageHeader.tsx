import type { JSX } from "preact";
import { formatDate } from "./utils/formatDate";

export interface DetailPageHeaderProps {
  title: string;
  created?: string;
  updated?: string;
  summary?: string;
  metadata?: JSX.Element;
  titleSize?: "3xl" | "4xl";
  useSemanticHeader?: boolean;
  className?: string;
}

/**
 * Reusable header for detail pages with title, timestamps, and optional summary
 */
export const DetailPageHeader = ({
  title,
  created,
  updated,
  summary,
  metadata,
  titleSize = "4xl",
  useSemanticHeader = true,
  className = "",
}: DetailPageHeaderProps): JSX.Element => {
  const Wrapper = useSemanticHeader ? "header" : "div";
  const titleClass = `text-${titleSize} font-bold mb-4 text-theme`;

  return (
    <Wrapper className={`mb-8 ${className}`}>
      <h1 className={titleClass}>{title}</h1>

      {(created || updated || metadata) && (
        <div className="text-sm text-theme-muted mb-4">
          {created && (
            <time dateTime={created}>Created {formatDate(created)}</time>
          )}
          {created && updated && " • "}
          {updated && !created && (
            <time dateTime={updated}>Last updated {formatDate(updated)}</time>
          )}
          {updated && created && (
            <time dateTime={updated}>Updated {formatDate(updated)}</time>
          )}
          {metadata}
        </div>
      )}

      {summary && <p className="text-lg text-theme-muted italic">{summary}</p>}
    </Wrapper>
  );
};
