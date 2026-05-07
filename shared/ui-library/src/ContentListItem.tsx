import type { JSX } from "preact";
import { cn } from "./lib/utils";

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
  featured?: boolean | undefined;
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
  featured,
}: ContentListItemProps): JSX.Element => {
  return (
    <li className="block pb-10 border-b border-rule last:border-b-0 last:pb-0 transition-transform duration-200 hover:translate-x-1">
      <a href={url} className="group block">
        {series && (
          <span className="block font-mono text-[0.65rem] font-medium uppercase tracking-[0.18em] text-accent mb-3">
            {String(series.index).padStart(3, "0")} · {series.name}
          </span>
        )}
        <h3
          className={cn(
            "font-heading font-normal text-heading mb-2 leading-[1.15] tracking-[-0.01em] transition-colors group-hover:text-accent",
            featured
              ? "text-[clamp(1.75rem,3.2vw,2.65rem)] leading-[1.05] tracking-[-0.018em] [font-variation-settings:'opsz'_96,'SOFT'_30]"
              : "text-[clamp(1.4rem,2.4vw,2rem)] [font-variation-settings:'opsz'_72,'SOFT'_30]",
          )}
        >
          {title}
        </h3>
        <time className="block font-mono text-[0.7rem] uppercase tracking-[0.14em] text-theme-light mb-4">
          {new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        {description && (
          <p className="text-[0.95rem] leading-[1.6] text-theme-muted max-w-[60ch]">
            {description}
          </p>
        )}
      </a>
    </li>
  );
};
