import type { JSX } from "preact";
import { formatDate } from "./utils/formatDate";

export interface EntryCardProps {
  title: string;
  created: string;
  updated: string;
  content: string;
  className?: string;
}

/**
 * Article-style content card with header (title + metadata) and prose content
 */
export const EntryCard = ({
  title,
  created,
  updated,
  content,
  className = "",
}: EntryCardProps): JSX.Element => {
  return (
    <article
      className={`entry-card bg-theme-subtle rounded-lg p-6 border border-theme ${className}`}
    >
      <header className="mb-4">
        <h2 className="text-xl font-semibold mb-2 text-theme">{title}</h2>
        <div className="flex items-center gap-4 text-sm text-theme-muted">
          <time dateTime={created}>Created {formatDate(created)}</time>
          {updated !== created && (
            <time dateTime={updated}>Updated {formatDate(updated)}</time>
          )}
        </div>
      </header>

      <div className="prose prose-theme max-w-none">
        {content.split("\n").map((paragraph, pIndex) =>
          paragraph.trim() ? (
            <p key={pIndex} className="mb-4 text-theme-muted">
              {paragraph}
            </p>
          ) : null,
        )}
      </div>
    </article>
  );
};
