import type { JSX } from "preact";

export interface SeriesInfo {
  name: string;
  index: number;
}

export interface ContentListItemProps {
  url: string;
  title: string;
  date: string;
  description?: string | undefined;
  series?: SeriesInfo | undefined;
}

/**
 * Reusable content list item - displays title, date, and optional description
 * Used in blog lists, deck lists, and homepage sections
 */
export const ContentListItem = ({
  url,
  title,
  date,
  description,
  series,
}: ContentListItemProps): JSX.Element => {
  return (
    <li>
      <a href={url} className="group block">
        {series && (
          <span className="text-xs font-medium text-accent uppercase tracking-wide">
            {String(series.index).padStart(3, "0")} {series.name}
          </span>
        )}
        <h3 className="text-lg font-medium text-heading group-hover:underline mb-2">
          {title}
        </h3>
        <time className="text-sm text-theme-muted block mb-3">
          {new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        {description && (
          <p className="text-sm text-theme-muted leading-relaxed">
            {description}
          </p>
        )}
      </a>
    </li>
  );
};
