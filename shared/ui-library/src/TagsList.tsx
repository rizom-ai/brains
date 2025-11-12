import type { JSX } from "preact";

export interface TagsListProps {
  tags: string[];
  maxVisible?: number;
  variant?: "default" | "muted";
  size?: "xs" | "sm";
  className?: string;
}

/**
 * TagsList component - displays a list of tags/keywords with optional truncation
 *
 * @example
 * ```tsx
 * <TagsList tags={link.keywords} maxVisible={4} />
 * ```
 */
export const TagsList = ({
  tags,
  maxVisible = 5,
  variant = "default",
  size = "xs",
  className = "",
}: TagsListProps): JSX.Element => {
  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  const sizeClasses = {
    xs: "text-xs px-2 py-1",
    sm: "text-sm px-3 py-1",
  };

  const variantClasses = {
    default: "bg-theme-muted text-theme",
    muted: "bg-theme text-theme-muted",
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className={`${sizeClasses[size]} ${variantClasses[variant]} rounded-full`}
        >
          {tag}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className={`${sizeClasses[size]} text-theme-muted`}>
          +{remainingCount} more
        </span>
      )}
    </div>
  );
};
