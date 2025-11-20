import type { JSX } from "preact";

export interface ContentListItemProps {
  url: string;
  title: string;
  date: string;
  description?: string | undefined;
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
}: ContentListItemProps): JSX.Element => {
  return (
    <li>
      <a href={url} className="group block">
        <h3 className="text-lg font-medium mb-2 text-heading group-hover:underline">
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
