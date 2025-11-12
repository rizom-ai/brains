import type { JSX } from "preact";

export interface ListPageHeaderProps {
  title: string;
  count?: number;
  singularLabel?: string;
  pluralLabel?: string;
  description?: string;
  className?: string;
}

/**
 * ListPageHeader component - displays a page title with optional count and description
 *
 * @example
 * ```tsx
 * <ListPageHeader
 *   title="Captured Links"
 *   count={totalCount}
 *   singularLabel="link"
 *   pluralLabel="links"
 *   description="captured from conversations and manual additions"
 * />
 * ```
 */
export const ListPageHeader = ({
  title,
  count,
  singularLabel,
  pluralLabel,
  description,
  className = "",
}: ListPageHeaderProps): JSX.Element => {
  // Build the count text if count and label are provided
  const countText =
    count !== undefined && singularLabel
      ? `${count} ${count === 1 ? singularLabel : pluralLabel || `${singularLabel}s`}`
      : null;

  // Combine count and description
  const subtitle =
    countText && description
      ? `${countText} ${description}`
      : countText || description;

  return (
    <div className={`mb-8 ${className}`}>
      <h1 className="text-3xl font-bold mb-2 text-theme">{title}</h1>
      {subtitle && <p className="text-theme-muted">{subtitle}</p>}
    </div>
  );
};
