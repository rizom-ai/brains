import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const tagVariants = cva("rounded-full", {
  variants: {
    variant: {
      default: "bg-theme-muted text-theme",
      muted: "bg-theme text-theme-muted",
      accent: "bg-accent/10 text-accent",
    },
    size: {
      xs: "text-xs px-2 py-1",
      sm: "text-sm px-3 py-1",
      md: "text-sm px-3 py-1 font-medium",
      lg: "text-sm px-4 py-2 font-medium",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "xs",
  },
});

export interface TagsListProps extends VariantProps<typeof tagVariants> {
  tags: string[];
  maxVisible?: number;
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
  variant,
  size,
  className,
}: TagsListProps): JSX.Element => {
  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visibleTags.map((tag) => (
        <span key={tag} className={cn(tagVariants({ variant, size }))}>
          {tag}
        </span>
      ))}
      {remainingCount > 0 && (
        <span
          className={cn(
            tagVariants({ size }),
            "bg-transparent text-theme-muted",
          )}
        >
          +{remainingCount} more
        </span>
      )}
    </div>
  );
};

export { tagVariants };
