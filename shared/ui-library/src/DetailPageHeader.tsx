import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";
import { formatDate } from "./utils/formatDate";

const detailPageHeaderVariants = cva("", {
  variants: {
    titleSize: {
      "3xl": "text-3xl",
      "4xl": "text-4xl",
    },
  },
  defaultVariants: {
    titleSize: "4xl",
  },
});

export interface DetailPageHeaderProps
  extends VariantProps<typeof detailPageHeaderVariants> {
  title: string;
  created?: string;
  updated?: string;
  summary?: string;
  metadata?: JSX.Element;
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
  titleSize,
  useSemanticHeader = true,
  className,
}: DetailPageHeaderProps): JSX.Element => {
  const Wrapper = useSemanticHeader ? "header" : "div";

  return (
    <Wrapper className={cn("mb-8", className)}>
      <h1
        className={cn(
          detailPageHeaderVariants({ titleSize }),
          "font-bold mb-4 text-theme",
        )}
      >
        {title}
      </h1>

      {(created ?? updated ?? metadata) && (
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

export { detailPageHeaderVariants };
